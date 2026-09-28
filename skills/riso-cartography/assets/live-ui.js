/* live-ui.js — interface pieces pulled on the riso press (needs riso.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live print behind it; the canvas is decoration (aria-hidden), the
 * control stays native, keyboard-reachable and readable by assistive tech. The press is the
 * vocabulary: a button is a block of ink that slips out of register when you point at it and
 * takes a fresh stamp when pressed; a switch's knob is its own drum, slid across; a slider and
 * a progress bar are a drum pulled along the strip; a loader is the press running, drums
 * wandering and contours traced one after another; the focus ring is two misregistered
 * hairlines; a section transition feeds through the drums as it scrolls past; the cursor is a
 * registration mark in two inks trailing the mouse; an icon is printed on two drums that slip
 * apart when you point at its control.
 *
 *   const ui = Riso.ui;
 *   ui.background(section);   ui.button(btn);   ui.card(card);   ui.toggle(checkbox);
 *   ui.slider(range);   const p = ui.progress(el); p.set(0.4);   ui.loader(el);
 *   ui.focusRing();   ui.transition(strip);   ui.cursor(app);   ui.icon(span, 'play');
 *   Riso.iconMask(svg, { pad, weight })   // any <path d> SVG as a drum master
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Icons: Phosphor Icons (light weight), MIT, Copyright (c) 2023 Phosphor Icons,
 * https://phosphoricons.com — inlined below, never fetched. The rest is original code, MIT.
 */
