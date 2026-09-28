/* pour.js — liquid colour for a maximalist colour page. Poured paint seen flat and in daylight:
 * soft grain swirls, agate bands, moiré line fields, veined marbling, a blurred bloom, flat
 * colour fields, a photograph poured like paint, and the palette cards that name the colours.
 * One scalar field (noise warped by noise) is solved on a coarse grid and every mode reads it
 * per pixel, so band edges and veins stay sharp at any size. Seeded. No dependencies.
 * Original implementation.
 *
 *   Pour.paint(canvas, { mode: 'bands', palette: 'agate', seed: 3 })   // fills the canvas at its own size
 *   Pour.plate(el, { mode: 'swirl', palette: 'citric' })               // a canvas that fills el, painted when seen
 *   Pour.photo(canvas, img, { warp: 1, map: 'aqua' })                  // pour a photograph
 *   Pour.swatches(el, [{ name: 'Klein', hex: '#1f2fb0' }], { layout: 'bars' })  // palette cards
 *
 * Modes: swirl (soft ramp), bands (agate), moire (fine lines), marble (levels with veins and a
 * halo), bloom (petals round a centre), field (flat colour or one slow gradient).
 */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const rng = seed => mulberry32(typeof seed === 'number' ? Math.floor(seed * 9973) + 17 : hashStr(String(seed)));

  /* ------------------------------------------------------------------ palettes */
  // Each palette is sampled from the board: ramps run dark to light unless the mode needs an order.
  const PALETTES = {
    citric:  { colors: ['#1f2fb0', '#3f5fb8', '#8fd11a', '#b4f000'], note: 'Klein blobs on acid green (pin 8)' },
    lime:    { colors: ['#4f7a0c', '#87a714', '#bdc591', '#eef0e6'], note: 'a soft green swirl on white (pin 15)' },
    moss:    { colors: ['#2f8022', '#5d981d', '#90b41f', '#c8cb1e', '#e4e46a'], note: 'green grain (pin 19)' },
    agate:   { colors: ['#c6d83a', '#a9cd4e', '#5f9b7c', '#2a5f86'], core: '#183b62', note: 'yellow-green and blue bands (pin 38)' },
    lava:    { colors: ['#3f9ff0', '#d0502c', '#c24a30', '#9a7c86', '#a3a1ad'], vein: '#1d3050', note: 'orange and blue marbling round grey (pin 48)' },
    ink:     { colors: ['#2b3d10', '#8fbf14', '#cfe21a', '#eef68a'], alt: ['#0e120c', '#10150d'], vein: '#0e120c', note: 'acid ribbons on black (pin 20)' },
    bloom:   { colors: ['#020301', '#195702', '#5db403', '#d0ea09', '#f2f6a0'], note: 'a blurred yellow bloom (pin 39)' },
    aqua:    { colors: ['#01263b', '#024b5c', '#037882', '#24b0ac', '#8bdfd0'], note: 'teal depth (pins 32, 45)' },
    sherbet: { colors: ['#367ee8', '#4cbeea', '#66d7b6', '#88de88', '#c6e56e'], note: 'blue to lime (pin 44)' },
    pool:    { colors: ['#3a6eaf', '#448aaa', '#59a99e', '#73cd8a', '#8eed74'], note: 'green on blue (pin 40)' },
    nectar:  { colors: ['#6f9aa0', '#a9c273', '#eebf59', '#f58f5c', '#f55754'], note: 'coral to sage (pin 13)' },
    plum:    { colors: ['#122a16', '#1f4a26', '#6c1e4c', '#c23a96', '#9a5ad8'], note: 'magenta lines on green-black (pin 26)' },
    fuchsia: { colors: ['#0a1712', '#ed1fb3', '#4dedb1', '#6b9dd7'], note: 'fuchsia, mint and sky (pin 25)' },
    acid:    { colors: ['#95d401'], note: 'a flat acid field (pin 4)' },
    klein:   { colors: ['#1f2fb0'], note: 'a flat Klein field (pin 17)' },
    cobalt:  { colors: ['#0b1560', '#1f2fb0', '#3d5ee0', '#9fb6f2'], vein: '#eef2ff', note: 'Klein swirls with white highlights (pins 33, 46, 49)' },
  };
  const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const pal = p => {
    if (Array.isArray(p)) return { colors: p };
    if (typeof p === 'string') return PALETTES[p] || PALETTES.citric;
    return p || PALETTES.citric;
  };

  /* ------------------------------------------------------------------ noise */
  function makeNoise(seed) {
    const r = rng(seed), P = new Uint8Array(512), G = new Float32Array(512);
    for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) { P[i + 256] = P[i]; G[i + 256] = G[i]; }
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = G[P[X + P[Y]]], b = G[P[X + 1 + P[Y]]], c = G[P[X + P[Y + 1]]], d = G[P[X + 1 + P[Y + 1]]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(n, x, y, oct) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); f *= 2.03; a *= 0.5; }
    return s;
  }

  /* ------------------------------------------------------------------ the field */
  // Noise warped by noise (after Inigo Quilez), solved on a grid every `step` pixels.
  function solve(W, H, o) {
    const step = o.step, gw = Math.ceil(W / step) + 2, gh = Math.ceil(H / step) + 2;
    const g = new Float32Array(gw * gh), g2 = o.comb != null ? new Float32Array(gw * gh) : null, n = makeNoise(o.seed), R = rng(o.seed + ':off');
    const ca = Math.cos((o.comb || 0) * Math.PI / 180), sa = Math.sin((o.comb || 0) * Math.PI / 180);
    const off = Array.from({ length: 8 }, () => R() * 100);
    const S = Math.min(W, H) * o.scale, sx = o.stretch[0], sy = o.stretch[1];
    const cx = o.center[0] * W, cy = o.center[1] * H, rr = Math.min(W, H);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const X = i * step, Y = j * step;
        let v;
        if (o.mode === 'bloom') {
          const dx = (X - cx) / rr, dy = (Y - cy) / rr, rho = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
          const w = fbm(n, dx * 2.2 + off[0], dy * 2.2 + off[1], 3) * o.warp;
          const petals = 0.5 + 0.5 * Math.cos(o.petals * th + o.twist * rho * 6 + w * 3);
          const reach = o.radius * (0.55 + 0.9 * (0.5 + fbm(n, Math.cos(th) * 1.3 + off[4], Math.sin(th) * 1.3 + off[5], 2)));
          const fall = Math.exp(-Math.pow(rho / reach, 2));
          v = Math.pow(petals, 0.8) * fall * (0.55 + 0.9 * rho / (rho + 0.12)) + fbm(n, dx * 3 + off[2], dy * 3 + off[3], 2) * 0.12;
        } else {
          let X2 = X, Y2 = Y;
          if (o.twirl) {                                            // one vortex round the centre (pins 10, 15)
            const dx = X - cx, dy = Y - cy, a = o.twirl * Math.exp(-3 * (dx * dx + dy * dy) / (rr * rr)), ca = Math.cos(a), sa = Math.sin(a);
            X2 = cx + dx * ca - dy * sa; Y2 = cy + dx * sa + dy * ca;
          }
          const x = X2 / S / sx, y = Y2 / S / sy, k = o.warp;
          const qx = fbm(n, x + off[0], y + off[1], 4), qy = fbm(n, x + off[2], y + off[3], 4);
          const rx = fbm(n, x + k * qx + off[4], y + k * qy + off[5], 4), ry = fbm(n, x + k * qx + off[6], y + k * qy + off[7], 4);
          v = fbm(n, x + k * rx, y + k * ry, o.octaves);
          if (g2) {
            // combed: straight stripes across the sheet, pushed sideways by the warped field, so bands keep one width
            // the push is warped once and kept smooth, so the stripes meander without folding
            g2[j * gw + i] = v;
            v = (X2 * ca + Y2 * sa) / S + o.wander * fbm(n, x + k * qx + off[6], y + k * qy + off[7], 2);
          }
        }
        g[j * gw + i] = v;
      }
    }
    // normalise to the 2nd–98th percentile so every seed fills the whole ramp
    const norm = a => {
      const sample = []; for (let i = 0; i < a.length; i += 7) sample.push(a[i]);
      sample.sort((x, y) => x - y);
      const lo = sample[Math.floor(sample.length * 0.02)], hi = sample[Math.floor(sample.length * 0.98)], sc = 1 / ((hi - lo) || 1);
      for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * sc;
    };
    norm(g); if (g2) norm(g2);
    return { g, g2, gw, gh, step };
  }

  /* ------------------------------------------------------------------ paint */
  const MODES = {
    swirl:  { scale: 1.1, warp: 1.2, octaves: 3, contrast: 1.2, twirl: 0, grain: 0.34 },
    bands:  { scale: 0.5, warp: 0.9, octaves: 2, comb: 0, wander: 1, bands: 11, sharp: 1.15, core: 1.6, grain: 0.36, stretch: [1.4, 2.2] },
    moire:  { scale: 0.45, warp: 1, octaves: 2, comb: 90, wander: 0.8, bands: 60, line: 1.3, grain: 0.22 },
    marble: { scale: 1.15, warp: 1.8, octaves: 3, levels: 4, vein: 1.8, sharp: 0.8, grain: 0.4 },
    bloom:  { petals: 5, twist: 0.6, radius: 0.62, warp: 2.2, octaves: 3, contrast: 1.4, grain: 0.36, center: [0.52, 0.47] },
    field:  { scale: 2.6, warp: 0.6, octaves: 2, contrast: 1, grain: 0.3 },
  };

  /** Paint a mode into a canvas at its own pixel size. Returns the canvas. */
  function paint(canvas, opts) {
    const P = pal(opts && opts.palette);
    const o = Object.assign({ seed: 1, step: 3, stretch: [1, 1], center: [0.5, 0.5], mode: 'swirl' }, MODES[(opts && opts.mode) || 'swirl'], opts || {});
    const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    const cols = P.colors.map(hexRgb);
    if (o.mode === 'field' && cols.length === 1) {
      ctx.fillStyle = P.colors[0]; ctx.fillRect(0, 0, W, H);   // a flat field, only grained (pins 4, 17)
      return grainOnly(canvas, o);
    }
    const F = solve(W, H, o), { g, g2, gw, step } = F;
    const img = ctx.createImageData(W, H), d = img.data;
    const gr = rng(o.seed + ':grain'), gn = o.grain * 46;
    const vein = hexRgb(P.vein || '#101010'), core = hexRgb(P.core || '#000000'), nb = o.bands, lv = o.levels;
    const out = [0, 0, 0];
    const rampOf = (cs, t) => {
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const x = t * (cs.length - 1), i = Math.min(cs.length - 2, Math.floor(x)), u = x - i, a = cs[i], b = cs[i + 1];
      out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; out[2] = a[2] + (b[2] - a[2]) * u;
    };
    const ramp = t => rampOf(cols, t), alt = P.alt ? P.alt.map(hexRgb) : null;
    const mix = (c, k) => { out[0] += (c[0] - out[0]) * k; out[1] += (c[1] - out[1]) * k; out[2] += (c[2] - out[2]) * k; };
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const lines = cols.slice(1);

    for (let y = 0; y < H; y++) {
      const fy = y / step, j = Math.floor(fy), v = fy - j;
      for (let x = 0; x < W; x++) {
        const fx = x / step, i = Math.floor(fx), u = fx - i, k = j * gw + i;
        const a = g[k], b = g[k + 1], c = g[k + gw], e = g[k + gw + 1];
        const t = a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
        // |grad t| in field units per pixel, for widths measured in pixels
        const gx = ((b - a) * (1 - v) + (e - c) * v) / step, gy = ((c - a) * (1 - u) + (e - b) * u) / step;
        const gm = Math.hypot(gx, gy) + 1e-6;

        if (o.mode === 'swirl' || o.mode === 'bloom' || o.mode === 'field') {
          ramp(0.5 + (t - 0.5) * o.contrast);
        } else if (o.mode === 'bands') {
          // each band is one smooth swing from the first colour to the last and back (pin 38)
          const sb = t * nb, f = sb - Math.floor(sb), w = 0.5 - 0.5 * Math.cos(2 * Math.PI * f);
          ramp(Math.pow(w, o.sharp));
          if (o.core) { const pm = Math.abs(f - 0.5) / (nb * gm); mix(core, 0.9 * (1 - sstep(o.core * 0.5, o.core * 0.5 + 1.2, pm))); }
        } else if (o.mode === 'moire') {
          out[0] = cols[0][0]; out[1] = cols[0][1]; out[2] = cols[0][2];
          const s = t * nb, f = s - Math.floor(s), pm = Math.abs(f - 0.5) / (nb * gm);
          const cov = 1 - sstep(o.line - 0.7, o.line + 0.7, pm);
          if (cov > 0) {
            // the lines take their colour from the warped field under them (pin 26)
            const t2 = g2 ? g2[k] + (g2[k + 1] - g2[k]) * u + (g2[k + gw] - g2[k]) * v : t;
            const x2 = Math.min(0.999, Math.max(0, t2)) * (lines.length - 1), li = Math.floor(x2), lu = x2 - li;
            const L0 = lines[li], L1 = lines[Math.min(lines.length - 1, li + 1)];
            mix([L0[0] + (L1[0] - L0[0]) * lu, L0[1] + (L1[1] - L0[1]) * lu, L0[2] + (L1[2] - L0[2]) * lu], cov);
          }
        } else {                                                    // marble
          // levels of the field; inside each, colour runs from the vein to the level's middle (pins 20, 48)
          const sl = t * lv, bi = Math.floor(sl), f = sl - bi, tri = Math.pow(1 - Math.abs(2 * f - 1), o.sharp);
          if (alt && (bi & 1)) rampOf(alt, tri); else ramp(tri);
          const pe = Math.min(f, 1 - f) / (lv * gm);                // pixels to the nearest level edge
          if (o.vein) mix(vein, 1 - sstep(o.vein * 0.5, o.vein * 0.5 + 1.1, pe));
        }
        const q = (y * W + x) * 4, n = (gr() - 0.5) * gn;
        d[q] = out[0] + n; d[q + 1] = out[1] + n; d[q + 2] = out[2] + n; d[q + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function grainOnly(canvas, o) {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const img = ctx.getImageData(0, 0, W, H), d = img.data, gr = rng(o.seed + ':grain'), gn = o.grain * 46;
    for (let q = 0; q < d.length; q += 4) { const n = (gr() - 0.5) * gn; d[q] += n; d[q + 1] += n; d[q + 2] += n; }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Pour a photograph: push its pixels along the warped field, then map it through a palette. */
  function photo(canvas, src, opts) {
    const o = Object.assign({ seed: 1, warp: 1, scale: 0.8, map: null, amount: 1, grain: 0.3, step: 4, stretch: [1, 1], center: [0.5, 0.5], octaves: 4, mode: 'photo' }, opts || {});
    const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
    const bx = buf.getContext('2d');
    const sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height;
    const s = Math.max(W / sw, H / sh);
    bx.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
    const S = bx.getImageData(0, 0, W, H).data;
    // two independent fields give the push in x and in y
    const fx = solve(W, H, Object.assign({}, o, { seed: o.seed + ':x', warp: 1.4 })), fy = solve(W, H, Object.assign({}, o, { seed: o.seed + ':y', warp: 1.4 }));
    const amp = Math.min(W, H) * 0.09 * o.warp;
    const M = o.map ? pal(o.map).colors.map(hexRgb) : null;
    const img = ctx.createImageData(W, H), d = img.data, gr = rng(o.seed + ':grain'), gn = o.grain * 46;
    const bil = (F, x, y) => { const X = x / F.step, Y = y / F.step, i = Math.floor(X), j = Math.floor(Y), u = X - i, v = Y - j, k = j * F.gw + i, g = F.g; return g[k] * (1 - u) * (1 - v) + g[k + 1] * u * (1 - v) + g[k + F.gw] * (1 - u) * v + g[k + F.gw + 1] * u * v; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sx = x + (bil(fx, x, y) - 0.5) * 2 * amp, sy = y + (bil(fy, x, y) - 0.5) * 2 * amp;
      sx = Math.min(W - 1.001, Math.max(0, sx)); sy = Math.min(H - 1.001, Math.max(0, sy));
      const i = Math.floor(sx), j = Math.floor(sy), u = sx - i, v = sy - j, p = (j * W + i) * 4;
      const c = [0, 1, 2].map(ch => S[p + ch] * (1 - u) * (1 - v) + S[p + 4 + ch] * u * (1 - v) + S[p + W * 4 + ch] * (1 - u) * v + S[p + W * 4 + 4 + ch] * u * v);
      if (M) {
        const l = Math.min(1, Math.max(0, (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255));
        const t = l * (M.length - 1), mi = Math.min(M.length - 2, Math.floor(t)), mu = t - mi;
        for (let ch = 0; ch < 3; ch++) c[ch] += ((M[mi][ch] + (M[mi + 1][ch] - M[mi][ch]) * mu) - c[ch]) * o.amount;
      }
      const q = (y * W + x) * 4, n = (gr() - 0.5) * gn;
      d[q] = c[0] + n; d[q + 1] = c[1] + n; d[q + 2] = c[2] + n; d[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Size a canvas to its box on screen (capped), so a paint is sharp without being slow. */
  function fit(canvas, max) {
    const b = canvas.getBoundingClientRect(), dpr = Math.min(root.devicePixelRatio || 1, 2), cap = max || 1800;
    let w = Math.max(2, Math.round(b.width * dpr)), h = Math.max(2, Math.round(b.height * dpr));
    if (w > cap) { h = Math.round(h * cap / w); w = cap; }
    if (h > cap) { w = Math.round(w * cap / h); h = cap; }
    canvas.width = w; canvas.height = h;
    return canvas;
  }

  /** A canvas that fills `el`, painted when it comes into view and again when its size really changes. */
  function plate(el, opts) {
    const c = el.querySelector('canvas.pour') || el.appendChild(Object.assign(document.createElement('canvas'), { className: 'pour' }));
    c.setAttribute('aria-hidden', 'true');
    let last = 0, seen = false;
    const draw = () => {
      const w = c.getBoundingClientRect().width;
      if (!w || (last && Math.abs(w - last) / last < 0.15)) return;
      last = w; fit(c, opts && opts.max);
      if (opts && opts.src) photo(c, opts.src, opts); else paint(c, opts);
      c.dispatchEvent(new Event('poured'));
    };
    c.repaint = o => { if (o) opts = Object.assign({}, opts, o); last = 0; draw(); };
    if ('IntersectionObserver' in root) {
      new IntersectionObserver((es, ob) => { if (es.some(e => e.isIntersecting)) { seen = true; draw(); ob.disconnect(); } }, { rootMargin: '300px' }).observe(el);
      if ('ResizeObserver' in root) { let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => seen && draw(), 180); }).observe(el); }
    } else draw();
    return c;
  }

  /* ------------------------------------------------------------------ palette cards */
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contrast = (a, b) => { const x = lum(hexRgb(a)), y = lum(hexRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const cmyk = h => { const [r, g, b] = hexRgb(h).map(v => v / 255), k = 1 - Math.max(r, g, b); if (k >= 1) return [0, 0, 0, 100]; return [r, g, b].map(v => Math.round((1 - v - k) / (1 - k) * 100)).concat(Math.round(k * 100)); };
  const spec = h => { const [r, g, b] = hexRgb(h), [c, m, y, k] = cmyk(h); return `R${r} G${g} B${b}<br>HEX ${h.replace('#', '').toUpperCase()}<br>C${c} M${m} Y${y} K${k}`; };
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  // The name on a card is inked in a neighbouring card's colour, the one that reads best on it (pin 5).
  const inkFor = (list, i) => {
    const bg = list[i].hex || (list[i].stops || [])[0];
    const cand = list.filter((_, j) => j !== i).map(c => c.hex).filter(Boolean);
    const near = [list[i + 1], list[i - 1]].filter(c => c && c.hex).map(c => c.hex);
    const good = near.filter(h => contrast(h, bg) >= 3);
    return good[0] || cand.sort((a, b) => contrast(b, bg) - contrast(a, bg))[0] || '#ffffff';
  };

  const CSS = `
  .pour-bars{display:flex;width:100%;height:100%;min-height:inherit}
  .pour-bars>*{flex:1 1 0;min-width:0;position:relative;padding:14px 12px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
  .pour-bars .spec{font-size:10px;line-height:1.35;letter-spacing:.02em;font-weight:500}
  .pour-bars .name{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:600;letter-spacing:-.02em;line-height:.9;font-size:var(--pour-name,clamp(28px,4.2vw,64px));white-space:nowrap}
  .pour-bars .note{font-size:11px;margin-top:6px}
  @media (max-width:640px){.pour-bars{flex-direction:column;height:auto}.pour-bars>*{flex:0 0 auto;flex-direction:row;align-items:flex-end;min-height:92px;padding:12px 16px}.pour-bars .name{writing-mode:horizontal-tb;transform:none;font-size:clamp(30px,10vw,44px)}.pour-bars>[style*="--pour-grad-h"]{--pour-grad:var(--pour-grad-h)}}
  .pour-strip{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr))}
  .pour-strip>*{aspect-ratio:1;display:flex;align-items:flex-end;padding:4px;font-size:9px;letter-spacing:.02em;box-shadow:inset 0 0 0 .5px rgba(14,18,12,.14)}
  .pour-pills{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
  .pour-pills>*{border-radius:0 999px 999px 0;padding:8px 26px 8px 14px;min-width:min(62%,300px);font-size:13px;line-height:1.2;font-weight:600}
  .pour-pills small{display:block;font-weight:500;font-size:10px;opacity:.8}`;

  /** Palette cards: 'bars' (tall cards with specs and a turned name), 'strip' (chips with hex), 'pills' (tabs). */
  function swatches(el, list, opts) {
    const o = Object.assign({ layout: 'bars', spec: true }, opts || {});
    if (!document.getElementById('pour-style')) { const st = document.createElement('style'); st.id = 'pour-style'; st.textContent = CSS; document.head.append(st); }
    list = list.map(c => typeof c === 'string' ? { hex: c } : c);
    el.classList.add('pour-' + o.layout);
    el.style.setProperty('--n', list.length);
    el.innerHTML = list.map((c, i) => {
      const bg = c.stops ? `var(--pour-grad,linear-gradient(180deg,${c.stops.join(',')}));--pour-grad-h:linear-gradient(90deg,${c.stops.join(',')})` : c.hex, ink = c.ink || inkFor(list, i);
      if (o.layout === 'strip') return `<span style="background:${bg};color:${ink}" title="${esc(c.name || c.hex)}">${o.spec ? esc((c.hex || '').replace('#', '').toUpperCase()) : ''}</span>`;
      if (o.layout === 'pills') return `<span style="background:${bg};color:${ink}">${esc(c.name || '')}${c.hex && o.spec ? `<small>${esc(c.hex.toUpperCase())}</small>` : ''}</span>`;
      const top = c.stops ? (c.names || []).map(esc).join('<br>') : o.spec ? spec(c.hex) : '';
      return `<div style="background:${bg};color:${ink}"><div class="spec">${c.label ? `<b>${esc(c.label)}</b><br>` : ''}${top}${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</div><div class="name">${esc(c.name || '')}</div></div>`;
    }).join('');
    return el;
  }

  root.Pour = { paint, photo, plate, fit, swatches, PALETTES, MODES, contrast, rng };
})(window);
