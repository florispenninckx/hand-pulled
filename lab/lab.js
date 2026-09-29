/* lab.js: renders the fonts wave 3 A judging pages from window.LAB_FACES (faces.js).
 *
 * A style page sets window.LAB before this script:
 *   { style, label, copy: { poster: { kick, word, lines }, hero: { brand, links, head, sub, cta } },
 *     mount: { poster(el), hero(el), button(btn) } }   // each mounts that style's live engine
 * and gets, per face (current first, then the candidates): the axis slider, keep / maybe / drop
 * (candidates only) and two mockups, a poster and a site hero, with the same copy for every face.
 * The index (no window.LAB) gets one card per style with its candidates and their picks.
 * Verdicts and slider values persist in localStorage; every access is wrapped, so a page without
 * storage still works and only forgets. */
(function () {
  'use strict';
  const KEY = 'hand-pulled.lab.wave3a';
  const STYLES = [['indigo-grain', 'Indigo Grain'], ['riso-cartography', 'Riso Cartography'], ['abstract-texture', 'Abstract Texture']];
  const FACES = window.LAB_FACES || {};
  const LAB = window.LAB || null;

  // ---------------------------------------------------------------- storage
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      return { verdicts: s.verdicts || {}, values: s.values || {} };
    } catch (e) { return { verdicts: {}, values: {} }; }
  }
  const state = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* no storage: picks last this visit only */ } }

  // ---------------------------------------------------------------- small helpers
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const valueOf = f => state.values[f.name] == null ? f.start : state.values[f.name];

  // the display word in a face; a current face with a companion gets it set beneath, same size
  function disp(f, text, cls) {
    const top = `<span class="disp-top" style="font-family:'${f.family}';font-variation-settings:'${f.tag}' var(--v)">${esc(text)}</span>`;
    if (!f.under) return `<span class="disp ${cls}">${top}</span>`;
    const u = f.under;
    return `<span class="disp stack ${cls}">${top}<span class="under ${u.mode}" aria-hidden="true" style="font-family:'${u.family}';font-variation-settings:${u.fvs}">${esc(text)}</span></span>`;
  }

  // ---------------------------------------------------------------- the verdict text
  function verdictText() {
    const lines = ['hand-pulled fonts wave 3 A: verdicts', ''];
    const n = { keep: 0, maybe: 0, drop: 0, open: 0 };
    STYLES.forEach(([id, label]) => {
      const set = FACES[id];
      if (!set) return;
      lines.push(label + ' (' + id + ')');
      set.candidates.forEach(f => {
        const v = state.verdicts[f.name];
        n[v || 'open']++;
        const at = state.values[f.name] == null ? '' : `, looked best at ${f.tag} ${state.values[f.name]}`;
        lines.push(`  ${f.name} (${f.base}, ${f.tag}): ${v || 'not judged'}${v ? at : ''}`);
      });
      lines.push('');
    });
    lines.push(`keep ${n.keep} · maybe ${n.maybe} · drop ${n.drop} · not judged ${n.open}`);
    return lines.join('\n');
  }

  function copyBar(host) {
    host.innerHTML = `<div class="bar">
      <button type="button" class="btn copy">Copy verdict</button>
      <span class="count mono"></span>
      <span class="copied mono" role="status" aria-live="polite"></span>
      <textarea class="verdict-text" readonly aria-label="Verdict text" rows="16"></textarea></div>`;
    const btn = host.querySelector('.copy'), out = host.querySelector('.copied'), ta = host.querySelector('.verdict-text');
    btn.addEventListener('click', async () => {
      const text = verdictText();
      ta.value = text; ta.classList.add('shown');
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* fall back below */ }
      if (!ok) { try { ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; } }
      out.textContent = ok ? 'Copied. Paste it to Claude.' : 'Select the text below and copy it.';
    });
    return () => {
      let k = 0, all = 0;
      STYLES.forEach(([id]) => (FACES[id] ? FACES[id].candidates : []).forEach(f => { all++; if (state.verdicts[f.name]) k++; }));
      host.querySelector('.count').textContent = `${k} of ${all} judged`;
    };
  }

  // ---------------------------------------------------------------- fitting the display words
  // Each word is sized to fill its box, so a condensed and a wide face are compared at equal width.
  function fit(el, width, maxPx) {
    el.style.fontSize = '100px';
    const w = el.getBoundingClientRect().width || 1;
    el.style.fontSize = Math.max(12, Math.min(maxPx, 100 * width / w)).toFixed(1) + 'px';
  }
  function fitSection(sec) {
    const p = sec.querySelector('.poster'), h = sec.querySelector('.hero');
    if (p) {
      const cs = getComputedStyle(p), inner = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      fit(p.querySelector('.disp'), inner * 0.94, p.clientHeight * 0.42);
    }
    if (h) {
      const cs = getComputedStyle(h), inner = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      fit(h.querySelector('.disp'), inner * 0.82, Math.max(40, h.clientWidth * 0.13));
    }
  }

  // ---------------------------------------------------------------- a style page
  function facePage() {
    const set = FACES[LAB.style];
    const main = document.getElementById('faces');
    const refreshCount = copyBar(document.getElementById('verdict'));
    const c = LAB.copy;

    function section(f, isCand) {
      const id = 'f-' + slug(f.name), v = valueOf(f);
      const sec = document.createElement('section');
      sec.className = 'face' + (isCand ? ' cand' : ' current');
      sec.id = id;
      sec.style.setProperty('--v', v);
      sec.setAttribute('aria-labelledby', id + '-h');
      const verdict = isCand ? `<div class="verdict" role="group" aria-label="Verdict on ${esc(f.name)}">${['keep', 'maybe', 'drop'].map(k =>
        `<button type="button" data-v="${k}" aria-pressed="${state.verdicts[f.name] === k}">${k}</button>`).join('')}</div>` : '';
      sec.innerHTML = `
        <div class="face-head">
          <div>
            <h2 id="${id}-h">${esc(f.name)} <span class="tag">${isCand ? 'candidate' : 'current'} · ${f.tag}</span></h2>
            <p class="meta">${esc(f.base)} · ${f.tag} 0–1000 · ${esc(f.kb)} KB</p>
            <p class="idea">${esc(f.idea)}</p>
          </div>
          <div class="controls">
            <label class="dial"><span>${f.tag}</span><input type="range" min="0" max="1000" step="10" value="${v}" aria-label="${esc(f.name)} ${f.tag}"><output>${v}</output></label>
            ${verdict}
          </div>
        </div>
        <div class="mocks">
          <figure class="poster" aria-label="${esc(f.name)} on a poster">
            <p class="p-kick">${esc(c.poster.kick)}</p>
            <p class="p-word">${disp(f, c.poster.word, 'p-disp')}</p>
            <p class="p-lines">${c.poster.lines.map(esc).join('<br>')}</p>
          </figure>
          <div class="hero" role="group" aria-label="${esc(f.name)} in a site hero">
            <nav class="h-nav" aria-label="Mockup navigation"><b>${esc(c.hero.brand)}</b><ul>${c.hero.links.map(l => `<li>${esc(l)}</li>`).join('')}</ul></nav>
            <div class="h-body">
              <h3 class="h-head">${disp(f, c.hero.head, 'h-disp')}</h3>
              <p class="h-sub">${esc(c.hero.sub)}</p>
              <button type="button" class="cta">${esc(c.hero.cta)}</button>
            </div>
          </div>
        </div>`;
      const range = sec.querySelector('input'), out = sec.querySelector('output');
      let pending = 0;
      range.addEventListener('input', () => {
        sec.style.setProperty('--v', range.value);
        out.value = range.value;
        state.values[f.name] = +range.value; save();
        if (!pending) pending = requestAnimationFrame(() => { pending = 0; fitSection(sec); });
      });
      sec.querySelectorAll('.verdict button').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.v, on = state.verdicts[f.name] !== k;
        if (on) state.verdicts[f.name] = k; else delete state.verdicts[f.name];
        save();
        sec.querySelectorAll('.verdict button').forEach(x => x.setAttribute('aria-pressed', String(on && x === b)));
        refreshCount();
      }));
      return sec;
    }

    const group = (title, list, isCand) => {
      const h = document.createElement('p');
      h.className = 'kicker group';
      h.textContent = title;
      main.appendChild(h);
      list.forEach(f => main.appendChild(section(f, isCand)));
    };
    group('Current ' + (set.current.length > 1 ? 'faces' : 'face'), set.current, false);
    group('Candidates', set.candidates, true);
    refreshCount();

    const secs = [...main.querySelectorAll('.face')];
    const refit = () => secs.forEach(fitSection);
    refit();
    if (document.fonts) { document.fonts.ready.then(refit); document.fonts.addEventListener('loadingdone', refit); }
    let rz = 0;
    new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(refit); }).observe(main);

    // the live engines, mounted as each face comes near the screen (they pause off screen themselves)
    const mount = sec => {
      try {
        LAB.mount.poster(sec.querySelector('.poster'));
        LAB.mount.hero(sec.querySelector('.hero'));
        LAB.mount.button(sec.querySelector('.cta'));
      } catch (e) { console.warn('lab: live engine did not mount', e); }
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); mount(e.target); } }), { rootMargin: '300px 0px' });
      secs.forEach(s => io.observe(s));
    } else secs.forEach(mount);
  }

  // ---------------------------------------------------------------- the index
  function indexPage() {
    const host = document.getElementById('styles');
    const refreshCount = copyBar(document.getElementById('verdict'));
    const word = { 'indigo-grain': 'Tide', 'riso-cartography': 'wenn', 'abstract-texture': 'Swell' };
    host.innerHTML = STYLES.map(([id, label]) => {
      const set = FACES[id];
      if (!set) return '';
      return `<article class="style-card">
        <h2><a href="${id}.html">${label} →</a></h2>
        <p class="meta">now: ${set.current.map(f => esc(f.name) + ' (' + f.tag + ')').join(', ')} · four candidates below, each in a poster and a site hero on the style page</p>
        <div class="samples">${set.candidates.map(f => `
          <a class="sample" href="${id}.html#f-${slug(f.name)}" style="text-decoration:none">
            <span class="word" style="font-family:'${f.family}';font-variation-settings:'${f.tag}' ${valueOf(f)}">${esc(word[id])}</span>
            <span class="meta"><span>${esc(f.name)} · ${f.tag} · ${esc(f.kb)} KB</span><span class="pick" data-v="${state.verdicts[f.name] || ''}">${state.verdicts[f.name] || 'open'}</span></span>
          </a>`).join('')}</div>
      </article>`;
    }).join('');
    refreshCount();
  }

  if (LAB) facePage(); else indexPage();
})();
