/* live-ui.js — interface pieces seen through the glass (needs surface.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live plate behind it; the canvas is aria-hidden decoration, the
 * control stays native, keyboard-reachable and readable by assistive tech. The vocabulary is
 * the surface's: at rest a control shows mostly its soft colour field, hovering or focusing it
 * develops the pane over the field and lifts the grain, a low light rakes across it from the
 * pointer, and a press sends an echo ring through the glass.
 *
 *   const ui = Surface.ui;
 *   ui.background(section, { mode: 'reeded', palette: 'cobalt' });   ui.button(btn);   ui.card(card);
 *   ui.toggle(checkbox);   ui.slider(range);   const p = ui.progress(el); p.set(0.4);
 *   const l = ui.loader(el); l.stop();   ui.focusRing();   ui.transition(strip);
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Original code, MIT.
 */
(function (root) {
  'use strict';
  const S = root.Surface;
  if (!S || !S.live) throw new Error('live-ui.js: load surface.js and live.js first');
  const live = S.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  // small plates: no type, grain lighter than a poster's (the board read the posters' grain as heavy)
  const SMALL = { text: false, grain: 0.6, alive: true, drift: 0, rake: 0, own: false };

  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
.at-host{position:relative;isolation:isolate}
.at-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;border-radius:inherit}
.at-track{position:relative;display:inline-block;vertical-align:middle;overflow:hidden;box-shadow:inset 0 0 0 1px var(--at-line,#2c2d31)}
.at-track>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.at-track>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.at-track:has(input:focus-visible){outline:1px solid var(--at-focus,#ff4a12);outline-offset:3px}
.at-toggle{width:52px;height:26px}
.at-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;background:var(--at-ink,#e8e6e1);pointer-events:none;transition:transform .22s cubic-bezier(.3,.7,.3,1)}
.at-toggle>input:checked~.at-thumb{transform:translateX(26px)}
.at-slider{width:220px;height:22px}
.at-mark{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--at-ink,#e8e6e1);pointer-events:none}
.at-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none}
@media (prefers-reduced-motion:reduce){.at-thumb{transition:none}}`;
    document.head.appendChild(s);
  }
  // a canvas behind `host`'s content, filling it
  function backdrop(host) {
    style();
    host.classList.add('at-host');
    const c = document.createElement('canvas');
    c.className = 'at-bg'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    return c;
  }
  // one rAF for the pieces that move something themselves (the loader's lamp)
  const tickers = new Set();
  let raf = 0;
  const loop = now => { raf = 0; for (const f of tickers) f(now); if (tickers.size) raf = requestAnimationFrame(loop); };
  const tick = f => { tickers.add(f); if (!raf) raf = requestAnimationFrame(loop); return () => tickers.delete(f); };

  /** A live plate behind a section: contour echoes drifting, the raking light on the pointer, a click drops an echo ring. */
  function background(host, opts) {
    return live(backdrop(host), Object.assign({ mode: 'reeded', palette: 'cobalt', text: false, drift: 1, rake: 0.35, clickPulse: true, hand: host }, opts));
  }

  /**
   * A button: at rest the surface is half developed over its field; hover and keyboard focus
   * develop it fully and lift the grain, the pointer rakes light across the flutes, and a
   * press (or Enter/Space) sends an echo ring. rest / hover: exposure (default 0.4 / 1).
   */
  function button(btn, opts) {
    const o = Object.assign({ mode: 'reeded', palette: 'ember', rest: 0.4, hover: 1, under: 0.55 }, opts);
    const ctl = live(backdrop(btn), Object.assign({}, SMALL, { rake: 0.5, radius: 0.9, lag: 0.12, ease: 0.16 }, o, { develop: o.rest, hand: btn }));
    if (!ctl) return null;
    let over = false, focus = false;
    const upd = () => ctl.set({ develop: over || focus ? o.hover : o.rest, lift: over || focus ? 1 : 0 });
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    btn.addEventListener('pointerleave', () => { over = false; upd(); });
    btn.addEventListener('focus', () => { focus = btn.matches(':focus-visible'); upd(); });
    btn.addEventListener('blur', () => { focus = false; upd(); });
    btn.addEventListener('pointerdown', e => { const r = btn.getBoundingClientRect(); ctl.pulse(e.clientX - r.left, e.clientY - r.top, 1); });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const r = btn.getBoundingClientRect(); ctl.pulse(r.width / 2, r.height / 2, 1); } });
    return ctl;
  }

  /** A card whose surface develops over its field the first time it scrolls into view; the pointer rakes it, hover lifts the grain. */
  function card(el, opts) {
    const ctl = live(backdrop(el), Object.assign({ mode: 'satin', palette: 'opal', text: false, grain: 0.7, develop: 'in', drift: 0.7, rake: 0.3, hand: el }, opts));
    if (ctl) { el.addEventListener('pointerenter', () => ctl.set({ lift: 0.8 })); el.addEventListener('pointerleave', () => ctl.set({ lift: 0 })); }
    return ctl;
  }

  // wrap a native input in a track with a canvas under it
  function track(input, cls) {
    style();
    const t = document.createElement('span');
    t.className = 'at-track ' + (cls || '');
    input.parentNode.insertBefore(t, input);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    t.appendChild(c); t.appendChild(input);
    return { t, c };
  }

  /** A switch: off shows the dim bare field, on develops the pane over it. The thumb is a flat ink square. */
  function toggle(input, opts) {
    const o = Object.assign({ mode: 'reeded', palette: 'ember', off: 0, on: 1, under: 0.35 }, opts);
    if (!input.getAttribute('role')) input.setAttribute('role', 'switch');
    const { t, c } = track(input, 'at-toggle');
    const th = document.createElement('span'); th.className = 'at-thumb'; th.setAttribute('aria-hidden', 'true'); t.appendChild(th);
    const state = () => ({ develop: input.checked ? o.on : o.off });
    const ctl = live(c, Object.assign({}, SMALL, { ease: 0.14 }, o, state()));
    input.addEventListener('change', () => { if (!ctl) return; ctl.set(state()); if (input.checked) { const r = t.getBoundingClientRect(); ctl.pulse(r.width * 0.75, r.height / 2, 0.8); } });
    return ctl;
  }

  /** A slider: the pane is developed from 0 up to the value, the rest is the dim field; a hairline marks the thumb. */
  function slider(input, opts) {
    const o = Object.assign({ mode: 'streak', palette: 'coral', under: 0.3 }, opts);
    const { t, c } = track(input, 'at-slider');
    const mark = document.createElement('span'); mark.className = 'at-mark'; mark.setAttribute('aria-hidden', 'true'); t.appendChild(mark);
    const val = () => { const lo = +input.min || 0, hi = input.max === '' ? 100 : +input.max; return clamp01((+input.value - lo) / (hi - lo || 1)); };
    const state = () => { const x = val(); mark.style.left = (x * 100) + '%'; return { reveal: [0, x, 0.01] }; };
    const ctl = live(c, Object.assign({}, SMALL, { ease: 0.08 }, o, state()));
    input.addEventListener('input', () => ctl && ctl.set(state()));
    input.addEventListener('pointerenter', () => ctl && ctl.set({ lift: 1 }));
    input.addEventListener('pointerleave', () => ctl && ctl.set({ lift: 0 }));
    return ctl;
  }

  /** Progress: the pane develops across the strip up to p. Returns { ctl, set(p) }; a finished bar sends an echo ring. */
  function progress(el, opts) {
    const o = Object.assign({ mode: 'streak', palette: 'signal', value: 0, under: 0.3 }, opts);
    const c = backdrop(el);
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    const ctl = live(c, Object.assign({}, SMALL, { ease: 0.12 }, o, { reveal: [0, o.value, 0.01] }));
    let last = o.value;
    const api = {
      ctl,
      set(p) {
        p = clamp01(p);
        el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (ctl) { ctl.set({ reveal: [0, p, 0.01], lift: p > 0 && p < 1 ? 0.6 : 0 }); if (p >= 1 && last < 1) { const r = el.getBoundingClientRect(); ctl.pulse(r.width * 0.9, r.height / 2, 0.9); } }
        last = p; return api;
      },
    };
    api.set(o.value);
    return api;
  }

  /** A loader: a lamp circling low over a small plate, and an echo ring every period. Returns { ctl, stop() }. Holds still with reduced motion. */
  function loader(el, opts) {
    const o = Object.assign({ mode: 'aurora', palette: 'halo', period: 1.8 }, opts);
    el.setAttribute('role', 'status');
    const ctl = live(backdrop(el), Object.assign({}, SMALL, { rake: 0.8, radius: 0.7, lag: 0.15, drift: 0.8, lift: 0.5 }, o));
    if (!ctl) return { ctl, stop() {} };
    let beat = -1;
    const untick = tick(now => {
      if (RM.matches) return;
      const r = el.getBoundingClientRect(), s = now / 1000 / o.period, a = s * Math.PI * 2;
      ctl.point(r.width * (0.5 + 0.34 * Math.cos(a)), r.height * (0.5 + 0.34 * Math.sin(a)));
      if (Math.floor(s) !== beat) { beat = Math.floor(s); ctl.pulse(r.width / 2, r.height / 2, 0.6); }
    });
    return { ctl, stop() { untick(); ctl.point(null); } };
  }

  /**
   * One focus ring for the page: a band of the ember plate, masked to a rounded rectangle,
   * over whatever has :focus-visible. Keep a 1px CSS outline too: it is what shows without
   * WebGL2 and in forced colours. opts: mode, palette, pad (px), band (px).
   */
  function focusRing(opts) {
    const o = Object.assign({ mode: 'reeded', palette: 'ember', pad: 5, band: 3 }, opts);
    style();
    const c = document.createElement('canvas');
    c.className = 'at-ring'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    let el = null, ctl = null, key = '';
    function place() {
      if (!el || !el.isConnected) { c.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), p = o.pad + o.band * 1.5;
      const w = Math.round(r.width + 2 * p), h = Math.round(r.height + 2 * p);
      Object.assign(c.style, { display: 'block', width: w + 'px', height: h + 'px', transform: `translate(${Math.round(r.left - p)}px,${Math.round(r.top - p)}px)` });
      const rad = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) + o.pad, k = w + 'x' + h + 'x' + rad;
      if (k === key) return;
      key = k;
      const ring = { pad: 0, band: o.band, radius: rad };
      if (!ctl) ctl = live(c, Object.assign({}, SMALL, { grain: 0.8, lift: 0.6, ring }, { mode: o.mode, palette: o.palette, seed: 9 }));
      else ctl.set({ ring });
    }
    document.addEventListener('focusin', e => { el = e.target.matches(':focus-visible') ? e.target : null; place(); });
    document.addEventListener('focusout', () => { el = null; place(); });
    root.addEventListener('scroll', () => el && place(), { passive: true, capture: true });
    root.addEventListener('resize', () => el && place());
    return { get ctl() { return ctl; }, canvas: c };
  }

  /** A section transition: a strip whose streaks develop over its bare field as it scrolls past. */
  function transition(el, opts) {
    return live(backdrop(el), Object.assign({ mode: 'streak', palette: 'drip', text: false, grain: 0.7, develop: 'scroll', scrollRange: [0, 1], drift: 0.6, rake: 0, own: false }, opts));
  }

  S.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition };
})(typeof window !== 'undefined' ? window : globalThis);
