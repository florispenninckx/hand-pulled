/* live-ui.js — interface pieces broken the pixel-sort way (needs pixelsort.js, glitch.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live canvas behind it; the canvas is decoration (aria-hidden), the
 * control stays native, keyboard-reachable and readable by assistive tech. The machine is the
 * sort: at rest a control is a dim strip of sorted rows; hovered or focused, its rows light up
 * and streak from their slits; pressed, it bursts. A switch and a slider hold one stuck white
 * column as their thumb, the way a dead driver line holds on a dropped screen. A progress bar is
 * a file arriving; a section transition loads row by row as it scrolls past.
 *
 *   const ui = Glitch.ui;
 *   ui.background(section);   ui.button(btn);   ui.card(el, { mode: 'wave', variant: 'ripple' });
 *   ui.toggle(checkbox);   ui.slider(range);   const p = ui.progress(el); p.set(0.4);
 *   const l = ui.loader(el);   ui.focusRing();   ui.transition(strip);   ui.icon(span, 'shuffle');
 *   // optional extra, only when the brief asks for a custom cursor: ui.cursor(area, { mark, hover })
 *
 * Every function returns the live controller (or a small object holding it) so a page can set()
 * it further. Icons: Phosphor Icons (light weight), MIT, Copyright (c) 2023 Phosphor Icons,
 * https://phosphoricons.com; the path data below was generated from @phosphor-icons/core, never
 * fetched at run time. The rest is original code, MIT.
 */
