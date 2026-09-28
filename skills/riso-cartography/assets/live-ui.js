/* live-ui.js — interface pieces pulled on the riso press (needs riso.js, live.js).
 *
 * Each piece is a real control (a <button>, an <input type="checkbox">, an <input type="range">,
 * a focusable element) with a live print behind it; the canvas is decoration (aria-hidden), the
 * control stays native, keyboard-reachable and readable by assistive tech. The press is the
 * vocabulary: a button is a block of ink that slips out of register when you point at it and
 * takes a fresh stamp when pressed; a switch's knob is its own drum, slid across; a slider and
 * a progress bar are a drum pulled along the strip; a loader is the press running, drums
 * wandering and contours traced one after another; the focus ring is two misregistered
 * hairlines; a section transition feeds through the drums as it scrolls past.
 *
 *   const ui = Riso.ui;
 *   ui.background(section);   ui.button(btn);   ui.card(card);   ui.toggle(checkbox);
 *   ui.slider(range);   const p = ui.progress(el); p.set(0.4);   ui.loader(el);
 *   ui.focusRing();   ui.transition(strip);
 *
 * Every function returns the live controller (or a small object holding it) so a page can
 * set() it further. Original code, MIT.
 */
(function (root) {
  'use strict';
  const Rz = root.Riso;
  if (!Rz || !Rz.live) throw new Error('live-ui.js: load riso.js and live.js first');
  const live = Rz.live;
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const dpr = () => Math.min(2, root.devicePixelRatio || 1);

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
.rz-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;display:none;mix-blend-mode:multiply}`;
    document.head.appendChild(s);
  }
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

  Rz.ui = { background, button, card, toggle, slider, progress, loader, focusRing, transition, contours, tint, mapLayers };
})(typeof window !== 'undefined' ? window : globalThis);
