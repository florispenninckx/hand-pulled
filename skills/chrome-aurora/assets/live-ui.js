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
 *   ui.cursor(area);   ui.icon(span, 'lightbulb');   Mercury.iconMask(svg)
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Icons: Phosphor Icons (light weight), MIT, Copyright (c) 2023 Phosphor Icons,
 * https://phosphoricons.com — inlined below, never fetched. The rest is original code, MIT.
 */
(function (root) {
  'use strict';
  const M = root.Mercury;
  if (!M || !M.live) throw new Error('live-ui.js: load mercury.js and live.js first');
  const live = M.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  // Phosphor Icons, light weight (MIT). 256 viewBox, filled outlines.
  const P = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="${d}"/></svg>`;
  const ICONS = {
    lightbulb: P('M174,232a6,6,0,0,1-6,6H88a6,6,0,0,1,0-12h80A6,6,0,0,1,174,232Zm40-128a85.56,85.56,0,0,1-32.88,67.64A18.23,18.23,0,0,0,174,186v6a14,14,0,0,1-14,14H96a14,14,0,0,1-14-14v-6a18,18,0,0,0-7-14.23h0a85.59,85.59,0,0,1-33-67.24C41.74,57.91,79.39,19.12,125.93,18A86,86,0,0,1,214,104Zm-12,0a74,74,0,0,0-75.79-74C86.17,31,53.78,64.34,54,104.42a73.67,73.67,0,0,0,28.4,57.87A29.92,29.92,0,0,1,94,186v6a2,2,0,0,0,2,2h64a2,2,0,0,0,2-2v-6a30.18,30.18,0,0,1,11.7-23.78A73.59,73.59,0,0,0,202,104Zm-20.08-9A55.58,55.58,0,0,0,137,50.08a6,6,0,1,0-2,11.84C152.38,64.84,167.13,79.6,170.08,97a6,6,0,0,0,5.91,5,6.87,6.87,0,0,0,1-.08A6,6,0,0,0,181.92,95Z'),
    'lamp-pendant': P('M174,76.05V72a14,14,0,0,0-14-14H134V16a6,6,0,0,0-12,0V58H96A14,14,0,0,0,82,72v4A109.76,109.76,0,0,0,18,176a6,6,0,0,0,6,6H90v2a38,38,0,0,0,76,0v-2h66a6,6,0,0,0,6-6A109.76,109.76,0,0,0,174,76.05ZM154,184a26,26,0,0,1-52,0v-2h52ZM30.18,170A97.76,97.76,0,0,1,90.31,85.51,6,6,0,0,0,94,80V72a2,2,0,0,1,2-2h64a2,2,0,0,1,2,2v8a6,6,0,0,0,3.69,5.54A97.76,97.76,0,0,1,225.82,170Z'),
    play: P('M231.36,116.19,87.28,28.06a14,14,0,0,0-14.18-.27A13.69,13.69,0,0,0,66,39.87V216.13a13.69,13.69,0,0,0,7.1,12.08,14,14,0,0,0,14.18-.27l144.08-88.13a13.82,13.82,0,0,0,0-23.62Zm-6.26,13.38L81,217.7a2,2,0,0,1-2.06,0,1.78,1.78,0,0,1-1-1.61V39.87a1.78,1.78,0,0,1,1-1.61A2.06,2.06,0,0,1,80,38a2,2,0,0,1,1,.31L225.1,126.43a1.82,1.82,0,0,1,0,3.14Z'),
    pause: P('M200,34H160a14,14,0,0,0-14,14V208a14,14,0,0,0,14,14h40a14,14,0,0,0,14-14V48A14,14,0,0,0,200,34Zm2,174a2,2,0,0,1-2,2H160a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2h40a2,2,0,0,1,2,2ZM96,34H56A14,14,0,0,0,42,48V208a14,14,0,0,0,14,14H96a14,14,0,0,0,14-14V48A14,14,0,0,0,96,34Zm2,174a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2H96a2,2,0,0,1,2,2Z'),
    power: P('M122,128V48a6,6,0,0,1,12,0v80a6,6,0,0,1-12,0Zm57.28-77A6,6,0,0,0,172.72,61C196.41,76.47,210,100.88,210,128a82,82,0,0,1-164,0c0-27.12,13.59-51.53,37.28-67A6,6,0,0,0,76.72,51C49.57,68.68,34,96.75,34,128a94,94,0,0,0,188,0C222,96.75,206.43,68.68,179.28,51Z'),
    sun: P('M122,40V16a6,6,0,0,1,12,0V40a6,6,0,0,1-12,0Zm68,88a62,62,0,1,1-62-62A62.07,62.07,0,0,1,190,128Zm-12,0a50,50,0,1,0-50,50A50.06,50.06,0,0,0,178,128ZM59.76,68.24a6,6,0,1,0,8.48-8.48l-16-16a6,6,0,0,0-8.48,8.48Zm0,119.52-16,16a6,6,0,1,0,8.48,8.48l16-16a6,6,0,1,0-8.48-8.48ZM192,70a6,6,0,0,0,4.24-1.76l16-16a6,6,0,0,0-8.48-8.48l-16,16A6,6,0,0,0,192,70Zm4.24,117.76a6,6,0,0,0-8.48,8.48l16,16a6,6,0,0,0,8.48-8.48ZM46,128a6,6,0,0,0-6-6H16a6,6,0,0,0,0,12H40A6,6,0,0,0,46,128Zm82,82a6,6,0,0,0-6,6v24a6,6,0,0,0,12,0V216A6,6,0,0,0,128,210Zm112-88H216a6,6,0,0,0,0,12h24a6,6,0,0,0,0-12Z'),
    moon: P('M232.13,143.64a6,6,0,0,0-6-1.49A90.07,90.07,0,0,1,113.86,29.85a6,6,0,0,0-7.49-7.48A102.88,102.88,0,0,0,54.48,58.68,102,102,0,0,0,197.32,201.52a102.88,102.88,0,0,0,36.31-51.89A6,6,0,0,0,232.13,143.64Zm-42,48.29a90,90,0,0,1-126-126A90.9,90.9,0,0,1,99.65,37.66,102.06,102.06,0,0,0,218.34,156.35,90.9,90.9,0,0,1,190.1,191.93Z'),
    'cloud-fog': P('M120,206H72a6,6,0,0,1,0-12h48a6,6,0,0,1,0,12Zm64-12H160a6,6,0,0,0,0,12h24a6,6,0,0,0,0-12Zm-24,32H104a6,6,0,0,0,0,12h56a6,6,0,0,0,0-12Zm70-126a74.09,74.09,0,0,1-74,74H76A50,50,0,1,1,86.2,75,74.08,74.08,0,0,1,230,100Zm-12,0A62.06,62.06,0,0,0,94,96.35a6,6,0,0,1-12-.7,75.84,75.84,0,0,1,1.07-9A38,38,0,1,0,76,162h80A62.07,62.07,0,0,0,218,100Z'),
    lock: P('M208,82H174V56a46,46,0,0,0-92,0V82H48A14,14,0,0,0,34,96V208a14,14,0,0,0,14,14H208a14,14,0,0,0,14-14V96A14,14,0,0,0,208,82ZM94,56a34,34,0,0,1,68,0V82H94ZM210,208a2,2,0,0,1-2,2H48a2,2,0,0,1-2-2V96a2,2,0,0,1,2-2H208a2,2,0,0,1,2,2Zm-72-56a10,10,0,1,1-10-10A10,10,0,0,1,138,152Z'),
    'lock-open': P('M208,82H94V56a34,34,0,0,1,34-34c16.3,0,31,11.69,34.12,27.19a6,6,0,0,0,11.76-2.38C169.55,25.48,150.26,10,128,10A46.06,46.06,0,0,0,82,56V82H48A14,14,0,0,0,34,96V208a14,14,0,0,0,14,14H208a14,14,0,0,0,14-14V96A14,14,0,0,0,208,82Zm2,126a2,2,0,0,1-2,2H48a2,2,0,0,1-2-2V96a2,2,0,0,1,2-2H208a2,2,0,0,1,2,2Zm-72-56a10,10,0,1,1-10-10A10,10,0,0,1,138,152Z'),
    'sliders-horizontal': P('M40,86H74.6a30,30,0,0,0,58.8,0H216a6,6,0,0,0,0-12H133.4a30,30,0,0,0-58.8,0H40a6,6,0,0,0,0,12Zm64-24A18,18,0,1,1,86,80,18,18,0,0,1,104,62ZM216,170H197.4a30,30,0,0,0-58.8,0H40a6,6,0,0,0,0,12h98.6a30,30,0,0,0,58.8,0H216a6,6,0,0,0,0-12Zm-48,24a18,18,0,1,1,18-18A18,18,0,0,1,168,194Z'),
    timer: P('M128,42a94,94,0,1,0,94,94A94.11,94.11,0,0,0,128,42Zm0,176a82,82,0,1,1,82-82A82.1,82.1,0,0,1,128,218ZM172.24,91.76a6,6,0,0,1,0,8.48l-40,40a6,6,0,1,1-8.48-8.48l40-40A6,6,0,0,1,172.24,91.76ZM98,16a6,6,0,0,1,6-6h48a6,6,0,0,1,0,12H104A6,6,0,0,1,98,16Z'),
    'fast-forward': P('M247.59,116.35,159.41,60.18a14,14,0,0,0-14.22-.46A13.83,13.83,0,0,0,138,71.84v41L55.41,60.18a14,14,0,0,0-14.22-.46A13.83,13.83,0,0,0,34,71.84V184.16a13.83,13.83,0,0,0,7.19,12.12,14,14,0,0,0,14.22-.46L138,143.21v40.95a13.83,13.83,0,0,0,7.19,12.12,14,14,0,0,0,14.22-.46l88.18-56.17a13.79,13.79,0,0,0,0-23.3ZM137.15,129.53,49,185.69a1.9,1.9,0,0,1-2,.06,1.73,1.73,0,0,1-1-1.59V71.84a1.73,1.73,0,0,1,1-1.59,2,2,0,0,1,1-.26,1.87,1.87,0,0,1,1,.32l88.19,56.16a1.8,1.8,0,0,1,0,3.06Zm104,0L153,185.69a1.9,1.9,0,0,1-2,.06,1.73,1.73,0,0,1-1-1.59V71.84a1.73,1.73,0,0,1,1-1.59,2,2,0,0,1,1-.26,1.87,1.87,0,0,1,1,.32l88.19,56.16a1.8,1.8,0,0,1,0,3.06Z'),
    sparkle: P('M196.89,130.94,144.4,111.6,125.06,59.11a13.92,13.92,0,0,0-26.12,0L79.6,111.6,27.11,130.94a13.92,13.92,0,0,0,0,26.12L79.6,176.4l19.34,52.49a13.92,13.92,0,0,0,26.12,0L144.4,176.4l52.49-19.34a13.92,13.92,0,0,0,0-26.12Zm-4.15,14.86-55.08,20.3a6,6,0,0,0-3.56,3.56l-20.3,55.08a1.92,1.92,0,0,1-3.6,0L89.9,169.66a6,6,0,0,0-3.56-3.56L31.26,145.8a1.92,1.92,0,0,1,0-3.6l55.08-20.3a6,6,0,0,0,3.56-3.56l20.3-55.08a1.92,1.92,0,0,1,3.6,0l20.3,55.08a6,6,0,0,0,3.56,3.56l55.08,20.3a1.92,1.92,0,0,1,0,3.6ZM146,40a6,6,0,0,1,6-6h18V16a6,6,0,0,1,12,0V34h18a6,6,0,0,1,0,12H182V64a6,6,0,0,1-12,0V46H152A6,6,0,0,1,146,40ZM246,88a6,6,0,0,1-6,6H230v10a6,6,0,0,1-12,0V94H208a6,6,0,0,1,0-12h10V72a6,6,0,0,1,12,0V82h10A6,6,0,0,1,246,88Z'),
    flashlight: P('M184,18H72A14,14,0,0,0,58,32V77.33a14,14,0,0,0,2.8,8.4l20.8,27.73a2,2,0,0,1,.4,1.21V224a14,14,0,0,0,14,14h64a14,14,0,0,0,14-14V114.67a2,2,0,0,1,.4-1.2l20.8-27.74a14,14,0,0,0,2.8-8.4V32A14,14,0,0,0,184,18ZM72,30H184a2,2,0,0,1,2,2V58H70V32A2,2,0,0,1,72,30ZM185.6,78.53l-20.8,27.74a14,14,0,0,0-2.8,8.4V224a2,2,0,0,1-2,2H96a2,2,0,0,1-2-2V114.67a14,14,0,0,0-2.8-8.4L70.4,78.54a2,2,0,0,1-.4-1.21V70H186v7.33A2,2,0,0,1,185.6,78.53ZM134,120v32a6,6,0,0,1-12,0V120a6,6,0,0,1,12,0Z'),
  };

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
.ma-ring>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.ma-icon{display:inline-block;position:relative;vertical-align:middle;flex:none}
.ma-icon>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;mix-blend-mode:screen}`;
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

  /**
   * iconMask(svg, { pad, weight, size }) — an icon's SVG (one or more <path d>, any viewBox) cast
   * as a white-on-black canvas: fed to a plate as its `image`, the white becomes a pool of metal
   * in the icon's shape. `weight` strokes the outline too (viewBox units): light icons are
   * hairlines, and a pool needs a little body before it can catch a lamp.
   */
  function iconMask(svg, opts) {
    const o = Object.assign({ pad: 0.1, weight: 8, size: 256 }, opts);
    const vb = ((svg.match(/viewBox="([^"]+)"/) || [0, '0 0 256 256'])[1]).split(/[\s,]+/).map(Number);
    const c = document.createElement('canvas'); c.width = c.height = o.size;
    const x = c.getContext('2d'), s = o.size * (1 - 2 * o.pad) / Math.max(vb[2], vb[3]);
    x.fillStyle = '#000'; x.fillRect(0, 0, o.size, o.size);
    x.translate((o.size - vb[2] * s) / 2 - vb[0] * s, (o.size - vb[3] * s) / 2 - vb[1] * s); x.scale(s, s);
    x.fillStyle = x.strokeStyle = '#fff'; x.lineWidth = o.weight; x.lineJoin = 'round';
    for (const m of svg.matchAll(/\sd="([^"]+)"/g)) { const p = new Path2D(m[1]); x.fill(p); if (o.weight) x.stroke(p); }
    return c;
  }

  /**
   * An icon poured in chrome: the SVG's silhouette becomes the height of a film plate, so it is
   * a pool of metal in the icon's shape, oil in its folds, screen-blended onto the dark. `name`
   * is a key of ICONS or an SVG string. The element sets the size; its button raises the lamp.
   */
  function icon(el, name, opts) {
    const svg = ICONS[name] || name;
    const o = Object.assign({ plate: 'film', look: 'oxide', seed: 3, grain: 0.02, rest: 1, hover: 1.25, weight: 24, pad: 0.08 }, opts);
    style();
    el.classList.add('ma-icon'); el.setAttribute('aria-hidden', 'true');
    const c = document.createElement('canvas'); el.appendChild(c);
    const host = el.closest('button,a,label,[tabindex]') || el;
    const ctl = live(c, { plate: o.plate, look: o.look, seed: o.seed, grain: o.grain, image: iconMask(svg, { pad: o.pad, weight: o.weight }), zoom: 0, level: o.rest, drift: 0.4, pointer: 1, radius: 1.2, tilt: 0, clickPulse: false, own: false, hand: host });
    if (!ctl) return null;
    host.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') ctl.set({ level: o.hover }); });
    host.addEventListener('pointerleave', () => ctl.set({ level: o.rest }));
    return ctl;
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
    const o = opts || {}, id = String(++cursors), prev = area.style.cursor, at = `[data-ma-cursor="${id}"]`;
    let sheet = null, dead = false;
    Promise.all([curValue(base, 'auto'), o.hover ? curValue(hover, 'pointer') : null]).then(([b, h]) => {
      if (dead) return;
      area.style.cursor = b;
      area.setAttribute('data-ma-cursor', id);
      // text fields keep their I-beam; with hover, links and controls take the second mark (the
      // doubled attribute outranks a page's own `.nav button { cursor: pointer }`)
      sheet = document.createElement('style');
      sheet.textContent = `${at}${at} :is(textarea,[contenteditable=""],[contenteditable="true"],input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=color],[type=file],[type=image])){cursor:text}`
        + (h ? `${at}${at} :is(a[href],button,summary,select,label,[role=button],[role=link],[role=switch],[role=tab],input:is([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset])):not(:disabled){cursor:${h}}` : '');
      document.head.appendChild(sheet);
    }).catch(() => {});   // no mark: the system cursor stays
    return { destroy() { dead = true; if (sheet) { sheet.remove(); area.style.cursor = prev; area.removeAttribute('data-ma-cursor'); } } };
  }

  /**
   * An opt-in cursor for `area`, only when the brief asks for one: the system cursor is the
   * default, and the live background is how the style answers the pointer. The mark is a bead of chrome with an oil-film skin and a faint halo,
   * painted once through the still engine. opts.hover: true gives links and controls inside `area`
   * a second mark, a chrome ring. opts: look, seed (film plate options). Returns { destroy() }, which puts the previous cursor back.
   */
  function cursor(area, opts) {
    const o = Object.assign({ look: 'oxide', seed: 4 }, opts);
    // the film plate poured over a height of our own: a dome makes the bead, a torus the ring (2D path, no GL context)
    const plate = (k, ring) => {
      const n = CUR * k, h = curCanvas(k), x = h.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, n, n);
      const g = ring ? x.createRadialGradient(n / 2, n / 2, 6 * k, n / 2, n / 2, 12 * k) : x.createRadialGradient(n / 2 - k, n / 2 - k, 0, n / 2, n / 2, 8 * k);
      if (ring) { g.addColorStop(0, '#000'); g.addColorStop(0.45, '#fff'); g.addColorStop(1, '#000'); } else { g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#9a9a9a'); g.addColorStop(1, '#000'); }
      x.fillStyle = g; x.fillRect(0, 0, n, n);
      return M.film(document.createElement('canvas'), { width: n, height: n, look: o.look, seed: o.seed, gl: false, image: h, grain: 0.02 });
    };
    const rim = 'rgba(0,0,0,.72)';
    return nativeCursor(area, o, {
      hot: [16, 16],
      paint: k => curCut(plate(k, false), k, x => curDisc(x, 8), x => { curRing(x, 8.4, 0.9, rim); curRing(x, 11.5, 0.8, 'rgba(235,231,223,.55)'); }),
    }, {
      hot: [16, 16],
      paint: k => curCut(plate(k, true), k, x => { curDisc(x, 12); curDisc(x, 6); }, x => { curRing(x, 12.2, 0.8, rim); curRing(x, 5.8, 0.8, rim); }),
    });
  }

  M.iconMask = iconMask;
  M.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, cursor, icon, ICONS };
})(typeof window !== 'undefined' ? window : globalThis);