(function (root) {
  'use strict';
  const G = root.Glitch;
  if (!G || !G.live) throw new Error('live-ui.js: load pixelsort.js, glitch.js and live.js first');
  const live = G.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  // Phosphor Icons, light weight (MIT). 256 viewBox, filled outlines, generated from the package's SVGs.
  const P = (...ds) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${ds.map(d => `<path d="${d}"/>`).join('')}</svg>`;
  const ICONS = {
    lightning: P('M213.84,118.63a6,6,0,0,0-3.73-4.25L150.88,92.17l15-75a6,6,0,0,0-10.27-5.27l-112,120a6,6,0,0,0,2.28,9.71l59.23,22.21-15,75a6,6,0,0,0,3.14,6.52A6.07,6.07,0,0,0,96,246a6,6,0,0,0,4.39-1.91l112-120A6,6,0,0,0,213.84,118.63ZM106,220.46l11.85-59.28a6,6,0,0,0-3.77-6.8l-55.6-20.85,91.46-98L138.12,94.82a6,6,0,0,0,3.77,6.8l55.6,20.85Z'),
    shuffle: P('M236.24,179.76a6,6,0,0,1,0,8.48l-24,24a6,6,0,0,1-8.48-8.48L217.52,190H200.94a70.16,70.16,0,0,1-57-29.31l-41.71-58.4A58.11,58.11,0,0,0,55.06,78H32a6,6,0,0,1,0-12H55.06a70.16,70.16,0,0,1,57,29.31l41.71,58.4A58.11,58.11,0,0,0,200.94,178h16.58l-13.76-13.76a6,6,0,0,1,8.48-8.48Zm-92.06-74.41a5.91,5.91,0,0,0,3.48,1.12,6,6,0,0,0,4.89-2.51l1.19-1.67A58.11,58.11,0,0,1,200.94,78h16.58L203.76,91.76a6,6,0,1,0,8.48,8.48l24-24a6,6,0,0,0,0-8.48l-24-24a6,6,0,0,0-8.48,8.48L217.52,66H200.94a70.16,70.16,0,0,0-57,29.31L142.78,97A6,6,0,0,0,144.18,105.35Zm-32.36,45.3a6,6,0,0,0-8.37,1.39l-1.19,1.67A58.11,58.11,0,0,1,55.06,178H32a6,6,0,0,0,0,12H55.06a70.16,70.16,0,0,0,57-29.31l1.19-1.67A6,6,0,0,0,111.82,150.65Z'),
    export: P('M214,112v96a14,14,0,0,1-14,14H56a14,14,0,0,1-14-14V112A14,14,0,0,1,56,98H80a6,6,0,0,1,0,12H56a2,2,0,0,0-2,2v96a2,2,0,0,0,2,2H200a2,2,0,0,0,2-2V112a2,2,0,0,0-2-2H176a6,6,0,0,1,0-12h24A14,14,0,0,1,214,112ZM92.24,68.24,122,38.49V136a6,6,0,0,0,12,0V38.49l29.76,29.75a6,6,0,1,0,8.48-8.48l-40-40a6,6,0,0,0-8.48,0l-40,40a6,6,0,1,0,8.48,8.48Z'),
    scissors: P('M159.38,112a6,6,0,0,1,1.57-8.34l67.66-46.31a6,6,0,0,1,6.78,9.91l-67.67,46.3a6,6,0,0,1-8.34-1.56ZM237,197.09a6,6,0,0,1-8.34,1.56L136,135.27,91,166.06A34,34,0,1,1,84,156a1.8,1.8,0,0,0,.19.2L125.37,128,84.23,99.84,84,100a34,34,0,1,1,7-10.1l144.38,98.8A6,6,0,0,1,237,197.09ZM75.56,91.55a22,22,0,1,0-31.12,0,21.88,21.88,0,0,0,31.12,0ZM82,180a22,22,0,1,0-6.44,15.56h0A21.88,21.88,0,0,0,82,180Z'),
    film: P('M216,42H40A14,14,0,0,0,26,56V200a14,14,0,0,0,14,14H216a14,14,0,0,0,14-14V56A14,14,0,0,0,216,42ZM38,86h84v84H38Zm96-12V54h36V74Zm-12,0H86V54h36Zm0,108v20H86V182Zm12,0h36v20H134Zm0-12V86h84v84ZM218,56V74H182V54h34A2,2,0,0,1,218,56ZM40,54H74V74H38V56A2,2,0,0,1,40,54ZM38,200V182H74v20H40A2,2,0,0,1,38,200Zm178,2H182V182h36v18A2,2,0,0,1,216,202Z'),
    play: P('M231.36,116.19,87.28,28.06a14,14,0,0,0-14.18-.27A13.69,13.69,0,0,0,66,39.87V216.13a13.69,13.69,0,0,0,7.1,12.08,14,14,0,0,0,14.18-.27l144.08-88.13a13.82,13.82,0,0,0,0-23.62Zm-6.26,13.38L81,217.7a2,2,0,0,1-2.06,0,1.78,1.78,0,0,1-1-1.61V39.87a1.78,1.78,0,0,1,1-1.61A2.06,2.06,0,0,1,80,38a2,2,0,0,1,1,.31L225.1,126.43a1.82,1.82,0,0,1,0,3.14Z'),
    pause: P('M200,34H160a14,14,0,0,0-14,14V208a14,14,0,0,0,14,14h40a14,14,0,0,0,14-14V48A14,14,0,0,0,200,34Zm2,174a2,2,0,0,1-2,2H160a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2h40a2,2,0,0,1,2,2ZM96,34H56A14,14,0,0,0,42,48V208a14,14,0,0,0,14,14H96a14,14,0,0,0,14-14V48A14,14,0,0,0,96,34Zm2,174a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2H96a2,2,0,0,1,2,2Z'),
    broken: P('M216,42H40A14,14,0,0,0,26,56V200a14,14,0,0,0,14,14h64a6,6,0,0,0,5.69-4.1l15.12-45.36,37.42-15a6,6,0,0,0,3.34-3.34l15-37.42L225.9,93.69A6,6,0,0,0,230,88V56A14,14,0,0,0,216,42ZM117.77,154.43a6,6,0,0,0-3.46,3.67L99.68,202H40a2,2,0,0,1-2-2V171.17l52.58-52.58a2,2,0,0,1,2.83,0L126,151.15ZM218,83.68,174.1,98.31a6,6,0,0,0-3.67,3.46l-15.05,37.61L138.1,146.3l-36.2-36.2a14,14,0,0,0-19.8,0L38,154.2V56a2,2,0,0,1,2-2H216a2,2,0,0,1,2,2Zm9.51,33.18a6,6,0,0,0-5.41-.82L198.3,124a6,6,0,0,0-3.67,3.47L180,164l-36.56,14.63A6,6,0,0,0,140,182.3L132,206.1a6,6,0,0,0,5.69,7.9H216a14,14,0,0,0,14-14V121.73A6,6,0,0,0,227.51,116.86ZM218,200a2,2,0,0,1-2,2H146.06l4.42-13.26,36.37-14.55a6,6,0,0,0,3.34-3.34l14.55-36.37L218,130.06Z'),
    waveform: P('M54,96v64a6,6,0,0,1-12,0V96a6,6,0,0,1,12,0ZM88,26a6,6,0,0,0-6,6V224a6,6,0,0,0,12,0V32A6,6,0,0,0,88,26Zm40,32a6,6,0,0,0-6,6V192a6,6,0,0,0,12,0V64A6,6,0,0,0,128,58Zm40,32a6,6,0,0,0-6,6v64a6,6,0,0,0,12,0V96A6,6,0,0,0,168,90Zm40-16a6,6,0,0,0-6,6v96a6,6,0,0,0,12,0V80A6,6,0,0,0,208,74Z'),
  };

  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
.pg-host{position:relative;isolation:isolate}
.pg-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;image-rendering:pixelated}
.pg-track{position:relative;display:inline-block;vertical-align:middle;overflow:hidden;background:#0b0b0e;box-shadow:inset 0 0 0 1px var(--pg-line,#26262c)}
.pg-track>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated}
.pg-track>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.pg-track:has(input:focus-visible){outline:2px solid var(--pg-focus,#3fd0c9);outline-offset:2px}
.pg-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none;image-rendering:pixelated}
.pg-icon{display:inline-block;position:relative;vertical-align:-.2em;width:1.25em;height:1.25em}
.pg-icon>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated}`;
    document.head.appendChild(s);
  }
  function backdrop(host) {
    style();
    host.classList.add('pg-host');
    const c = document.createElement('canvas');
    c.className = 'pg-bg'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    return c;
  }
  const tickers = new Set();
  let raf = 0;
  const loop = now => { raf = 0; for (const f of tickers) f(now); if (tickers.size) raf = requestAnimationFrame(loop); };
  const tick = f => { tickers.add(f); if (!raf) raf = requestAnimationFrame(loop); return () => tickers.delete(f); };
  const strip = o => Object.assign({ mode: 'sorted', scene: 6, own: false, clickPulse: false, mosh: 0, tear: 0 }, o);

  /** The picture behind a section, alive: sort sweep, scroll mosh, pointer tear, click burst. opts go to live(). */
  function background(host, opts) {
    return live(backdrop(host), Object.assign({ mode: 'smear', scene: 6, seed: 6, clickPulse: true, hand: host }, opts));
  }

  /**
   * A button: a dim strip of sorted rows at rest (dim 0.72), lit and streaking on hover and
   * focus, a burst on press (pointer, Enter, Space). Put the label in a span with the page
   * colour behind it, knocked out of the strip (see SKILL.md).
   */
  function button(btn, opts) {
    const o = Object.assign({ rest: 0.72, seed: 3 }, opts);
    const ctl = live(backdrop(btn), strip(Object.assign({ dim: o.rest, sweep: 0, alive: false, hand: btn }, o)));
    if (!ctl) return null;
    let over = false, focus = false;
    const upd = () => ctl.set(over || focus ? { dim: 0, sweep: 1, alive: true } : { dim: o.rest, sweep: 0, alive: false });
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    btn.addEventListener('pointerleave', () => { over = false; upd(); });
    btn.addEventListener('focus', () => { focus = btn.matches(':focus-visible'); upd(); });
    btn.addEventListener('blur', () => { focus = false; upd(); });
    btn.addEventListener('pointerdown', e => { const r = btn.getBoundingClientRect(); ctl.pulse(e.clientX - r.left, e.clientY - r.top, 1); });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const r = btn.getBoundingClientRect(); ctl.pulse(r.width / 2, r.height / 2, 1); } });
    return ctl;
  }

  /** A card: a plate that arrives like a slow file the first time it is seen, then keeps sorting. opts go to live(). */
  function card(el, opts) {
    return live(backdrop(el), Object.assign({ mode: 'smear', scene: 6, seed: 2, develop: 'in', sweep: 0.7, tear: 0.6, hand: el }, opts));
  }

  function track(input, cls) {
    style();
    const t = document.createElement('span');
    t.className = 'pg-track ' + (cls || '');
    input.parentNode.insertBefore(t, input);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    t.appendChild(c); t.appendChild(input);
    return { t, c };
  }

  /** A switch: off, the strip is dim and its stuck column sits left; on, it lights, sorts, and the column jumps right. */
  function toggle(input, opts) {
    const o = Object.assign({ seed: 5 }, opts);
    if (!input.getAttribute('role')) input.setAttribute('role', 'switch');
    const { c } = track(input, 'pg-toggle');
    const state = () => input.checked ? { dim: 0, sweep: 0.8, alive: true, thumb: 0.78 } : { dim: 0.78, sweep: 0, alive: false, thumb: 0.22 };
    const ctl = live(c, strip(Object.assign({ pixel: 2, ease: 0.1, hand: c }, o, state())));
    input.addEventListener('change', () => { if (!ctl) return; ctl.set(state()); const r = c.getBoundingClientRect(); ctl.pulse(r.width * (input.checked ? 0.78 : 0.22), r.height / 2, 0.7); });
    return ctl;
  }

  /** A slider: the strip is shown from 0 up to the value, the rest is ground, and a stuck column is the thumb. */
  function slider(input, opts) {
    const o = Object.assign({ seed: 7 }, opts);
    const { c } = track(input, 'pg-slider');
    const val = () => { const lo = +input.min || 0, hi = input.max === '' ? 100 : +input.max; return clamp01((+input.value - lo) / (hi - lo || 1)); };
    const state = () => { const v = val(); return { reveal: [0, v], thumb: Math.min(0.995, v) }; };
    const ctl = live(c, strip(Object.assign({ pixel: 2, sweep: 0.4, ease: 0.06, hand: c }, o, state())));
    input.addEventListener('input', () => ctl && ctl.set(state()));
    return ctl;
  }

  /** Progress as a file arriving: shown up to p, streaking at its edge. Returns { ctl, set(p) }; a finished bar bursts. */
  function progress(el, opts) {
    const o = Object.assign({ value: 0, seed: 9 }, opts);
    const c = backdrop(el);
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    const ctl = live(c, strip(Object.assign({ pixel: 2, sweep: 0.5, ease: 0.12, reveal: [0, o.value] }, o)));
    let last = o.value;
    const api = {
      ctl,
      set(p) {
        p = clamp01(p);
        el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (ctl) { ctl.set({ reveal: [0, p] }); if (p >= 1 && last < 1) { const r = el.getBoundingClientRect(); ctl.pulse(r.width * 0.9, r.height / 2, 1); } }
        last = p; return api;
      },
    };
    api.set(o.value);
    return api;
  }

  /** A loader: a strip whose sort sweeps fast while a tear runs along it. Returns { ctl, stop() }. With reduced motion it holds still. */
  function loader(el, opts) {
    const o = Object.assign({ seed: 11, period: 1.2 }, opts);
    el.setAttribute('role', 'status');
    const ctl = live(backdrop(el), strip(Object.assign({ pixel: 2, sweep: 1, speed: 4, tear: 1, radius: 0.45, lag: 0.05 }, o)));
    if (!ctl) return { ctl, stop() {} };
    const untick = tick(now => {
      if (RM.matches) return;
      const r = el.getBoundingClientRect(), a = (now / 1000) / o.period % 1;
      ctl.point(r.width * a, r.height * 0.5);
    });
    return { ctl, stop() { untick(); ctl.point(null); } };
  }

  /**
   * One focus ring for the page: a frame of sorted rows drawn over whatever has
   * :focus-visible, on a transparent overlay. Keep a CSS outline too (it is what shows without
   * WebGL2 and in forced colours). opts: pad (px), band (px).
   */
  function focusRing(opts) {
    const o = Object.assign({ pad: 4, band: 3, seed: 13 }, opts);
    style();
    const c = document.createElement('canvas');
    c.className = 'pg-ring'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    let el = null, ctl = null, key = '';
    const shape = (b, p) => (ctx, w, h) => {   // w, h in device px; b, p in CSS px
      const k = w / (parseFloat(c.style.width) || w), B = Math.max(1, Math.round(b * k)), P = Math.round(p * k);
      ctx.fillStyle = '#fff';
      ctx.fillRect(P, P, w - 2 * P, B); ctx.fillRect(P, h - P - B, w - 2 * P, B);
      ctx.fillRect(P, P, B, h - 2 * P); ctx.fillRect(w - P - B, P, B, h - 2 * P);
    };
    function place() {
      if (!el || !el.isConnected) { c.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), p = o.pad + o.band;
      const w = Math.round(r.width + 2 * p), h = Math.round(r.height + 2 * p);
      Object.assign(c.style, { display: 'block', width: w + 'px', height: h + 'px', transform: `translate(${Math.round(r.left - p)}px,${Math.round(r.top - p)}px)` });
      const k = w + 'x' + h;
      if (k === key) return;
      key = k;
      const opts = strip({ pixel: 1, seed: o.seed, shape: shape(o.band, 0), sweep: 1, speed: 2, lo: 0.1 });
      if (!ctl) ctl = live(c, opts); else ctl.set({ shape: opts.shape });
    }
    document.addEventListener('focusin', e => { el = e.target.matches(':focus-visible') ? e.target : null; place(); });
    document.addEventListener('focusout', () => { el = null; place(); });
    root.addEventListener('scroll', () => el && place(), { passive: true, capture: true });
    root.addEventListener('resize', () => el && place());
    return { get ctl() { return ctl; }, canvas: c };
  }

  /** A section transition: a strip of the picture that loads row by row as it scrolls into view. opts go to live(). */
  function transition(el, opts) {
    return live(backdrop(el), Object.assign({ mode: 'smear', scene: 6, seed: 8, develop: 'scroll', sweep: 0.6, own: false, hand: el }, opts));
  }

  /**
   * iconMask(svg, { pad, weight }): an icon's SVG (one or more <path d>, any viewBox) as a
   * `shape` for the sorted strip: the paths fill white, and only what they cover is kept.
   * `weight` strokes the outline too (viewBox units), so light icons stay legible.
   */
  function iconMask(svg, opts) {
    const o = Object.assign({ pad: 0.06, weight: 0 }, opts);
    const vb = ((svg.match(/viewBox="([^"]+)"/) || [0, '0 0 256 256'])[1]).split(/[\s,]+/).map(Number);
    const paths = Array.from(svg.matchAll(/\sd="([^"]+)"/g), m => new Path2D(m[1]));
    return (ctx, w, h) => {
      const s = Math.min(w, h) * (1 - 2 * o.pad) / Math.max(vb[2], vb[3]);
      ctx.save();
      ctx.translate((w - vb[2] * s) / 2 - vb[0] * s, (h - vb[3] * s) / 2 - vb[1] * s); ctx.scale(s, s);
      ctx.fillStyle = ctx.strokeStyle = '#fff'; ctx.lineWidth = o.weight; ctx.lineJoin = 'round';
      for (const p of paths) { ctx.fill(p); if (o.weight) ctx.stroke(p); }
      ctx.restore();
    };
  }

  /**
   * An icon cut from the sorted picture: its outline keeps the sorted rows and drops the rest.
   * At rest it holds still; when its control is hovered or focused the sweep runs, and the rows
   * streak out past the outline; a press bursts. `name` is a key of ICONS or an SVG string.
   * The element sets the size (CSS width/height; default 1.25em).
   */
  function icon(el, name, opts) {
    const svg = ICONS[name] || name;
    const o = Object.assign({ seed: 21, weight: 8 }, opts);
    style();
    el.classList.add('pg-icon'); if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    const c = document.createElement('canvas'); el.appendChild(c);
    const ctl = live(c, strip({ pixel: 1, seed: o.seed, lo: 0.08, hi: 1, sweep: 0, speed: 2, alive: false, shape: iconMask(svg, { weight: o.weight }), crop: [0.5, 0.54, 1.6] }));
    const host = el.closest('button,a,label,[tabindex]') || el;
    if (ctl) {
      const on = v => ctl.set(v ? { sweep: 1, alive: true } : { sweep: 0, alive: false });
      host.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') on(true); });
      host.addEventListener('pointerleave', () => on(false));
      host.addEventListener('focus', () => on(host.matches(':focus-visible')));
      host.addEventListener('blur', () => on(false));
      host.addEventListener('pointerdown', () => { const r = el.getBoundingClientRect(); ctl.pulse(r.width / 2, r.height / 2, 1); });
    }
    return ctl;
  }

  // ---------------------------------------------------------------- optional: a custom cursor
  // A mark 32 CSS px square, painted once at 1x and 2x (paint(k) gives a 32k px canvas, or a
  // Promise of one) and handed to CSS as `image-set(url() 1x, url() 2x) hx hy, fallback`, or the
  // 1x url alone where `cursor` does not take image-set. The system draws it: nothing follows the
  // mouse, nothing keeps running, and touch has no cursor to show.
  const CUR = 32;
  const curCanvas = k => { const c = document.createElement('canvas'); c.width = c.height = CUR * k; return c; };
  // keep `plate` only inside shape(ctx) (filled even-odd by default, so a second circle cuts a
  // ring; shape may also stroke), then draw lines(ctx) over it; ctx in CSS px
  function curCut(plate, k, shape, lines, rule) {
    const c = curCanvas(k), x = c.getContext('2d'), m = curCanvas(k), mx = m.getContext('2d');
    mx.scale(k, k); mx.fillStyle = mx.strokeStyle = '#000'; mx.lineJoin = mx.lineCap = 'round';
    mx.beginPath(); shape(mx); mx.fill(rule || 'evenodd');
    x.drawImage(plate, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.scale(k, k); if (lines) lines(x);
    return c;
  }
  // under what is already on `c`: shape filled and stroked `w` CSS px wide in `col` (an outline of the whole silhouette)
  function curUnder(c, k, shape, w, col) {
    const x = c.getContext('2d');
    x.save(); x.globalCompositeOperation = 'destination-over'; x.setTransform(k, 0, 0, k, 0, 0);
    x.fillStyle = x.strokeStyle = col; x.lineWidth = w; x.lineJoin = x.lineCap = 'round';
    x.beginPath(); shape(x); x.stroke(); x.fill();
    x.restore(); return c;
  }
  const curPath = (x, pts) => { x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.closePath(); };
  // the pointer arrow, its tip (the hotspot) at 2,2
  const CUR_ARROW = [[2, 2], [2, 23], [7.4, 18.1], [11, 26.2], [14.5, 24.6], [11, 17], [18, 17]];
  function curValue(mark, fallback) {
    return Promise.all([mark.paint(1), mark.paint(2)]).then(([a, b]) => {
      const u = c => `url("${c.toDataURL('image/png')}")`, hot = ` ${mark.hot[0]} ${mark.hot[1]}, ${fallback}`;
      const set = `image-set(${u(a)} 1x, ${u(b)} 2x)` + hot, ok = v => !!(root.CSS && CSS.supports && CSS.supports('cursor', v));
      return ok(set) ? set : ok('-webkit-' + set) ? '-webkit-' + set : u(a) + hot;
    });
  }
  let cursors = 0;
  function nativeCursor(area, opts, base, hover) {
    area = area || document.documentElement;
    const o = opts || {}, id = String(++cursors), prev = area.style.cursor, at = `[data-pg-cursor="${id}"]`;
    let sheet = null, dead = false;
    Promise.all([curValue(base, 'auto'), o.hover ? curValue(hover, 'pointer') : null]).then(([b, h]) => {
      if (dead) return;
      area.style.cursor = b;
      area.setAttribute('data-pg-cursor', id);
      // text fields keep their I-beam; with hover, links and controls take the second mark (the
      // doubled attribute outranks a page's own `.nav button { cursor: pointer }`)
      sheet = document.createElement('style');
      sheet.textContent = `${at}${at} :is(textarea,[contenteditable=""],[contenteditable="true"],input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=color],[type=file],[type=image])){cursor:text}`
        + (h ? `${at}${at} :is(a[href],button,summary,select,label,[role=button],[role=link],[role=switch],[role=tab],input:is([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset])):not(:disabled){cursor:${h}}` : '');
      document.head.appendChild(sheet);
    }).catch(() => {});   // no mark: the system cursor stays
    return { destroy() { dead = true; if (sheet) { sheet.remove(); area.style.cursor = prev; area.removeAttribute('data-pg-cursor'); } } };
  }

  /**
   * Optional extra, not one of the pieces: a custom cursor for `area`, only when the brief asks
   * for one. The system cursor is the default, and the live background is how the style answers
   * the pointer. A native CSS cursor, painted once through the still engine at 32 px (1x and 2x),
   * each mark in white and black outlines so it reads on any ground. opts.mark picks the mark
   * (cursor.marks lists them; an unknown name gives the default); every hover mark splits its pink and teal channels apart:
   *   'arrow'   an arrow filled with a sorted smear, its rows spilling out to the right (the default)
   *   'blocks'  an arrow broken into 2 px macroblocks, each one flat, two rows slipped sideways
   * opts.hover: true gives links and controls inside `area` the hover mark. opts: seed, scene,
   * image (smear options). Returns { destroy() }, which puts the previous cursor back.
   */
  function cursor(area, opts) {
    const o = Object.assign({ mark: 'arrow', seed: 17 }, opts);
    const arrow = x => { x.moveTo(2, 2); x.lineTo(2, 22); x.lineTo(7, 17.5); x.lineTo(10.5, 25); x.lineTo(13.5, 23.6); x.lineTo(10, 16.2); x.lineTo(16.5, 16.2); x.closePath(); };
    const smear = k => G.smear(curCanvas(k), { width: CUR * k, height: CUR * k, seed: o.seed, scene: o.scene, image: o.image, pixel: k });
    const white = '#f4f1ea', black = '#0b0b0e', split = [[-2.5, '#ff3fa4'], [2.5, '#19e3d0']];
    // the silhouette `shape` cut from the smear, outlined black then white; `split` puts pink and teal copies behind it
    const cut = (k, sm, shape, over, rule) => {
      const c = curCut(sm, k, shape, null, rule);
      curUnder(c, k, shape, 1.6, black); curUnder(c, k, shape, 3.6, white);
      if (over) for (const [dx, col] of split) { const x = c.getContext('2d'); x.save(); x.globalCompositeOperation = 'destination-over'; x.setTransform(k, 0, 0, k, dx * k, 0); x.beginPath(); shape(x); x.fillStyle = col; x.fill(rule || 'evenodd'); x.restore(); }
      return c;
    };
    // the arrow on a 2 px grid: a block is in when its centre is, and two rows of blocks slip sideways
    const grid = [], probe = curCanvas(1).getContext('2d');
    probe.beginPath(); curPath(probe, CUR_ARROW);
    for (let j = 0; j < 12; j++) for (let i = 0; i < 8; i++) {
      const bx = 2 + 2 * i, by = 2 + 2 * j;
      if ((i === 0 && j === 0) || probe.isPointInPath(bx + 1, by + 1)) grid.push([bx + (j === 5 ? 2 : j === 9 ? -2 : 0), by]);
    }
    const blocks = x => { for (const [bx, by] of grid) x.rect(bx, by, 2, 2); };
    // each block flat, the colour of the smear at its corner: the picture as a stream of macroblocks
    const flat = k => { const sm = smear(k), t = curCanvas(k), x = t.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(sm, 0, 0, CUR * k, CUR * k, 0, 0, CUR / 2, CUR / 2); x.drawImage(t, 0, 0, CUR / 2, CUR / 2, 0, 0, CUR * k, CUR * k); return t; };
    const marks = {
      arrow: { hot: [2, 2], paint: (k, over) => {
        const sm = smear(k), c = curCanvas(k), x = c.getContext('2d');
        x.scale(k, k);
        // the sorted rows run on out of the arrow, one device row each, to lengths of their own
        for (let y = 5; y < 22; y += 2) x.drawImage(sm, 0, y * k, CUR * k, k, 9, y, 11 + (y * 37) % 11, 1);
        x.beginPath(); arrow(x); x.lineJoin = 'round'; x.lineWidth = 2.6; x.strokeStyle = white; x.stroke();
        if (over) for (const [dx, col] of split) { x.save(); x.translate(dx, 0); x.beginPath(); arrow(x); x.fillStyle = col; x.fill(); x.restore(); }
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.drawImage(curCut(sm, k, arrow, q => { q.beginPath(); arrow(q); q.lineJoin = 'round'; q.lineWidth = 1; q.strokeStyle = black; q.stroke(); }), 0, 0);
        return c;
      } },
      blocks: { hot: [2, 2], paint: (k, over) => cut(k, flat(k), blocks, over, 'nonzero') },
    };
    const m = marks[o.mark] || marks.arrow;
    return nativeCursor(area, o, { hot: m.hot, paint: k => m.paint(k, false) }, { hot: m.hot, paint: k => m.paint(k, true) });
  }
  cursor.marks = ['arrow', 'blocks'];

  G.iconMask = iconMask;
  G.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, icon, ICONS, cursor };
})(typeof window !== 'undefined' ? window : globalThis);
