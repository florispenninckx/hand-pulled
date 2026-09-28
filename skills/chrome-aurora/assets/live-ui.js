/* live-ui.js — interface pieces cast in liquid chrome (needs mercury.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live canvas behind it; the canvas is decoration (aria-hidden), the
 * control stays native, keyboard-reachable and readable by assistive tech. Light is a lamp: hovering
 * a button raises the lamp over it and the highlight follows the pointer, pressing drops a ripple
 * into the metal, a switch polishes the half its thumb sits on, a slider polishes the strip up to
 * its value, a card rises out of the black when it scrolls in.
 *
 *   const ui = Mercury.ui;
 *   ui.background(section);   ui.button(btn);   ui.card(card, { plate: 'ribbon', look: 'volt' });
 *   ui.toggle(checkbox);   ui.slider(range);   const p = ui.progress(el); p.set(0.4);
 *   const l = ui.loader(el);   ui.focusRing();   ui.transition(strip);
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Original code, MIT.
 */
(function (root) {
  'use strict';
  const M = root.Mercury;
  if (!M || !M.live) throw new Error('live-ui.js: load mercury.js and live.js first');
  const live = M.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
.ma-host{position:relative;isolation:isolate;overflow:hidden}
.ma-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;border-radius:inherit;background:#000}
.ma-track{position:relative;display:inline-block;vertical-align:middle;border-radius:999px;overflow:hidden;background:#000;box-shadow:inset 0 0 0 1px var(--ma-line,rgba(235,231,223,.22))}
.ma-track>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.ma-track>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.ma-track:has(input:focus-visible){outline:1px solid var(--ma-focus,#ebe7df);outline-offset:3px}
.ma-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none;border-radius:8px;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.ma-ring>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}`;
    document.head.appendChild(s);
  }
  // a canvas behind `host`'s content, filling it
  function backdrop(host) {
    style();
    host.classList.add('ma-host');
    const c = document.createElement('canvas');
    c.className = 'ma-bg'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    return c;
  }
  // one rAF for the pieces that move something themselves (the loader's orbiting lamp)
  const tickers = new Set();
  let raf = 0;
  const loop = now => { raf = 0; for (const f of tickers) f(now); if (tickers.size) raf = requestAnimationFrame(loop); };
  const tick = f => { tickers.add(f); if (!raf) raf = requestAnimationFrame(loop); return () => tickers.delete(f); };

  /** A live pool of chrome behind a section: aurora drift, the lamp follows the pointer, clicks ripple. */
  function background(host, opts) {
    return live(backdrop(host), Object.assign({ plate: 'film', look: 'oxide', seed: 7, drift: 1, pointer: 0.9, clickPulse: true, tilt: 1, hand: host }, opts));
  }

  /**
   * A button of black chrome: dimmed at rest, the lamp rises over it on hover and focus and
   * follows the pointer, a press (or Enter/Space) drops a ripple. rest / hover: level (0.55 / 1).
   */
  function button(btn, opts) {
    const o = Object.assign({ plate: 'glass', look: 'eye', seed: 4, grain: 0.03, zoom: 360, rest: 0.55, hover: 1, drift: 0, pointer: 1, radius: 0.9, tilt: 0, clickPulse: false, ease: 0.14 }, opts);
    const ctl = live(backdrop(btn), Object.assign({}, o, { level: o.rest, hand: btn }));
    if (!ctl) return null;
    let over = false, focus = false;
    const r = () => btn.getBoundingClientRect();
    const upd = () => { ctl.set({ level: over || focus ? o.hover : o.rest }); if (focus && !over) ctl.point(r().width * 0.3, r().height * 0.2); else if (!over) ctl.point(null); };
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    btn.addEventListener('pointerleave', () => { over = false; upd(); });
    btn.addEventListener('focus', () => { focus = btn.matches(':focus-visible'); upd(); });
    btn.addEventListener('blur', () => { focus = false; upd(); });
    btn.addEventListener('pointerdown', e => ctl.pulse(e.clientX - r().left, e.clientY - r().top, 1));
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') ctl.pulse(r().width / 2, r().height / 2, 1); });
    return ctl;
  }

  /** A card whose plate rises out of the black the first time it scrolls into view. opts go to live(). */
  function card(el, opts) {
    return live(backdrop(el), Object.assign({ plate: 'ribbon', look: 'volt', seed: 3, rise: true, drift: 0.7, pointer: 0.8, tilt: 0.6, hand: el }, opts));
  }

  // wrap a native input in a track with a canvas under it
  function track(input, cls) {
    style();
    const t = document.createElement('span');
    t.className = 'ma-track ' + (cls || '');
    input.parentNode.insertBefore(t, input);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    t.appendChild(c); t.appendChild(input);
    return { t, c };
  }

  /** A switch: the half the thumb sits on is polished chrome, the rest is dull; flipping slides the polish. */
  function toggle(input, opts) {
    const o = Object.assign({ plate: 'glass', look: 'pool', seed: 2, grain: 0.03, zoom: 240 }, opts);
    if (!input.getAttribute('role')) input.setAttribute('role', 'switch');
    const { t, c } = track(input, 'ma-toggle');
    const state = () => ({ fill: input.checked ? [0.5, 1, 0.02] : [0, 0.5, 0.02] });
    const ctl = live(c, Object.assign({ drift: 0, pointer: 0.8, radius: 1, tilt: 0, clickPulse: false, ease: 0.12, own: false, hand: t }, o, state()));
    input.addEventListener('change', () => { if (!ctl) return; ctl.set(state()); const r = t.getBoundingClientRect(); ctl.pulse(r.width * (input.checked ? 0.75 : 0.25), r.height / 2, 0.8); });
    return ctl;
  }

  /** A slider: the strip is polished from 0 up to the value, dull past it. */
  function slider(input, opts) {
    const o = Object.assign({ plate: 'glass', look: 'pool', seed: 6, grain: 0.03, zoom: 300 }, opts);
    const { t, c } = track(input, 'ma-slider');
    const val = () => { const lo = +input.min || 0, hi = input.max === '' ? 100 : +input.max; return clamp01((+input.value - lo) / (hi - lo || 1)); };
    const ctl = live(c, Object.assign({ drift: 0, pointer: 0.8, radius: 0.6, tilt: 0, clickPulse: false, ease: 0.08, own: false, hand: t }, o, { fill: [0, val(), 0.006] }));
    input.addEventListener('input', () => ctl && ctl.set({ fill: [0, val(), 0.006] }));
    return ctl;
  }

  /** Progress as polish: the strip is polished up to p. Returns { ctl, set(p) }; a finished bar ripples. */
  function progress(el, opts) {
    const o = Object.assign({ plate: 'ribbon', look: 'lagoon', seed: 9, grain: 0.04, zoom: 260, value: 0 }, opts);
    const c = backdrop(el);
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    const ctl = live(c, Object.assign({ drift: 0.6, pointer: 0, tilt: 0, clickPulse: false, ease: 0.12, own: false }, o, { fill: [0, o.value, 0.005] }));
    let last = o.value;
    const api = {
      ctl,
      set(p) {
        p = clamp01(p);
        el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (ctl) { ctl.set({ fill: [0, p, 0.005] }); if (p >= 1 && last < 1) { const r = el.getBoundingClientRect(); ctl.pulse(r.width * 0.92, r.height / 2, 1); } }
        last = p; return api;
      },
    };
    api.set(o.value);
    return api;
  }

  /** A loader: a bead of chrome with a lamp circling over it. Returns { ctl, stop() }. With reduced motion it holds still. */
  function loader(el, opts) {
    const o = Object.assign({ plate: 'glass', look: 'eye', seed: 12, grain: 0.03, zoom: 160, period: 1.4 }, opts);
    el.setAttribute('role', 'status');
    const ctl = live(backdrop(el), Object.assign({ drift: 0.5, pointer: 1, radius: 0.7, lag: 0.08, tilt: 0, clickPulse: false, own: false }, o));
    if (!ctl) return { ctl, stop() {} };
    const untick = tick(now => {
      if (RM.matches) return;
      const r = el.getBoundingClientRect(), a = (now / 1000) * Math.PI * 2 / o.period;
      ctl.point(r.width * (0.5 + 0.34 * Math.cos(a)), r.height * (0.5 + 0.34 * Math.sin(a)));
    });
    return { ctl, stop() { untick(); ctl.point(null); } };
  }

  /**
   * One focus ring for the page: a band of chrome drawn round whatever has :focus-visible, cut by a
   * CSS mask so only the band shows. Keep a 1px CSS outline too (it is what shows without WebGL2 and
   * in forced colours). opts: pad (px), band (px), plate/look.
   */
  function focusRing(opts) {
    const o = Object.assign({ pad: 4, band: 3, plate: 'glass', look: 'pinch', seed: 5, grain: 0.03 }, opts);
    style();
    const box = document.createElement('div');
    box.className = 'ma-ring'; box.setAttribute('aria-hidden', 'true');
    box.style.padding = o.band + 'px';
    const c = document.createElement('canvas'); box.appendChild(c);
    document.body.appendChild(box);
    let el = null, ctl = null;
    function place() {
      if (!el || !el.isConnected) { box.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), p = o.pad + o.band;
      const rad = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 2) + p;
      Object.assign(box.style, { display: 'block', width: Math.round(r.width + 2 * p) + 'px', height: Math.round(r.height + 2 * p) + 'px', borderRadius: rad + 'px', transform: `translate(${Math.round(r.left - p)}px,${Math.round(r.top - p)}px)` });
      if (!ctl) ctl = live(c, { plate: o.plate, look: o.look, seed: o.seed, grain: o.grain, drift: 1, speed: 3, pointer: 0, tilt: 0, clickPulse: false, own: false });
    }
    document.addEventListener('focusin', e => { el = e.target.matches(':focus-visible') ? e.target : null; place(); });
    document.addEventListener('focusout', () => { el = null; place(); });
    root.addEventListener('scroll', () => el && place(), { passive: true, capture: true });
    root.addEventListener('resize', () => el && place());
    return { get ctl() { return ctl; }, el: box };
  }

  /**
   * A section transition: a strip of aurora light that brightens out of black as it scrolls up the
   * viewport, and whose reflection tilts with the scroll. opts go to live().
   */
  function transition(el, opts) {
    return live(backdrop(el), Object.assign({ plate: 'aurora', look: 'ember', seed: 3, scroll: true, drift: 0.8, pointer: 0.5, tilt: 1.4, hand: el }, opts));
  }

  M.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition };
})(typeof window !== 'undefined' ? window : globalThis);