(function (root) {
  'use strict';
  const Rz = root.Riso;
  if (!Rz || !Rz.live) throw new Error('live-ui.js: load riso.js and live.js first');
  const live = Rz.live;
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const dpr = () => Math.min(2, root.devicePixelRatio || 1);
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

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
.rz-host{position:relative;isolation:isolate}
.rz-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block}
.rz-track{position:relative;display:inline-block;vertical-align:middle}
.rz-track>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.rz-track>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.rz-track:has(input:focus-visible){outline:1px solid var(--rz-focus,#0078bf);outline-offset:4px}
.rz-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none;mix-blend-mode:multiply}
.rz-cursor{position:fixed;left:0;top:0;pointer-events:none;z-index:2147482999;display:none;mix-blend-mode:multiply}
.rz-icon{display:inline-block;position:relative;vertical-align:middle;flex:none}
.rz-icon>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;mix-blend-mode:multiply}`;
    document.head.appendChild(s);
  }
  // one rAF for the pieces that move something themselves (the cursor's follow)
  const tickers = new Set();
  let raf = 0;
  const loop = now => { raf = 0; for (const f of tickers) f(now); if (tickers.size) raf = requestAnimationFrame(loop); };
  const tick = f => { tickers.add(f); if (!raf) raf = requestAnimationFrame(loop); return () => tickers.delete(f); };
  // pure white paper with no fibre: an overlay multiplied onto the page shows only its ink
  const CLEAR = { tone: '#ffffff', fibre: 0 };
  // a canvas behind `host`'s content, filling it
  function backdrop(host) {
    style();
    host.classList.add('rz-host');
    const c = document.createElement('canvas');
    c.className = 'rz-bg'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    return c;
  }

  // ---------------------------------------------------------------- masters
  /** Contour lines of live.ground(w, h, seed), marching squares on its grid: `levels` as in `trace`. */
  function contours(ctx, w, h, seed, levels, lw, every) {
    const G = live.ground(w, h, seed), { g, gw, gh } = G, sx = w / (gw - 1), sy = h / (gh - 1);
    for (let L = 1; L < levels; L++) {
      const t = L / levels;
      ctx.lineWidth = lw * (every && L % every === 0 ? 2.2 : 1);
      ctx.beginPath();
      for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
        const a = g[j * gw + i], b = g[j * gw + i + 1], c = g[(j + 1) * gw + i + 1], d = g[(j + 1) * gw + i];
        const pts = [];
        const edge = (p, q, x0, y0, x1, y1) => { if ((p < t) !== (q < t)) { const f = (t - p) / (q - p); pts.push([(x0 + (x1 - x0) * f) * sx, (y0 + (y1 - y0) * f) * sy]); } };
        edge(a, b, i, j, i + 1, j); edge(b, c, i + 1, j, i + 1, j + 1); edge(d, c, i, j + 1, i + 1, j + 1); edge(a, d, i, j, i, j + 1);
        for (let k = 0; k + 1 < pts.length; k += 2) { ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); }
      }
      ctx.stroke();
    }
  }
  /**
   * iconMask(svg, { pad, weight, shade }) — an icon's SVG (Phosphor-style: one or more <path d>,
   * any viewBox) as a layer's `draw`: the paths fill black on the white master, centred with
   * `pad` (share of the short side) around them. `weight` strokes the outline too (viewBox
   * units), which keeps light icons standing once the grain has eaten into them; `shade` < 1
   * prints a lighter tint.
   */
  function iconMask(svg, opts) {
    const o = Object.assign({ pad: 0.12, weight: 0, shade: 1 }, opts);
    const vb = ((svg.match(/viewBox="([^"]+)"/) || [0, '0 0 256 256'])[1]).split(/[\s,]+/).map(Number);
    const paths = Array.from(svg.matchAll(/\sd="([^"]+)"/g), m => new Path2D(m[1]));
    return (ctx, w, h) => {
      const s = Math.min(w, h) * (1 - 2 * o.pad) / Math.max(vb[2], vb[3]), g = Math.round(255 * (1 - o.shade));
      ctx.save();
      ctx.translate((w - vb[2] * s) / 2 - vb[0] * s, (h - vb[3] * s) / 2 - vb[1] * s); ctx.scale(s, s);
      ctx.fillStyle = ctx.strokeStyle = `rgb(${g},${g},${g})`; ctx.lineWidth = o.weight; ctx.lineJoin = 'round';
      for (const p of paths) { ctx.fill(p); if (o.weight) ctx.stroke(p); }
      ctx.restore();
    };
  }
  /** A layer-tint of the same ground: density from `lo` (valleys) to `hi` (tops), for a grain screen. */
  function tint(ctx, w, h, seed, lo, hi) {
    const { g, gw, gh } = live.ground(w, h, seed), c = document.createElement('canvas');
    c.width = gw; c.height = gh;
    const x = c.getContext('2d'), img = x.createImageData(gw, gh);
    for (let i = 0; i < gw * gh; i++) { const v = Math.round(255 * (1 - (lo + (hi - lo) * clamp01((g[i] - 0.3) / 0.45)))); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(c, 0, 0, w, h);
  }
  const rect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  /** The map most pieces print: a tint drum and a contour drum of one ground, in one or two inks. */
  function mapLayers(o) {
    const k = dpr();
    return [
      { ink: o.tintInk || o.ink, screen: 'grain', density: 1, draw: (c, w, h) => tint(c, w, h, o.seed, o.lo == null ? 0.04 : o.lo, o.hi == null ? 0.34 : o.hi) },
      { ink: o.ink, screen: 'solid', draw: (c, w, h) => contours(c, w, h, o.seed, o.levels || 14, 0.9 * k, 5) },
    ];
  }

  // ---------------------------------------------------------------- pieces
  /** A live map behind a section: tint + contours in blue, drums drifting, a loupe on the pointer, a stamp on click, contours traced. */
  function background(host, opts) {
    const o = Object.assign({ ink: 'blue', seed: 4, paper: 'white', levels: 14 }, opts);
    return live(backdrop(host), Object.assign({ layers: mapLayers(o), paper: o.paper, seed: o.seed, drift: 1, pointer: 1, radius: 0.2, clickPulse: true, stampInk: 'fluorescent-pink', trace: 0.9, traceLevels: o.levels, hand: host }, opts, { layers: mapLayers(o) }));
  }

  /**
   * A button: a block of ink on one drum and a key line in a second ink on another, printed a
   * hair out of register. Hover or focus knocks the drums further out (`slip`), a press stamps
   * fresh ink where it landed. `density` < 1 gives a pale block (a secondary button). Set the
   * label colour in CSS: paper on a full block, ink on a pale one.
   */
  function button(btn, opts) {
    const o = Object.assign({ ink: 'blue', key: 'fluorescent-pink', density: 0.97, seed: 3, hover: 0.5 }, opts);
    const k = dpr();
    const block = (c, w, h) => { rect(c, 4 * k, 4 * k, w - 8 * k, h - 8 * k, 2 * k); c.fill(); };
    const line = (c, w, h) => { c.lineWidth = 1.2 * k; rect(c, 2 * k, 2 * k, w - 4 * k, h - 4 * k, 3 * k); c.stroke(); };
    const ctl = live(backdrop(btn), { layers: [{ ink: o.ink, screen: 'grain', density: o.density, draw: block }, { ink: o.key, screen: 'solid', draw: line }], paper: 'white', seed: o.seed, misregister: 0.7, drift: 0, pointer: 0, own: false, stampInk: o.key, ease: 0.12 });
    if (!ctl) return null;
    let over = false, focus = false;
    const upd = () => ctl.set({ slip: over || focus ? o.hover : 0 });
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
    btn.addEventListener('pointerleave', () => { over = false; upd(); });
    btn.addEventListener('focus', () => { focus = btn.matches(':focus-visible'); upd(); });
    btn.addEventListener('blur', () => { focus = false; upd(); });
    btn.addEventListener('pointerdown', e => { const r = btn.getBoundingClientRect(); ctl.pulse(e.clientX - r.left, e.clientY - r.top, 1, 0.3); });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const r = btn.getBoundingClientRect(); ctl.pulse(r.width / 2, r.height / 2, 1, 0.3); } });
    return ctl;
  }

  /** A card: a small map that feeds through the drums the first time it scrolls into view; loupe on hover. */
  function card(el, opts) {
    const o = Object.assign({ ink: 'blue', seed: 7, levels: 10, lo: 0.02, hi: 0.22 }, opts);
    return live(backdrop(el), Object.assign({ layers: mapLayers(o), paper: 'white', seed: o.seed, feed: 'in', drift: 0.6, pointer: 1, radius: 0.28, zoom: 1.6, hand: el, own: false }, opts, { layers: mapLayers(o) }));
  }

  // wrap a native input in a track with a canvas under it
  function track(input, cls) {
    style();
    const t = document.createElement('span');
    t.className = 'rz-track ' + (cls || '');
    input.parentNode.insertBefore(t, input);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    t.appendChild(c); t.appendChild(input);
    return { t, c };
  }

  /** A switch: a hairline track, and the knob on its own drum, slid across when on (the track tints in). */
  function toggle(input, opts) {
    const o = Object.assign({ ink: 'blue', seed: 5 }, opts), k = dpr();
    if (!input.getAttribute('role')) input.setAttribute('role', 'switch');
    const { t, c } = track(input, 'rz-toggle');
    const layers = [
      { ink: o.ink, screen: 'solid', draw: (x, w, h) => { x.lineWidth = 1.2 * k; rect(x, k, k, w - 2 * k, h - 2 * k, h / 2); x.stroke(); } },
      { ink: o.ink, screen: 'grain', density: 0.35, draw: (x, w, h) => { x.fillStyle = '#000'; rect(x, 3 * k, 3 * k, w - 6 * k, h - 6 * k, h / 2); x.fill(); } },
      { ink: o.ink, screen: 'grain', density: 0.97, draw: (x, w, h) => { x.beginPath(); x.arc(h / 2, h / 2, h / 2 - 4 * k, 0, 7); x.fill(); } },
    ];
    const state = () => { const r = t.getBoundingClientRect(), d = r.width - r.height; return { offsets: [null, [input.checked ? 0 : -r.width, 0], [input.checked ? d : 0, 0]] }; };
    const ctl = live(c, Object.assign({ layers, paper: 'white', seed: o.seed, misregister: 0.5, drift: 0, pointer: 0, own: false, ease: 0.1 }, state()));
    input.addEventListener('change', () => ctl && ctl.set(state()));
    return ctl;
  }

  /** A slider: a ruled track, and a drum of ink pulled along it up to the value. */
  function slider(input, opts) {
    const o = Object.assign({ ink: 'blue', seed: 6 }, opts), k = dpr();
    const { t, c } = track(input, 'rz-slider');
    const val = () => { const lo = +input.min || 0, hi = input.max === '' ? 100 : +input.max; return clamp01((+input.value - lo) / (hi - lo || 1)); };
    const layers = [
      { ink: o.ink, screen: 'solid', draw: (x, w, h) => { x.lineWidth = 1 * k; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); for (let i = 0; i <= 10; i++) { const X = 1 + i * (w - 2) / 10; x.moveTo(X, h * (i % 5 ? 0.35 : 0.2)); x.lineTo(X, h * (i % 5 ? 0.65 : 0.8)); } x.stroke(); } },
      { ink: o.ink, screen: 'grain', density: 0.95, draw: (x, w, h) => { x.fillRect(0, h * 0.3, w, h * 0.4); x.fillRect(w - 6 * k, h * 0.08, 6 * k, h * 0.84); } },
    ];
    const state = () => { const r = t.getBoundingClientRect(); return { offsets: [null, [-(1 - val()) * r.width, 0]] }; };
    const ctl = live(c, Object.assign({ layers, paper: 'white', seed: o.seed, misregister: 0.5, drift: 0, pointer: 0, own: false, ease: 0.07 }, state()));
    input.addEventListener('input', () => ctl && ctl.set(state()));
    if (root.ResizeObserver) new ResizeObserver(() => ctl && ctl.set(state())).observe(t);
    return ctl;
  }

  /** Progress: a drum pulled along the strip up to p. Returns { ctl, set(p) }; a finished bar takes a stamp. */
  function progress(el, opts) {
    const o = Object.assign({ ink: 'blue', seed: 8, value: 0 }, opts), k = dpr();
    const c = backdrop(el);
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    const layers = [
      { ink: o.ink, screen: 'solid', draw: (x, w, h) => { x.lineWidth = k; x.strokeRect(k / 2, k / 2, w - k, h - k); } },
      { ink: o.ink, screen: 'grain', density: 0.9, draw: (x, w, h) => x.fillRect(0, 0, w, h) },
    ];
    const off = p => ({ offsets: [null, [-(1 - p) * (el.getBoundingClientRect().width || 1), 0]] });
    const ctl = live(c, Object.assign({ layers, paper: 'white', seed: o.seed, misregister: 0.4, drift: 0, pointer: 0, own: false, ease: 0.12, stampInk: 'fluorescent-pink' }, off(o.value)));
    let last = o.value;
    const api = {
      ctl,
      set(p) {
        p = clamp01(p);
        el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (ctl) { ctl.set(off(p)); if (p >= 1 && last < 1) { const r = el.getBoundingClientRect(); ctl.pulse(r.width - r.height, r.height / 2, 1, 0.6); } }
        last = p; return api;
      },
    };
    api.set(o.value);
    return api;
  }

  /** A loader: a small plate with the press running (drums wandering, contours traced fast). Holds still with reduced motion. */
  function loader(el, opts) {
    const o = Object.assign({ ink: 'blue', seed: 9, levels: 8, lo: 0.02, hi: 0.16 }, opts);
    el.setAttribute('role', 'status');
    const ctl = live(backdrop(el), { layers: mapLayers(o), paper: 'white', seed: o.seed, drift: 3, speed: 2, trace: 1, traceLevels: o.levels, traceRate: 5, traceInk: 'fluorescent-pink', pointer: 0, own: false });
    return { ctl, stop() { ctl && ctl.pause(); } };
  }

  /**
   * One focus ring for the page: two hairlines, blue and fluorescent pink, printed a little out of
   * register around whatever has :focus-visible, on an overlay multiplied onto the page (its paper
   * is pure white). Keep a 1px CSS outline too: it is what shows without WebGL2 and in forced colours.
   */
  function focusRing(opts) {
    const o = Object.assign({ pad: 5, inks: ['fluorescent-pink', 'blue'] }, opts), k = dpr();
    style();
    const c = document.createElement('canvas');
    c.className = 'rz-ring'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    let el = null, ctl = null, key = '';
    const ring = rad => (x, w, h) => { x.lineWidth = 1.6 * k; rect(x, (o.pad - 1) * k, (o.pad - 1) * k, w - 2 * (o.pad - 1) * k, h - 2 * (o.pad - 1) * k, rad * k); x.stroke(); };
    function place() {
      if (!el || !el.isConnected) { c.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), p = o.pad + 3;
      const w = Math.round(r.width + 2 * p), h = Math.round(r.height + 2 * p);
      Object.assign(c.style, { display: 'block', width: w + 'px', height: h + 'px', transform: `translate(${Math.round(r.left - p)}px,${Math.round(r.top - p)}px)` });
      const rad = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) + o.pad, kk = w + 'x' + h + 'x' + rad;
      if (kk === key) return;
      key = kk;
      const layers = o.inks.map(ink => ({ ink, screen: 'solid', draw: ring(rad) }));
      const so = { layers, paper: { tone: '#ffffff', fibre: 0 }, seed: 12, misregister: 1.4 };
      if (!ctl) ctl = live(c, Object.assign({ drift: 2.5, speed: 1.4, pointer: 0, own: false }, so));
      else ctl.set(so);
    }
    document.addEventListener('focusin', e => { el = e.target.matches(':focus-visible') ? e.target : null; place(); });
    document.addEventListener('focusout', () => { el = null; place(); });
    root.addEventListener('scroll', () => el && place(), { passive: true, capture: true });
    root.addEventListener('resize', () => el && place());
    return { get ctl() { return ctl; }, canvas: c };
  }

  /** A section transition: a strip of contours that feeds through the drums as it scrolls past. */
  function transition(el, opts) {
    const o = Object.assign({ ink: 'blue', tintInk: 'fluorescent-pink', seed: 11, levels: 12, lo: 0, hi: 0.18 }, opts);
    return live(backdrop(el), { layers: mapLayers(o), paper: 'white', seed: o.seed, feed: 'scroll', drift: 0.8, pointer: 0, trace: 0.6, traceLevels: o.levels });
  }

  /**
   * A cursor for `area`: a registration mark (ring and cross hairs) printed in two inks a little
   * out of register, trailing the mouse on an overlay multiplied onto the page. The drums wander,
   * a click stamps it. The system cursor stays. Mouse only: hidden on touch and pen, and with
   * reduced motion. The view is made once, on the first mouse move, and then only moved.
   */
  function cursor(area, opts) {
    const o = Object.assign({ size: 44, lag: 0.1, inks: ['blue', 'fluorescent-pink'], seed: 14 }, opts), k = dpr();
    style();
    const c = document.createElement('canvas');
    c.className = 'rz-cursor'; c.setAttribute('aria-hidden', 'true');
    Object.assign(c.style, { width: o.size + 'px', height: o.size + 'px' });
    document.body.appendChild(c);
    const mark = (x, w, h) => {
      const r = Math.min(w, h) * 0.26, cx = w / 2, cy = h / 2;
      x.lineWidth = 1.4 * k;
      x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(cx - r * 1.6, cy); x.lineTo(cx + r * 1.6, cy); x.moveTo(cx, cy - r * 1.6); x.lineTo(cx, cy + r * 1.6); x.stroke();
    };
    let ctl = null, tx = 0, ty = 0, x = 0, y = 0, on = false, last = 0;
    const show = v => { c.style.display = v ? 'block' : 'none'; };
    area.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || RM.matches) { on = false; show(false); return; }
      tx = e.clientX; ty = e.clientY;
      if (!on) { x = tx; y = ty; on = true; show(true); }
      if (!ctl) ctl = live(c, { layers: o.inks.map(ink => ({ ink, screen: 'solid', draw: mark })), paper: CLEAR, seed: o.seed, misregister: 1.2, drift: 2.5, speed: 1.3, pointer: 0, own: false, stampInk: o.inks[1] });
    }, { passive: true });
    area.addEventListener('pointerleave', () => { on = false; show(false); });
    area.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && ctl) ctl.pulse(o.size / 2, o.size / 2, 0.8, 0.3); });
    tick(now => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
      if (!on) return;
      const q = 1 - Math.exp(-dt / o.lag);
      x += (tx - x) * q; y += (ty - y) * q;
      c.style.transform = `translate(${Math.round(x - o.size / 2)}px,${Math.round(y - o.size / 2)}px)`;
    });
    return { get ctl() { return ctl; }, canvas: c };
  }

  /**
   * An icon pulled on two drums: the shape in a grain of `ink`, and its hairline outline in `key`,
   * a hair out of register, on an overlay multiplied onto whatever is under it (so put it on a
   * pale ground: on a full block of the same ink it disappears). Pointing at or focusing its
   * control knocks the drums apart. `name` is a key of ICONS or an SVG string with <path d>
   * outlines. The element sets the size (CSS width and height).
   */
  function icon(el, name, opts) {
    const svg = ICONS[name] || name;
    const o = Object.assign({ ink: 'blue', key: 'fluorescent-pink', weight: 8, seed: 3, hover: 1 }, opts);
    style();
    el.classList.add('rz-icon');
    if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    const c = document.createElement('canvas'); el.appendChild(c);
    const layers = [
      { ink: o.ink, screen: 'grain', density: 1, draw: iconMask(svg, { weight: o.weight }) },
      { ink: o.key, screen: 'solid', draw: iconMask(svg, { weight: 0, shade: 0.8 }) },
    ];
    const ctl = live(c, { layers, paper: CLEAR, seed: o.seed + (typeof name === 'string' && ICONS[name] ? name.length : 0), misregister: 0.35, drift: 0.4, pointer: 0, own: false, ease: 0.12 });
    const host = el.closest('button,a,label,[tabindex]') || el;
    if (ctl) {
      let over = false, focus = false;
      const upd = () => ctl.set({ slip: over || focus ? o.hover : 0 });
      host.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { over = true; upd(); } });
      host.addEventListener('pointerleave', () => { over = false; upd(); });
      host.addEventListener('focus', () => { focus = host.matches(':focus-visible'); upd(); });
      host.addEventListener('blur', () => { focus = false; upd(); });
    }
    return ctl;
  }

  Rz.iconMask = iconMask;
  Rz.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, cursor, icon, contours, tint, mapLayers, ICONS };
})(typeof window !== 'undefined' ? window : globalThis);
