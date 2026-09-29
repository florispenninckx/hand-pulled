/* live-ui.js — interface pieces exposed through the cyanotype process (needs cyanotype.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live canvas behind it; the canvas is decoration, the control stays
 * native, keyboard-reachable and readable by assistive tech. Light is exposure: hovering a button
 * exposes it through the grain, pressing it is a flash, a switch's thumb is a coin laid on the
 * paper (it blocks the light, so it stays pale), a slider exposes the strip up to its value.
 *
 *   const ui = Cyanotype.ui;
 *   ui.background(section, { palette: 'cobalt' });   ui.button(btn);   ui.card(card, { mode: 'halo' });
 *   ui.toggle(checkbox);   ui.slider(range);   const p = ui.progress(el); p.set(0.4);
 *   ui.focusRing();   ui.transition(strip);   ui.icon(span, 'flower');
 *   // optional extra, only when the brief asks for a custom cursor: ui.cursor(area, { mark, hover })
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Icons: Phosphor Icons (light weight), MIT, Copyright (c) 2023 Phosphor Icons,
 * https://phosphoricons.com — inlined below, never fetched. The rest is original code, MIT.
 */
(function (root) {
  'use strict';
  const C = root.Cyanotype;
  if (!C || !C.live) throw new Error('live-ui.js: load cyanotype.js and live.js first');
  const live = C.live;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  // Phosphor Icons, light weight (MIT). 256 viewBox, filled outlines.
  const P = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="${d}"/></svg>`;
  const ICONS = {
    sun: P('M122,40V16a6,6,0,0,1,12,0V40a6,6,0,0,1-12,0Zm68,88a62,62,0,1,1-62-62A62.07,62.07,0,0,1,190,128Zm-12,0a50,50,0,1,0-50,50A50.06,50.06,0,0,0,178,128ZM59.76,68.24a6,6,0,1,0,8.48-8.48l-16-16a6,6,0,0,0-8.48,8.48Zm0,119.52-16,16a6,6,0,1,0,8.48,8.48l16-16a6,6,0,1,0-8.48-8.48ZM192,70a6,6,0,0,0,4.24-1.76l16-16a6,6,0,0,0-8.48-8.48l-16,16A6,6,0,0,0,192,70Zm4.24,117.76a6,6,0,0,0-8.48,8.48l16,16a6,6,0,0,0,8.48-8.48ZM46,128a6,6,0,0,0-6-6H16a6,6,0,0,0,0,12H40A6,6,0,0,0,46,128Zm82,82a6,6,0,0,0-6,6v24a6,6,0,0,0,12,0V216A6,6,0,0,0,128,210Zm112-88H216a6,6,0,0,0,0,12h24a6,6,0,0,0,0-12Z'),
    image: P('M216,42H40A14,14,0,0,0,26,56V200a14,14,0,0,0,14,14H216a14,14,0,0,0,14-14V56A14,14,0,0,0,216,42ZM40,54H216a2,2,0,0,1,2,2V163.57L188.53,134.1a14,14,0,0,0-19.8,0l-21.42,21.42L101.9,110.1a14,14,0,0,0-19.8,0L38,154.2V56A2,2,0,0,1,40,54ZM38,200V171.17l52.58-52.58a2,2,0,0,1,2.84,0L176.83,202H40A2,2,0,0,1,38,200Zm178,2H193.8l-38-38,21.41-21.42a2,2,0,0,1,2.83,0l38,38V200A2,2,0,0,1,216,202ZM146,100a10,10,0,1,1,10,10A10,10,0,0,1,146,100Z'),
    drop: P('M172.53,49.06a252.86,252.86,0,0,0-41.09-38,6,6,0,0,0-6.88,0,252.86,252.86,0,0,0-41.09,38C56.34,80.26,42,113.09,42,144a86,86,0,0,0,172,0C214,113.09,199.66,80.26,172.53,49.06ZM128,218a74.09,74.09,0,0,1-74-74c0-59.62,59-108.93,74-120.51C143,35.07,202,84.38,202,144A74.09,74.09,0,0,1,128,218Zm53.92-65A55.58,55.58,0,0,1,137,197.92a7,7,0,0,1-1,.08,6,6,0,0,1-1-11.92c17.38-2.92,32.13-17.68,35.08-35.08a6,6,0,1,1,11.84,2Z'),
    sliders: P('M40,86H74.6a30,30,0,0,0,58.8,0H216a6,6,0,0,0,0-12H133.4a30,30,0,0,0-58.8,0H40a6,6,0,0,0,0,12Zm64-24A18,18,0,1,1,86,80,18,18,0,0,1,104,62ZM216,170H197.4a30,30,0,0,0-58.8,0H40a6,6,0,0,0,0,12h98.6a30,30,0,0,0,58.8,0H216a6,6,0,0,0,0-12Zm-48,24a18,18,0,1,1,18-18A18,18,0,0,1,168,194Z'),
    play: P('M231.36,116.19,87.28,28.06a14,14,0,0,0-14.18-.27A13.69,13.69,0,0,0,66,39.87V216.13a13.69,13.69,0,0,0,7.1,12.08,14,14,0,0,0,14.18-.27l144.08-88.13a13.82,13.82,0,0,0,0-23.62Zm-6.26,13.38L81,217.7a2,2,0,0,1-2.06,0,1.78,1.78,0,0,1-1-1.61V39.87a1.78,1.78,0,0,1,1-1.61A2.06,2.06,0,0,1,80,38a2,2,0,0,1,1,.31L225.1,126.43a1.82,1.82,0,0,1,0,3.14Z'),
    pause: P('M200,34H160a14,14,0,0,0-14,14V208a14,14,0,0,0,14,14h40a14,14,0,0,0,14-14V48A14,14,0,0,0,200,34Zm2,174a2,2,0,0,1-2,2H160a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2h40a2,2,0,0,1,2,2ZM96,34H56A14,14,0,0,0,42,48V208a14,14,0,0,0,14,14H96a14,14,0,0,0,14-14V48A14,14,0,0,0,96,34Zm2,174a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V48a2,2,0,0,1,2-2H96a2,2,0,0,1,2,2Z'),
    aperture: P('M200.12,55.88A102,102,0,0,0,55.87,200.12,102,102,0,1,0,200.12,55.88Zm-102,66.67,19.65-23.14,29.86,5.46,10.21,28.58-19.65,23.14-29.86-5.46ZM209.93,90.69a90.24,90.24,0,0,1-2,78.63l-56.14-10.24Zm-6.16-11.28-36.94,43.48L136.66,38.42a89.31,89.31,0,0,1,55,25.94A91.33,91.33,0,0,1,203.77,79.41Zm-139.41-15A89.37,89.37,0,0,1,123.81,38.1L143,91.82,54.75,75.71A91.2,91.2,0,0,1,64.36,64.36ZM48,86.68l56.14,10.24L46.07,165.31a90.24,90.24,0,0,1,2-78.63Zm4.21,89.91,36.94-43.48,30.17,84.47a89.31,89.31,0,0,1-55-25.94A91.33,91.33,0,0,1,52.23,176.59Zm139.41,15a89.32,89.32,0,0,1-59.45,26.26L113,164.18l88.24,16.11A91.2,91.2,0,0,1,191.64,191.64Z'),
    flower: P('M209.35,131.09a42.24,42.24,0,0,0-6.82-3.09,42.24,42.24,0,0,0,6.82-3.09,38,38,0,1,0-38-65.82,43.33,43.33,0,0,0-6.08,4.36A42.94,42.94,0,0,0,166,56a38,38,0,0,0-76,0,42.94,42.94,0,0,0,.73,7.45,43.33,43.33,0,0,0-6.08-4.36,38,38,0,0,0-38,65.82A42.24,42.24,0,0,0,53.47,128a42.24,42.24,0,0,0-6.82,3.09,38,38,0,0,0,9.16,69.62,38.53,38.53,0,0,0,9.9,1.31,37.82,37.82,0,0,0,18.94-5.11,43.33,43.33,0,0,0,6.08-4.36A42.94,42.94,0,0,0,90,200a38,38,0,0,0,76,0,42.94,42.94,0,0,0-.73-7.45,43.33,43.33,0,0,0,6.08,4.36A37.82,37.82,0,0,0,190.29,202a38.53,38.53,0,0,0,9.9-1.31,38,38,0,0,0,9.16-69.62Zm-32-61.61a26,26,0,1,1,26,45c-4.77,2.75-14.92,6.15-36.4,7.47l-1.44-.08A38,38,0,0,0,152,98.58l.66-1.31C164.56,79.33,172.58,72.24,177.35,69.48ZM128,154a26,26,0,1,1,26-26A26,26,0,0,1,128,154Zm0-124a26,26,0,0,1,26,26c0,5.51-2.13,16-11.73,35.27-.26.4-.53.8-.79,1.21a37.88,37.88,0,0,0-27,0l-.79-1.22C104.13,72,102,61.51,102,56A26,26,0,0,1,128,30ZM52.65,114.52a26,26,0,0,1,26-45c4.77,2.76,12.79,9.85,24.67,27.79l.66,1.31a38,38,0,0,0-13.49,23.33l-1.44.08C67.57,120.67,57.42,117.27,52.65,114.52Zm26,72a26,26,0,0,1-26-45c4.77-2.75,14.92-6.15,36.4-7.47l1.44.08A38,38,0,0,0,104,157.42l-.66,1.31C91.44,176.67,83.42,183.76,78.65,186.52ZM128,226a26,26,0,0,1-26-26c0-5.51,2.13-16,11.73-35.27.26-.4.53-.8.79-1.21a37.88,37.88,0,0,0,27,0l.79,1.22C151.87,184,154,194.49,154,200A26,26,0,0,1,128,226Zm84.87-49a26,26,0,0,1-35.52,9.52c-4.77-2.76-12.79-9.85-24.67-27.79l-.66-1.31a38,38,0,0,0,13.49-23.33L167,134c21.48,1.32,31.63,4.72,36.4,7.47A26,26,0,0,1,212.87,177Z'),
    butterfly: P('M231.1,51.71C226.09,45.27,218.64,42,209,42c-16.33,0-37.41,11.06-56.4,29.59A132,132,0,0,0,134,93.94V56a6,6,0,0,0-12,0V93.94a132,132,0,0,0-18.54-22.35C84.49,53.06,63.4,42,47.07,42c-9.69,0-17.14,3.27-22.15,9.71-5.53,7.11-7.71,17.69-6.66,32.34.91,12.73,4.12,26.53,6.81,37.13,6.28,24.74,20.77,33,31.78,35.68A42,42,0,1,0,128,201.62a42,42,0,1,0,71.16-44.76c11-2.63,25.5-10.94,31.78-35.68C237.55,95.21,242.72,66.65,231.1,51.71ZM92,210a30.12,30.12,0,0,1-3.34-60A6,6,0,0,0,87.35,138a41.71,41.71,0,0,0-20.28,8c-9,.31-24.12-3.16-30.37-27.76-3.25-12.81-11.89-46.83-2.31-59.15C37.05,55.66,41.2,54,47.07,54c12.88,0,31.72,10.28,48,26.18C111.69,96.39,122,114.59,122,127.67V180A30,30,0,0,1,92,210Zm127.31-91.77C213.07,142.83,198,146.29,189,146a41.62,41.62,0,0,0-20.28-8A6,6,0,1,0,167.36,150,30.11,30.11,0,1,1,134,180V127.67c0-13.08,10.32-31.28,26.93-47.49C177.23,64.28,196.07,54,209,54c5.87,0,10,1.66,12.68,5.08C231.21,71.4,222.57,105.42,219.32,118.23Z'),
    clock: P('M128,26A102,102,0,1,0,230,128,102.12,102.12,0,0,0,128,26Zm0,192a90,90,0,1,1,90-90A90.1,90.1,0,0,1,128,218Zm62-90a6,6,0,0,1-6,6H128a6,6,0,0,1-6-6V72a6,6,0,0,1,12,0v50h50A6,6,0,0,1,190,128Z'),
    lightning: P('M213.84,118.63a6,6,0,0,0-3.73-4.25L150.88,92.17l15-75a6,6,0,0,0-10.27-5.27l-112,120a6,6,0,0,0,2.28,9.71l59.23,22.21-15,75a6,6,0,0,0,3.14,6.52A6.07,6.07,0,0,0,96,246a6,6,0,0,0,4.39-1.91l112-120A6,6,0,0,0,213.84,118.63ZM106,220.46l11.85-59.28a6,6,0,0,0-3.77-6.8l-55.6-20.85,91.46-98L138.12,94.82a6,6,0,0,0,3.77,6.8l55.6,20.85Z'),
  };

  // ---------------------------------------------------------------- shared bits
  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
.cy-host{position:relative;isolation:isolate}
.cy-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;border-radius:inherit}
.cy-track{position:relative;display:inline-block;vertical-align:middle;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--cy-line,rgba(28,42,107,.35))}
.cy-track>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.cy-track>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.cy-track:has(input:focus-visible){outline:1px solid var(--cy-focus,#1c2a6b);outline-offset:3px}
.cy-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none}
.cy-icon{display:inline-block;position:relative;vertical-align:middle}
.cy-icon>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}`;
    document.head.appendChild(s);
  }
  // a canvas behind `host`'s content, filling it
  function backdrop(host) {
    style();
    host.classList.add('cy-host');
    const c = document.createElement('canvas');
    c.className = 'cy-bg'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    return c;
  }
  // one rAF for the pieces that move something themselves (the loader orbit)
  const tickers = new Set();
  let raf = 0;
  const loop = now => { raf = 0; for (const f of tickers) f(now); if (tickers.size) raf = requestAnimationFrame(loop); };
  const tick = f => { tickers.add(f); if (!raf) raf = requestAnimationFrame(loop); return () => tickers.delete(f); };
  // a flat plate with a little tooth: what most controls expose
  const plate = (base, tilt) => (u, v) => base + tilt * (0.5 - u) + 0.04 * Math.sin(u * 7.3 + v * 3.1);

  // ---------------------------------------------------------------- pieces
  /** A live field behind a section. opts go to live(); default: cobalt pools, drift, pointer, click flash. */
  function background(host, opts) {
    return live(backdrop(host), Object.assign({ mode: 'field', palette: 'cobalt', drift: 1, pointer: 0.3, clickPulse: true, hand: host }, opts));
  }

  /**
   * A button that exposes through the grain on hover and focus, and flashes on press.
   * rest / hover: exposure at rest and when lit (default 0.14 / 1). The label colour
   * should flip with a CSS :hover/:focus-visible rule on the button (see SKILL.md).
   */
  function button(btn, opts) {
    const o = Object.assign({ mode: 'develop', T: plate(0.86, 0.12), palette: 'paperblue', coarse: 0.7, grain: 1, rest: 0.14, hover: 1, alive: false, drift: 0, pointer: 0, ease: 0.16 }, opts);
    const ctl = live(backdrop(btn), Object.assign({}, o, { develop: o.rest, hand: btn }));
    if (!ctl) return null;
    let over = false, focus = false;
    const upd = () => ctl.set({ develop: over || focus ? o.hover : o.rest, alive: over || focus });
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    btn.addEventListener('pointerleave', () => { over = false; upd(); });
    btn.addEventListener('focus', () => { focus = btn.matches(':focus-visible'); upd(); });
    btn.addEventListener('blur', () => { focus = false; upd(); });
    btn.addEventListener('pointerdown', e => { const r = btn.getBoundingClientRect(); ctl.pulse(e.clientX - r.left, e.clientY - r.top, 0.9); });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const r = btn.getBoundingClientRect(); ctl.pulse(r.width / 2, r.height / 2, 0.9); } });
    return ctl;
  }

  /** A card whose print develops in the first time it scrolls into view. opts go to live(). */
  function card(el, opts) {
    return live(backdrop(el), Object.assign({ mode: 'field', palette: 'cobalt', develop: 'in', drift: 0.6, pointer: 0.25, hand: el, alive: true }, opts));
  }

  // wrap a native input in a track with a canvas under it
  function track(input, cls) {
    style();
    const t = document.createElement('span');
    t.className = 'cy-track ' + (cls || '');
    input.parentNode.insertBefore(t, input);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    t.appendChild(c); t.appendChild(input);
    return { t, c };
  }

  /** A switch: the track exposes when on; the thumb is a coin on the paper, so it stays pale. */
  function toggle(input, opts) {
    const o = Object.assign({ palette: 'paperblue', off: 0.3, on: 1 }, opts);
    if (!input.getAttribute('role')) input.setAttribute('role', 'switch');
    const { c } = track(input, 'cy-toggle');
    const state = () => ({ develop: input.checked ? o.on : o.off, holds: [{ x: input.checked ? 0.72 : 0.28, y: 0.5, r: 0.36, soft: 0.2 }] });
    const ctl = live(c, Object.assign({ mode: 'develop', T: plate(0.9, 0.06), palette: o.palette, coarse: 0.6, grain: 1, drift: 0, pointer: 0, alive: false, ease: 0.14, own: false }, state()));
    input.addEventListener('change', () => ctl && ctl.set(state()));
    return ctl;
  }

  /** A slider: the strip is exposed from 0 up to the value, and a coin sits at the thumb. */
  function slider(input, opts) {
    const o = Object.assign({ palette: 'paperblue' }, opts);
    const { t, c } = track(input, 'cy-slider');
    const val = () => { const lo = +input.min || 0, hi = input.max === '' ? 100 : +input.max; return clamp01((+input.value - lo) / (hi - lo || 1)); };
    const state = () => {
      const r = t.getBoundingClientRect(), k = r.width ? (r.height * 0.5) / r.width : 0.05, v = val(), x = k + v * (1 - 2 * k);
      return { reveal: [0, x, 0.015], holds: [{ x, y: 0.5, r: 0.34, soft: 0.2 }] };
    };
    const ctl = live(c, Object.assign({ mode: 'develop', T: plate(0.92, 0.1), palette: o.palette, coarse: 0.6, grain: 1, drift: 0, pointer: 0, alive: false, ease: 0.08, own: false }, state()));
    input.addEventListener('input', () => ctl && ctl.set(state()));
    if (root.ResizeObserver) new ResizeObserver(() => ctl && ctl.set(state())).observe(t);
    return ctl;
  }

  /** Progress as an exposure: the strip exposes up to p. Returns { ctl, set(p) }; a finished bar flashes. */
  function progress(el, opts) {
    const o = Object.assign({ palette: 'paperblue', value: 0 }, opts);
    const c = backdrop(el);
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    const ctl = live(c, { mode: 'develop', T: plate(0.95, 0.15), palette: o.palette, coarse: 0.8, grain: 1.1, drift: 0, pointer: 0, alive: true, ease: 0.12, reveal: [0, o.value, 0.01], own: false });
    let last = o.value;
    const api = {
      ctl,
      set(p) {
        p = clamp01(p);
        el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (ctl) { ctl.set({ reveal: [0, p, 0.01] }); if (p >= 1 && last < 1) { const r = el.getBoundingClientRect(); ctl.pulse(r.width * 0.9, r.height / 2, 0.8); } }
        last = p; return api;
      },
    };
    api.set(o.value);
    return api;
  }

  /** A loader: a pool of light circling on a small plate. Returns { ctl, stop() }. With reduced motion it holds still. */
  function loader(el, opts) {
    const o = Object.assign({ palette: 'paperblue', period: 1.6 }, opts);
    el.setAttribute('role', 'status');
    const ctl = live(backdrop(el), { mode: 'develop', T: (u, v) => 0.55 * Math.exp(-((u - 0.5) ** 2 + (v - 0.5) ** 2) / 0.08), palette: o.palette, coarse: 0.5, drift: 0.4, pointer: 0.9, radius: 0.28, lag: 0.25, alive: true, own: false });
    if (!ctl) return { ctl, stop() {} };
    const untick = tick(now => {
      if (RM.matches) return;
      const r = el.getBoundingClientRect(), a = (now / 1000) * Math.PI * 2 / o.period;
      ctl.point(r.width * (0.5 + 0.28 * Math.cos(a)), r.height * (0.5 + 0.28 * Math.sin(a)));
    });
    return { ctl, stop() { untick(); ctl.point(null); } };
  }

  /**
   * One focus ring for the page: a grainy band of exposure drawn over whatever has
   * :focus-visible, on a transparent overlay. Keep a 1px CSS outline too (it is what shows
   * without WebGL2 and in forced colours). opts: palette, pad (px), band (px).
   */
  function focusRing(opts) {
    const o = Object.assign({ palette: 'lily', pad: 5, band: 3.5 }, opts);
    style();
    const c = document.createElement('canvas');
    c.className = 'cy-ring'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    let el = null, ctl = null, key = '';
    const ringT = (w, h, rad) => (u, v) => {
      const x = u * w, y = v * h, pad = o.pad + o.band * 1.5;
      const hw = w / 2 - pad, hh = h / 2 - pad, r = Math.min(rad, hw, hh);
      const qx = Math.abs(x - w / 2) - (hw - r), qy = Math.abs(y - h / 2) - (hh - r);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      return Math.exp(-((d / o.band) ** 2));
    };
    function place() {
      if (!el || !el.isConnected) { c.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), p = o.pad + o.band * 1.5;
      const w = Math.round(r.width + 2 * p), h = Math.round(r.height + 2 * p);
      Object.assign(c.style, { display: 'block', width: w + 'px', height: h + 'px', transform: `translate(${Math.round(r.left - p)}px,${Math.round(r.top - p)}px)` });
      const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 2, k = w + 'x' + h + 'x' + rad;
      if (k === key) return;
      key = k;
      const T = ringT(w, h, rad + o.pad);
      if (!ctl) ctl = live(c, { mode: 'develop', T, palette: o.palette, grain: 1.2, coarse: 0.4, transparent: 1.6, drift: 0, pointer: 0, alive: true, own: false, develop: 1 });
      else ctl.set({ T });
    }
    document.addEventListener('focusin', e => { el = e.target.matches(':focus-visible') ? e.target : null; place(); });
    document.addEventListener('focusout', () => { el = null; place(); });
    root.addEventListener('scroll', () => el && place(), { passive: true, capture: true });
    root.addEventListener('resize', () => el && place());
    return { get ctl() { return ctl; }, canvas: c };
  }

  /**
   * A section transition: a strip that develops from paper into ink as it scrolls past, so a
   * pale page hands over to a dark one. opts: from, to (colours at either end), palette (overrides).
   */
  function transition(el, opts) {
    const o = Object.assign({ from: '#f3f3ef', to: '#0b1030' }, opts);
    const pal = o.palette || { ground: o.to, stops: [[0, o.from], [0.3, '#c9d2ee'], [0.55, '#4f63bd'], [0.8, '#1a2a78'], [1, o.to]] };
    const seed = 11, n = C.noise(C.mulberry32(seed));
    const T = (u, v) => 1.9 * Math.pow(v, 1.5) + 0.12 * C.fbm(n, u * 5, v * 2, 3);
    return live(backdrop(el), { mode: 'develop', T, palette: pal, seed, coarse: 0.9, grain: 1.2, develop: 'scroll', drift: 0.5, pointer: 0, alive: true });
  }

  /**
   * An icon exposed like a botanical: its silhouette is printed through print() with a little
   * soft focus, pale on a transparent ground. `icon` is a name in ICONS or an SVG string with
   * <path d> outlines. The element sets the size (CSS width/height).
   */
  function icon(el, name, opts) {
    const svg = ICONS[name] || name;
    const o = Object.assign({ palette: { ground: '#000', stops: [[0, '#0b1030'], [0.4, '#2d5aa8'], [0.75, '#9cc6ee'], [1, '#eef6ff']] }, rest: 0.9, hover: 1.3, weight: 10 }, opts);
    style();
    el.classList.add('cy-icon'); el.setAttribute('aria-hidden', el.getAttribute('aria-hidden') || 'true');
    const c = document.createElement('canvas'); el.appendChild(c);
    const ctl = live(c, { mode: 'print', objects: C.iconMask(svg, { pad: 0.08, weight: o.weight }), polarity: 'positive', focus: 0.5, haze: 0.5, soft: 0.2, weave: 0.2, levels: [0.02, 0.5], palette: o.palette, grain: 0.9, transparent: 1.4, develop: 'in', developMs: 1400, drift: 0, pointer: 0, alive: false, own: false, seed: name.length || 3 });
    const host = el.closest('button,a,[tabindex]') || el;
    if (ctl) {
      host.addEventListener('pointerenter', () => ctl.set({ develop: o.hover, alive: true }));
      host.addEventListener('pointerleave', () => ctl.set({ develop: o.rest, alive: false }));
      ctl.set({ develop: 'in' });
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
    const o = opts || {}, id = String(++cursors), prev = area.style.cursor, at = `[data-cy-cursor="${id}"]`;
    let sheet = null, dead = false;
    Promise.all([curValue(base, 'auto'), o.hover ? curValue(hover, 'pointer') : null]).then(([b, h]) => {
      if (dead) return;
      area.style.cursor = b;
      area.setAttribute('data-cy-cursor', id);
      // text fields keep their I-beam; with hover, links and controls take the second mark (the
      // doubled attribute outranks a page's own `.nav button { cursor: pointer }`)
      sheet = document.createElement('style');
      sheet.textContent = `${at}${at} :is(textarea,[contenteditable=""],[contenteditable="true"],input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=color],[type=file],[type=image])){cursor:text}`
        + (h ? `${at}${at} :is(a[href],button,summary,select,label,[role=button],[role=link],[role=switch],[role=tab],input:is([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset])):not(:disabled){cursor:${h}}` : '');
      document.head.appendChild(sheet);
    }).catch(() => {});   // no mark: the system cursor stays
    return { destroy() { dead = true; if (sheet) { sheet.remove(); area.style.cursor = prev; area.removeAttribute('data-cy-cursor'); } } };
  }

  /**
   * Optional extra, not one of the pieces: a custom cursor for `area`, only when the brief asks
   * for one. The system cursor is the default, and the live background is how the style answers
   * the pointer. A native CSS cursor, painted once through the still engine at 32 px (1x and 2x):
   * each mark is a small sun print, what lay on the paper left pale. opts.mark picks the mark
   * (cursor.marks lists them; an unknown name gives the default):
   *   'fern'  an arrow with a fern frond laid along it (the default); hover: the negative, a pale arrow with a blue frond
   * opts.hover: true gives links and controls inside `area` the hover mark. opts: palette, seed
   * (print options). Returns { destroy() }, which puts the previous cursor back.
   */
  function cursor(area, opts) {
    const o = Object.assign({ mark: 'fern', palette: 'lily', seed: 7 }, opts);
    // print() with `lay(x)` laid on the paper, drawn in CSS px (white blocks the light and stays pale)
    const sun = (k, lay, grain, focus) => C.print(curCanvas(k), { width: CUR * k, height: CUR * k, palette: o.palette, seed: o.seed, focus: focus || 0.25, haze: focus ? 0.05 : 0.15, grain: grain || 1.2, objects: (x, w) => {
      x.save(); x.scale(w / CUR, w / CUR); x.fillStyle = x.strokeStyle = '#fff'; x.lineCap = x.lineJoin = 'round'; lay(x); x.restore();
    } });
    const paper = '#f5f2fb', shade = 'rgba(10,23,64,.5)';
    const rim = (x, path, w) => { x.lineJoin = 'round'; x.beginPath(); path(x); x.lineWidth = 2.4; x.strokeStyle = shade; x.stroke(); x.lineWidth = w || 1; x.strokeStyle = paper; x.stroke(); };
    const frond = x => {
      x.lineWidth = 1.3; x.beginPath(); x.moveTo(3.4, 6); x.quadraticCurveTo(5.5, 14, 9.6, 21.5);
      for (let i = 0; i < 6; i++) { const y = 8 + i * 2.2, cx = 3.6 + i * 0.95, l = 3.2 - i * 0.3; x.moveTo(cx, y); x.lineTo(cx + l, y - 1.4); if (i > 1) { x.moveTo(cx, y); x.lineTo(cx - Math.min(1.2, l * 0.4), y - 1.1); } }
      x.stroke();
    };
    const marks = {
      fern: { hot: [2, 2], paint: (k, over) => curCut(sun(k, over ? x => { x.beginPath(); curPath(x, CUR_ARROW); x.fill(); x.fillStyle = x.strokeStyle = '#000'; frond(x); } : frond, 0.6, 0.08), k, x => curPath(x, CUR_ARROW), x => rim(x, q => curPath(q, CUR_ARROW))) },
    };
    const m = marks[o.mark] || marks.fern;
    return nativeCursor(area, o, { hot: m.hot, paint: k => m.paint(k, false) }, { hot: m.hot, paint: k => m.paint(k, true) });
  }
  cursor.marks = ['fern'];

  C.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, icon, ICONS, cursor };
})(typeof window !== 'undefined' ? window : globalThis);
