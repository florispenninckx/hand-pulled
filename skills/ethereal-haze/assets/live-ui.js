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
 *   const l = ui.loader(el);   ui.focusRing();   ui.transition(strip);   ui.cursor(area);   ui.icon(span, 'flower');
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Icons: Phosphor Icons (light weight), MIT, Copyright (c) 2023 Phosphor Icons,
 * https://phosphoricons.com — inlined below, never fetched. The rest is original code, MIT.
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

  // Phosphor Icons, light weight (MIT). 256 viewBox, filled outlines.
  const P = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="${d}"/></svg>`;
  const ICONS = {
    flower: P('M209.35,131.09a42.24,42.24,0,0,0-6.82-3.09,42.24,42.24,0,0,0,6.82-3.09,38,38,0,1,0-38-65.82,43.33,43.33,0,0,0-6.08,4.36A42.94,42.94,0,0,0,166,56a38,38,0,0,0-76,0,42.94,42.94,0,0,0,.73,7.45,43.33,43.33,0,0,0-6.08-4.36,38,38,0,0,0-38,65.82A42.24,42.24,0,0,0,53.47,128a42.24,42.24,0,0,0-6.82,3.09,38,38,0,0,0,9.16,69.62,38.53,38.53,0,0,0,9.9,1.31,37.82,37.82,0,0,0,18.94-5.11,43.33,43.33,0,0,0,6.08-4.36A42.94,42.94,0,0,0,90,200a38,38,0,0,0,76,0,42.94,42.94,0,0,0-.73-7.45,43.33,43.33,0,0,0,6.08,4.36A37.82,37.82,0,0,0,190.29,202a38.53,38.53,0,0,0,9.9-1.31,38,38,0,0,0,9.16-69.62Zm-32-61.61a26,26,0,1,1,26,45c-4.77,2.75-14.92,6.15-36.4,7.47l-1.44-.08A38,38,0,0,0,152,98.58l.66-1.31C164.56,79.33,172.58,72.24,177.35,69.48ZM128,154a26,26,0,1,1,26-26A26,26,0,0,1,128,154Zm0-124a26,26,0,0,1,26,26c0,5.51-2.13,16-11.73,35.27-.26.4-.53.8-.79,1.21a37.88,37.88,0,0,0-27,0l-.79-1.22C104.13,72,102,61.51,102,56A26,26,0,0,1,128,30ZM52.65,114.52a26,26,0,0,1,26-45c4.77,2.76,12.79,9.85,24.67,27.79l.66,1.31a38,38,0,0,0-13.49,23.33l-1.44.08C67.57,120.67,57.42,117.27,52.65,114.52Zm26,72a26,26,0,0,1-26-45c4.77-2.75,14.92-6.15,36.4-7.47l1.44.08A38,38,0,0,0,104,157.42l-.66,1.31C91.44,176.67,83.42,183.76,78.65,186.52ZM128,226a26,26,0,0,1-26-26c0-5.51,2.13-16,11.73-35.27.26-.4.53-.8.79-1.21a37.88,37.88,0,0,0,27,0l.79,1.22C151.87,184,154,194.49,154,200A26,26,0,0,1,128,226Zm84.87-49a26,26,0,0,1-35.52,9.52c-4.77-2.76-12.79-9.85-24.67-27.79l-.66-1.31a38,38,0,0,0,13.49-23.33L167,134c21.48,1.32,31.63,4.72,36.4,7.47A26,26,0,0,1,212.87,177Z'),
    drop: P('M172.53,49.06a252.86,252.86,0,0,0-41.09-38,6,6,0,0,0-6.88,0,252.86,252.86,0,0,0-41.09,38C56.34,80.26,42,113.09,42,144a86,86,0,0,0,172,0C214,113.09,199.66,80.26,172.53,49.06ZM128,218a74.09,74.09,0,0,1-74-74c0-59.62,59-108.93,74-120.51C143,35.07,202,84.38,202,144A74.09,74.09,0,0,1,128,218Zm53.92-65A55.58,55.58,0,0,1,137,197.92a7,7,0,0,1-1,.08,6,6,0,0,1-1-11.92c17.38-2.92,32.13-17.68,35.08-35.08a6,6,0,1,1,11.84,2Z'),
    sun: P('M122,40V16a6,6,0,0,1,12,0V40a6,6,0,0,1-12,0Zm68,88a62,62,0,1,1-62-62A62.07,62.07,0,0,1,190,128Zm-12,0a50,50,0,1,0-50,50A50.06,50.06,0,0,0,178,128ZM59.76,68.24a6,6,0,1,0,8.48-8.48l-16-16a6,6,0,0,0-8.48,8.48Zm0,119.52-16,16a6,6,0,1,0,8.48,8.48l16-16a6,6,0,1,0-8.48-8.48ZM192,70a6,6,0,0,0,4.24-1.76l16-16a6,6,0,0,0-8.48-8.48l-16,16A6,6,0,0,0,192,70Zm4.24,117.76a6,6,0,0,0-8.48,8.48l16,16a6,6,0,0,0,8.48-8.48ZM46,128a6,6,0,0,0-6-6H16a6,6,0,0,0,0,12H40A6,6,0,0,0,46,128Zm82,82a6,6,0,0,0-6,6v24a6,6,0,0,0,12,0V216A6,6,0,0,0,128,210Zm112-88H216a6,6,0,0,0,0,12h24a6,6,0,0,0,0-12Z'),
    clock: P('M128,26A102,102,0,1,0,230,128,102.12,102.12,0,0,0,128,26Zm0,192a90,90,0,1,1,90-90A90.1,90.1,0,0,1,128,218Zm62-90a6,6,0,0,1-6,6H128a6,6,0,0,1-6-6V72a6,6,0,0,1,12,0v50h50A6,6,0,0,1,190,128Z'),
    sliders: P('M40,86H74.6a30,30,0,0,0,58.8,0H216a6,6,0,0,0,0-12H133.4a30,30,0,0,0-58.8,0H40a6,6,0,0,0,0,12Zm64-24A18,18,0,1,1,86,80,18,18,0,0,1,104,62ZM216,170H197.4a30,30,0,0,0-58.8,0H40a6,6,0,0,0,0,12h98.6a30,30,0,0,0,58.8,0H216a6,6,0,0,0,0-12Zm-48,24a18,18,0,1,1,18-18A18,18,0,0,1,168,194Z'),
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
@media (prefers-reduced-motion:no-preference){.hz-ring :focus-visible{animation:hz-breathe 3.2s ease-in-out infinite}}
.hz-ring.hz-ring-live :focus-visible{box-shadow:none;animation:none}
.hz-halo{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none}
.hz-halo>canvas{width:100%;height:100%;display:block}
.hz-icon{display:inline-block;position:relative;vertical-align:middle;border-radius:50%;overflow:hidden}
.hz-icon>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}`;
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
   * One focus ring for the page (or for `scope`): a 1px ink outline on whatever has
   * :focus-visible, and around it a band of warm haze on a transparent overlay, breathing
   * slowly (a live sun seen through a soft ring-shaped mask that follows the element's radius).
   * The outline stays: it is what shows in forced colours. Without WebGL2 the overlay is
   * replaced by a CSS halo; reduced motion holds either still. opts: ramp, pad, band (px).
   */
  function focusRing(scope, opts) {
    const o = Object.assign({ ramp: 'coral', pad: 4, band: 7 }, opts);
    style();
    const host = scope || document.body;
    host.classList.add('hz-ring');
    const wrap = document.createElement('div'), c = document.createElement('canvas');
    wrap.className = 'hz-halo'; wrap.setAttribute('aria-hidden', 'true');
    wrap.appendChild(c); document.body.appendChild(wrap);
    let el = null, ctl = null, key = '', off = false;
    // the band as an alpha mask: a rounded rectangle stroked soft, drawn once per size
    const mask = (w, h, rad) => {
      const m = document.createElement('canvas'); m.width = w; m.height = h;
      const x = m.getContext('2d'), e = o.band / 2 + 1;
      x.filter = `blur(${(o.band * 0.28).toFixed(1)}px)`; x.lineWidth = o.band; x.strokeStyle = '#000';
      x.beginPath(); x.roundRect(e, e, w - 2 * e, h - 2 * e, Math.max(0, rad)); x.stroke();
      return `url(${m.toDataURL()})`;
    };
    function place() {
      if (off || !el || !el.isConnected || !host.contains(el)) { wrap.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), p = o.pad + o.band;
      const w = Math.round(r.width + 2 * p), h = Math.round(r.height + 2 * p);
      Object.assign(wrap.style, { display: 'block', width: w + 'px', height: h + 'px', transform: `translate(${Math.round(r.left - p)}px,${Math.round(r.top - p)}px)` });
      const rad = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.height / 2), k = w + 'x' + h + 'x' + rad;
      if (k === key) return;
      key = k;
      const m = mask(w, h, rad + p - o.band / 2 - 1);
      wrap.style.webkitMaskImage = wrap.style.maskImage = m;
      if (!ctl) {
        ctl = live(c, piece(o.ramp, 'sun', { pointer: false, breath: 0.7, breathPeriod: 6, mist: 0.2, drift: 1, focus: 0.3, own: false, seed: 5 }));
        if (!ctl) { off = true; host.classList.remove('hz-ring-live'); wrap.remove(); return; }
      }
    }
    host.classList.add('hz-ring-live');
    document.addEventListener('focusin', e => { el = e.target.matches(':focus-visible') ? e.target : null; place(); });
    document.addEventListener('focusout', () => { el = null; place(); });
    root.addEventListener('scroll', () => el && place(), { passive: true, capture: true });
    root.addEventListener('resize', () => el && place());
    return { get ctl() { return ctl; }, canvas: c };
  }

  /**
   * A section transition: a strip of haze that is sharp when it crosses the middle of the
   * viewport and goes soft as it scrolls away, the way a lens racks focus. opts go to live().
   */
  function transition(el, opts) {
    return live(backdrop(el), Object.assign({ fn: 'field', form: 'flow', focus: 0, focusScroll: 1.2, drift: 0.6, mist: 0.4, pointer: false, hand: el }, opts));
  }

  // ---------------------------------------------------------------- the opt-in cursor
  // A mark 32 CSS px square, painted once at 1x and 2x (paint(k) gives a 32k px canvas, or a
  // Promise of one) and handed to CSS as `image-set(url() 1x, url() 2x) hx hy, fallback`, or the
  // 1x url alone where `cursor` does not take image-set. The system draws it: nothing follows the
  // mouse, nothing keeps running, and touch has no cursor to show.
  const CUR = 32;
  const curCanvas = k => { const c = document.createElement('canvas'); c.width = c.height = CUR * k; return c; };
  // keep `plate` only inside shape(ctx) (filled even-odd, so a second circle cuts a ring), then draw lines(ctx) over it; ctx in CSS px
  function curCut(plate, k, shape, lines) {
    const c = curCanvas(k), x = c.getContext('2d');
    x.drawImage(plate, 0, 0, c.width, c.height);
    x.scale(k, k);
    x.globalCompositeOperation = 'destination-in'; x.beginPath(); shape(x); x.fill('evenodd');
    x.globalCompositeOperation = 'source-over'; if (lines) lines(x);
    return c;
  }
  const curDisc = (x, r) => { x.moveTo(16 + r, 16); x.arc(16, 16, r, 0, Math.PI * 2); };
  const curRing = (x, r, w, col) => { x.beginPath(); x.arc(16, 16, r, 0, Math.PI * 2); x.lineWidth = w; x.strokeStyle = col; x.stroke(); };
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
    const o = opts || {}, id = String(++cursors), prev = area.style.cursor, at = `[data-hz-cursor="${id}"]`;
    let sheet = null, dead = false;
    Promise.all([curValue(base, 'auto'), o.hover ? curValue(hover, 'pointer') : null]).then(([b, h]) => {
      if (dead) return;
      area.style.cursor = b;
      area.setAttribute('data-hz-cursor', id);
      // text fields keep their I-beam; with hover, links and controls take the second mark (the
      // doubled attribute outranks a page's own `.nav button { cursor: pointer }`)
      sheet = document.createElement('style');
      sheet.textContent = `${at}${at} :is(textarea,[contenteditable=""],[contenteditable="true"],input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=color],[type=file],[type=image])){cursor:text}`
        + (h ? `${at}${at} :is(a[href],button,summary,select,label,[role=button],[role=link],[role=switch],[role=tab],input:is([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset])):not(:disabled){cursor:${h}}` : '');
      document.head.appendChild(sheet);
    }).catch(() => {});   // no mark: the system cursor stays
    return { destroy() { dead = true; if (sheet) { sheet.remove(); area.style.cursor = prev; area.removeAttribute('data-hz-cursor'); } } };
  }

  /**
   * An opt-in cursor for `area`, only when the brief asks for one: the system cursor is the
   * default, and the live background is how the style answers the pointer. The mark is a small sun cut from a grain field, with a cream rim,
   * painted once through the still engine. opts.hover: true gives links and controls inside `area`
   * a second mark, the same sun as a halo round a red point. opts: seed, colors (field options). Returns { destroy() }, which puts the previous cursor back.
   */
  function cursor(area, opts) {
    const o = Object.assign({ seed: 9 }, opts);
    const plate = k => H.field(document.createElement('canvas'), { width: CUR * k, height: CUR * k, form: 'sun', seed: o.seed, colors: o.colors });
    const cream = '#fff6ec', edge = 'rgba(90,40,26,.45)';
    return nativeCursor(area, o, {
      hot: [16, 16],
      paint: k => curCut(plate(k), k, x => curDisc(x, 9), x => { curRing(x, 9.5, 1, cream); curRing(x, 10.5, 0.8, edge); }),
    }, {
      hot: [16, 16],
      paint: k => curCut(plate(k), k, x => { curDisc(x, 12.5); curDisc(x, 8.5); }, x => {
        curRing(x, 13, 1, cream); curRing(x, 8, 1, cream); curRing(x, 14, 0.8, edge);
        x.fillStyle = '#e2231a'; x.beginPath(); curDisc(x, 1.5); x.fill();
      }),
    });
  }

  /**
   * iconMask(svg, { size, pad, weight, ramp, ground }) — an icon's SVG (Phosphor-style: one or
   * more <path d>, any viewBox) painted as a stage for the haze: a cream ground with the glyph
   * lit in a warm ramp, stroked a little heavier (`weight`, viewBox units) so thin light icons
   * survive the lens. Returns a canvas, which live() develops like a photograph (`image`).
   */
  function iconMask(svg, opts) {
    const o = Object.assign({ size: 256, pad: 0.16, weight: 14, ramp: 'coral', ground: '#fbeee4' }, opts);
    const vb = ((svg.match(/viewBox="([^"]+)"/) || [0, '0 0 256 256'])[1]).split(/[\s,]+/).map(Number);
    const paths = Array.from(svg.matchAll(/\sd="([^"]+)"/g), m => new Path2D(m[1]));
    const n = o.size, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'), s = n * (1 - 2 * o.pad) / Math.max(vb[2], vb[3]), ramp = RAMPS[o.ramp] || o.ramp;
    x.save();
    x.translate((n - vb[2] * s) / 2 - vb[0] * s, (n - vb[3] * s) / 2 - vb[1] * s); x.scale(s, s);
    x.lineWidth = o.weight; x.lineJoin = 'round';
    for (const p of paths) { x.fill(p); if (o.weight) x.stroke(p); }
    x.restore();
    // light the glyph: a warm ramp from its heart outwards, then the ground behind it
    x.globalCompositeOperation = 'source-in';
    const g = x.createRadialGradient(n * 0.46, n * 0.42, 0, n / 2, n / 2, n * 0.5);
    ramp.slice(1, 4).forEach((col, i) => g.addColorStop(i / 2, col));
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    x.globalCompositeOperation = 'destination-over'; x.fillStyle = o.ground; x.fillRect(0, 0, n, n);
    return c;
  }

  /**
   * An icon developed in the haze: iconMask() of `name` (a key of ICONS, or an SVG string) as
   * a small round print, a little out of focus at rest; hovering or focusing its control pulls
   * it sharp. The element sets the size (CSS width/height). opts: ramp, ground, rest, sharp.
   */
  function icon(el, name, opts) {
    const svg = ICONS[name] || name;
    const o = Object.assign({ ramp: 'coral', ground: '#fbeee4', rest: 0.5, sharp: -0.3 }, opts);
    style();
    el.classList.add('hz-icon'); if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    const c = document.createElement('canvas'); el.appendChild(c);
    const ctl = live(c, { image: iconMask(svg, { ramp: o.ramp, ground: o.ground }), look: 'silk', resolution: 1, grain: 0.03, scatter: 0, own: false, focus: o.rest, focusRadius: 0.03, drift: 0.25, mist: 0, breath: 0.15, pointer: false, seed: (name.length * 7) % 13 + 1 });
    const host = el.closest('button,a,label,[tabindex]') || el;
    if (ctl) {
      const sharp = on => ctl.set({ focus: on ? o.sharp : o.rest });
      host.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') sharp(true); });
      host.addEventListener('pointerleave', () => sharp(false));
      host.addEventListener('focus', () => sharp(host.matches(':focus-visible')));
      host.addEventListener('blur', () => sharp(false));
    }
    return ctl;
  }

  H.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, cursor, icon, iconMask, ICONS, RAMPS };
  H.iconMask = iconMask;
})(typeof window !== 'undefined' ? window : globalThis);
