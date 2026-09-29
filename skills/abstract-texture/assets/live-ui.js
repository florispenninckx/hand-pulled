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
 *   ui.cursor(area);   ui.icon(span, 'flame');   Surface.iconMask(svg, { pad, weight })
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Icons: Phosphor Icons (light weight, @phosphor-icons/core 2.1.1), MIT,
 * Copyright (c) 2023 Phosphor Icons, https://phosphoricons.com: the path data below was
 * extracted from the package by a script, inlined, never fetched. The rest is original code, MIT.
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

  // Phosphor Icons, light weight (MIT, see above). 256 viewBox, filled outlines.
  const P = (...d) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${d.map(x => `<path d="${x}"/>`).join('')}</svg>`;
  const ICONS = {
    flame: P('M172.34,52.86a218.34,218.34,0,0,0-41.25-34,6,6,0,0,0-6.18,0,218.34,218.34,0,0,0-41.25,34C56.4,81.48,42,113,42,144a86,86,0,0,0,172,0C214,113,199.6,81.48,172.34,52.86ZM94,184c0-29.8,25.11-50.41,34-56.78,8.91,6.35,34,26.87,34,56.78a34.05,34.05,0,0,1-32.25,34c-.59,0-1.16,0-1.75,0s-1.16,0-1.75,0A34.05,34.05,0,0,1,94,184Zm74.42,21.94A45.68,45.68,0,0,0,174,184c0-42.9-41.16-68.09-42.91-69.14a6,6,0,0,0-6.18,0C123.16,115.91,82,141.1,82,184a45.68,45.68,0,0,0,5.58,21.94A74,74,0,0,1,54,144c0-59.83,59.62-103.26,74-112.86,14.39,9.6,74,53,74,112.86A74,74,0,0,1,168.42,205.94Z'),
    snowflake: P('M221.83,150.57a6,6,0,0,1-4.4,7.26l-26.62,6.54,7,26.08a6,6,0,0,1-4.24,7.35,6.4,6.4,0,0,1-1.55.2,6,6,0,0,1-5.8-4.45L178.27,164,134,138.39v51.13l22.24,22.24a6,6,0,1,1-8.48,8.48L128,200.49l-19.76,19.75a6,6,0,0,1-8.48-8.48L122,189.52V138.39L77.73,164l-7.93,29.6A6,6,0,0,1,64,198a6.4,6.4,0,0,1-1.55-.2,6,6,0,0,1-4.24-7.35l7-26.08-26.62-6.54a6,6,0,0,1,2.86-11.66l30.23,7.43L116,128,71.66,102.4l-30.23,7.43A5.88,5.88,0,0,1,40,110a6,6,0,0,1-1.43-11.83l26.62-6.54-7-26.08a6,6,0,1,1,11.59-3.1l7.93,29.6L122,117.61V66.48L99.76,44.24a6,6,0,0,1,8.48-8.48L128,55.51l19.76-19.75a6,6,0,0,1,8.48,8.48L134,66.48v51.13l44.27-25.56,7.93-29.6a6,6,0,1,1,11.59,3.1l-7,26.08,26.62,6.54A6,6,0,0,1,216,110a5.88,5.88,0,0,1-1.43-.17l-30.23-7.43L140,128l44.34,25.6,30.23-7.43A6,6,0,0,1,221.83,150.57Z'),
    thermometer: P('M134,154.6V88a6,6,0,0,0-12,0v66.6a30,30,0,1,0,12,0ZM128,202a18,18,0,1,1,18-18A18,18,0,0,1,128,202Zm38-67V48a38,38,0,0,0-76,0v87a62,62,0,1,0,76,0Zm-38,99a50,50,0,0,1-28.57-91A6,6,0,0,0,102,138V48a26,26,0,0,1,52,0v90a6,6,0,0,0,2.57,4.92A50,50,0,0,1,128,234Z'),
    bell: P('M220.07,176.94C214.41,167.2,206,139.73,206,104a78,78,0,1,0-156,0c0,35.74-8.42,63.2-14.08,72.94A14,14,0,0,0,48,198H90.48a38,38,0,0,0,75,0H208a14,14,0,0,0,12.06-21.06ZM128,218a26,26,0,0,1-25.29-20h50.58A26,26,0,0,1,128,218Zm81.71-33a1.9,1.9,0,0,1-1.7,1H48a1.9,1.9,0,0,1-1.7-1,2,2,0,0,1,0-2C53.87,170,62,139.69,62,104a66,66,0,1,1,132,0c0,35.68,8.14,65.95,15.71,79A2,2,0,0,1,209.71,185Z'),
    hourglass: P('M209.8,198l-73.12-70L209.8,58l.09-.09A14,14,0,0,0,200,34H56a14,14,0,0,0-9.9,23.9l.09.09,73.12,70L46.2,198l-.09.09A14,14,0,0,0,56,222H200a14,14,0,0,0,9.9-23.9ZM54.16,47.23A1.91,1.91,0,0,1,56,46H200a2,2,0,0,1,1.45,3.38L128,119.69,54.56,49.38A1.91,1.91,0,0,1,54.16,47.23ZM201.84,208.77A1.91,1.91,0,0,1,200,210H56a2,2,0,0,1-1.45-3.38L128,136.31l73.44,70.31A1.91,1.91,0,0,1,201.84,208.77Z'),
    timer: P('M128,42a94,94,0,1,0,94,94A94.11,94.11,0,0,0,128,42Zm0,176a82,82,0,1,1,82-82A82.1,82.1,0,0,1,128,218ZM172.24,91.76a6,6,0,0,1,0,8.48l-40,40a6,6,0,1,1-8.48-8.48l40-40A6,6,0,0,1,172.24,91.76ZM98,16a6,6,0,0,1,6-6h48a6,6,0,0,1,0,12H104A6,6,0,0,1,98,16Z'),
    plus: P('M222,128a6,6,0,0,1-6,6H134v82a6,6,0,0,1-12,0V134H40a6,6,0,0,1,0-12h82V40a6,6,0,0,1,12,0v82h82A6,6,0,0,1,222,128Z'),
    play: P('M231.36,116.19,87.28,28.06a14,14,0,0,0-14.18-.27A13.69,13.69,0,0,0,66,39.87V216.13a13.69,13.69,0,0,0,7.1,12.08,14,14,0,0,0,14.18-.27l144.08-88.13a13.82,13.82,0,0,0,0-23.62Zm-6.26,13.38L81,217.7a2,2,0,0,1-2.06,0,1.78,1.78,0,0,1-1-1.61V39.87a1.78,1.78,0,0,1,1-1.61A2.06,2.06,0,0,1,80,38a2,2,0,0,1,1,.31L225.1,126.43a1.82,1.82,0,0,1,0,3.14Z'),
    pause: P('M200,34H160a14,14,0,0,0-14,14V208a14,14,0,0,0,14,14h40a14,14,0,0,0,14-14V48A14,14,0,0,0,200,34Zm2,174a2,2,0,0,1-2,2H160a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2h40a2,2,0,0,1,2,2ZM96,34H56A14,14,0,0,0,42,48V208a14,14,0,0,0,14,14H96a14,14,0,0,0,14-14V48A14,14,0,0,0,96,34Zm2,174a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2H96a2,2,0,0,1,2,2Z'),
    check: P('M228.24,76.24l-128,128a6,6,0,0,1-8.48,0l-56-56a6,6,0,0,1,8.48-8.48L96,191.51,219.76,67.76a6,6,0,0,1,8.48,8.48Z'),
    sun: P('M122,40V16a6,6,0,0,1,12,0V40a6,6,0,0,1-12,0Zm68,88a62,62,0,1,1-62-62A62.07,62.07,0,0,1,190,128Zm-12,0a50,50,0,1,0-50,50A50.06,50.06,0,0,0,178,128ZM59.76,68.24a6,6,0,1,0,8.48-8.48l-16-16a6,6,0,0,0-8.48,8.48Zm0,119.52-16,16a6,6,0,1,0,8.48,8.48l16-16a6,6,0,1,0-8.48-8.48ZM192,70a6,6,0,0,0,4.24-1.76l16-16a6,6,0,0,0-8.48-8.48l-16,16A6,6,0,0,0,192,70Zm4.24,117.76a6,6,0,0,0-8.48,8.48l16,16a6,6,0,0,0,8.48-8.48ZM46,128a6,6,0,0,0-6-6H16a6,6,0,0,0,0,12H40A6,6,0,0,0,46,128Zm82,82a6,6,0,0,0-6,6v24a6,6,0,0,0,12,0V216A6,6,0,0,0,128,210Zm112-88H216a6,6,0,0,0,0,12h24a6,6,0,0,0,0-12Z'),
    drop: P('M172.53,49.06a252.86,252.86,0,0,0-41.09-38,6,6,0,0,0-6.88,0,252.86,252.86,0,0,0-41.09,38C56.34,80.26,42,113.09,42,144a86,86,0,0,0,172,0C214,113.09,199.66,80.26,172.53,49.06ZM128,218a74.09,74.09,0,0,1-74-74c0-59.62,59-108.93,74-120.51C143,35.07,202,84.38,202,144A74.09,74.09,0,0,1,128,218Zm53.92-65A55.58,55.58,0,0,1,137,197.92a7,7,0,0,1-1,.08,6,6,0,0,1-1-11.92c17.38-2.92,32.13-17.68,35.08-35.08a6,6,0,1,1,11.84,2Z'),
  };
  /**
   * iconMask(svg, { pad, weight }) — an icon's SVG (one or more <path d>, any viewBox) as a
   * mask for live(): `mask(ctx, w, h)` fills the paths, so the plate shows only through the
   * icon. `weight` strokes the outline too (viewBox units), which keeps light icons legible.
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
.at-icon{display:inline-block;position:relative;width:1.25em;height:1.25em;vertical-align:-.3em;flex:none}
.at-icon>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
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
    // hovered, the colour behind the glass starts to drift (native plates draw it every frame)
    const upd = () => ctl.set({ develop: over || focus ? o.hover : o.rest, lift: over || focus ? 1 : 0, drift: over || focus ? 0.8 : 0 });
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
    const o = opts || {}, id = String(++cursors), prev = area.style.cursor, at = `[data-at-cursor="${id}"]`;
    let sheet = null, dead = false;
    Promise.all([curValue(base, 'auto'), o.hover ? curValue(hover, 'pointer') : null]).then(([b, h]) => {
      if (dead) return;
      area.style.cursor = b;
      area.setAttribute('data-at-cursor', id);
      // text fields keep their I-beam; with hover, links and controls take the second mark (the
      // doubled attribute outranks a page's own `.nav button { cursor: pointer }`)
      sheet = document.createElement('style');
      sheet.textContent = `${at}${at} :is(textarea,[contenteditable=""],[contenteditable="true"],input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=color],[type=file],[type=image])){cursor:text}`
        + (h ? `${at}${at} :is(a[href],button,summary,select,label,[role=button],[role=link],[role=switch],[role=tab],input:is([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset])):not(:disabled){cursor:${h}}` : '');
      document.head.appendChild(sheet);
    }).catch(() => {});   // no mark: the system cursor stays
    return { destroy() { dead = true; if (sheet) { sheet.remove(); area.style.cursor = prev; area.removeAttribute('data-at-cursor'); } } };
  }

  /**
   * An opt-in cursor for `area`, only when the brief asks for one: the system cursor is the
   * default, and the live background is how the style answers the pointer. The mark is a ring of reeded glass round the pointer,
   * painted once through the still engine. opts.hover: true gives links and controls inside `area`
   * a second mark, the whole lens. opts: palette, seed (reeded plate options). Returns { destroy() }, which puts the previous cursor back.
   */
  function cursor(area, opts) {
    const o = Object.assign({ palette: 'ember', seed: 5 }, opts);
    const plate = k => S.reeded(document.createElement('canvas'), { width: 48 * k, height: 48 * k, palette: o.palette, seed: o.seed, text: false });
    const ink = 'rgba(24,14,10,.85)', dot = (x, r) => { x.fillStyle = '#1a0f0a'; x.beginPath(); curDisc(x, r); x.fill(); };
    return nativeCursor(area, o, {
      hot: [16, 16],
      paint: k => plate(k).then(p => curCut(p, k, x => { curDisc(x, 11); curDisc(x, 5.5); }, x => { curRing(x, 11.5, 1, ink); curRing(x, 5, 1, ink); dot(x, 1.2); })),
    }, {
      hot: [16, 16],
      paint: k => plate(k).then(p => curCut(p, k, x => curDisc(x, 12), x => { curRing(x, 12.5, 1, ink); dot(x, 1.4); })),
    });
  }

  /**
   * An icon seen through the glass: the plate shows only through the icon's paths (iconMask).
   * At rest it is the bare warm field; hovering or focusing the control it sits in develops the
   * reeds over it, starts the colour drifting and lifts the grain. `name` is a key of ICONS or an
   * SVG string with <path d> outlines; the element's font size sets the size (1.25em).
   */
  function icon(el, name, opts) {
    const svg = ICONS[name] || name;
    const o = Object.assign({ mode: 'reeded', palette: 'ember', rest: 0.35, hover: 1, weight: 5, under: 1 }, opts);
    style();
    el.classList.add('at-icon'); el.setAttribute('aria-hidden', 'true');
    const c = document.createElement('canvas'); el.appendChild(c);
    const ctl = live(c, Object.assign({}, SMALL, { seed: (name.length || 3) + 2, ground: '#000000', ease: 0.18 }, o, { develop: o.rest, mask: iconMask(svg, { weight: o.weight }) }));
    if (!ctl) return null;
    const host = el.closest('button,a,label,[tabindex]') || el;
    let over = false, focus = false;
    const upd = () => { const a = over || focus; ctl.set({ develop: a ? o.hover : o.rest, lift: a ? 0.7 : 0, drift: a ? 1 : 0 }); };
    host.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    host.addEventListener('pointerleave', () => { over = false; upd(); });
    host.addEventListener('focusin', () => { focus = host.matches(':focus-visible') || !!host.querySelector(':focus-visible'); upd(); });
    host.addEventListener('focusout', () => { focus = false; upd(); });
    return ctl;
  }

  S.iconMask = iconMask;
  S.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, cursor, icon, iconMask, ICONS };
})(typeof window !== 'undefined' ? window : globalThis);
