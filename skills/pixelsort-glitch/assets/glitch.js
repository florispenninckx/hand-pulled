/* glitch.js — seven plates of one picture broken by a codec, a screen, a scanner or a layout. Load pixelsort.js first.
 *
 *   Glitch.smear(canvas, { width, height, cssWidth, seed, image });     // rows sorted, then dragged sideways from a slit, band by band
 *   Glitch.wave(canvas, { ..., mode: 'ripple' | 'water' });              // rows and columns pushed along by sine waves
 *   Glitch.drip(canvas, { ..., mode: 'dusk' | 'mint' });                 // a band in macroblocks, its columns stretched down and sorted
 *   Glitch.shatter(canvas, { ... });                                     // a dropped screen: cracks, shards, dead columns, ink bleed
 *   Glitch.collage(canvas, { ..., mode: 'night' | 'day' });              // pieces cut from the picture, each broken one way
 *   Glitch.scan(canvas, { ... });                                        // a photocopy pulled across a scanner, its R, G and B lines apart
 *   Glitch.type(canvas, { ..., mode: 'paper' | 'ink', text });           // words set, then sliced, doubled and stretched
 *   Glitch.dusk(width, height, seed) -> canvas                           // the stand-in photograph: a coast at dusk
 *
 * Every plate starts from a picture and does to it what a machine does: sorts its rows,
 * reads it through a slit, pushes it with a wave, cracks the glass in front of it, cuts it
 * up, drags it across a scanner. Pass `image` (any <img> or canvas) to break your own
 * photograph instead of the stand-in; `scene` picks another stand-in (default: the seed).
 * Work is done on a canvas of `pixel` CSS px per pixel and enlarged nearest-neighbour, so
 * pixels stay square. Seeded; no dependencies beyond pixelsort.js. Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const PS = () => root.PixelSort;
  const rng = s => PS().mulberry32(s >>> 0);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const ctx2 = c => c.getContext('2d', { willReadFrequently: true });
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const luma = (d, i) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    const p = hash(xi, yi, s), q = hash(xi + 1, yi, s), r = hash(xi, yi + 1, s), t = hash(xi + 1, yi + 1, s);
    return p + (q - p) * a + (r - p) * b + (p - q - r + t) * a * b;
  }
  function fbm(x, y, s, oct) {
    let v = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 101); n += a; f *= 2.03; a *= 0.5; }
    return v / n;
  }
  function ramp(stops, t) {   // stops: [[t, [r,g,b]], ...], ascending
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, a] = stops[i - 1], [t1, b] = stops[i]; return mix(a, b, (t - t0) / (t1 - t0)); }
    return stops[stops.length - 1][1];
  }
  const stops = list => list.map(([t, c]) => [t, hex(c)]);

  const PALETTES = {
    sky: [[0, '#0a1030'], [0.2, '#16306a'], [0.42, '#1f7894'], [0.6, '#58b7b8'], [0.72, '#d9d6c0'], [0.84, '#ffb489'], [0.94, '#ff7650'], [1, '#ff5a3c']],
    lit: [[0, '#5b3a9a'], [0.35, '#a0409a'], [0.6, '#ff4f8b'], [0.8, '#ff7a5a'], [1, '#ffc27a']],
    sea: [[0, '#e0648c'], [0.05, '#8f67b5'], [0.15, '#2d9fab'], [0.45, '#0f6b7b'], [1, '#03202b']],
    rock: '#08091a', cloud: '#2a1c55', sun: '#fff1cf', glow: '#ffc98c', glint: '#ffb36e', shore: '#3a2a62', foam: '#d9eef0', teal: '#2bb4b4',
    mint: { ground: ['#e9f7f5', '#cdeeed', '#b9e2e0'], mass: ['#27353a', '#3d5b5c', '#6c9d9b', '#8c7652', '#a7d8d5', '#f6fcfb'] },
    lcd: ['#27d8ff', '#ff45d2', '#f6ec5d', '#7b5cff', '#ffffff', '#3dffb0', '#ff5a5a'],
    cold: '#dff3fa', bleed: '#04050b',
    night: { ground: '#050506', pink: ['#12000a', '#ff2e8b', '#ffd6ea'], blue: '#9fd6ff', line: '#ffffff' },
    day: { ground: '#f5f4f0', blue: '#78b6e6', bar: '#111214', line: '#16171a' },
    scan: { bed: '#f4f3ef', toner: '#0c0c0e' },
    paper: { ground: '#f7f6f2', ink: '#111114', grey: '#8d9296' },
    ink: { ground: '#eee7d7', ink: '#1f3c93' },
  };

  /** Canvas sizes: the output in device pixels, the work canvas in "pixels" of `pixel` CSS px each. */
  function setup(canvas, o, pixel) {
    const W = Math.round(o.width || canvas.width), H = Math.round(o.height || canvas.height);
    canvas.width = W; canvas.height = H;
    const css = o.cssWidth ? o.cssWidth / W : 1, p = (o.pixel || pixel) / css;   // device px per work px
    return { W, H, w: Math.max(8, Math.round(W / p)), h: Math.max(8, Math.round(H / p)), dpr: 1 / css };
  }
  function blit(canvas, work) {
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(work, 0, 0, canvas.width, canvas.height); ctx.restore();
    return canvas;
  }
  /** Draw `image` to cover a w×h canvas (centre crop). */
  function cover(ctx, image, w, h) {
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height, k = Math.max(w / iw, h / ih);
    ctx.drawImage(image, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
  }
  /** Film grain, in place: luminance noise with a little colour in it. */
  function grain(img, amount, sd) {
    const { width: w, height: h, data: d } = img;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, n = (hash(x, y, sd) - 0.5) * amount, c = (hash(x, y, sd + 1) - 0.5) * amount * 0.35;
      d[i] += n + c; d[i + 1] += n; d[i + 2] += n - c;
    }
    return img;
  }

  // ---- the stand-in photograph ---------------------------------------------------
  /**
   * A coast at dusk. The sky runs navy, blue and teal through a pale band to orange at a low
   * sun, under a broken cover of cloud lit violet, pink and coral from below; a far shore lies in haze on the
   * horizon; the sea mirrors all of it, broken by ripples that grow toward the viewer, with a
   * glitter path under the sun; a black headland stands in front, its face streaked and its
   * top edge rimmed with light, surf at its foot. Drawn at half size and enlarged, so it is
   * soft like a lens, then vignetted and grained. Drawn, not traced.
   */
  function dusk(W, H, seed) {
    const w = Math.max(8, Math.round(W / 2)), h = Math.max(8, Math.round(H / 2)), rand = rng(seed * 97 + 11), sd = (seed * 131) | 0, S = Math.min(w, h);
    const SKY = stops(PALETTES.sky), LIT = stops(PALETTES.lit), SEA = stops(PALETTES.sea), ROCK = hex(PALETTES.rock), CLOUD = hex(PALETTES.cloud), SUN = hex(PALETTES.sun), GLOW = hex(PALETTES.glow), GLINT = hex(PALETTES.glint), SHORE = hex(PALETTES.shore), TEAL = hex(PALETTES.teal), FOAM = hex(PALETTES.foam);
    const hz = Math.round(h * (0.5 + rand() * 0.12)), side = rand() < 0.5 ? -1 : 1;
    const sx = w * (side < 0 ? 0.55 + rand() * 0.25 : 0.2 + rand() * 0.25), sr = S * (0.026 + rand() * 0.014), sy = hz - sr * (0.2 + rand() * 1.2);
    const reach = w * (0.24 + rand() * 0.18), peak = h * (0.12 + rand() * 0.16);
    const dist = x => (side < 0 ? x : w - 1 - x) / reach;   // 0 at the headland's side, 1 where it meets the sea
    const top = new Float32Array(w), shore = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const u = dist(x), rough = 0.78 + 0.44 * fbm(x / (S * 0.09), 3.7, sd + 5, 5);
      top[x] = u < 1 ? hz - peak * (1 - 0.4 * u) * smooth(1, 0.8, u) * rough : Infinity;
      shore[x] = h * (0.006 + 0.022 * fbm(x / (S * 0.25), 8.1, sd + 6, 4) * smooth(0.95, 0.5, Math.abs(x / w - (side < 0 ? 0.8 : 0.2)) * 2));
    }
    const c = mk(w, h), ctx = ctx2(c), img = ctx.createImageData(w, h), d = img.data;
    const put = (i, col) => { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
    // sky: the ramp, bent a little by the air, under two layers of cloud
    for (let y = 0; y < hz; y++) {
      for (let x = 0; x < w; x++) {
        const t = clamp(y / hz + 0.07 * (fbm(x / (S * 0.8), y / (S * 0.5), sd + 1, 3) - 0.5), 0, 1);
        let col = ramp(SKY, t);
        const gx = (x - sx) / (S * 0.7), gy = (y - sy) / (S * 0.3), g = Math.exp(-(gx * gx + gy * gy) * 1.6);
        col = mix(col, GLOW, g * 0.6);
        // altocumulus: warped, lumpy, lit from below toward the horizon
        const q = fbm(x / (S * 0.7), y / (S * 0.12), sd + 11, 3);
        const n = fbm(x / (S * 0.3) + q * 1.6, y / (S * 0.05) + q, sd, 5), m = smooth(0.46, 0.66, n) * smooth(0.08, 0.35, t) * (1 - smooth(0.9, 1, t));
        if (m > 0.001) {
          const nb = fbm(x / (S * 0.3) + q * 1.6, (y + S * 0.01) / (S * 0.05) + q, sd, 5), lit = clamp(0.35 + (n - nb) * 12 + g * 0.45 + t * 0.25, 0, 1);
          col = mix(col, mix(mix(CLOUD, col, 0.2), mix(ramp(LIT, t), GLOW, g * 0.5), lit), m * 0.95);
        }
        // cirrus: long thin streaks high up
        const ci = fbm(x / (S * 1.2) + q, y / (S * 0.012), sd + 3, 4), cm = smooth(0.55, 0.75, ci) * (1 - smooth(0.2, 0.55, t));
        if (cm > 0.001) col = mix(col, ramp(LIT, t), cm * 0.5);
        const r = Math.hypot(x - sx, y - sy);
        if (r < sr + 1) col = mix(col, SUN, clamp(sr + 1 - r, 0, 1) * (m > 0.5 ? 0.4 : 1));
        // the far shore, in haze
        if (hz - y <= shore[x]) col = mix(SHORE, col, 0.35 + 0.4 * (1 - (hz - y) / Math.max(1, shore[x])));
        put((y * w + x) * 4, col);
      }
    }
    // sea: the sky mirrored and broken by ripples that grow toward the viewer
    for (let y = hz; y < h; y++) {
      const u = (y - hz) / Math.max(1, h - hz);
      for (let x = 0; x < w; x++) {
        const fx = x / (S * (0.03 + u * 0.3)), fy = (y - hz) / (S * (0.003 + u * 0.03));
        const r = fbm(fx, fy, sd + 3, 4), slope = fbm(fx, fy + 0.35, sd + 3, 4) - r;
        const my = clamp(Math.round(hz - 1 - (y - hz) * 1.5 + slope * S * (0.05 + u * 0.5)), 0, hz - 1), mx = clamp(Math.round(x + (r - 0.5) * S * (0.02 + u * 0.1)), 0, w - 1), j = (my * w + mx) * 4;
        let col = mix(ramp(SEA, u), [d[j], d[j + 1], d[j + 2]], 0.75 - 0.4 * u);
        col = mix(col, [0, 0, 0], clamp(0.1 - slope * 4, 0, 0.5));
        const gl = Math.exp(-Math.pow((x - sx) / (S * (0.015 + u * 0.2)), 2));
        if (slope > 0.02) col = mix(col, GLINT, gl * clamp((slope - 0.02) * 12, 0, 1));
        put((y * w + x) * 4, col);
      }
    }
    // the headland in front of both: a streaked face, a rim of light along its top, surf at its foot
    for (let y = Math.max(0, Math.floor(Math.min(...top))); y < h; y++) {
      const uf = y < hz ? 0 : (y - hz) / Math.max(1, h - hz), wob = 0.08 * (vnoise(y / (S * 0.03), 1.5, sd + 2) - 0.5);
      for (let x = 0; x < w; x++) {
        const u = dist(x), foot = 1 + 0.4 * Math.pow(uf, 0.8) + wob;
        const edge = y < hz ? 1 - u : foot - u;
        const inside = y < hz ? y >= top[x] : edge > 0;
        const i = (y * w + x) * 4;
        if (!inside) {   // surf: foam in the water just off the rock
          if (y >= hz && edge > -0.06) { const f = fbm(x / (S * 0.02), y / (S * 0.006), sd + 13, 3); if (f > 0.55) put(i, mix([d[i], d[i + 1], d[i + 2]], FOAM, clamp((f - 0.55) * 4, 0, 0.8) * (1 + edge / 0.06))); }
          continue;
        }
        const strata = fbm(x / (S * 0.012), y / (S * 0.09), sd + 9, 4), ridge = 1 - Math.abs(2 * fbm(x / (S * 0.05), y / (S * 0.05), sd + 10, 4) - 1);
        let col = mix(ROCK, [52, 42, 86], clamp(strata * 0.9 - 0.25 + ridge * 0.2, 0, 1) * 0.55);
        col = mix(col, TEAL, clamp(1 - edge / 0.14, 0, 1) * 0.3 * strata);   // the face toward the water
        if (y < hz) {
          const e = (y - top[x]) / (S * 0.016), sun = Math.exp(-Math.abs(x - sx) / (w * 0.6));
          if (e < 1) col = mix(col, ramp(SKY, 0.8 + 0.18 * sun), (1 - e) * (1 - e) * (0.3 + 0.65 * sun));
        }
        put(i, col);
      }
    }
    ctx.putImageData(img, 0, 0);
    const out = mk(W, H), octx = ctx2(out);
    octx.imageSmoothingQuality = 'high'; octx.drawImage(c, 0, 0, W, H);
    const big = octx.getImageData(0, 0, W, H);
    const bd = big.data, cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, v = 1 - 0.3 * Math.pow(Math.hypot(x - cx, y - cy) / R, 2.2);
      bd[i] *= v; bd[i + 1] *= v; bd[i + 2] *= v;
    }
    octx.putImageData(grain(big, 20, sd + 21), 0, 0);
    return out;
  }
  /** The picture a plate breaks: your image, cropped to fit, or the stand-in. */
  function source(o, w, h) {
    if (o.image) { const c = mk(w, h); cover(ctx2(c), o.image, w, h); return c; }
    return dusk(w, h, o.scene != null ? o.scene : o.seed);
  }
  const pixels = c => ctx2(c).getImageData(0, 0, c.width, c.height);

  // ---- tools ---------------------------------------------------------------------
  /** Replace each size×size block with its mean: the picture as a codec at the bottom of its bitrate sees it. */
  function macroblock(img, size, x0, y0, x1, y1) {
    const { width: w, data: d } = img;
    x0 = x0 || 0; y0 = y0 || 0; x1 = x1 == null ? w : x1; y1 = y1 == null ? img.height : y1;
    for (let by = Math.max(0, y0); by < y1; by += size) for (let bx = Math.max(0, x0); bx < x1; bx += size) {
      let r = 0, g = 0, b = 0, n = 0;
      const ey = Math.min(y1, by + size), ex = Math.min(x1, bx + size);
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      r /= n; g /= n; b /= n;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; }
    }
    return img;
  }
  /**
   * Slit-scan one row in place: the pixels on one side of `x0` are replaced by the row read
   * through a slit at x0, spread out by 1/k (k = 0 repeats the slit's pixel, a flat streak).
   * `len` limits how far the streak runs; `dir` is +1 (to the right) or -1.
   */
  function slitRow(d, src, w, y, x0, k, dir, len) {
    const row = y * w, end = dir > 0 ? Math.min(w, x0 + len) : Math.max(-1, x0 - len);
    for (let x = x0; x !== end; x += dir) {
      const sx = clamp(Math.round(x0 + (x - x0) * k), 0, w - 1), i = (row + x) * 4, j = (row + sx) * 4;
      d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2];
    }
  }
  /** The same down a column: pixels below `y0` read through a slit at y0, spread by 1/k. */
  function slitCol(d, src, w, h, x, y0, k, dir, len) {
    const end = dir > 0 ? Math.min(h, y0 + len) : Math.max(-1, y0 - len);
    for (let y = y0; y !== end; y += dir) {
      const sy = clamp(Math.round(y0 + (y - y0) * k), 0, h - 1), i = (y * w + x) * 4, j = (sy * w + x) * 4;
      d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2];
    }
  }
  /** Scanlines: every other row a shade darker, the way a CRT or a capture card leaves them. */
  function scanlines(img, depth) {
    const { width: w, height: h, data: d } = img;
    for (let y = 1; y < h; y += 2) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] *= 1 - depth; d[i + 1] *= 1 - depth; d[i + 2] *= 1 - depth; }
    return img;
  }

  /** Chroma pushed past where the file can hold it: every pixel moved away from its own grey. */
  function vivid(img, k) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = l + (d[i] - l) * k; d[i + 1] = l + (d[i + 1] - l) * k; d[i + 2] = l + (d[i + 2] - l) * k; }
    return img;
  }

  // ---- I. smear: the picture read through a slit, band by band, then sorted ----------------
  function smear(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1 }, opts);
    const { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 31 + 7);
    const c = source(o, w, h), ctx = ctx2(c), s = ctx.getImageData(0, 0, w, h).data;
    let img = ctx.createImageData(w, h);
    const d = img.data;
    // 1. band by band, a narrow strip of the picture is drawn out across the whole width. The strip
    //    walks sideways from band to band, so every edge in the picture comes out as a staircase
    let xa = w * (0.3 + rand() * 0.4), y = 0;
    while (y < h) {
      const bh = 1 + Math.round(Math.pow(rand(), 2.4) * h * 0.07);
      xa = clamp(xa + (rand() - 0.5) * w * 0.14, 0, w - 1);
      if (rand() < 0.05) xa = rand() * w;
      const r = rand(), k = r < 0.22 ? 0.5 + rand() * 0.5 : r < 0.6 ? 0.06 + rand() * 0.2 : rand() * 0.05;   // how much of the picture a band still holds
      const xc = w * (0.2 + rand() * 0.6), jit = rand() < 0.3;
      for (let yy = y; yy < Math.min(h, y + bh); yy++) {
        const row = yy * w, sh = jit ? Math.round((rand() - 0.5) * w * 0.02) : 0;
        for (let x = 0; x < w; x++) {
          const sx = clamp(Math.round(xa + (x - xc + sh) * k), 0, w - 1), i = (row + x) * 4, j = (row + sx) * 4;
          d[i] = s[j]; d[i + 1] = s[j + 1]; d[i + 2] = s[j + 2]; d[i + 3] = 255;
        }
      }
      y += bh;
    }
    // 2. each row sorted inside its mid-tone runs: what is left of the picture's texture turns to streaks
    img = PS().sort(img, { mode: 'threshold', key: 'lightness', lo: 0.2, hi: 0.9, randomness: 0.45, seed: o.seed });
    // 3. a few bands a step out of register, red and blue a few pixels apart
    const e = img.data, reg = new Uint8ClampedArray(e);
    for (let n = 0; n < 9; n++) {
      const y0 = rand() * h | 0, bh = 2 + (rand() * h * 0.04 | 0), off = Math.round((rand() - 0.5) * 12);
      for (let yy = y0; yy < Math.min(h, y0 + bh); yy++) for (let x = 0; x < w; x++) {
        const i = (yy * w + x) * 4;
        e[i] = reg[(yy * w + clamp(x - off, 0, w - 1)) * 4]; e[i + 2] = reg[(yy * w + clamp(x + off, 0, w - 1)) * 4 + 2];
      }
    }
    scanlines(img, 0.08);
    ctx.putImageData(grain(img, 10, o.seed * 3), 0, 0);
    return blit(canvas, c);
  }

  // ---- II. wave: the picture pushed by waves ----------------------------------------------
  /**
   * ripple: an edge meanders down the plate in steps. Left of it every row is dragged flat
   * from the edge, so the picture turns to streaks; right of it the rows are pushed back and
   * forth a few pixels at a time, and the picture comes apart in contour lines, the moire of
   * a screen shot through a screen. water: the columns are sorted into streaks, then the whole
   * picture wobbles as if seen through moving water.
   */
  function wave(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1, mode: 'ripple' }, opts);
    const { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 37 + 3), S = Math.min(w, h), sd = o.seed * 7 | 0;
    const c = source(o, w, h), ctx = ctx2(c);
    let img = ctx.getImageData(0, 0, w, h);
    if (o.mode === 'water') {
      img = PS().sort(img, { mode: 'random', key: 'lightness', angle: 90, charLength: h * 0.08, randomness: 0.35, seed: o.seed });
      const src = new Uint8ClampedArray(img.data), d = img.data;
      const A = S * (0.035 + rand() * 0.02), B = S * (0.015 + rand() * 0.01), fx = S * (0.05 + rand() * 0.02), fy = S * 0.07;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // horizontal edges bend into lobes, vertical ones into wavy lines; each column a pixel out of step with the next
        const dy = A * (fbm(x / fx, y / (S * 0.25), sd, 2) - 0.5) * 2 + (x & 1 ? 1 : -1) * S * 0.004;
        const dx = B * (fbm(x / (S * 0.3), y / fy, sd + 5, 2) - 0.5) * 2;
        const sx = clamp(Math.round(x + dx), 0, w - 1), sy = clamp(Math.round(y + dy), 0, h - 1), i = (y * w + x) * 4, j = (sy * w + sx) * 4;
        d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2];
      }
      vivid(img, 1.35);
      ctx.putImageData(img, 0, 0);
      return blit(canvas, c);
    }
    const src = new Uint8ClampedArray(img.data), d = img.data;
    // the edge: an S-curve with noise in it, held for a few rows at a time so it steps
    const p = rand() * TAU, amp = w * (0.12 + rand() * 0.1), mid = w * (0.42 + rand() * 0.16), ex = new Float32Array(h);
    for (let y = 0, e = mid, hold = 0; y < h; y++) {
      if (hold-- <= 0) { e = mid + amp * Math.sin(TAU * y / (h * 1.15) + p) + w * 0.18 * (fbm(y / (h * 0.18), 2.5, sd, 3) - 0.5); hold = 2 + (rand() * rand() * 12 | 0); }
      ex[y] = e + (hash(0, y, sd + 1) - 0.5) * S * 0.025;   // ragged by a pixel or two, row to row
    }
    const lam = S * (0.011 + rand() * 0.008), A2 = S * (0.018 + rand() * 0.012);
    for (let y = 0; y < h; y++) {
      const e = ex[y], bend = (e - mid) * 0.7, k = hash(1, y >> 2, sd + 2) < 0.7 ? hash(2, y >> 2, sd) * 0.04 : 0.1 + hash(3, y >> 2, sd) * 0.3;
      const reach = w * (0.6 + 0.8 * fbm(y / (h * 0.05), 7.7, sd + 3, 2));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let sx, sy = y, v = 1;
        if (x < e && e - x < reach) sx = e - bend + (x - e) * k;   // streaks: the row read through a slit at the edge
        else {
          const r = x < e ? 0 : Math.exp(-(x - e) / (w * 0.45)) * (0.35 + 0.65 * smooth(0.3, 0.6, fbm(x / (S * 0.25), y / (S * 0.25), sd + 4, 3)));
          const ph = TAU * (y / lam + 6 * fbm(x / (S * 0.2), y / (S * 0.3), sd + 5, 3));
          sx = x - bend + A2 * r * Math.sin(ph); sy = y + A2 * 0.6 * r * Math.cos(ph);
          v = 1 - 0.5 * r * Math.pow(0.5 + 0.5 * Math.sin(ph), 3);
        }
        const j = (clamp(Math.round(sy), 0, h - 1) * w + clamp(Math.round(sx), 0, w - 1)) * 4;
        d[i] = src[j] * v; d[i + 1] = src[j + 1] * v; d[i + 2] = src[j + 2] * v;
      }
    }
    vivid(img, 1.3);
    ctx.putImageData(img, 0, 0);
    return blit(canvas, c);
  }

  // ---- III. drip: a band in macroblocks, its columns dripping ------------------------------
  function drip(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 2, mode: 'dusk' }, opts);
    const mint = o.mode === 'mint', { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 31 + 7);
    let c, top, bot;
    if (mint) {
      const pal = PALETTES.mint;
      c = mk(w, h); const ctx = ctx2(c), g = ctx.createLinearGradient(0, 0, 0, h);
      pal.ground.forEach((col, i) => g.addColorStop(i / (pal.ground.length - 1), col));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      top = h * (0.3 + rand() * 0.06); bot = h * (0.5 + rand() * 0.06);
      if (o.image) {   // your picture, laid in as the band that breaks
        const s = mk(w, h); cover(ctx2(s), o.image, w, h);
        ctx.drawImage(s, 0, top - h * 0.1, w, bot - top + h * 0.2, 0, top - h * 0.1, w, bot - top + h * 0.2);
      } else {         // a dark mass: figures, a doorway, a car, something the file used to hold
        for (let i = 0; i < 40; i++) {
          const bw = w * (0.02 + rand() * 0.12), bh = (bot - top) * (0.3 + rand() * 0.8), x = w * (0.08 + rand() * 0.72), y = top + (bot - top) * rand() * 0.6;
          ctx.fillStyle = pal.mass[rand() < 0.45 ? (rand() * 2 | 0) : 2 + (rand() * 4 | 0)]; ctx.globalAlpha = 0.7 + rand() * 0.3; ctx.fillRect(x, y, bw, bh);
        }
        ctx.globalAlpha = 1;
      }
    } else {
      c = source(o, w, h);
      top = h * (0.28 + rand() * 0.1); bot = h * (0.5 + rand() * 0.08);
    }
    const ctx = ctx2(c);
    let img = ctx.getImageData(0, 0, w, h);
    const B = Math.max(4, Math.round(Math.min(w, h) / (mint ? 22 : 30))), d = img.data;
    // the band loses its detail in macroblocks (dusk: only some of them)
    if (mint) macroblock(img, B, 0, Math.floor(top / B) * B - B, w, Math.ceil(bot / B) * B);
    else for (let k = 0; k < 60; k++) { const bx = (rand() * w / B | 0) * B, by = Math.floor((top + rand() * (bot - top)) / B) * B, s = rand() < 0.6 ? B : 2 * B; macroblock(img, s, bx, by, bx + s * (1 + (rand() * 4 | 0)), by + s); }
    if (mint) {
      for (let k = 0; k < 150; k++) {   // blocks with stale motion vectors: copied up, out of the band, as dust
        const bx = (rand() * (w / B) | 0) * B, by = Math.floor((top + rand() * (bot - top)) / B) * B, r = rand(), s = r < 0.5 ? B >> 2 : r < 0.85 ? B >> 1 : B;
        const ty = by - Math.floor(rand() * Math.sqrt(rand()) * top / s) * s - s, tx = bx + (Math.round((rand() - 0.5) * 4)) * s;
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          const sy = by + y, sx = bx + x, dy = ty + y, dx = tx + x;
          if (dy < 0 || dx < 0 || dx >= w || sx >= w || sy >= h) continue;
          d.set(d.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 3), (dy * w + dx) * 4);
        }
      }
      for (let k = 0; k < 700; k++) {  // single dead pixels drifting above
        const x = rand() * w | 0, y = (rand() * Math.sqrt(rand()) * top) | 0, sx = rand() * w | 0, sy = (top + rand() * (bot - top)) | 0, j = (sy * w + sx) * 4;
        const s = 1 + (rand() * 2 | 0);
        for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) if (x + xx < w && y + yy < h) d.set(d.subarray(j, j + 3), ((y + yy) * w + x + xx) * 4);
      }
    }
    // the drip: each run of columns is stretched down from the band, a different amount per run
    const src = new Uint8ClampedArray(d);
    for (let x = 0; x < w;) {
      const run = 1 + (rand() * rand() * 5 | 0), y0 = Math.round(bot - (bot - top) * rand() * 0.7), k = 0.12 + rand() * rand() * 0.8, reach = rand() < 0.2 ? 0.5 + rand() * 0.4 : 1;
      for (let xx = x; xx < Math.min(w, x + run); xx++) slitCol(d, src, w, h, xx, y0, k, 1, Math.round((h - y0) * reach));
      x += run;
    }
    // dusk: the sky drips too, upward from the band, shorter
    if (!mint) for (let x = 0; x < w;) {
      const run = 1 + (rand() * rand() * 8 | 0), y0 = Math.round(top + (bot - top) * rand() * 0.4), k = 0.05 + rand() * 0.5;
      if (rand() < 0.45) for (let xx = x; xx < Math.min(w, x + run); xx++) slitCol(d, src, w, h, xx, y0, k, -1, Math.round(y0 * (0.2 + rand() * rand() * 0.8)));
      x += run;
    }
    // and inside the drip, the columns are sorted: lighter pixels slide to the bottom of each interval
    const mask = new ImageData(w, h);
    for (let y = Math.round(mint ? bot : top); y < h; y++) for (let x = 0; x < w; x++) mask.data[(y * w + x) * 4] = 255;
    img = PS().sort(img, { mode: 'threshold', key: 'lightness', lo: mint ? 0.08 : 0.1, hi: mint ? 0.86 : 0.9, angle: 90, randomness: 0.35, seed: o.seed, mask });
    ctx.putImageData(img, 0, 0);
    return blit(canvas, c);
  }

  // ---- IV. shatter: a screen that was dropped ----------------------------------------------
  /**
   * The picture on an LCD that hit the floor. The backlight washes it pale and cold, the cut
   * driver lines leave whole columns stuck on one colour, the glass breaks into wedges that
   * each show the panel a little moved and turned, the middle is crushed into splinters, and
   * the liquid crystal leaks out along the cracks in black, spiky stains.
   */
  function shatter(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1 }, opts);
    const { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 43 + 5), S = Math.min(w, h), sd = o.seed * 5 | 0;
    const base = source(o, w, h), bctx = ctx2(base), img = bctx.getImageData(0, 0, w, h), d = img.data, COLD = hex(PALETTES.cold), LCD = PALETTES.lcd.map(hex);
    // dead columns, in clusters: each stuck on one colour over part or all of its height
    const stuck = new Array(w).fill(null);
    for (let x = 0; x < w;) {
      const cw = 1 + (rand() * rand() * 4 | 0);
      if (rand() < 0.2 + 0.6 * smooth(0.35, 0.7, fbm(x / (S * 0.12), 0.5, sd, 2))) {
        const y0 = rand() < 0.75 ? 0 : rand() * h, s = [LCD[rand() * LCD.length | 0], 0.3 + rand() * 0.6, y0, rand() < 0.75 ? h : y0 + rand() * h];
        for (let k = 0; k < cw && x + k < w; k++) stuck[x + k] = s;
      }
      x += cw + (rand() * 3 | 0);
    }
    // the panel: washed toward a cold backlight, every third column leaning red, green or blue
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, sub = x % 3, s = stuck[x];
      let c = mix([d[i], d[i + 1], d[i + 2]], COLD, 0.42 + 0.3 * luma(d, i));
      if (s && y >= s[2] && y < s[3]) c = mix(c, s[0], s[1]);
      d[i] = c[0] * (sub === 0 ? 1 : 0.92); d[i + 1] = c[1] * (sub === 1 ? 1 : 0.94); d[i + 2] = c[2] * (sub === 2 ? 1 : 0.94);
    }
    bctx.putImageData(img, 0, 0);
    const c = mk(w, h), ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    // the cracks run out from the point of impact, jagged, a few of them forking
    const px = w * (0.36 + rand() * 0.28), py = h * (0.34 + rand() * 0.28), n = 12 + (rand() * 8 | 0), R = Math.hypot(w, h) * 1.5;
    const walk = (x, y, a, len, jag) => {
      const pts = [[x, y]], x0 = x, y0 = y; let ang = a;
      while (Math.hypot(x - x0, y - y0) < len) {
        const step = S * (0.015 + rand() * 0.05) * (1 + Math.hypot(x - px, y - py) / S);
        ang = a + (ang - a) * 0.6 + (rand() - 0.5) * jag; x += Math.cos(ang) * step; y += Math.sin(ang) * step; pts.push([x, y]);
      }
      return pts;
    };
    const cracks = [], forks = [];
    for (let i = 0; i < n; i++) cracks.push(walk(px, py, (i + 0.2 + rand() * 0.6) / n * TAU, R, 0.7));
    cracks.forEach(pts => {
      for (let f = 0; f < 3; f++) if (rand() < 0.55) {
        const k = 1 + (rand() * (pts.length - 2) | 0), [x, y] = pts[k], [x1, y1] = pts[Math.min(pts.length - 1, k + 1)];
        forks.push(walk(x, y, Math.atan2(y1 - y, x1 - x) + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.6), S * (0.1 + rand() * 0.4), 0.9));
      }
    });
    const shard = (poly, ox, oy, rot, sc, tint) => {
      ctx.save(); ctx.beginPath(); poly.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.clip();
      ctx.translate(px + ox, py + oy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-px, -py);
      ctx.drawImage(base, -S * 0.1, -S * 0.1, w + S * 0.2, h + S * 0.2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h); }
      ctx.restore();
    };
    const tint = () => { const r = rand(); return r < 0.35 ? `rgba(255,255,255,${0.15 + rand() * 0.35})` : r < 0.55 ? `rgba(12,20,48,${0.1 + rand() * 0.25})` : r < 0.75 ? `rgba(120,210,240,${0.1 + rand() * 0.25})` : null; };
    // each wedge between two cracks shows the panel moved and turned a little
    for (let i = 0; i < n; i++) {
      const a = cracks[i], b = cracks[(i + 1) % n];
      shard([...a, ...b.slice().reverse()], (rand() - 0.5) * S * 0.05, (rand() - 0.5) * S * 0.05, (rand() - 0.5) * 0.07, 1 + (rand() - 0.3) * 0.08, tint());
    }
    // the middle, crushed into splinters
    for (let k = 0; k < 70; k++) {
      const a = rand() * TAU, r = S * 0.2 * Math.pow(rand(), 1.4), cx = px + Math.cos(a) * r, cy = py + Math.sin(a) * r, s = S * (0.01 + rand() * 0.05);
      const poly = [0, 1, 2].map(() => { const b = rand() * TAU; return [cx + Math.cos(b) * s * (0.4 + rand()), cy + Math.sin(b) * s * (0.4 + rand())]; });
      shard(poly, (rand() - 0.5) * S * 0.12, (rand() - 0.5) * S * 0.12, (rand() - 0.5) * 0.6, 0.9 + rand() * 0.3, rand() < 0.5 ? tint() : null);
    }
    // the liquid crystal leaks: spiky black stains at the impact and along the cracks, then specks
    ctx.fillStyle = PALETTES.bleed;
    const blot = (x, y, r, ang, stretch) => {
      const m = 9 + (rand() * 14 | 0);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(stretch, 1 / Math.sqrt(stretch)); ctx.beginPath();
      for (let k = 0; k < m; k++) { const b = (k + rand() * 0.6) / m * TAU, rr = r * (rand() < 0.3 ? 1.1 + rand() * 0.9 : 0.35 + rand() * 0.6); k ? ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr) : ctx.moveTo(Math.cos(b) * rr, Math.sin(b) * rr); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    };
    blot(px, py, S * (0.04 + rand() * 0.04), rand() * TAU, 1.3);
    [...cracks, ...forks].forEach(pts => {
      if (rand() < 0.25) return;
      const m = 2 + (rand() * 7 | 0);
      for (let k = 0; k < m; k++) {
        const j = Math.min(pts.length - 2, 1 + (Math.pow(rand(), 1.6) * (pts.length - 2) | 0)), [x0, y0] = pts[j], [x1, y1] = pts[j + 1], dd = Math.hypot(x0 - px, y0 - py) / S;
        blot(x0 + (x1 - x0) * rand(), y0 + (y1 - y0) * rand(), S * (0.006 + rand() * rand() * 0.05) * Math.max(0.25, 1 - dd * 0.8), Math.atan2(y1 - y0, x1 - x0), 1.2 + rand() * 2);
      }
    });
    for (let k = 0; k < 500; k++) {
      const a = rand() * TAU, r = S * Math.pow(rand(), 1.8) * 0.45, s = 0.6 + rand() * rand() * S * 0.008;
      if (rand() < 0.5) ctx.fillRect(px + Math.cos(a) * r, py + Math.sin(a) * r, s, s); else blot(px + Math.cos(a) * r, py + Math.sin(a) * r, s, rand() * TAU, 1 + rand());
    }
    // the web around the impact: short cracks between the long ones, ring by ring
    const at = (pts, r) => { for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k][0] - px, pts[k][1] - py) >= r) return pts[k]; return pts[pts.length - 1]; };
    const web = [];
    for (let ring = 1; ring < 7; ring++) {
      const r = S * 0.035 * ring * (0.8 + rand() * 0.4);
      for (let i = 0; i < n; i++) if (rand() < 0.8 - ring * 0.08) web.push([at(cracks[i], r * (0.85 + rand() * 0.3)), at(cracks[(i + 1) % n], r * (0.85 + rand() * 0.3))]);
    }
    // every crack twice: a dark line, and beside it the glass edge catching the light
    const line = (fn, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); fn(); ctx.stroke(); };
    [[`rgba(8,10,22,.9)`, 1.4, 0], [`rgba(255,255,255,.8)`, 1, 1.2]].forEach(([col, lw, off]) => {
      [...cracks, ...forks].forEach(pts => line(() => { ctx.moveTo(pts[0][0] + off, pts[0][1]); pts.forEach(p => ctx.lineTo(p[0] + off, p[1])); }, col, lw));
      web.forEach(([a, b]) => line(() => { ctx.moveTo(a[0] + off, a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2 + (px - (a[0] + b[0]) / 2) * 0.12, (a[1] + b[1]) / 2 + (py - (a[1] + b[1]) / 2) * 0.12, b[0] + off, b[1]); }, col, lw));
    });
    return blit(canvas, c);
  }

  // ---- V. collage: pieces cut from the picture, each broken one way --------------------------
  /** One cut piece, broken one way. `P` is the mode's palette. */
  function treat(f, kind, rand, P) {
    const { width: fw, height: fh, data: d } = f, n = fw * fh, night = P === PALETTES.night;
    const grey = (i, lo, hi) => { const v = smooth(lo, hi, luma(d, i)) * 255; d[i] = d[i + 1] = d[i + 2] = v; };
    const pink = () => {
      const R = stops([[0, P.pink[0]], [0.55, P.pink[1]], [1, P.pink[2]]]), B = hex(P.blue);
      for (let p = 0; p < n; p++) { const i = p * 4, l = smooth(0.03, 0.6, luma(d, i)), c = hash(p % fw >> 2, p / fw >> 1, 5) < 0.1 && l > 0.45 ? B : ramp(R, l); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
    };
    if (kind === 'rows' || kind === 'cols' || kind === 'streak') {   // a scanline that forgot to advance: each row (or column) one pixel of itself, drawn out
      const src = new Uint8ClampedArray(d), rows = kind !== 'cols';
      let a = rand() * (rows ? fw : fh) | 0;
      for (let t = 0; t < (rows ? fh : fw); t++) {
        if (rand() < 0.2) a = rand() * (rows ? fw : fh) | 0;
        const k = rand() < 0.6 ? 0 : rand() * 0.08;
        if (rows) { slitRow(d, src, fw, t, a, k, 1, fw); slitRow(d, src, fw, t, a, k, -1, fw); }
        else { slitCol(d, src, fw, fh, t, a, k, 1, fh); slitCol(d, src, fw, fh, t, a, k, -1, fh); }
      }
      if (kind === 'streak') pink();
      else if (night) for (let p = 0; p < n; p++) grey(p * 4, 0.05, 0.8);
      else for (let p = 0; p < n; p++) { const i = p * 4, l = luma(d, i) * 255; d[i] = 168 + (l + (d[i] - l) * 0.3) * 0.34; d[i + 1] = 170 + (l + (d[i + 1] - l) * 0.3) * 0.34; d[i + 2] = 174 + (l + (d[i + 2] - l) * 0.3) * 0.34; }
    } else if (kind === 'grey') { for (let p = 0; p < n; p++) grey(p * 4, 0.12, 0.6); }
    else if (kind === 'pink') pink();
    else if (kind === 'grid') {   // the picture seen only through a mesh
      const g = 3 + (rand() * 3 | 0);
      for (let p = 0; p < n; p++) {
        const i = p * 4, x = p % fw, y = p / fw | 0, l = luma(d, i), on = x % g === 0 || y % g === 0;
        const v = night ? (on ? 50 + smooth(0.1, 0.6, l) * 205 : smooth(0.4, 0.9, l) * 90) : (on ? 90 + (1 - l) * 60 : 236);
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    } else if (kind === 'lines') { for (let p = 0; p < n; p++) { grey(p * 4, 0.05, 0.7); if ((p / fw | 0) % 2) { d[p * 4] *= 0.12; d[p * 4 + 1] *= 0.12; d[p * 4 + 2] *= 0.12; } } }
    else if (kind === 'block') { macroblock(f, 3 + (rand() * 8 | 0)); for (let p = 0; p < n; p++) grey(p * 4, 0.05, 0.9); }
    else if (kind === 'solid') { for (let p = 0; p < n; p++) { d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = 246; } }
    else if (kind === 'cut') {   // the dark parts dropped out: the ground shows through ragged edges
      const t = 0.25 + rand() * 0.2;
      for (let p = 0; p < n; p++) { const i = p * 4, l = luma(d, i); if (l < t) d[i + 3] = 0; else { const v = night ? 120 + smooth(t, 0.7, l) * 135 : 40 + l * 110; d[i] = d[i + 1] = d[i + 2] = v; } }
    } else if (kind === 'pale') { for (let p = 0; p < n; p++) { const i = p * 4, l = luma(d, i) * 255; d[i] = 150 + (l + (d[i] - l) * 0.3) * 0.42; d[i + 1] = 152 + (l + (d[i + 1] - l) * 0.3) * 0.42; d[i + 2] = 156 + (l + (d[i + 2] - l) * 0.3) * 0.42; } }
    else if (kind === 'blue') {   // a threshold that kept only the darks, printed in one blue on white, the deepest in black
      const B = hex(P.blue), t = 0.3 + rand() * 0.2;
      for (let p = 0; p < n; p++) { const i = p * 4, l = luma(d, i) + (hash(p % fw, p / fw | 0, 3) - 0.5) * 0.12, c = l < t ? (l < t * 0.45 ? [20, 22, 28] : B) : [238, 240, 242]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
    } else if (kind === 'rust') { for (let p = 0; p < n; p++) { const i = p * 4, l = luma(d, i), row = (p / fw | 0) % 3 === 0 ? 0.7 : 1; d[i] = (70 + l * 150) * row; d[i + 1] = (40 + l * 110) * row; d[i + 2] = (28 + l * 80) * row; } }
    else if (kind === 'bar') { for (let p = 0; p < n; p++) { d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = 18; } }
    return f;
  }
  /**
   * The picture cut into rectangles on a loose grid, some in place, some moved, some blown up
   * until the pixels show, each broken one way. `night`: grey, mesh and hot pink on black.
   * `day`: pale streaks, one blue, rust and black on white. Thin runs of colour leak out of
   * the pieces sideways, and the layout's hairlines are left in.
   */
  function collage(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1, mode: 'night' }, opts);
    const day = o.mode === 'day', P = day ? PALETTES.day : PALETTES.night, { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 61 + 3);
    const pic = source(o, w, h), pctx = ctx2(pic), c = mk(w, h), ctx = ctx2(c);
    ctx.fillStyle = P.ground; ctx.fillRect(0, 0, w, h);
    const TREAT = day ? [['cols', 5], ['pale', 2], ['blue', 5], ['rust', 1], ['rows', 1], ['bar', 1], ['cut', 2]]
      : [['rows', 3], ['streak', 4], ['grid', 3], ['grey', 3], ['pink', 3], ['lines', 2], ['cut', 2], ['solid', 1], ['block', 1]];
    const total = TREAT.reduce((s, t) => s + t[1], 0);
    const pick = () => { let r = rand() * total; for (const [k, wt] of TREAT) { if ((r -= wt) < 0) return k; } return TREAT[0][0]; };
    const u = Math.max(2, Math.round(Math.min(w, h) / 24)), snap = v => Math.max(u, Math.round(v / u) * u);
    const cx = w * (0.42 + rand() * 0.16), cy = h * (0.42 + rand() * 0.16), gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    const sx0 = day ? 0.6 : 0.42, sy0 = day ? 0.6 : 0.4, n = (day ? 42 : 34) + (rand() * 10 | 0);
    for (let k = 0; k < n; k++) {
      const r = rand(), tall = rand() < 0.22;
      const fw = snap(w * (tall ? 0.03 + rand() * 0.12 : 0.12 + Math.pow(r, 1.5) * 0.5)), fh = snap(h * (tall ? 0.12 + rand() * 0.35 : 0.02 + rand() * rand() * 0.28));
      const dx = snap(cx + gauss() * w * sx0 - fw / 2), dy = snap(cy + gauss() * h * sy0 - fh / 2), kind = pick();
      const z = rand() < 0.3 && kind !== 'grid' && kind !== 'lines' ? 2 + (rand() * 4 | 0) : 1, gw = Math.max(1, Math.round(fw / z)), gh = Math.max(1, Math.round(fh / z));   // some pieces blown up
      const home = rand() < 0.45, sx = home ? clamp(dx, 0, w - gw) : rand() * Math.max(1, w - gw) | 0, sy = home ? clamp(dy, 0, h - gh) : rand() * Math.max(1, h - gh) | 0;
      const f = treat(pctx.getImageData(sx, sy, gw, gh), kind, rand, P), t = mk(gw, gh);
      t.getContext('2d').putImageData(f, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(t, dx, dy, fw, fh);
    }
    // runs: a few rows leak out of the pieces sideways, each one pixel drawn out
    const img = ctx.getImageData(0, 0, w, h), d = img.data, src = new Uint8ClampedArray(d), bg = hex(P.ground);
    for (let k = 0; k < (day ? 30 : 45); k++) {
      const y = clamp(Math.round(cy + gauss() * h * 0.45), 0, h - 1), th = rand() < 0.7 ? 1 : 2 + (rand() * 3 | 0), x0 = clamp(Math.round(cx + gauss() * w * 0.4), 0, w - 1);
      const j = (y * w + x0) * 4; if (Math.abs(src[j] - bg[0]) + Math.abs(src[j + 1] - bg[1]) + Math.abs(src[j + 2] - bg[2]) < 30) continue;
      for (let yy = y; yy < Math.min(h, y + th); yy++) slitRow(d, src, w, yy, x0, rand() < 0.7 ? 0 : 0.05, rand() < 0.5 ? 1 : -1, Math.round(w * (0.05 + rand() * rand() * 0.5)));
    }
    ctx.putImageData(img, 0, 0);
    // hairlines and stray squares: the layout's guides, left in
    ctx.fillStyle = P.line;
    for (let k = 0; k < 8; k++) {
      ctx.globalAlpha = 0.4 + rand() * 0.5;
      if (rand() < 0.5) ctx.fillRect(snap(cx + gauss() * w * 0.4), rand() * h * 0.3, 1, h * (0.2 + rand() * 0.7));
      else ctx.fillRect(rand() * w * 0.3, snap(cy + gauss() * h * 0.4), w * (0.2 + rand() * 0.7), 1);
    }
    for (let k = 0; k < 10; k++) { const s = 2 + rand() * 5; ctx.fillStyle = rand() < 0.3 ? (day ? P.blue : PALETTES.night.pink[1]) : P.line; ctx.fillRect(cx + gauss() * w * 0.5, cy + gauss() * h * 0.5, s, s); }
    ctx.globalAlpha = 1;
    return blit(canvas, c);
  }

  // ---- VI. scan: a photocopy pulled across the scanner --------------------------------------
  /**
   * A black-and-white photocopy of the picture on a flatbed whose sheet was moved while the
   * head ran. Where it wobbled, edges snake; where it stalled, rows repeat into vertical
   * streaks; where it was jerked sideways during a line, the line blurs flat. The head reads
   * R, G and B a few lines apart, so wherever the sheet moved, grey edges split into rainbows.
   */
  function scan(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1 }, opts);
    const { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 53 + 1), S = Math.min(w, h), sd = o.seed * 11 | 0;
    // the print: the picture photocopied hard, grainy in the greys, on a sheet a little smaller than the bed
    const mx = Math.round(w * (0.05 + rand() * 0.03)), my = Math.round(h * 0.03), sw = w - 2 * mx, sh = h - 2 * my;
    const pd = pixels(source(o, sw, sh)).data, sample = [];
    for (let k = 0; k < 3000; k++) sample.push(luma(pd, (rand() * sw * sh | 0) * 4));
    sample.sort((a, b) => a - b);
    const lo = sample[(sample.length * 0.15) | 0], hi = sample[(sample.length * 0.8) | 0];
    const sum = new Float32Array((sw + 1) * sh);   // running sums along each row, for the sideways blur
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const p = y * sw + x, l = smooth(lo, hi, luma(pd, p * 4) + (fbm(x / 3, y / 3, sd, 2) - 0.5) * 0.1) + (hash(x, y, sd + 7) - 0.5) * 0.16;
      sum[y * (sw + 1) + x + 1] = sum[y * (sw + 1) + x] + clamp(0.04 + 0.94 * l, 0, 1);
    }
    const read = (sy, sx, bl) => {   // the sheet at (sx, sy), smeared over bl pixels
      const a = clamp(Math.round(sx - bl / 2), 0, sw - 1), b = clamp(Math.round(sx + bl / 2) + 1, a + 1, sw), r = sy * (sw + 1);
      return (sum[r + b] - sum[r + a]) / (b - a);
    };
    // the pull: where the sheet was at each moment of the scan, and how far it slid during that line
    const T = h + 24, posX = new Float32Array(T), posY = new Float32Array(T), blur = new Float32Array(T);
    let yy = 0, xx = 0, t = 0;
    while (t < T) {
      const r = rand(), len = 8 + (rand() * rand() * h * 0.22 | 0), A = S * (0.02 + rand() * 0.07), L = 14 + rand() * 60, ph = rand() * TAU, x0 = xx;
      const kind = r < 0.22 ? 'still' : r < 0.62 ? 'wobble' : r < 0.75 ? 'stall' : r < 0.9 ? 'jerk' : 'skip';
      const speed = kind === 'stall' ? 0.1 + rand() * 0.4 : kind === 'skip' ? 1.6 + rand() * 1.4 : 1, drift = kind === 'jerk' || kind === 'stall' ? (rand() - 0.5) * 0.5 : 0, B = S * (0.05 + rand() * 0.3);
      for (let k = 0; k < len && t < T; k++, t++) {
        const env = Math.sin(Math.PI * k / len);
        xx = x0 + drift * k + (kind === 'wobble' ? A * Math.sin(TAU * k / L + ph) * env : 0);
        posX[t] = xx; posY[t] = yy; blur[t] = kind === 'jerk' ? B * env * (0.6 + 0.4 * hash(t, 0, sd)) : 0; yy += speed;
      }
      xx *= 0.7;   // the hand pulls it back toward square
    }
    const ky = (h - 1) / Math.max(1, posY[h - 1]);   // the pull still has to reach the end of the bed
    const lag = [0, 3 + rand() * 3, 7 + rand() * 5];
    const c = mk(w, h), ctx = ctx2(c), img = ctx.createImageData(w, h), d = img.data, BED = hex(PALETTES.scan.bed);
    for (let y = 0; y < h; y++) for (let ch = 0; ch < 3; ch++) {
      const tt = Math.min(T - 1, y + lag[ch]), t0 = Math.floor(tt), f = tt - t0, t1 = Math.min(T - 1, t0 + 1);
      const ox = posX[t0] + (posX[t1] - posX[t0]) * f, syy = Math.round((posY[t0] + (posY[t1] - posY[t0]) * f) * ky - my), bl = blur[t0];
      for (let x = 0; x < w; x++) {
        const sxx = x - ox - mx;
        const v = syy >= 0 && syy < sh && sxx >= 0 && sxx < sw ? read(syy, sxx, bl) * 250 : BED[ch] - 6 * hash(x >> 3, y, sd + ch);
        d[(y * w + x) * 4 + ch] = v; d[(y * w + x) * 4 + 3] = 255;
      }
    }
    // the lamp: toner dust, and a speck of light where the lid did not close
    for (let k = 0; k < w * h * 0.0004; k++) { const x = rand() * w | 0, y = rand() * h | 0, i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = rand() < 0.7 ? 20 : 245; }
    ctx.putImageData(grain(img, 10, sd + 3), 0, 0);
    return blit(canvas, c);
  }

  // ---- VII. type: words set, then sliced, doubled and stretched ------------------------------
  /**
   * paper: heavy lowercase words, loosely spaced, over a band of the picture pulled sideways;
   * the lines are sliced and shifted, one is doubled, and ink is flicked over them.
   * ink: a one-colour print in blue on cream. Rules, numbers, a dot grid and a ghost of the
   * title; columns of the sheet dragged down as if the scanner stuck on a line; the words set
   * large at the bottom left; a solid band of ink with the small print knocked out of it.
   * Drawn at device resolution, so the type stays sharp while the page breaks.
   */
  function type(canvas, opts) {
    const o = Object.assign({ seed: 1, mode: 'paper', sans: 'Archivo, Helvetica, Arial, sans-serif', mono: '"IBM Plex Mono", ui-monospace, monospace' }, opts);
    const ink = o.mode === 'ink', P = ink ? PALETTES.ink : PALETTES.paper, { W, H, dpr } = setup(canvas, o, 1), rand = rng(o.seed * 29 + 3);
    const w = W / dpr, h = H / dpr, S = Math.min(w, h), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const text = (o.text || (ink ? 'stale\nvector\nbroken\nfiles' : 'what the\nfile\nforgot')).split('\n');
    const fs = clamp(S / 60, 7, 11), big = ink ? S * 0.14 : S * 0.1;
    // column streaks, in device pixels: a strip of the sheet read through a slit and drawn down
    const streaks = (count, maxw, ya, yb) => {
      const img = ctx.getImageData(0, 0, W, H), d = img.data, src = new Uint8ClampedArray(d);
      for (let k = 0; k < count; k++) {
        const x0 = rand() * W | 0, sw = Math.max(1, Math.round((1 + rand() * rand() * maxw) * dpr)), y0 = (ya + rand() * (yb - ya)) * H | 0, len = H * (0.1 + rand() * 0.7), dir = rand() < 0.8 ? 1 : -1, k2 = rand() < 0.6 ? 0 : rand() * 0.2;
        for (let x = x0; x < Math.min(W, x0 + sw); x++) slitCol(d, src, W, H, x, y0, k2, dir, Math.round(len));
      }
      ctx.putImageData(img, 0, 0);
    };
    // a line of type, letter by letter, loosely tracked and now and then broken apart
    const set = (ln, x, y, gap) => {
      const start = x;
      for (const ch of ln) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + big * 0.02 + (gap && ch !== ' ' && rand() < gap ? big * (0.2 + rand() * 0.5) : 0); }
      return x - start;
    };
    ctx.save(); ctx.scale(dpr, dpr);
    ctx.fillStyle = P.ground; ctx.fillRect(0, 0, w, h);
    const pw = Math.max(8, Math.round(w / 2)), ph = Math.max(8, Math.round(h / 2)), pic = source(o, pw, ph), pimg = pixels(pic), pd = pimg.data;
    const placed = [];
    if (ink) {
      // the picture, only its darkest parts, in a few narrow strips of ink
      const INK = hex(P.ink), tint = mk(pw, ph), ti = tint.getContext('2d').createImageData(pw, ph), td = ti.data;
      for (let p = 0; p < pw * ph; p++) { const l = luma(pd, p * 4) + (hash(p % pw, p / pw | 0, 3) - 0.5) * 0.2; if (l < 0.26) { td[p * 4] = INK[0]; td[p * 4 + 1] = INK[1]; td[p * 4 + 2] = INK[2]; td[p * 4 + 3] = l < 0.15 ? 230 : 110; } }
      tint.getContext('2d').putImageData(ti, 0, 0);
      for (let k = 0; k < 3; k++) { const sx = rand() * pw * 0.85, sw = pw * (0.04 + rand() * 0.1); ctx.drawImage(tint, sx, 0, sw, ph, rand() * w * 0.9, 0, sw * 2, h); }
      // the layout under it: rules, a dot grid, stray numbers, a header line, the title as a ghost
      ctx.fillStyle = P.ink;
      for (let k = 0; k < 16; k++) { ctx.globalAlpha = 0.3 + rand() * 0.6; ctx.fillRect(w * rand(), 0, rand() < 0.25 ? 2 : 1, h); }
      for (let k = 0; k < 7; k++) { ctx.globalAlpha = 0.3 + rand() * 0.6; ctx.fillRect(0, h * rand(), w, 1); }
      ctx.globalAlpha = 0.2; ctx.font = `800 ${S * 0.24}px ${o.sans}`; set(text[text.length - 1], w * 0.04, h * 0.2, 0);
      ctx.globalAlpha = 1;
      const gx = w * (0.62 + rand() * 0.2), gy = h * (0.1 + rand() * 0.15), gs = S * 0.035;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (rand() < 0.8) { ctx.beginPath(); ctx.arc(gx + i * gs, gy + j * gs, gs * 0.18, 0, TAU); ctx.fill(); }
      ctx.font = `500 ${fs}px ${o.mono}`;
      for (let k = 0; k < 18; k++) ctx.fillText(String((rand() * 999) | 0).padStart(k % 3 ? 2 : 3, '0'), w * rand(), h * rand());
      ctx.fillText('10:06   row 1:2   column 1:2', w * 0.03, fs * 1.6); ctx.fillText('14–16.11.2026', w * 0.62, fs * 1.6);
      streaks(22, 30, 0, 0.55);
      // the words, large, bottom left; every other line printed through a screen
      ctx.font = `800 ${big}px ${o.sans}`;
      text.forEach((ln, i) => { const x = w * (0.04 + rand() * 0.05), y = h * 0.42 + i * big * 0.92; ctx.globalAlpha = i % 2 ? 0.6 : 1; placed.push([x, y, set(ln, x, y, 0), ln]); });
    } else {
      // a band of the picture across the middle: strips pulled sideways, the colour mostly gone
      const src = new Uint8ClampedArray(pd);
      for (let y = 0; y < ph; y++) { const a = rand() * pw | 0; if (rand() < 0.6) slitRow(pd, src, pw, y, a, rand() * 0.06, rand() < 0.5 ? 1 : -1, pw); }
      for (let p = 0; p < pw * ph; p++) { const i = p * 4, l = luma(pd, i) * 255; for (let c = 0; c < 3; c++) pd[i + c] = 40 + 0.8 * (l + (pd[i + c] - l) * 0.45); }
      ctx2(pic).putImageData(pimg, 0, 0);
      const by = h * (0.44 + rand() * 0.06), bh = h * (0.14 + rand() * 0.06);
      for (let k = 0; k < 13; k++) {
        const x = w * (-0.05 + rand() * 0.6), ww = w * (0.06 + rand() * 0.3), y = by + rand() * bh * 0.8 - bh * 0.1, hh = bh * (0.15 + rand() * 0.6);
        ctx.globalAlpha = 0.7 + rand() * 0.3; ctx.drawImage(pic, rand() * pw * 0.8, rand() * ph * 0.8, ww / 2, hh / 2, x, y, ww, hh);
      }
      for (let k = 0; k < 2; k++) { const x = w * (0.15 + rand() * 0.5); ctx.globalAlpha = 0.9; ctx.drawImage(pic, rand() * pw * 0.9, ph * 0.6, pw * 0.02, ph * 0.3, x, by - bh * 0.3, w * (0.02 + rand() * 0.03), bh * 1.8); }
      ctx.globalAlpha = 1;
      // a paragraph over the band, and a few guides
      ctx.fillStyle = P.ink; ctx.font = `400 ${fs}px ${o.sans}`;
      const px0 = w * (0.5 + rand() * 0.06), words = 'Three nights of music and pictures made by breaking files on purpose. A codec loses its vectors, a scanner loses its place, a screen falls on the floor. What is left is what the file forgot.'.split(' ');
      let line = '', ly = by + bh * 0.35;
      for (const wd of words) { if (ctx.measureText(line + wd).width > w * 0.42) { ctx.fillText(line, px0, ly); line = ''; ly += fs * 1.25; } line += wd + ' '; }
      ctx.fillText(line, px0, ly);
      for (let k = 0; k < 4; k++) { ctx.globalAlpha = 0.2 + rand() * 0.35; ctx.fillRect(w * rand(), 0, 1, h); }
      ctx.globalAlpha = 1;
      // the words: heavy, lowercase, set loose, spread down the page
      ctx.font = `800 ${big}px ${o.sans}`;
      text.forEach((ln, i) => {
        const x = w * (0.1 + rand() * 0.3), y = text.length > 1 ? h * (0.22 + i * 0.52 / (text.length - 1)) + (rand() - 0.5) * h * 0.04 : h * 0.42;
        placed.push([x, y, set(ln, x, y, 0.15), ln]);
      });
    }
    // doubled: part of a line printed again, a few letters off and clipped to a band
    ctx.fillStyle = P.ink; ctx.globalAlpha = 1;
    placed.forEach(([x, y, tw, ln]) => {
      if (rand() > (ink ? 0.5 : 0.7)) return;
      const bandY = y - big * (0.3 + rand() * 0.5), bandH = big * (0.2 + rand() * 0.4), off = (rand() - 0.5) * big * 1.4;
      ctx.save(); ctx.beginPath(); ctx.rect(0, bandY, w, bandH); ctx.clip();
      ctx.fillStyle = P.ground; ctx.fillRect(x - big, bandY, tw + big * 2, bandH); ctx.fillStyle = P.ink; set(ln, x + off, y + (rand() - 0.5) * big * 0.2, ink ? 0 : 0.15);
      ctx.restore();
    });
    if (ink) {   // a solid band of ink, the small print knocked out of it
      const by = h * (0.84 + rand() * 0.04), bh = fs * 5;
      ctx.fillRect(0, by, w, bh); ctx.fillStyle = P.ground; ctx.font = `500 ${fs}px ${o.mono}`;
      ['Stale Vector (fictional)', 'Hal 4, Werkplaats Noord', 'doors 20:00'].forEach((s, i) => ctx.fillText(s, w * (0.04 + i * 0.32), by + fs * 1.8));
      ctx.fillText('a weekend of broken files', w * 0.04, by + fs * 3.6);
    }
    ctx.restore();
    if (ink) {
      streaks(5, 6, 0.35, 0.8);
      // ink that did not take evenly
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = fbm(x / (9 * dpr), y / (9 * dpr), 5, 2); if (d[i + 2] < 200) { const v = 0.85 + n * 0.3; d[i] = clamp(d[i] * v + (1 - v) * 238, 0, 255); d[i + 1] = clamp(d[i + 1] * v + (1 - v) * 231, 0, 255); } }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    const img = ctx.getImageData(0, 0, W, H), d = img.data, src = new Uint8ClampedArray(d);
    // slices through the lines of type, shifted sideways
    placed.forEach(([x, y]) => {
      for (let k = 0; k < 2; k++) {
        const y0 = Math.round((y - big * (0.05 + rand() * 0.7)) * dpr), bh = Math.round(big * (0.03 + rand() * 0.1) * dpr), sh = Math.round((rand() - 0.5) * big * 0.8 * dpr);
        for (let yy = Math.max(0, y0); yy < Math.min(H, y0 + bh); yy++) for (let xx = 0; xx < W; xx++) { const sx = xx - sh; if (sx < 0 || sx >= W) continue; const i = (yy * W + xx) * 4, j = (yy * W + sx) * 4; d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2]; }
      }
    });
    // ink flicked over the page, mostly above the words, and a few drips running down from the band
    const fleck = (fx, fy, r, v) => {
      for (let yy = Math.round(fy - r); yy <= fy + r; yy++) for (let xx = Math.round(fx - r); xx <= fx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || Math.hypot(xx - fx, yy - fy) > r * (0.7 + hash(xx, yy, 9) * 0.5)) continue;
        const i = (yy * W + xx) * 4; d[i] = d[i + 1] = d[i + 2] = v;
      }
    };
    placed.forEach(([x, y, tw], i) => {
      for (let k = 0; k < (i ? 30 : 70); k++) fleck((x + rand() * tw * 1.3 - tw * 0.1) * dpr, (y - big * (0.7 + rand() * rand() * 2.2)) * dpr, (0.4 + Math.pow(rand(), 4) * 3.5) * dpr, 20);
    });
    for (let k = 0; k < 6; k++) {
      const x0 = rand() * w * 0.8, y0 = h * (0.45 + rand() * 0.15), len = h * (0.05 + rand() * 0.25), dw = 0.6 + rand() * 1.6;
      for (let t = 0; t < len; t += 0.7) fleck((x0 + Math.sin(t * 0.05) * 0.8) * dpr, (y0 + t) * dpr, dw * (1 - t / len * 0.6) * dpr, 70 + rand() * 30);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // ---- two more stand-ins: a valley between ridges, and paint dragged across a board ----------
  const SCAPES = {
    alpine: { sky: [[0, '#9fbcd4'], [0.6, '#d3e2e8'], [1, '#eef3ef']], far: '#b5cde0', near: '#1d3f8a', tree: [[0, '#0c2410'], [0.35, '#2f5a18'], [0.7, '#9cc636'], [1, '#eef36a']], rock: '#dde7ef', snow: '#f5f8f7', haze: '#dce8ee', mist: 0.3, trees: 0.8 },
    ink: { sky: [[0, '#c9d6d8'], [1, '#f3f4f1']], far: '#b8c8ca', near: '#16282c', tree: [[0, '#081013'], [0.5, '#27454b'], [0.85, '#8aaeb2'], [1, '#e8f0ee']], rock: '#93aaad', snow: '#f4f6f4', haze: '#eef1ef', mist: 0.65, trees: 0.6 },
    violet: { sky: [[0, '#4cc3da'], [0.55, '#9fe2e6'], [1, '#f1efe6']], far: '#8a6c9c', near: '#4b2a22', tree: [[0, '#1c1236'], [0.45, '#3b31a6'], [0.8, '#8a7ce6'], [1, '#f0d9ec']], rock: '#7a4d45', snow: '#fff2f0', haze: '#f2cfdc', mist: 0.3, trees: 0.7, cloud: '#fff4f6' },
    tape: { sky: [[0, '#88a2aa'], [0.5, '#c6d3cc'], [1, '#efe6d6']], far: '#a6bab6', near: '#20333b', tree: [[0, '#101e28'], [0.45, '#3a5c69'], [0.8, '#97b7b1'], [1, '#f2eadb']], rock: '#6c8891', snow: '#f4ede0', haze: '#e6e0d1', mist: 0.45, trees: 0.5 },
  };
  /**
   * A valley seen along its floor: five ridges, far to near, each rising to one side, so the
   * slopes zig-zag into the distance. Far ridges are pale and misted, with snow on their
   * crests; near ones carry forest in clumps lit from the left, and gullies of rock. Drawn at
   * half size and enlarged, grained. `name` is a palette in SCAPES. Drawn, not traced.
   */
  function scape(W, H, seed, name) {
    const P = SCAPES[name] || SCAPES.alpine;
    const w = Math.max(8, Math.round(W / 2)), h = Math.max(8, Math.round(H / 2)), rand = rng(seed * 89 + 5), sd = (seed * 113) | 0, S = Math.min(w, h);
    const SKY = stops(P.sky), TREE = stops(P.tree), FAR = hex(P.far), NEAR = hex(P.near), ROCK = hex(P.rock), SNOW = hex(P.snow), HAZE = hex(P.haze), CL = P.cloud ? hex(P.cloud) : null;
    const N = 5, cx = w * (0.3 + rand() * 0.4), L = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), side = i % 2 ? 1 : -1;
      L.push({ u, side, base: h * (0.38 + 0.48 * u + (rand() - 0.5) * 0.05), amp: h * (0.34 - 0.12 * u), f: 0.6 + u * 1.6, s: sd + 17 * i });
    }
    const top = L.map(l => {
      const t = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        const v = l.side > 0 ? clamp((x - cx * 0.7) / (w - cx * 0.7), 0, 1) : clamp((cx * 1.3 - x) / (cx * 1.3), 0, 1);
        const rg = 1 - Math.abs(2 * fbm(x / (S * 0.3 / l.f), 1.3, l.s, 5) - 1);
        t[x] = l.base - l.amp * (0.25 * rg + Math.pow(v, 1.3) * (0.75 + 0.3 * rg));
      }
      return t;
    });
    const c = mk(w, h), ctx = ctx2(c), img = ctx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let k = -1;
      for (let i = N - 1; i >= 0; i--) if (y >= top[i][x]) { k = i; break; }
      let col;
      if (k < 0) {   // sky, with a little cloud
        col = ramp(SKY, y / h);
        const n = fbm(x / (S * 0.35), y / (S * 0.1), sd + 1, 4);
        if (CL) col = mix(col, CL, smooth(0.5, 0.72, n) * 0.9);
        else col = mix(col, HAZE, smooth(0.55, 0.8, n) * 0.5);
      } else {
        const l = L[k], dep = (y - top[k][x]) / h, g = S * (0.006 + 0.01 * l.u);
        const n = fbm(x / g, y / g, l.s + 3, 3), nb = fbm((x + 1) / g, y / g, l.s + 3, 3), lit = clamp(0.5 + (n - nb) * 9, 0, 1);
        const cover = smooth(0.45, 0.62, fbm(x / (S * 0.12), y / (S * 0.08), l.s + 5, 3) + (P.trees - 0.5) * 0.5 + l.u * 0.1);
        const gully = fbm(x / (S * 0.01), y / (S * 0.1), l.s + 7, 3);
        col = mix(mix(FAR, NEAR, l.u * 0.8), ROCK, clamp(gully * 1.2 - 0.3, 0, 1) * 0.6 * (1 - l.u * 0.5));
        col = mix(col, ramp(TREE, clamp(n * 0.9 + lit * 0.45 - 0.15, 0, 1)), cover * (0.4 + 0.6 * l.u));
        if (l.side < 0) col = mix(col, NEAR, 0.3);   // the slopes turned from the light
        if (l.u < 0.3 && dep < 0.035 && n > 0.42) col = mix(col, SNOW, 0.85);   // snow along the far crests
        col = mix(col, HAZE, clamp(P.mist * (Math.pow(1 - l.u, 1.5) * 0.7 + smooth(0.02, 0.2, dep) * (1 - l.u * 0.8) * 0.8), 0, 0.92));
      }
      const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, W, H, sd, 14);
  }
  /** Paint dragged across a dark board in wide pale strokes: what the `foil` band breaks. Drawn, not traced. */
  function strokes(W, H, seed) {
    const w = Math.max(8, Math.round(W / 2)), h = Math.max(8, Math.round(H / 2)), sd = (seed * 71) | 0, S = Math.min(w, h);
    const c = mk(w, h), ctx = ctx2(c), img = ctx.createImageData(w, h), d = img.data;
    const RAMP = stops([[0, '#0e0c0c'], [0.3, '#2b2525'], [0.55, '#8d8580'], [0.75, '#d8d1ca'], [1, '#f6f2ec']]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const band = fbm(x / (S * 1.4), y / (S * 0.07), sd, 4), fibre = fbm(x / (S * 0.5), y / (S * 0.004), sd + 3, 3);
      const t = clamp(smooth(0.36, 0.52, band) * (0.8 + 0.4 * fibre) + (fibre - 0.5) * 0.3 + 0.08, 0, 1);
      const col = ramp(RAMP, t), i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, W, H, sd, 16);
  }
  function finish(c, W, H, sd, g) {
    const out = mk(W, H), o = ctx2(out);
    o.imageSmoothingQuality = 'high'; o.drawImage(c, 0, 0, W, H);
    o.putImageData(grain(o.getImageData(0, 0, W, H), g, sd + 21), 0, 0);
    return out;
  }
  /** The picture for a plate: your image, or the named stand-in (a SCAPES palette, 'dusk' or 'strokes'). */
  function picture(o, w, h, name) {
    if (o.image) { const c = mk(w, h); cover(ctx2(c), o.image, w, h); return c; }
    const sc = o.scene != null ? o.scene : o.seed;
    return name === 'dusk' ? dusk(w, h, sc) : name === 'strokes' ? strokes(w, h, sc) : scape(w, h, sc, name);
  }

  // ---- VIII. fall: a landscape sorted downward ------------------------------------------------
  /**
   * The valley with its columns run down. In each run of columns a slit sits on the first edge
   * found below a random height, and the column under it is read out spread thin, so the ridge,
   * the tree line or a cloud drags down in a curtain; then every column is interval-sorted, so
   * what texture is left streaks vertically. `ink` also lets a few blocks slip down the file.
   * Modes are the palettes: `alpine` (lime forest, blue shade), `ink` (misted grey-teal
   * ridges), `violet` (teal sky, violet and brown slopes).
   */
  function fall(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1, mode: 'alpine' }, opts);
    const { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 43 + 9);
    const c = picture(o, w, h, SCAPES[o.mode] ? o.mode : 'alpine'), ctx = ctx2(c);
    let img = ctx.getImageData(0, 0, w, h);
    const d = img.data, src = new Uint8ClampedArray(d);
    for (let x = 0; x < w;) {
      const run = 1 + (rand() * rand() * 6 | 0);
      if (rand() < 0.38) {
        let y0 = Math.round(h * rand() * 0.75);
        for (let y = y0 + 1; y < h - 1; y++) if (Math.abs(luma(src, (y * w + x) * 4) - luma(src, ((y - 1) * w + x) * 4)) > 0.05) { y0 = y; break; }
        const k = rand() < 0.5 ? rand() * 0.06 : 0.1 + rand() * 0.4, reach = Math.round((h - y0) * (0.15 + Math.sqrt(rand()) * 0.6));
        for (let xx = x; xx < Math.min(w, x + run); xx++) slitCol(d, src, w, h, xx, y0, k, 1, reach);
      }
      x += run;
    }
    if (o.mode === 'ink') {   // a few blocks slipped down the file, stale
      const s2 = new Uint8ClampedArray(d);
      for (let k = 0; k < 14; k++) {
        const bw = Math.round(w * (0.04 + rand() * 0.22)), bh = Math.round(h * (0.01 + rand() * rand() * 0.08)), x0 = rand() * (w - bw) | 0, y0 = rand() * (h - bh) | 0, dy = Math.round(h * (rand() - 0.3) * 0.2), dx = Math.round(w * (rand() - 0.5) * 0.1);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const ty = y0 + y + dy, tx = x0 + x + dx; if (ty < 0 || ty >= h || tx < 0 || tx >= w) continue;
          const i = (ty * w + tx) * 4, j = ((y0 + y) * w + x0 + x) * 4; d[i] = s2[j]; d[i + 1] = s2[j + 1]; d[i + 2] = s2[j + 2];
        }
      }
    }
    img = PS().sort(img, { mode: 'threshold', key: 'lightness', lo: 0.45, hi: 0.95, angle: 90, randomness: 0.45, seed: o.seed });
    vivid(img, o.mode === 'ink' ? 1.05 : o.mode === 'violet' ? 1 : 1.1);
    ctx.putImageData(grain(img, 30, o.seed * 5), 0, 0);
    return blit(canvas, c);
  }

  // ---- IX. band: the picture smeared in horizontal bands --------------------------------------
  /**
   * A tape that lost tracking. The picture is cut into bands of rows, and each band fails its
   * own way: it holds one row and repeats it, it reads its rows through a slit and spreads them
   * sideways, or it slips left or right; in some bands R, G and B are read a few pixels apart,
   * so every edge carries a fringe. `tape`: a pale valley in grey-teal and cream, sometimes
   * split into tiles whose seams show. `foil`: pale paint on a dark board, the fringes wide
   * and a few bands filmed with a rainbow, like oil on the head.
   */
  function band(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1, mode: 'tape' }, opts);
    const foil = o.mode === 'foil', { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 53 + 1);
    const c = picture(o, w, h, foil ? 'strokes' : 'tape'), ctx = ctx2(c);
    let img = ctx.getImageData(0, 0, w, h);
    const d = img.data, s = new Uint8ClampedArray(d);
    const xs = [0]; if (!foil && rand() < 0.7) xs.push(Math.round(w * (0.35 + rand() * 0.3))); xs.push(w);
    const ys = !foil && xs.length > 2 && rand() < 0.6 ? Math.round(h * (0.4 + rand() * 0.2)) : -1;
    for (let cI = 0; cI < xs.length - 1; cI++) {
      const xa = xs[cI], xb = xs[cI + 1];
      for (let y = 0; y < h;) {
        const bh = 1 + Math.round(Math.pow(rand(), 2.2) * h * 0.09), r = rand();
        const kind = r < 0.3 ? 'hold' : r < 0.78 ? 'slit' : 'slip';
        const x0 = xa + rand() * (xb - xa), k = rand() < 0.6 ? rand() * 0.08 : 0.15 + rand() * 0.5, dx = Math.round((rand() - 0.5) * w * 0.25);
        const co = foil ? Math.round(2 + rand() * 7) : rand() < 0.45 ? 1 + (rand() * 3 | 0) : 0, jy = Math.round((rand() - 0.5) * h * 0.04);
        const prism = foil && rand() < 0.3, ph = rand() * 6, fr = 2 + rand() * 6;
        for (let yy = y; yy < Math.min(h, y + bh); yy++) {
          if (yy === ys) { for (let x = xa; x < xb; x++) { const i = (yy * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 236; } continue; }   // a tile seam
          const sy = clamp((kind === 'hold' ? y : yy) + jy, 0, h - 1);
          for (let x = xa; x < xb; x++) {
            const sx = kind === 'slip' ? x - dx : kind === 'slit' ? x0 + (x - x0) * k : x0 + (x - x0) * 0.6;
            const at = (v, ch) => s[(sy * w + clamp(Math.round(v), 0, w - 1)) * 4 + ch], i = (yy * w + x) * 4;
            d[i] = at(sx + co, 0); d[i + 1] = at(sx, 1); d[i + 2] = at(sx - co, 2);
            if (prism) {
              const l = (d[i] + d[i + 1] + d[i + 2]) / 765, a = TAU * (x / w * fr + ph), m = 0.55 * (1 - Math.abs(l - 0.55) * 1.6);
              if (m > 0) { d[i] += (128 + 127 * Math.cos(a) - d[i]) * m; d[i + 1] += (128 + 127 * Math.cos(a - 2.1) - d[i + 1]) * m; d[i + 2] += (128 + 127 * Math.cos(a + 2.1) - d[i + 2]) * m; }
            }
          }
        }
        y += bh;
      }
      if (cI > 0) for (let y = 0; y < h; y++) { const i = (y * w + xa) * 4; d[i] = d[i + 1] = d[i + 2] = 236; }   // the seam between tiles
    }
    img = PS().sort(img, { mode: 'threshold', key: 'lightness', lo: foil ? 0.5 : 0.55, hi: 0.97, randomness: 0.5, seed: o.seed });
    scanlines(img, 0.06);
    ctx.putImageData(grain(img, foil ? 30 : 44, o.seed * 7), 0, 0);
    return blit(canvas, c);
  }

  // ---- X. mosh: the picture carried along stale motion vectors --------------------------------
  /**
   * Datamosh: the key frame is gone, so the motion vectors of the frames after it keep moving
   * the last picture the decoder had. Every macroblock carries one vector; each frame the
   * picture is copied along them, block by block, and a few blocks are refreshed from the
   * picture somewhere else, as the next shot's intra blocks leak in. R, G and B are carried at
   * slightly different speeds, so the smear comes apart into oil-film fringes. `melt`: the
   * vectors swirl and sag, the coast turns to liquid. `burst`: they point out from one spot,
   * a zoom that never lands. `patch`: blocky regions slide apart, and the picture is first
   * cut to contour stripes in a few places, so it smears into zebra moiré among flat coral
   * and grey.
   */
  function mosh(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1, mode: 'melt' }, opts);
    const M = ['melt', 'burst', 'patch'].includes(o.mode) ? o.mode : 'melt', { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 67 + 5), S = Math.min(w, h), sd = o.seed * 29 | 0;
    const c = picture(o, w, h, M === 'melt' ? 'dusk' : M === 'burst' ? 'violet' : 'alpine'), ctx = ctx2(c);
    const img = ctx.getImageData(0, 0, w, h), d = img.data, key = new Uint8ClampedArray(d);
    if (M === 'patch') {   // a few regions cut to contour stripes, the rest pushed toward coral, grey and black
      const PAL = [[240, 96, 76], [185, 182, 176], [20, 20, 22], [47, 122, 42], [142, 201, 240], [244, 240, 232]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, l = luma(d, i), r = hash(x / (S * 0.12) | 0, y / (S * 0.12) | 0, sd);
        if (r < 0.35) { const v = Math.sin(TAU * (l * 4 + x / S)) > 0 ? 244 : 18; d[i] = d[i + 1] = d[i + 2] = v; }
        else { const p = PAL[(Math.floor(l * 4 + r * 3)) % PAL.length]; d[i] = p[0] * 0.8 + d[i] * 0.2; d[i + 1] = p[1] * 0.8 + d[i + 1] * 0.2; d[i + 2] = p[2] * 0.8 + d[i + 2] * 0.2; }
      }
      key.set(d);
    }
    const B = Math.max(4, Math.round(S / 36)), bw = Math.ceil(w / B), bh = Math.ceil(h / B), vx = new Float32Array(bw * bh), vy = new Float32Array(bw * bh);
    const fx = w * (0.3 + rand() * 0.4), fy = h * (0.3 + rand() * 0.4);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const k = by * bw + bx, px = (bx + 0.5) * B, py = (by + 0.5) * B;
      if (M === 'melt') {
        const a = TAU * 2 * fbm(px / (S * 0.5), py / (S * 0.5), sd, 3), m = S * 0.01 * (0.3 + fbm(px / (S * 0.3), py / (S * 0.3), sd + 4, 2));
        vx[k] = Math.cos(a) * m; vy[k] = Math.sin(a) * m + S * 0.004;
      } else if (M === 'burst') {
        const dx = px - fx, dy = py - fy, r = Math.hypot(dx, dy) || 1, m = S * 0.03 * (r / S) * (0.5 + hash(bx, by, sd));
        vx[k] = dx / r * m - dy / r * m * 0.15; vy[k] = dy / r * m + dx / r * m * 0.15;
      } else {
        const r = hash(bx >> 2, by >> 1, sd);
        vx[k] = r < 0.25 ? 0 : (hash(bx >> 2, by >> 1, sd + 1) - 0.5) * S * 0.06; vy[k] = (hash(bx >> 2, by >> 1, sd + 2) - 0.5) * S * 0.012;
      }
    }
    const frames = M === 'patch' ? 8 : M === 'burst' ? 14 : 16, ch = M === 'patch' ? 0 : M === 'burst' ? 0.07 : 0.09;
    let cur = d, nxt = new Uint8ClampedArray(d.length);
    for (let f = 0; f < frames; f++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = ((y / B) | 0) * bw + ((x / B) | 0), i = (y * w + x) * 4;
        for (let q = 0; q < 3; q++) {
          const sc = 1 + ch * q, sx = clamp(Math.round(x - vx[k] * sc), 0, w - 1), sy = clamp(Math.round(y - vy[k] * sc), 0, h - 1);
          nxt[i + q] = cur[(sy * w + sx) * 4 + q];
        }
        nxt[i + 3] = 255;
      }
      for (let n = 0; n < 3; n++) {   // intra blocks from elsewhere in the picture, leaking in
        const bx = (rand() * bw | 0) * B, by = (rand() * bh | 0) * B, sxo = (rand() * bw | 0) * B, syo = (rand() * bh | 0) * B, s = B * (1 + (rand() * 3 | 0));
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          const ty = by + y, tx = bx + x, sy = syo + y, sx = sxo + x; if (ty >= h || tx >= w || sy >= h || sx >= w) continue;
          const i = (ty * w + tx) * 4, j = (sy * w + sx) * 4; nxt[i] = key[j]; nxt[i + 1] = key[j + 1]; nxt[i + 2] = key[j + 2];
        }
      }
      const t = cur; cur = nxt; nxt = t;
    }
    const out = new ImageData(cur === d ? d : new Uint8ClampedArray(cur), w, h);
    vivid(out, M === 'melt' ? 1.1 : 1.05);
    ctx.putImageData(grain(out, M === 'patch' ? 22 : 44, o.seed * 11), 0, 0);
    return blit(canvas, c);
  }

  // ---- XI. weave: the picture rebuilt on a grid ------------------------------------------------
  /**
   * The picture rebuilt from threads or blocks. `plaid`: each run of columns (the warp) is one
   * pixel of the picture read along a slit row, each run of rows (the weft) one pixel read
   * along a slit column, and they cross over-two-under-two, so the picture comes back as a
   * tartan of its own colours. `blocks`: the frame is partitioned the way a codec does it,
   * split into smaller squares wherever the picture is busy, and each block is kept as its mean,
   * copied stale from nearby or run down from its top row; wide stale slabs drift over it.
   * `grid`: the picture cut into cells, each cell holding every third row like a blind, a
   * little out of step with its neighbours, the seams between them left dark.
   */
  function weave(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1, mode: 'plaid' }, opts);
    const M = ['plaid', 'blocks', 'grid'].includes(o.mode) ? o.mode : 'plaid', { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 71 + 13), S = Math.min(w, h), sd = o.seed * 19 | 0;
    const c = picture(o, w, h, M === 'plaid' ? 'alpine' : M === 'blocks' ? 'ink' : 'dusk'), ctx = ctx2(c);
    let img = ctx.getImageData(0, 0, w, h);
    const d = img.data, s = new Uint8ClampedArray(d);
    const px = (x, y) => (clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)) * 4;
    if (M === 'plaid') {
      const C = new Int32Array(w), R = new Int32Array(h);
      for (let x = 0; x < w;) { const run = 1 + (rand() * rand() * 7 | 0), j = px(x, h * clamp(0.5 + (fbm(x / w * 2.5, 0.5, sd, 2) - 0.5) * 2.4 + (rand() - 0.5) * 0.3, 0.02, 0.98)); for (let xx = x; xx < Math.min(w, x + run); xx++) C[xx] = j; x += run; }
      for (let y = 0; y < h;) { const run = 1 + (rand() * rand() * 9 | 0), j = px(w * clamp(0.5 + (fbm(1.5, y / h * 2.5, sd + 1, 2) - 0.5) * 2.4 + (rand() - 0.5) * 0.3, 0.02, 0.98), y); for (let yy = y; yy < Math.min(h, y + run); yy++) R[yy] = j; y += run; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const warp = ((x + y) & 3) < 2, j = warp ? C[x] : R[y], v = warp ? 1 : 0.7, i = (y * w + x) * 4;
        d[i] = s[j] * v; d[i + 1] = s[j + 1] * v; d[i + 2] = s[j + 2] * v;
      }
      vivid(img, 0.9);
    } else if (M === 'blocks') {
      const leaf = (x0, y0, n) => {
        let m = 0, m2 = 0, k = 0;
        for (let y = y0; y < Math.min(h, y0 + n); y += 2) for (let x = x0; x < Math.min(w, x0 + n); x += 2) { const l = luma(s, (y * w + x) * 4); m += l; m2 += l * l; k++; }
        const v = k ? m2 / k - (m / k) * (m / k) : 0;
        if (n > 2 && v > 0.0006 * (n / 4) && rand() > 0.08) { const q = n >> 1; leaf(x0, y0, q); leaf(x0 + q, y0, q); leaf(x0, y0 + q, q); leaf(x0 + q, y0 + q, q); return; }
        const r = rand(), ox = Math.round((rand() - 0.5) * 4) * n, oy = Math.round((rand() - 0.5) * 2) * n;
        let mr = 0, mg = 0, mb = 0, cnt = 0;
        for (let y = y0; y < Math.min(h, y0 + n); y++) for (let x = x0; x < Math.min(w, x0 + n); x++) { const i = (y * w + x) * 4; mr += s[i]; mg += s[i + 1]; mb += s[i + 2]; cnt++; }
        for (let y = y0; y < Math.min(h, y0 + n); y++) for (let x = x0; x < Math.min(w, x0 + n); x++) {
          const i = (y * w + x) * 4, j = r < 0.55 ? -1 : r < 0.85 ? px(x + ox, y + oy) : px(x, y0);
          if (j < 0) { d[i] = mr / cnt; d[i + 1] = mg / cnt; d[i + 2] = mb / cnt; } else { d[i] = s[j]; d[i + 1] = s[j + 1]; d[i + 2] = s[j + 2]; }
        }
      };
      const N = 1 << Math.max(3, Math.round(Math.log2(S / 5)));
      for (let y = 0; y < h; y += N) for (let x = 0; x < w; x += N) leaf(x, y, N);
      const t = new Uint8ClampedArray(d);
      for (let k = 0; k < 40; k++) {   // wide stale slabs drifting over the partition
        const bw = Math.round(S * (0.05 + rand() * 0.3)), bh = Math.max(2, Math.round(bw * (0.15 + rand() * 0.45))), x0 = rand() * w | 0, y0 = (0.15 + rand() * 0.8) * h | 0, dx = Math.round((rand() - 0.5) * S * 0.2), flat = rand() < 0.5;
        const j0 = px(x0 + bw / 2, y0 + bh / 2);
        for (let y = y0; y < Math.min(h, y0 + bh); y++) for (let x = x0; x < Math.min(w, x0 + bw); x++) {
          const i = (y * w + x) * 4, j = flat ? j0 : px(x - dx, y); d[i] = t[j]; d[i + 1] = t[j + 1]; d[i + 2] = t[j + 2];
        }
      }
    } else {
      const cols = [0]; while (cols[cols.length - 1] < w) cols.push(Math.min(w, cols[cols.length - 1] + Math.round(w * (0.06 + rand() * 0.16))));
      for (let a = 0; a < cols.length - 1; a++) {
        for (let y = 0; y < h;) {
          const ch = Math.round(h * (0.04 + rand() * 0.18)), ox = Math.round((rand() - 0.5) * w * 0.06), oy = Math.round((rand() - 0.5) * h * 0.05), hold = 2 + (rand() * 3 | 0), k = rand() < 0.3 ? rand() * 0.1 : 1;
          for (let yy = y; yy < Math.min(h, y + ch); yy++) {
            const sy = y + Math.floor((yy - y) / hold) * hold + oy, dark = (yy - y) % hold === hold - 1 ? 0.7 : 1;
            for (let x = cols[a]; x < cols[a + 1]; x++) {
              const i = (yy * w + x) * 4, j = px(cols[a] + (x - cols[a]) * k + ox, sy), e = x === cols[a] || yy === y ? 0.6 : dark;
              d[i] = s[j] * e; d[i + 1] = s[j + 1] * e; d[i + 2] = s[j + 2] * e;
            }
          }
          y += ch;
        }
      }
      for (let i = 0; i < d.length; i += 4) { d[i] = 38 + d[i] * 0.85; d[i + 1] = 38 + d[i + 1] * 0.85; d[i + 2] = 38 + d[i + 2] * 0.85; }   // the blind lets light through
    }
    ctx.putImageData(grain(img, M === 'plaid' ? 28 : 42, o.seed * 13), 0, 0);
    return blit(canvas, c);
  }

  root.Glitch = { smear, wave, drip, shatter, collage, scan, type, fall, band, mosh, weave, dusk, scape, strokes, macroblock, slitRow, slitCol, scanlines, vivid, PALETTES, SCAPES };
})(typeof window !== 'undefined' ? window : globalThis);
