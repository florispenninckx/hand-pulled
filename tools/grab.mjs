#!/usr/bin/env node
// Save every plate of a reference page as a PNG, for tools/match.py.
//
//   node tools/grab.mjs [skill ...]          (default: every folder in skills/)
//
// Loads skills/<skill>/reference.html in headless Chrome over CDP (the approach of bigbrain's shot.mjs,
// with its own throwaway profile), scrolls each plate into view so lazy renders run, and writes
// match-out/grabs/<skill>/NN.png plus manifest.json (label, section, kind).
//
// A plate is a visible <canvas> at least 160 CSS px on its short side, read with toDataURL. A tainted or
// blank canvas falls back to a screenshot of its box. Pages whose plates are DOM, not canvas, name
// them in FIGURES and are screenshotted element by element. The page renders at 2x, so most plates
// come out near the pins' 564 px width. match-out/ is in .git/info/exclude.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIGURES = {};
const MIN_SIDE = 160;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const skills = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(join(ROOT, 'skills')).filter(d => existsSync(join(ROOT, 'skills', d, 'reference.html')));

async function grab(skill) {
  const profile = mkdtempSync(join(tmpdir(), 'hp-grab-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader', '--hide-scrollbars',
    '--mute-audio', '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  const kill = setTimeout(() => { console.error(`${skill}: over 240 s, giving up`); chrome.kill('SIGKILL'); }, 240000);
  let ws, seq = 0;
  const pending = new Map(), problems = [];
  const cdp = (method, params = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { pending.delete(id); rej(new Error(`${method}: no answer in 60 s`)); }, 60000);
      pending.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); }, method });
    });
  };
  const evaluate = async expr => {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
    const port = readFileSync(portFile, 'utf8').split('\n')[0];
    let page;
    for (let i = 0; i < 50 && !page; i++) {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).catch(() => []);
      page = list.find(t => t.type === 'page');
      if (!page) await sleep(100);
    }
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    };
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp('Page.navigate', { url: `file://${join(ROOT, 'skills', skill, 'reference.html')}` });
    await sleep(3000);

    // Tag the plates, then visit each one so observers fire, then let everything settle.
    const sel = FIGURES[skill] || 'canvas';
    const n = await evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => {
        const r = e.getBoundingClientRect();
        return r.width >= ${MIN_SIDE} && r.height >= ${MIN_SIDE} && getComputedStyle(e).visibility !== 'hidden';
      });
      els.forEach((e, i) => e.dataset.hpGrab = i);
      return els.length;
    })()`);
    for (let i = 0; i < n; i++) {
      await evaluate(`document.querySelector('[data-hp-grab="${i}"]').scrollIntoView({ block: 'center' })`);
      await sleep(250);
    }
    await sleep(2500);

    const out = join(ROOT, 'match-out', 'grabs', skill);
    mkdirSync(out, { recursive: true });
    for (const f of readdirSync(out)) rmSync(join(out, f));
    const manifest = [];
    for (let i = 0; i < n; i++) {
      const q = `document.querySelector('[data-hp-grab="${i}"]')`;
      const meta = await evaluate(`(() => {
        const e = ${q};
        const sec = e.closest('section'), h = sec && sec.querySelector('h2');
        const fig = e.closest('figure'), cap = fig && fig.querySelector('figcaption');
        return { label: e.getAttribute('aria-label') || (cap && cap.textContent.trim()) || e.textContent.trim().slice(0, 80),
                 section: h ? h.textContent.replace(/^\\+/, '').trim() : 'opening', tag: e.tagName.toLowerCase() };
      })()`);
      let data = null, kind = 'canvas';
      if (meta.tag === 'canvas') {
        data = await evaluate(`(() => { try {
          const c = ${q}, x = document.createElement('canvas');
          x.width = 48; x.height = 48; const g = x.getContext('2d'); g.drawImage(c, 0, 0, 48, 48);
          const d = g.getImageData(0, 0, 48, 48).data; let s = 0, s2 = 0;
          for (let k = 0; k < d.length; k += 4) { const v = d[k] + d[k+1] + d[k+2]; s += v; s2 += v * v; }
          const m = s / 2304, sd = Math.sqrt(s2 / 2304 - m * m);
          return sd < 1 && m < 1 ? null : c.toDataURL('image/png').split(',')[1];
        } catch (e) { return null; } })()`);
      }
      if (!data) {
        kind = meta.tag === 'canvas' ? 'canvas-shot' : 'element';
        await evaluate(`${q}.scrollIntoView({ block: 'center' })`);
        await sleep(400);
        const r = await evaluate(`(() => { const b = ${q}.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
        ({ data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 }, captureBeyondViewport: true }));
      }
      const file = `${String(i).padStart(2, '0')}.png`;
      writeFileSync(join(out, file), Buffer.from(data, 'base64'));
      manifest.push({ n: i, file, kind, section: meta.section, label: meta.label });
    }
    writeFileSync(join(out, 'manifest.json'), JSON.stringify({ skill, grabbed: new Date().toISOString(), plates: manifest }, null, 1));
    const shots = manifest.filter(m => m.kind !== 'canvas').length;
    console.log(`${skill.padEnd(18)} ${n} plates${shots ? ` (${shots} by screenshot)` : ''}${problems.length ? `, ${problems.length} page error(s): ${problems[0]}` : ''}`);
    return problems.length === 0;
  } finally {
    clearTimeout(kill);
    try { ws?.close(); } catch {}
    chrome.kill('SIGTERM');
    await sleep(400);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

let ok = true;
for (const s of skills) {
  try { ok = (await grab(s)) && ok; } catch (e) { console.error(`${s}: ${e.message}`); ok = false; }
}
process.exit(ok ? 0 : 1);
