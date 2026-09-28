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
 *   const l = ui.loader(el);   ui.focusRing();   ui.transition(strip);
 *
 * Every function returns the live controller (or a small object holding it) so a page can set()
 * it further. Original code, MIT.
 */
(function (root) {
  'use strict';
  const G = root.Glitch;
  if (!G || !G.live) throw new Error('live-ui.js: load pixelsort.js, glitch.js and live.js first');
  const live = G.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

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
.pg-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none;image-rendering:pixelated}`;
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

  G.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition };
})(typeof window !== 'undefined' ? window : globalThis);
