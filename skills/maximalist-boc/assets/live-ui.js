/* live-ui.js — interface pieces poured in live paint (needs pour.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live canvas behind it; the canvas is decoration, the control stays
 * native, keyboard-reachable and readable by assistive tech. The paint is wet: hovering a button
 * stirs it and drags a comb through it, pressing drops paint into it, a switch or a slider is
 * poured from the left up to its value, a card pours in from the top when it first scrolls in.
 *
 *   const ui = Pour.ui;
 *   ui.background(section, { mode: 'marble' });   ui.button(btn);   ui.card(card, { mode: 'bands' });
 *   ui.toggle(checkbox);   ui.slider(range);   const p = ui.progress(el); p.set(0.4);
 *   const l = ui.loader(el);   ui.focusRing();   ui.transition(strip);
 *
 * Every function returns the live controller (or a small object holding it) so a page can set()
 * it further. Original code, MIT.
 */
(function (root) {
  'use strict';
  const P = root.Pour;
  if (!P || !P.live) throw new Error('live-ui.js: load pour.js and live.js first');
  const live = P.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
.mx-host{position:relative;isolation:isolate}
.mx-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;border-radius:inherit}
.mx-track{position:relative;display:inline-block;vertical-align:middle;border-radius:999px;overflow:hidden;background:var(--mx-ground,#090c08);box-shadow:inset 0 0 0 1.5px var(--mx-line,#090c08)}
.mx-track>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.mx-track>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.mx-track>.mx-thumb{position:absolute;top:3px;bottom:3px;aspect-ratio:1;border-radius:50%;background:var(--mx-thumb,#f3f5ea);box-shadow:0 0 0 1.5px var(--mx-line,#090c08);pointer-events:none;transition:left .22s cubic-bezier(.3,1.4,.5,1)}
.mx-toggle{width:58px;height:30px}
.mx-toggle>.mx-thumb{left:3px}
.mx-toggle>input:checked~.mx-thumb{left:calc(100% - 27px)}
.mx-slider{height:26px;width:100%}
.mx-slider>.mx-thumb{transition:none}
.mx-track:has(input:focus-visible){outline:2px solid var(--mx-focus,#cdf564);outline-offset:3px}
.mx-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none}
@media (prefers-reduced-motion: reduce){.mx-track>.mx-thumb{transition:none}}`;
    document.head.appendChild(s);
  }
  // a canvas behind `host`'s content, filling it
  function backdrop(host) {
    style();
    host.classList.add('mx-host');
    const c = document.createElement('canvas');
    c.className = 'mx-bg'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    return c;
  }
  // wrap a native input in a track with a canvas under it and a thumb over it
  function track(input, cls) {
    style();
    const t = document.createElement('span');
    t.className = 'mx-track ' + cls;
    input.parentNode.insertBefore(t, input);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    const th = document.createElement('span'); th.className = 'mx-thumb'; th.setAttribute('aria-hidden', 'true');
    t.appendChild(c); t.appendChild(input); t.appendChild(th);
    return { t, c, th };
  }

  /** A live sheet behind a section: drifting, combed by the pointer, a drop on click. opts go to live(). */
  function background(host, opts) {
    return live(backdrop(host), Object.assign({ mode: 'swirl', ramp: 'pour', pointer: 1, clickPulse: true, hand: host }, opts));
  }

  /**
   * A button on a poured sheet: still at rest, stirred and combed on hover and focus, a drop on
   * press (Enter and Space too). Flip the label colour with a CSS :hover/:focus-visible rule.
   */
  function button(btn, opts) {
    const o = Object.assign({ mode: 'marble', ramp: 'acidnight', scale: 0.7, grain: 0.3, rest: 0, hover: 1, pointer: 1, reach: 0.5, tooth: 7, lag: 0.08, alive: false, own: false }, opts);
    const ctl = live(backdrop(btn), Object.assign({}, o, { wet: o.rest, hand: btn }));
    if (!ctl) return null;
    let over = false, focus = false;
    const upd = () => ctl.set({ wet: over || focus ? o.hover : o.rest, alive: over || focus });
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    btn.addEventListener('pointerleave', () => { over = false; upd(); });
    btn.addEventListener('focus', () => { focus = btn.matches(':focus-visible'); upd(); });
    btn.addEventListener('blur', () => { focus = false; upd(); });
    btn.addEventListener('pointerdown', e => { const r = btn.getBoundingClientRect(); ctl.pulse(e.clientX - r.left, e.clientY - r.top, 1); });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const r = btn.getBoundingClientRect(); ctl.pulse(r.width / 2, r.height / 2, 1); } });
    return ctl;
  }

  /** A card poured in from the top the first time it scrolls into view, then left to flow. opts go to live(). */
  function card(el, opts) {
    return live(backdrop(el), Object.assign({ mode: 'bands', develop: 'in', pointer: 0.8, hand: el, own: false }, opts));
  }

  /** A switch: paint poured across the track when on; the thumb is a native-looking dot over it. */
  function toggle(input, opts) {
    const o = Object.assign({ mode: 'swirl', ramp: 'klein cornflower acid citric', scale: 0.5, grain: 0.3 }, opts);
    if (!input.getAttribute('role')) input.setAttribute('role', 'switch');
    const { c } = track(input, 'mx-toggle');
    const state = () => ({ reveal: input.checked ? 1 : 0 });
    const ctl = live(c, Object.assign({ drift: 1, wet: 0.6, pointer: 0, alive: false, ease: 0.12, own: false }, o, state()));
    input.addEventListener('change', () => ctl && ctl.set(state()));
    return ctl;
  }

  /** A slider: paint poured from the left up to the value, its edge running. */
  function slider(input, opts) {
    const o = Object.assign({ mode: 'bands', ramp: 'agate', grain: 0.3 }, opts);
    const { t, c, th } = track(input, 'mx-slider');
    const val = () => { const lo = +input.min || 0, hi = input.max === '' ? 100 : +input.max; return clamp01((+input.value - lo) / (hi - lo || 1)); };
    const state = () => {
      const r = t.getBoundingClientRect(), k = r.width ? (r.height * 0.5) / r.width : 0.05, x = k + val() * (1 - 2 * k);
      th.style.left = `calc(${(x * 100).toFixed(2)}% - ${(r.height / 2 - 3).toFixed(1)}px)`;
      return { reveal: x };
    };
    const ctl = live(c, Object.assign({ drift: 1, wet: 0.5, pointer: 0, alive: false, ease: 0.08, own: false }, o, state()));
    input.addEventListener('input', () => ctl && ctl.set(state()));
    if (root.ResizeObserver) new ResizeObserver(() => ctl && ctl.set(state())).observe(t);
    return ctl;
  }

  /** Progress as a pour: the strip fills up to p. Returns { ctl, set(p) }; a finished bar gets a drop. */
  function progress(el, opts) {
    const o = Object.assign({ mode: 'swirl', ramp: 'shallows', scale: 0.4, grain: 0.3, value: 0 }, opts);
    const c = backdrop(el);
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    const so = Object.assign({}, o); delete so.value;
    const ctl = live(c, Object.assign({ drift: 1, wet: 0.7, pointer: 0, alive: true, ease: 0.12, own: false, reveal: o.value }, so));
    let last = o.value;
    const api = {
      ctl,
      set(p) {
        p = clamp01(p);
        el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (ctl) { ctl.set({ reveal: p }); if (p >= 1 && last < 1) { const r = el.getBoundingClientRect(); ctl.pulse(r.width * 0.85, r.height / 2, 1); } }
        last = p; return api;
      },
    };
    api.set(o.value);
    return api;
  }

  /** A loader: a small sheet stirred fast with a drop every beat. Returns { ctl, stop() }. With reduced motion it holds still. */
  function loader(el, opts) {
    const o = Object.assign({ mode: 'marble', ramp: 'acidnight', scale: 0.5, grain: 0.3, beat: 0.7 }, opts);
    el.setAttribute('role', 'status');
    const so = Object.assign({}, o); delete so.beat;
    const ctl = live(backdrop(el), Object.assign({ drift: 1, speed: 4, wet: 1.6, pointer: 0, alive: true, own: false }, so));
    if (!ctl) return { ctl, stop() {} };
    let n = 0;
    const id = setInterval(() => {
      if (RM.matches || document.hidden) return;
      const r = el.getBoundingClientRect(), a = n++ * 2.4;
      ctl.pulse(r.width * (0.5 + 0.28 * Math.cos(a)), r.height * (0.5 + 0.28 * Math.sin(a)), 1);
    }, o.beat * 1000);
    return { ctl, stop() { clearInterval(id); ctl.set({ wet: 0 }); } };
  }

  /**
   * One focus ring for the page: a band of live paint drawn round whatever has :focus-visible,
   * on a transparent overlay. Keep a 2px CSS outline too (it shows without WebGL2 and in forced
   * colours). opts: mode/ramp, pad (px), band (px).
   */
  function focusRing(opts) {
    const o = Object.assign({ mode: 'swirl', ramp: 'citric acid citric+50 mint', scale: 0.3, grain: 0.2, pad: 4, band: 4 }, opts);
    style();
    const c = document.createElement('canvas');
    c.className = 'mx-ring'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    let el = null, ctl = null;
    const so = Object.assign({}, o); delete so.pad; delete so.band;
    function place() {
      if (!el || !el.isConnected) { c.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), m = o.pad + o.band;
      const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      Object.assign(c.style, { display: 'block', left: (r.left - m) + 'px', top: (r.top - m) + 'px', width: (r.width + 2 * m) + 'px', height: (r.height + 2 * m) + 'px' });
      const ring = { pad: o.band * 0.5, band: o.band, radius: rad + o.pad + o.band * 0.5 };
      if (!ctl) ctl = live(c, Object.assign({ drift: 1, wet: 0.8, pointer: 0, alive: true, own: false, ring }, so));
      else ctl.set({ ring });
    }
    document.addEventListener('focusin', e => { el = e.target.matches(':focus-visible') ? e.target : null; place(); });
    document.addEventListener('focusout', () => { el = null; place(); });
    root.addEventListener('scroll', () => el && place(), { passive: true, capture: true });
    root.addEventListener('resize', () => el && place());
    return { get ctl() { return ctl; } };
  }

  /** A section transition: a strip poured down as it scrolls up the viewport. opts go to live(). */
  function transition(el, opts) {
    return live(backdrop(el), Object.assign({ mode: 'marble', ramp: 'ember', develop: 'scroll', pointer: 0.6, hand: el, own: false }, opts));
  }

  P.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition };
})(typeof window !== 'undefined' ? window : globalThis);
