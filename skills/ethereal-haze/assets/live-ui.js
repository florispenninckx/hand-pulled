/* live-ui.js — interface pieces seen through the haze (needs haze.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live canvas behind it; the canvas is decoration (aria-hidden),
 * the control stays native, keyboard-reachable and readable by assistive tech. The language
 * is a lens and a lamp: at rest a piece is a little out of focus; hovering or focusing it
 * pulls it sharp and lets the light swell toward the pointer; pressing it is a soft bloom.
 *
 *   const ui = Haze.ui;
 *   ui.background(section, { fn: 'bloom', palette: 'coral' });   ui.button(btn);   ui.card(card);
 *   ui.toggle(checkbox);   ui.slider(range);   const p = ui.progress(el); p.set(0.4);
 *   const l = ui.loader(el);   ui.focusRing();   ui.transition(strip);
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Original code, MIT.
 */
(function (root) {
  'use strict';
  const H = root.Haze;
  if (!H || !H.live) throw new Error('live-ui.js: load haze.js and live.js first');
  const live = H.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  // warm ramps for small pieces: a coral light, a rose one, an apricot one
  const RAMPS = {
    coral: ['#fbe6d6', '#f9b48c', '#f47a56', '#ec4f46', '#f6a070', '#fff0e2'],
    rose: ['#fbe4e2', '#f4a6b4', '#ec6a86', '#f08a6a', '#fbd2b4'],
    apricot: ['#fdf0dc', '#fbc98a', '#f89a52', '#f06a3a', '#fbd9a8'],
  };

  // ---------------------------------------------------------------- shared bits
  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
.hz-host{position:relative;isolation:isolate}
.hz-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;border-radius:inherit}
.hz-track{position:relative;display:inline-block;vertical-align:middle;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--hz-line,rgba(43,35,32,.22))}
.hz-track>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.hz-track>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.hz-track>.hz-thumb{position:absolute;top:50%;width:var(--hz-thumb,18px);height:var(--hz-thumb,18px);margin:calc(var(--hz-thumb,18px)/-2) 0 0 calc(var(--hz-thumb,18px)/-2);border-radius:50%;background:var(--hz-thumb-c,#fffaf3);box-shadow:0 1px 6px rgba(120,40,20,.25);pointer-events:none;transition:left .45s cubic-bezier(.2,.7,.2,1)}
.hz-track:has(input:focus-visible){outline:1px solid var(--hz-focus,#2b2320);outline-offset:3px}
.hz-toggle{width:52px;height:28px}
.hz-slider{width:100%;height:14px}
.hz-slider>.hz-thumb{transition:none}
@keyframes hz-breathe{0%,100%{box-shadow:0 0 0 2px rgba(255,241,226,.9),0 0 10px 4px rgba(244,122,86,.45)}50%{box-shadow:0 0 0 2px rgba(255,241,226,.9),0 0 18px 8px rgba(244,122,86,.28)}}
.hz-ring :focus-visible{outline:1px solid var(--hz-focus,#2b2320);outline-offset:3px;box-shadow:0 0 0 2px rgba(255,241,226,.9),0 0 12px 5px rgba(244,122,86,.4)}
@media (prefers-reduced-motion:no-preference){.hz-ring :focus-visible{animation:hz-breathe 3.2s ease-in-out infinite}}`;
    document.head.appendChild(s);
  }
  // a canvas behind `host`'s content, filling it
  function backdrop(host) {
    style();
    host.classList.add('hz-host');
    const c = document.createElement('canvas');
    c.className = 'hz-bg'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    return c;
  }
  // wrap a native input in a track with a canvas under it and a pale thumb over it
  function track(input, cls) {
    style();
    const t = document.createElement('span');
    t.className = 'hz-track ' + (cls || '');
    input.parentNode.insertBefore(t, input);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    const th = document.createElement('span'); th.className = 'hz-thumb'; th.setAttribute('aria-hidden', 'true');
    t.appendChild(c); t.appendChild(input); t.appendChild(th);
    return { t, c, th };
  }
  const piece = (ramp, form, extra) => Object.assign({ fn: 'field', form: form || 'flow', colors: RAMPS[ramp] || ramp, own: false, drift: 0.6, mist: 0.3, breath: 0.25, pointer: true, bloom: 0.35, radius: 0.6 }, extra);
  // one rAF for pieces that move something themselves (the loader's lamp)
  const tickers = new Set();
  let raf = 0;
  const loop = now => { raf = 0; for (const f of tickers) f(now); if (tickers.size) raf = requestAnimationFrame(loop); };
  const tick = f => { tickers.add(f); if (!raf) raf = requestAnimationFrame(loop); return () => tickers.delete(f); };

  // ---------------------------------------------------------------- pieces
  /** A live image behind a section: fog drifting, mist breathing, light following the pointer, click = bloom. */
  function background(host, opts) {
    return live(backdrop(host), Object.assign({ fn: 'field', form: 'fold', drift: 1, mist: 0.5, clickPulse: true, hand: host }, opts));
  }

  /**
   * A button seen a little out of focus; hover or keyboard focus pulls it sharp and the light
   * swells toward the pointer; press (or Enter/Space) is a soft bloom. rest / sharp: focus
   * values (default 0.8 / -0.35). Flip the label colour with :hover / :focus-visible in CSS.
   */
  function button(btn, opts) {
    const o = Object.assign({ ramp: 'coral', form: 'sun', rest: 0.8, sharp: -0.35 }, opts);
    const ctl = live(backdrop(btn), piece(o.ramp, o.form, Object.assign({ focus: o.rest, hand: btn, radius: 0.9, bloom: 0.45, grain: 0.07 }, o.live)));
    if (!ctl) return null;
    let over = false, focus = false;
    const upd = () => ctl.set({ focus: over || focus ? o.sharp : o.rest });
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    btn.addEventListener('pointerleave', () => { over = false; upd(); });
    btn.addEventListener('focus', () => { focus = btn.matches(':focus-visible'); if (focus) { const r = btn.getBoundingClientRect(); ctl.point(r.width / 2, r.height / 2); } upd(); });
    btn.addEventListener('blur', () => { focus = false; ctl.point(null); upd(); });
    btn.addEventListener('pointerdown', e => { const r = btn.getBoundingClientRect(); ctl.pulse(e.clientX - r.left, e.clientY - r.top, 0.9); });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const r = btn.getBoundingClientRect(); ctl.pulse(r.width / 2, r.height / 2, 0.9); } });
    return ctl;
  }

  /** A card that comes into focus the first time it scrolls into view, then drifts and follows the pointer. opts go to live(). */
  function card(el, opts) {
    return live(backdrop(el), Object.assign({ fn: 'ribbon', form: 'shift', enter: true, drift: 0.7, mist: 0.35, hand: el, bloom: 0.25 }, opts));
  }

  /** A switch: off is soft and veiled, on pulls sharp and blooms once. The thumb is a pale disc. */
  function toggle(input, opts) {
    const o = Object.assign({ ramp: 'coral', form: 'flow', off: 1.2, on: -0.2 }, opts);
    if (!input.getAttribute('role')) input.setAttribute('role', 'switch');
    const { t, c, th } = track(input, 'hz-toggle');
    const place = () => { th.style.left = input.checked ? 'calc(100% - 14px)' : '14px'; };
    const ctl = live(c, piece(o.ramp, o.form, { focus: input.checked ? o.on : o.off, reveal: input.checked ? 1 : 0.25, revealPaper: '#efe6d8', hand: t, radius: 1 }));
    place();
    input.addEventListener('change', () => {
      place();
      if (!ctl) return;
      ctl.set({ focus: input.checked ? o.on : o.off, reveal: input.checked ? 1 : 0.25 });
      if (input.checked) { const r = t.getBoundingClientRect(); ctl.pulse(r.width - 14, r.height / 2, 0.8); }
    });
    return ctl;
  }

  /** A slider: colour up to the value, cream paper beyond it, sharp where the thumb is. */
  function slider(input, opts) {
    const o = Object.assign({ ramp: 'apricot', form: 'flow' }, opts);
    const { t, c, th } = track(input, 'hz-slider');
    const val = () => { const lo = +input.min || 0, hi = input.max === '' ? 100 : +input.max; return clamp01((+input.value - lo) / (hi - lo || 1)); };
    const ctl = live(c, piece(o.ramp, o.form, { reveal: val(), revealPaper: '#efe6d8', hand: t, radius: 0.8, sharpen: 0.6 }));
    const upd = () => {
      const v = val(), r = t.getBoundingClientRect();
      th.style.left = `calc(9px + ${v} * (100% - 18px))`;
      if (ctl) { ctl.set({ reveal: v }); ctl.point(9 + v * (r.width - 18), r.height / 2); }
    };
    th.style.setProperty('--hz-thumb', '18px');
    input.addEventListener('input', upd);
    input.addEventListener('blur', () => ctl && ctl.point(null));
    upd();
    if (ctl) ctl.point(null);
    return ctl;
  }

  /** Progress as colour spreading over cream: returns { ctl, set(p) } (0..1); a finished bar blooms. */
  function progress(el, opts) {
    const o = Object.assign({ ramp: 'coral', form: 'flow', value: 0 }, opts);
    const c = backdrop(el);
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    const ctl = live(c, piece(o.ramp, o.form, { reveal: o.value, revealPaper: '#efe6d8', pointer: false, hand: el }));
    let last = o.value;
    const api = {
      ctl,
      set(p) {
        p = clamp01(p);
        el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (ctl) { ctl.set({ reveal: p }); if (p >= 1 && last < 1) { const r = el.getBoundingClientRect(); ctl.pulse(r.width * 0.85, r.height / 2, 0.9); } }
        last = p; return api;
      },
    };
    api.set(o.value);
    return api;
  }

  /** A loader: a small sun breathing quickly while a lamp circles behind the gauze. Returns { ctl, stop() }. Reduced motion: it holds still. */
  function loader(el, opts) {
    const o = Object.assign({ ramp: 'coral', period: 2.2 }, opts);
    el.setAttribute('role', 'status');
    const ctl = live(backdrop(el), piece(o.ramp, 'sun', { breathPeriod: o.period * 1.5, breath: 0.6, mist: 0.5, pointer: false, bloom: 0.55, radius: 0.35, lag: 0.3 }));
    if (!ctl) return { ctl, stop() {} };
    const untick = tick(now => {
      if (RM.matches) return;
      const r = el.getBoundingClientRect(), a = (now / 1000) * Math.PI * 2 / o.period;
      ctl.point(r.width * (0.5 + 0.3 * Math.cos(a)), r.height * (0.5 + 0.3 * Math.sin(a)));
    });
    return { ctl, stop() { untick(); ctl.point(null); } };
  }

  /**
   * One focus ring for the page (or for `scope`): a 1px ink outline plus a warm halo that
   * breathes slowly, on whatever has :focus-visible. CSS only, so it costs nothing and also
   * shows without WebGL2; reduced motion holds the halo still.
   */
  function focusRing(scope) {
    style();
    (scope || document.body).classList.add('hz-ring');
  }

  /**
   * A section transition: a strip of haze that is sharp when it crosses the middle of the
   * viewport and goes soft as it scrolls away, the way a lens racks focus. opts go to live().
   */
  function transition(el, opts) {
    return live(backdrop(el), Object.assign({ fn: 'field', form: 'flow', focus: 0, focusScroll: 1.2, drift: 0.6, mist: 0.4, pointer: false, hand: el }, opts));
  }

  H.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, RAMPS };
})(typeof window !== 'undefined' ? window : globalThis);
