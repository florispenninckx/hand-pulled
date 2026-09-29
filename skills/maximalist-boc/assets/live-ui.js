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
 *   const l = ui.loader(el);   ui.focusRing();   ui.transition(strip);   ui.cursor(section);
 *   ui.icon(span, 'paint-bucket');   span.style.maskImage = ui.iconMask(svg);
 *
 * Every function returns the live controller (or a small object holding it) so a page can set()
 * it further. Icons: Phosphor Icons (light weight), MIT, Copyright (c) 2023 Phosphor Icons,
 * https://phosphoricons.com — inlined below, never fetched. The rest is original code, MIT.
 */
(function (root) {
  'use strict';
  const P = root.Pour;
  if (!P || !P.live) throw new Error('live-ui.js: load pour.js and live.js first');
  const live = P.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  // Phosphor Icons, light weight (MIT). 256 viewBox, filled outlines.
  const I = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="${d}"/></svg>`;
  const ICONS = {
    drop: I('M172.53,49.06a252.86,252.86,0,0,0-41.09-38,6,6,0,0,0-6.88,0,252.86,252.86,0,0,0-41.09,38C56.34,80.26,42,113.09,42,144a86,86,0,0,0,172,0C214,113.09,199.66,80.26,172.53,49.06ZM128,218a74.09,74.09,0,0,1-74-74c0-59.62,59-108.93,74-120.51C143,35.07,202,84.38,202,144A74.09,74.09,0,0,1,128,218Zm53.92-65A55.58,55.58,0,0,1,137,197.92a7,7,0,0,1-1,.08,6,6,0,0,1-1-11.92c17.38-2.92,32.13-17.68,35.08-35.08a6,6,0,1,1,11.84,2Z'),
    'drop-half': I('M172.53,49.06a251.42,251.42,0,0,0-41.09-38,6,6,0,0,0-6.88,0,251.42,251.42,0,0,0-41.09,38C56.34,80.26,42,113.09,42,144a86,86,0,0,0,172,0C214,113.09,199.66,80.26,172.53,49.06ZM202,144a75,75,0,0,1-.69,10H134V134h67.44A92.09,92.09,0,0,1,202,144ZM186.8,90H134V70h39.89A176,176,0,0,1,186.8,90ZM134,198h44.52A73.76,73.76,0,0,1,134,217.74Zm0-12V166h64.66a74.05,74.05,0,0,1-9.78,20Zm0-64V102h58.7a117.43,117.43,0,0,1,6.69,20Zm30.29-64H134V28.3A257.09,257.09,0,0,1,164.29,58ZM54,144c0-53.42,47.35-98.56,68-115.7V217.74A74.09,74.09,0,0,1,54,144Z'),
    'paint-bucket': I('M237,164.67a6,6,0,0,0-10,0c-.7,1-17,25.72-17,43.33a22,22,0,0,0,44,0C254,190.39,237.69,165.71,237,164.67ZM232,218a10,10,0,0,1-10-10c0-8.17,5.37-19.92,10-28.34,4.63,8.41,10,20.15,10,28.34A10,10,0,0,1,232,218Zm1.9-80.82a6,6,0,0,0,2.34-9.94L120.76,11.76a6,6,0,0,0-8.49,0l-42,42-26-26a6,6,0,0,0-8.49,8.48l26,26L16.44,107.59a22,22,0,0,0,0,31.11l84.86,84.86a22,22,0,0,0,31.11,0l78.83-78.83Zm-30.14-1.94-79.83,79.83a10,10,0,0,1-14.14,0L24.93,130.21a10,10,0,0,1,0-14.14L70.25,70.75l31.62,31.61a26,26,0,0,0,3.75,32,26,26,0,0,0,36.76,0h0a26,26,0,0,0-32-40.51L78.74,62.26l37.78-37.77L220.89,128.86l-14.79,4.93A6.07,6.07,0,0,0,203.76,135.24ZM114.1,106.11l0,0a14,14,0,1,1,0,19.82,13.91,13.91,0,0,1,0-19.82Z'),
    'paint-brush': I('M224,26c-20.8,0-44.11,11.41-69.3,33.9C136.62,76.06,121,94.9,110.3,109A58,58,0,0,0,34,164c0,32.07-20.43,46.39-21.35,47A6,6,0,0,0,16,222H92a58,58,0,0,0,55-76.3c14.08-10.67,32.92-26.32,49.08-44.4C218.59,76.11,230,52.8,230,32A6,6,0,0,0,224,26ZM92,210H30.65C37.92,200.85,46,185.78,46,164a46,46,0,1,1,46,46Zm29.49-95.91c3.6-4.67,7.88-10,12.71-15.69a78.17,78.17,0,0,1,23.4,23.4c-5.67,4.83-11,9.11-15.69,12.71A58.38,58.38,0,0,0,121.49,114.09Zm45.2-.3a90.24,90.24,0,0,0-24.48-24.48C163.05,66.46,191,42,217.56,38.44,214,65,189.54,93,166.69,113.79Z'),
    'hourglass-medium': I('M198,75.64V40a14,14,0,0,0-14-14H72A14,14,0,0,0,58,40V76a14.06,14.06,0,0,0,5.6,11.2L118,128,63.6,168.8A14.06,14.06,0,0,0,58,180v36a14,14,0,0,0,14,14H184a14,14,0,0,0,14-14V180.36a14.08,14.08,0,0,0-5.56-11.17L138,128l54.49-41.19A14.08,14.08,0,0,0,198,75.64ZM70,40a2,2,0,0,1,2-2H184a2,2,0,0,1,2,2V75.64a2,2,0,0,1-.79,1.6L178.9,82H76.67L70.8,77.6A2,2,0,0,1,70,76Zm58,80.49L92.67,94H163Zm58,59.87V216a2,2,0,0,1-2,2H72a2,2,0,0,1-2-2V180a2,2,0,0,1,.8-1.6L122,140v28a6,6,0,0,0,12,0V140.06l51.21,38.7A2,2,0,0,1,186,180.36Z'),
    waves: I('M220.62,178.58a6,6,0,0,1-.79,8.45c-16.87,14-32,19-45.75,19-18.19,0-34.13-8.66-48.94-16.7-26-14.12-48.44-26.31-81.31,1A6,6,0,0,1,36.17,181c39.13-32.45,68.65-16.41,94.69-2.26s48.44,26.31,81.31-1A6,6,0,0,1,220.62,178.58Zm-8.45-56.81c-32.87,27.27-55.32,15.07-81.31,1S75.3,92.54,36.17,125a6,6,0,0,0,7.66,9.25c32.87-27.27,55.32-15.08,81.31-1,14.81,8,30.75,16.71,48.94,16.71,13.79,0,28.88-5,45.75-19a6,6,0,0,0-7.66-9.24ZM43.83,78.21c32.87-27.27,55.32-15.07,81.31-1C140,85.3,155.89,94,174.08,94c13.79,0,28.88-5,45.75-19a6,6,0,1,0-7.66-9.24c-32.87,27.27-55.32,15.07-81.31,1S75.3,36.52,36.17,69a6,6,0,1,0,7.66,9.24Z'),
    sparkle: I('M196.89,130.94,144.4,111.6,125.06,59.11a13.92,13.92,0,0,0-26.12,0L79.6,111.6,27.11,130.94a13.92,13.92,0,0,0,0,26.12L79.6,176.4l19.34,52.49a13.92,13.92,0,0,0,26.12,0L144.4,176.4l52.49-19.34a13.92,13.92,0,0,0,0-26.12Zm-4.15,14.86-55.08,20.3a6,6,0,0,0-3.56,3.56l-20.3,55.08a1.92,1.92,0,0,1-3.6,0L89.9,169.66a6,6,0,0,0-3.56-3.56L31.26,145.8a1.92,1.92,0,0,1,0-3.6l55.08-20.3a6,6,0,0,0,3.56-3.56l20.3-55.08a1.92,1.92,0,0,1,3.6,0l20.3,55.08a6,6,0,0,0,3.56,3.56l55.08,20.3a1.92,1.92,0,0,1,0,3.6ZM146,40a6,6,0,0,1,6-6h18V16a6,6,0,0,1,12,0V34h18a6,6,0,0,1,0,12H182V64a6,6,0,0,1-12,0V46H152A6,6,0,0,1,146,40ZM246,88a6,6,0,0,1-6,6H230v10a6,6,0,0,1-12,0V94H208a6,6,0,0,1,0-12h10V72a6,6,0,0,1,12,0V82h10A6,6,0,0,1,246,88Z'),
    play: I('M231.36,116.19,87.28,28.06a14,14,0,0,0-14.18-.27A13.69,13.69,0,0,0,66,39.87V216.13a13.69,13.69,0,0,0,7.1,12.08,14,14,0,0,0,14.18-.27l144.08-88.13a13.82,13.82,0,0,0,0-23.62Zm-6.26,13.38L81,217.7a2,2,0,0,1-2.06,0,1.78,1.78,0,0,1-1-1.61V39.87a1.78,1.78,0,0,1,1-1.61A2.06,2.06,0,0,1,80,38a2,2,0,0,1,1,.31L225.1,126.43a1.82,1.82,0,0,1,0,3.14Z'),
    pause: I('M200,34H160a14,14,0,0,0-14,14V208a14,14,0,0,0,14,14h40a14,14,0,0,0,14-14V48A14,14,0,0,0,200,34Zm2,174a2,2,0,0,1-2,2H160a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2h40a2,2,0,0,1,2,2ZM96,34H56A14,14,0,0,0,42,48V208a14,14,0,0,0,14,14H96a14,14,0,0,0,14-14V48A14,14,0,0,0,96,34Zm2,174a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2H96a2,2,0,0,1,2,2Z'),
    sliders: I('M62,106.6V40a6,6,0,0,0-12,0v66.6a30,30,0,0,0,0,58.8V216a6,6,0,0,0,12,0V165.4a30,30,0,0,0,0-58.8ZM56,154a18,18,0,1,1,18-18A18,18,0,0,1,56,154Zm78-95.4V40a6,6,0,0,0-12,0V58.6a30,30,0,0,0,0,58.8V216a6,6,0,0,0,12,0V117.4a30,30,0,0,0,0-58.8ZM128,106a18,18,0,1,1,18-18A18,18,0,0,1,128,106Zm102,62a30.05,30.05,0,0,0-24-29.4V40a6,6,0,0,0-12,0v98.6a30,30,0,0,0,0,58.8V216a6,6,0,0,0,12,0V197.4A30.05,30.05,0,0,0,230,168Zm-30,18a18,18,0,1,1,18-18A18,18,0,0,1,200,186Z'),
    shuffle: I('M236.24,179.76a6,6,0,0,1,0,8.48l-24,24a6,6,0,0,1-8.48-8.48L217.52,190H200.94a70.16,70.16,0,0,1-57-29.31l-41.71-58.4A58.11,58.11,0,0,0,55.06,78H32a6,6,0,0,1,0-12H55.06a70.16,70.16,0,0,1,57,29.31l41.71,58.4A58.11,58.11,0,0,0,200.94,178h16.58l-13.76-13.76a6,6,0,0,1,8.48-8.48Zm-92.06-74.41a5.91,5.91,0,0,0,3.48,1.12,6,6,0,0,0,4.89-2.51l1.19-1.67A58.11,58.11,0,0,1,200.94,78h16.58L203.76,91.76a6,6,0,1,0,8.48,8.48l24-24a6,6,0,0,0,0-8.48l-24-24a6,6,0,0,0-8.48,8.48L217.52,66H200.94a70.16,70.16,0,0,0-57,29.31L142.78,97A6,6,0,0,0,144.18,105.35Zm-32.36,45.3a6,6,0,0,0-8.37,1.39l-1.19,1.67A58.11,58.11,0,0,1,55.06,178H32a6,6,0,0,0,0,12H55.06a70.16,70.16,0,0,0,57-29.31l1.19-1.67A6,6,0,0,0,111.82,150.65Z'),
  };

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
.mx-icon{display:inline-block;position:relative;vertical-align:middle;width:1.25em;height:1.25em;flex:none;background:currentColor;-webkit-mask:var(--mx-mask) center/contain no-repeat;mask:var(--mx-mask) center/contain no-repeat}
.mx-icon>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
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

  /**
   * iconMask(svg, { weight }) — an icon's SVG (one or more <path d>, any viewBox) as a CSS mask
   * value, url("data:…"): the paths filled, and stroked `weight` viewBox units wider, so a light
   * icon keeps enough body to carry paint. Use it as mask-image / -webkit-mask-image.
   */
  function iconMask(svg, opts) {
    const o = Object.assign({ weight: 0 }, opts);
    const vb = (svg.match(/viewBox="([^"]+)"/) || [0, '0 0 256 256'])[1];
    const ds = Array.from(svg.matchAll(/\sd="([^"]+)"/g), m => m[1]);
    const st = o.weight ? ` stroke="#000" stroke-width="${o.weight}" stroke-linejoin="round"` : '';
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${ds.map(d => `<path d="${d}"${st}/>`).join('')}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(out)}")`;
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
    const o = opts || {}, id = String(++cursors), prev = area.style.cursor, at = `[data-mx-cursor="${id}"]`;
    let sheet = null, dead = false;
    Promise.all([curValue(base, 'auto'), o.hover ? curValue(hover, 'pointer') : null]).then(([b, h]) => {
      if (dead) return;
      area.style.cursor = b;
      area.setAttribute('data-mx-cursor', id);
      // text fields keep their I-beam; with hover, links and controls take the second mark (the
      // doubled attribute outranks a page's own `.nav button { cursor: pointer }`)
      sheet = document.createElement('style');
      sheet.textContent = `${at}${at} :is(textarea,[contenteditable=""],[contenteditable="true"],input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=color],[type=file],[type=image])){cursor:text}`
        + (h ? `${at}${at} :is(a[href],button,summary,select,label,[role=button],[role=link],[role=switch],[role=tab],input:is([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset])):not(:disabled){cursor:${h}}` : '');
      document.head.appendChild(sheet);
    }).catch(() => {});   // no mark: the system cursor stays
    return { destroy() { dead = true; if (sheet) { sheet.remove(); area.style.cursor = prev; area.removeAttribute('data-mx-cursor'); } } };
  }

  /**
   * An opt-in cursor for `area`, only when the brief asks for one: the system cursor is the
   * default, and the live background is how the style answers the pointer. The mark is a wet ring of poured swirl, outlined in black, with a black point,
   * painted once through the still engine. opts.hover: true gives links and controls inside `area`
   * a second mark, the pour as a full drop. opts: mode, ramp, scale, seed (paint() options). Returns { destroy() }, which puts the previous cursor back.
   */
  function cursor(area, opts) {
    const o = Object.assign({ mode: 'swirl', ramp: 'klein cornflower acid citric', scale: 0.35, seed: 3, grain: 0.25 }, opts);
    const so = Object.assign({}, o); delete so.hover;
    const plate = k => { const c = curCanvas(k); P.paint(c, so); return c; };
    const ink = '#0b0b0b', dot = (x, r) => { x.fillStyle = ink; x.beginPath(); curDisc(x, r); x.fill(); };
    return nativeCursor(area, o, {
      hot: [16, 16],
      paint: k => curCut(plate(k), k, x => { curDisc(x, 11); curDisc(x, 6); }, x => { curRing(x, 11, 1.5, ink); curRing(x, 6, 1.5, ink); dot(x, 1.3); }),
    }, {
      hot: [16, 16],
      paint: k => curCut(plate(k), k, x => curDisc(x, 12.5), x => { curRing(x, 12.5, 1.5, ink); dot(x, 1.6); }),
    });
  }

  /**
   * An icon poured in paint: a small live sheet cut to the icon's shape with a CSS mask. It pours
   * in when it first scrolls into view, and the paint wakes while its button or link is hovered
   * or focused. `name` is a key of ICONS or an SVG string; the element sets the size (default
   * 1.25em) and, without WebGL2, shows the plain shape in currentColor.
   */
  function icon(el, name, opts) {
    const svg = ICONS[name] || name;
    const o = Object.assign({ mode: 'swirl', ramp: 'klein cornflower acid citric', scale: 0.2, grain: 0.2, weight: 6, rest: 0.25, hover: 1.4 }, opts);
    style();
    el.classList.add('mx-icon'); el.setAttribute('aria-hidden', el.getAttribute('aria-hidden') || 'true');
    el.style.setProperty('--mx-mask', iconMask(svg, { weight: o.weight }));
    const c = document.createElement('canvas'); el.appendChild(c);
    const so = Object.assign({}, o); delete so.weight; delete so.rest; delete so.hover;
    const ctl = live(c, Object.assign({ drift: 1, wet: o.rest, pointer: 0, alive: false, own: false, develop: 'in', developMs: 1200, seed: name.length || 3 }, so));
    const host = el.closest('button,a,label,[tabindex]') || el;
    if (ctl) {
      const on = v => () => ctl.set({ wet: v ? o.hover : o.rest, alive: v });
      host.addEventListener('pointerenter', on(true)); host.addEventListener('pointerleave', on(false));
      host.addEventListener('focusin', on(true)); host.addEventListener('focusout', on(false));
    }
    return ctl;
  }

  P.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, cursor, icon, ICONS, iconMask };
})(typeof window !== 'undefined' ? window : globalThis);
