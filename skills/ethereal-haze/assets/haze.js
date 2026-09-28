/* haze.js — warm soft-focus images made in code: flowers held too close, grain fields,
 * ribbons of colour on cream, silk, a meadow passed at speed.
 *
 *   Haze.bloom(canvas, { width, height, seed, palette: 'coral' });      // a flower so close the lens cannot find it
 *   Haze.field(canvas, { width, height, seed, form: 'fold' });          // a grain field: fold, sun, flow, flame, blot
 *   Haze.ribbon(canvas, { width, height, seed, form: 'shift', ramp });  // one ribbon of colour on cream paper
 *   Haze.silk(canvas, { width, height, seed, palette: 'rouge' });       // satin folds under one light
 *   Haze.meadow(canvas, { width, height, seed });                       // a field seen from a train, slow shutter
 *   Haze.poppies(canvas, { width, height, seed });                      // cut flowers swaying past the lens
 *   Haze.develop(canvas, image, { width, height, look: 'bloom' });      // your photograph through one of the looks
 *   Haze.grain(element, { opacity });                                   // a static grain overlay, for animated plates
 *
 * Every image is made small (it is all soft, so a third of the pixels is plenty) and
 * blurred the way its subject blurs: a flower by a lens (the scene averaged over a disc,
 * near petals sharper than far ones), a meadow by a moving shutter (averaged along a
 * line), a field or a ribbon as a spray of colour. Only after scaling up, at full device
 * resolution, does the print get its tooth: each pixel is taken from a random spot a few
 * pixels away (so every soft edge dissolves into stipple, the way a grain gradient does),
 * then grained, strongest in the midtones.
 *
 * No WebGL, no ctx.filter (not portable), no dependencies. Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, GA = Math.PI * (3 - Math.sqrt(5));

  const PALETTES = {
    // I. bloom: the inside of a flower. air past the rim, the far wall, the heart (light → gold → amber), petal hues, the odd petal, tip, crease, rim line, filaments
    coral:   { air: ['#fbe6d2', '#f7b89c'], wall: '#d62838', heart: ['#fff6e2', '#ffd466', '#f99a36'], petal: ['#f0503e', '#f46a4a', '#ea3450', '#f5855a'], odd: '#c9b4ec', tip: '#f9b4a2', crease: '#a8102a', rim: '#ffb23a', inner: '#fde6e6' },
    crimson: { air: ['#fc9a52', '#f04040'], wall: '#c01024', heart: ['#ffe8cc', '#ffa85a', '#f0603a'], petal: ['#c9072a', '#b20c1e', '#da2541', '#e3384a'], odd: '#f08a6a', tip: '#f2707a', crease: '#5a0410', rim: '#ffc9a0', inner: '#fbd6dc' },
    sorbet:  { air: ['#f0e2f4', '#f8cdd4'], wall: '#f07a6a', heart: ['#fff8ea', '#ffe08a', '#f9b24a'], petal: ['#f47858', '#f592aa', '#ef6848', '#f7a2bc'], odd: '#c4b4f0', tip: '#fbd4da', crease: '#d23a48', rim: '#ffd27a', inner: '#fff2f0' },
    // VI. poppies: milky cream-pink air, cups from oxblood through vermilion to peach, sap-green stems
    poppy:   { ground: ['#f6e6dc', '#f1d2c8', '#ecbfb8'], wash: '#ec6f8e', petal: ['#9a1e14', '#e2442a', '#f5793f', '#fab48a'], stem: '#86a256', veil: '#fbeee6' },
    // IV. silk: a ramp from the deepest crease to the sheen
    rouge:   { ramp: ['#420404', '#700605', '#96090a', '#b40f0c', '#cc1c12', '#e2361c', '#f06a38', '#fca274'] },
    bleu:    { ramp: ['#04122c', '#0a2a58', '#153f80', '#235aa8', '#3b78cc', '#63a0ec', '#a2c8f6', '#e2efff'] },
    // V. meadow: sky haze, tree line, grass, rapeseed, and the poppies in it
    meadow:  { sky: '#d2d6aa', trees: '#5a8438', grass: ['#7ea24a', '#98b858', '#b7ca62'], yellow: ['#e2d236', '#efe05a'], poppy: '#e8442a', white: '#f4f0d8' },
    // III. paper for ribbons
    cream:   '#f3ede1',
  };

  // The grain fields: a colour ramp each, sampled from the board they answer to.
  const FIELD = {
    fold:  { colors: ['#ec3860', '#f2bf48', '#eef0f4', '#f46238', '#d8205e'], scatter: 2.6, soft: 0.01 },
    sun:   { colors: ['#e2231a', '#ee3d22', '#f45c2c', '#f98434', '#fda844', '#ffca86', '#ffe8cc', '#fff6ec', '#fffaf5'], scatter: 3, soft: 0.01 },
    flow:  { colors: ['#f53c18', '#f8561e', '#fb7a24', '#fca02e', '#f9bd48'], scatter: 1.6, soft: 0.004 },
    flame: { colors: ['#a85a98', '#9a58a0', '#7552a0', '#6e4f9c', '#b84a6c', '#f64832', '#f2402e', '#f35a34', '#fb8a2e', '#fdb03a'], scatter: 2.6, soft: 0.028, drag: 0.08 },
    blot:  { colors: ['#dadada', '#f5410f', '#f02f5c', '#ee8284'], scatter: 7, soft: 0.004 },
  };

  // The ribbons: a path in the unit square, a width, and a ramp along it.
  const RIBBON = {
    shift:   { ramp: ['#bcc8ec', '#6a84dc', '#2a3ab8', '#2a1488', '#7a1558', '#e22b30', '#f5552a', '#e63a3a', '#cc5a8a', '#dcb4d2'] },
    wave:    { ramp: ['#a8c6e0', '#3a8ed0', '#0a48ae', '#0e1a66', '#1a2a82', '#453a80', '#d2442e', '#fc7250', '#f9a476', '#fbd8bc'] },
    ember:   { ramp: ['#f7b060', '#ee5a22', '#e8401e', '#d0281e', '#8a1a1a', '#2f1111', '#3a1416', '#8a4454', '#d098a4'] },
    orb:     { ramp: ['#0c2e3a', '#10404a', '#1a5a5e', '#3a8274', '#9aae70', '#e6bc62', '#f3e2bc'] },
    swirl:   { ramp: ['#f4c8d8', '#f07aa0', '#f24a4a', '#fa7a2e', '#fbb640', '#f6dc86'] },
    smoke:   { ramp: ['#d8d2c4', '#8a8478', '#343230', '#2a2a2c', '#4a483c', '#8c7c60', '#e0b860', '#f2e2bc'] },
  };

  // ---- small things ----------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /** Smooth value noise in 0..1, and three octaves of it. */
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    const p = hash(xi, yi, s), q = hash(xi + 1, yi, s), r = hash(xi, yi + 1, s), t = hash(xi + 1, yi + 1, s);
    return p + (q - p) * a + (r - p) * b + (p - q - r + t) * a * b;
  }
  const fbm = (x, y, s) => 0.55 * vnoise(x, y, s) + 0.3 * vnoise(x * 2.03 + 7.1, y * 2.03, s + 1) + 0.15 * vnoise(x * 4.1, y * 4.1 + 3.3, s + 2);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (c, a) => { const [r, g, b] = typeof c === 'string' ? hex(c) : c; return `rgba(${r | 0},${g | 0},${b | 0},${a == null ? 1 : a})`; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  /** A colour ramp: ramp(t, out) writes the colour at t (0..1) into out. */
  function ramp(stops) {
    const c = stops.map(s => typeof s === 'string' ? hex(s) : s), n = c.length - 1;
    return (t, out) => {
      const l = clamp(t, 0, 1) * n, k = Math.min(n - 1, l | 0), u = l - k, a = c[k], b = c[k + 1];
      out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; out[2] = a[2] + (b[2] - a[2]) * u;
      return out;
    };
  }

  // ---- the lens ---------------------------------------------------------------
  /** Average `src` over a set of offsets: first copy at full weight, then a running mean. */
  function spread(src, pts) {
    const out = mk(src.width, src.height), o = out.getContext('2d');
    o.drawImage(src, 0, 0);
    pts.forEach(([dx, dy], k) => { o.globalAlpha = 1 / (k + 2); o.drawImage(src, dx, dy); });
    return out;
  }
  function disc(r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) { const rr = r * Math.sqrt((i + 0.5) / n), a = i * GA; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    return pts;
  }
  /** Out of focus: the scene averaged over an aperture of radius r (px), then smoothed. */
  function defocus(src, r) {
    if (r < 0.6) return src;
    const once = spread(src, disc(r, Math.min(48, 14 + Math.round(r))));
    return r > 2.5 ? spread(once, disc(r * 0.3, 10)) : once;
  }
  /** Moving: the scene averaged along a line of `len` px at `ang`, in passes short enough that no copy shows. */
  function motion(src, len, ang) {
    if (len < 1) return src;
    const passes = len > 60 ? 3 : 1, l = len / Math.sqrt(passes);
    let img = src;
    for (let p = 0; p < passes; p++) {
      const n = Math.min(56, Math.max(8, Math.round(l / 1.2))), pts = [];
      for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * l; pts.push([Math.cos(ang) * t, Math.sin(ang) * t]); }
      img = spread(img, pts);
    }
    return img;
  }

  /** A scene canvas: w×h plus a margin m on every side; the context is translated so (0,0) is the frame's corner. */
  function stage(w, h, m) {
    const c = mk(w + 2 * m, h + 2 * m), ctx = c.getContext('2d');
    ctx.translate(m, m);
    return { c, ctx, w, h, m, D: Math.hypot(w, h) };
  }
  function redraw(st, src) {   // start a fresh stage from a blurred canvas
    const ctx = st.c.getContext('2d');
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(src, 0, 0); ctx.restore();
  }
  function wash(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  /** Paint every pixel of a stage (margin included) with fn(x, y, out) in frame coordinates. */
  function paint(st, fn) {
    const c = st.c, W = c.width, H = c.height, ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data, out = [0, 0, 0];
    for (let j = 0, k = 0; j < H; j++) for (let i = 0; i < W; i++, k += 4) {
      fn(i - st.m, j - st.m, out);
      d[k] = out[0]; d[k + 1] = out[1]; d[k + 2] = out[2]; d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- the print --------------------------------------------------------------
  /** A 512² tile of grain and scatter offsets per seed: white noise repeats invisibly, and a table is quicker than hashing 5 M pixels. */
  const TILES = new Map();
  function tile(seed) {
    if (TILES.has(seed)) return TILES.get(seed);
    const N = 512 * 512, g = new Float32Array(N), dx = new Float32Array(N), dy = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const x = j & 511, y = j >> 9;
      g[j] = hash(x, y, seed) + hash(x, y, seed + 1) - 1 + 0.6 * (hash(x >> 1, y >> 1, seed + 2) - 0.5);   // fine grain, slightly clumped
      const far = 0.55 + 1.8 * Math.pow(hash(x, y, seed + 7), 4);   // a spray: most pixels stay near home, a few travel
      dx[j] = (hash(x, y, seed + 3) + hash(x, y, seed + 4) - 1) * far;
      dy[j] = (hash(x, y, seed + 5) + hash(x, y, seed + 6) - 1) * far;
    }
    const t = { g, dx, dy };
    if (TILES.size > 8) TILES.clear();
    TILES.set(seed, t);
    return t;
  }
  /**
   * Upscale the stage into the output canvas, then — at full resolution — scatter, tone and grain.
   *   scatter   CSS px: each pixel is taken from up to this far away, so soft edges turn to stipple
   *   grain     0..~0.2, amplitude as a fraction of full scale (0.08 reads as film)
   *   chroma    0..1, how much of the grain is coloured rather than grey
   *   sat       saturation multiplier (1 leaves it)
   *   veil      0..1, lift toward veilColor (a milky, low-contrast print)
   *   vignette  0..1, corners darkened by this much
   */
  function finish(canvas, st, src, o) {
    // live.js: hand over the soft image and the print settings instead of printing on the CPU
    if (o.capture) { o.capture({ W: canvas.width, H: canvas.height, src, x: st.m, y: st.m, w: st.w, h: st.h, o, tile: tile(((o.seed | 0) * 7 + 1) & 0xffff) }); return canvas; }
    const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, st.m, st.m, st.w, st.h, 0, 0, W, H); ctx.restore();
    const k = o.cssWidth ? W / o.cssWidth : 1, sc = (o.scatter || 0) * k, amp = (o.grain == null ? 0.08 : o.grain) * 255;
    const chroma = o.chroma || 0, sat = o.sat == null ? 1 : o.sat, veil = o.veil || 0, vig = o.vignette || 0, vc = hex(o.veilColor || '#ffffff');
    const T = tile(((o.seed | 0) * 7 + 1) & 0xffff), G = T.g, img = ctx.getImageData(0, 0, W, H), s = img.data;
    const out = sc >= 0.5 ? ctx.createImageData(W, H) : img, d = out.data, cx = W / 2, cy = H / 2, inv = 1 / (cx * cx + cy * cy);
    for (let y = 0; y < H; y++) {
      const row = (y & 511) << 9;
      for (let x = 0; x < W; x++) {
        const j = row | (x & 511), i = (y * W + x) * 4;
        let si = i;
        if (sc >= 0.5) {
          const sx = clamp(x + T.dx[j] * sc, 0, W - 1) | 0, sy = clamp(y + T.dy[j] * sc, 0, H - 1) | 0;
          si = (sy * W + sx) * 4;
        }
        let r = s[si], g = s[si + 1], b = s[si + 2];
        if (sat !== 1) { const l = 0.299 * r + 0.587 * g + 0.114 * b; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
        if (vig) { const q = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * inv, f = 1 - vig * q * q; r *= f; g *= f; b *= f; }
        if (veil) { r += (vc[0] - r) * veil; g += (vc[1] - g) * veil; b += (vc[2] - b) * veil; }
        if (amp) {
          const l = clamp((r + g + b) / 765, 0, 1), a = amp * (0.42 + 2.3 * l * (1 - l)), n = G[j] * a;
          if (chroma) {
            const c = a * chroma;
            r += n + G[(j + 7919) & 262143] * c; g += n + G[(j + 104729) & 262143] * c; b += n + G[(j + 50021) & 262143] * c;
          } else { r += n; g += n; b += n; }
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }
  function setup(canvas, o, scale) {
    const W = o.width || canvas.width, H = o.height || canvas.height;
    canvas.width = W; canvas.height = H;
    const s = (o.resolution || scale) * (o.cssWidth ? o.cssWidth / W : 1);
    return { W, H, w: Math.max(16, Math.round(W * s)), h: Math.max(16, Math.round(H * s)) };
  }
  const opt = (defaults, form, opts) => Object.assign({}, defaults, form, opts);

  // ---- flower parts -----------------------------------------------------------
  /** A petal as a fan from its base: broad rounded rim, ruffled edge, narrowing to a point at the base. */
  function fan(ctx, p) {
    const n = 56;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    for (let i = 0; i <= n; i++) {
      const u = i / n * 2 - 1, th = p.ang + u * p.span + p.skew * (1 - u * u);
      const body = Math.pow(Math.cos(u * Math.PI / 2), 0.3);
      const r = p.len * body * (1 + p.ruffle * (0.6 * Math.sin(u * p.k1 + p.ph) + 0.4 * Math.sin(u * p.k2 + p.ph2)) * body);
      ctx.lineTo(p.x + Math.cos(th) * r, p.y + Math.sin(th) * r);
    }
    ctx.closePath();
  }
  function petalSpec(rand, x, y, ang, len, span, ruffle) {
    return { x, y, ang, len, span, ruffle, skew: (rand() - 0.5) * span * 0.5, k1: 4 + rand() * 4, k2: 10 + rand() * 8, ph: rand() * TAU, ph2: rand() * TAU };
  }
  function tilt(ctx, p, squash) {   // foreshorten about the petal's base: a flower seen at an angle
    if (!squash) return;
    ctx.translate(p.x, p.y); ctx.rotate(squash.ang); ctx.scale(1, squash.k); ctx.rotate(-squash.ang); ctx.translate(-p.x, -p.y);
  }
  /** Paint one petal with a radial ramp from its base; `deep` > 0 adds a multiply pass so overlaps darken like tissue. */
  function paintPetal(ctx, p, cols, a, squash, deep) {
    ctx.save(); tilt(ctx, p, squash);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.len * 1.02);
    cols.forEach((c, i) => g.addColorStop(Array.isArray(c) ? c[0] : i / (cols.length - 1), Array.isArray(c) ? c[1] : c));
    fan(ctx, p); ctx.fillStyle = g;
    ctx.globalAlpha = a; ctx.globalCompositeOperation = 'source-over'; ctx.fill();
    if (deep) { ctx.globalAlpha = a * deep; ctx.globalCompositeOperation = 'multiply'; ctx.fill(); }
    ctx.restore();
  }
  /** The petal's folded rim: a thin darker line along its edge, the thing that stays legible when all else is blur. */
  function rim(ctx, p, col, a, lw, squash) {
    ctx.save(); tilt(ctx, p, squash);
    fan(ctx, p); ctx.clip();   // inside only, so the line fades into the petal and not the air
    fan(ctx, p); ctx.globalCompositeOperation = 'multiply'; ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw * 2; ctx.stroke();
    ctx.restore();
  }
  // ---- I. bloom: the inside of a flower, so close that it is colour, light between petals, and one sharp edge (27, 29, 31, 33)
  /** A point of a long petal in its own frame: on the spine (side 0) or an edge (±1). Narrow base, widest past halfway, rounded tip, bent a little. */
  function bladeAt(b, s, side) {
    const hw = b.wid * Math.pow(s, 0.45) * Math.sqrt(Math.max(0, 1 - Math.pow(s, 6))) * (1 + b.ruffle * Math.sin(s * 13 + b.ph + side * 2));
    const slope = 2 * b.bend * s, nl = Math.hypot(1, slope);
    return [s * b.len - slope / nl * hw * side, b.bend * s * s * b.len + hw * side / nl];
  }
  function bladePath(ctx, b) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const p = bladeAt(b, i / 40, 1); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    for (let i = 40; i >= 0; i--) { const p = bladeAt(b, i / 40, -1); ctx.lineTo(p[0], p[1]); }
    ctx.closePath();
  }
  function bladeSpec(rand, x, y, ang, len, wid) {
    return { x, y, ang, len, wid, bend: (rand() - 0.5) * 0.24, ruffle: 0.02 + rand() * 0.04, ph: rand() * TAU, flip: rand() < 0.5 ? -1 : 1 };
  }
  /** Paint a long petal: amber at the base, its own hue through the body, paler at the tip; one side curls into shadow, the other takes the light. */
  function paintBlade(ctx, b, pal, main, a, tip) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
    bladePath(ctx, b);
    const g = ctx.createLinearGradient(0, 0, b.len, 0);
    g.addColorStop(0, pal.heart[1]); g.addColorStop(0.2, pal.heart[2]); g.addColorStop(0.42, main); g.addColorStop(0.84, main); g.addColorStop(1, tip || pal.tip);
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fill();
    ctx.clip(); ctx.scale(1, b.flip);
    const k = ctx.createLinearGradient(0, -b.wid, 0, b.wid);
    k.addColorStop(0, rgba(pal.crease, 0.6)); k.addColorStop(0.42, rgba(pal.crease, 0)); k.addColorStop(0.62, 'rgba(255,246,236,0)'); k.addColorStop(1, 'rgba(255,246,236,0.38)');
    ctx.fillStyle = k; ctx.fillRect(-b.len * 0.2, -b.len, b.len * 1.4, b.len * 2);
    ctx.restore();
  }
  /** The one edge in focus: a fine bright line along a petal's rim, as in a macro shot where only a sliver is sharp. */
  function rimLine(ctx, b, col, lw, a, side) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
    ctx.beginPath();
    for (let i = 4; i <= 38; i++) { const p = bladeAt(b, i / 40, side); i > 4 ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  function bloom(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'coral', grain: 0.085, scatter: 1.6, chroma: 0.3, sat: 1.04 }, opts);
    const pal = PALETTES[o.palette] && PALETTES[o.palette].wall ? PALETTES[o.palette] : PALETTES.coral;
    const { w, h } = setup(canvas, o, 0.34), rand = mulberry32(o.seed >>> 0);
    const S = Math.min(w, h), D0 = Math.hypot(w, h), far = S * 0.05, m = Math.ceil(far * 1.7), st = stage(w, h, m), ctx = st.ctx;
    const pick = () => pal.petal[rand() * pal.petal.length | 0];
    // the heart is below the frame, off to one side: we are looking down into the cup, petals rising past the lens
    const side = rand() < 0.5 ? -1 : 1, tall = h > w;
    const hx = w * (0.5 + side * (tall ? 0.08 + rand() * 0.12 : 0.16 + rand() * 0.16)), hy = h * (1.02 + rand() * 0.1), up = -Math.PI / 2 - side * (0.12 + rand() * 0.2);
    // behind everything, the far wall of the cup and the air past its rim
    const gr = ctx.createLinearGradient(0, -m, 0, h + m);
    gr.addColorStop(0, pal.air[0]); gr.addColorStop(0.45, pal.air[1]); gr.addColorStop(1, pal.wall);
    ctx.fillStyle = gr; ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
    for (let i = 0; i < 5; i++) {   // the back petals: very wide, deep, filling the frame
      const len = D0 * (0.85 + rand() * 0.3), a = up + (i / 4 - 0.5) * 2.6 + (rand() - 0.5) * 0.3;
      paintBlade(ctx, bladeSpec(rand, hx, hy, a, len, len * (0.34 + rand() * 0.1)), pal, pal.wall, 0.9, pick());
    }
    for (let i = 0; i < 3; i++) wash(ctx, w * rand(), h * rand() * 0.6, S * (0.3 + rand() * 0.25), pal.heart[0], 0.45);   // light coming through between them
    // the front petals: long, overlapping, each its own hue; one odd one (lavender or gold) as real blooms have
    const n = 6 + (rand() * 3 | 0), front = [], oddI = rand() * n | 0;
    for (let i = 0; i < n; i++) {
      const len = D0 * (0.5 + rand() * 0.32), a = up + (i / (n - 1) - 0.5) * 2.3 + (rand() - 0.5) * 0.25;
      front.push(bladeSpec(rand, hx + (rand() - 0.5) * S * 0.1, hy, a, len, len * (0.17 + rand() * 0.1)));
    }
    front.sort((p, q) => Math.abs(q.ang - up) - Math.abs(p.ang - up));   // outer ones first, so the middle ones lie on top
    front.forEach((b, i) => { const odd = i === (oddI % 3); paintBlade(ctx, b, pal, odd ? pal.odd : pick(), odd ? 0.6 : 0.92); });   // the odd one lies at the back, half seen
    for (let i = 0; i < 3 + (rand() * 3 | 0); i++) {   // pale filaments rising out of the heart
      const len = D0 * (0.3 + rand() * 0.22), b = bladeSpec(rand, hx + (rand() - 0.5) * S * 0.08, hy, up + (rand() - 0.5) * 1.2, len, len * (0.05 + rand() * 0.04));
      paintBlade(ctx, b, { heart: [pal.inner, pal.inner, pal.inner], crease: pal.crease }, pal.inner, 0.75, pal.inner);
    }
    wash(ctx, hx, hy, D0 * 0.3, pal.heart[0], 0.85); wash(ctx, hx, hy, D0 * 0.42, pal.heart[1], 0.4);   // the heart: light, blurred to glare
    let img = defocus(st.c, far);
    // the nearest petal in better focus, laid thin over the blur, with a bright sliver of rim along one edge
    redraw(st, img);
    const near = front[front.length - 2 - (rand() * 2 | 0)] || front[0];
    paintBlade(ctx, near, pal, pal.petal[0], 0.5);
    rimLine(ctx, near, pal.crease, S * 0.012, 0.35, near.flip);
    rimLine(ctx, near, pal.rim, S * 0.006, 1, near.flip);
    img = defocus(st.c, S * 0.004);
    // and a petal right against the lens, one soft sweep across a corner
    redraw(st, img);
    wash(ctx, w * (side < 0 ? 1.05 : -0.05), h * (0.1 + rand() * 0.5), S * 0.5, pal.petal[1], 0.5);
    img = defocus(st.c, S * 0.012);
    return finish(canvas, st, img, o);
  }

  // ---- II. field: a grain gradient — soft colour, one or two crisp edges, and every edge sprayed to stipple
  const FORMS = {
    // sheets of colour folded over each other: each has one crisp edge and fades away from it (16, 1, 4)
    fold(rand, w, h, C, s) {
      const L = Math.hypot(w, h), P = C.map(hex), ph = [rand() * TAU, rand() * TAU, rand() * TAU], lean = rand() < 0.5 ? -1 : 1;
      const x0 = w * (0.42 + rand() * 0.12), y0 = h * (0.3 + rand() * 0.1);
      return (x, y, out) => {
        const wx = x + (fbm(x / L * 3, y / L * 3, s) - 0.5) * L * 0.12, wy = y + (fbm(x / L * 3 + 9, y / L * 3, s + 5) - 0.5) * L * 0.12;
        let c = P[0].slice();
        // a pool of the second hue low in the frame
        const low = smooth(0.55, 1.05, wy / h + 0.15 * Math.sin(wx / w * 3 + ph[2]));
        c = mix(c, P[3], low * 0.9);
        // the gold sheet from the top: its lower edge soft
        const gEdge = h * (0.22 + 0.14 * Math.sin(wx / w * 2.6 + ph[0])) + lean * (wx - w / 2) * 0.25, gd = (gEdge - wy) / L;
        c = mix(c, P[1], smooth(-0.07, 0.05, gd) * 0.95);
        // the pale fold: a crisp S-edge down the frame, fading away on one side
        const fEdge = x0 + w * 0.14 * Math.sin(wy / h * 3.1 + ph[1]) + (wy - y0) * 0.18 * lean, fd = lean * (fEdge - wx) / L;
        const fa = smooth(-0.003, 0.008, fd) * Math.exp(-Math.max(0, fd - 0.03) / 0.16) * smooth(-0.1, 0.3, wy / h);
        c = mix(c, P[2], fa * 0.9);
        // the shadow the fold throws, a deeper vein of the last hue just beyond the crisp edge
        c = mix(c, P[4], Math.exp(-Math.pow((fd + 0.04) / 0.035, 2)) * 0.5);
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
        return out;
      };
    },
    // a sun: one hot core fading through the ramp to paper (15)
    sun(rand, w, h, C, s) {
      const S = Math.min(w, h), cx = w * (0.46 + rand() * 0.08), cy = h * (0.44 + rand() * 0.08), R = Math.max(S * 0.8, Math.max(w, h) * 0.56) * (0.95 + rand() * 0.1), ey = h > w ? 1.12 : 0.9, R0 = ramp(C);
      return (x, y, out) => {
        const dx = (x - cx) / R, dy = (y - cy) / (R * ey), n = fbm(x / R * 1.4, y / R * 1.4, s) - 0.5;
        return R0(Math.sqrt(dx * dx + dy * dy) * (1 + n * 0.22), out);
      };
    },
    // bands of orange bent into an S, brushed along their length (14, 3, 10)
    flow(rand, w, h, C, s) {
      const L = Math.hypot(w, h), a = -1.05 + rand() * 0.3, ca = Math.cos(a), sa = Math.sin(a), k = 1.3 + rand() * 0.5, ph = rand() * TAU, R0 = ramp(C);
      return (x, y, out) => {
        const px = x / L, py = y / L, al = px * ca + py * sa, ac = -px * sa + py * ca;
        const warp = 0.2 * Math.sin(al * 4 + ph) + 0.08 * (fbm(al * 2.5, ac * 2.5, s) - 0.5);
        const fib = (fbm(al * 2.2, (ac + warp) * 40, s + 7) - 0.5) * 0.12;   // brushed: streaks long along the band, short across
        let t = (ac + warp) * k + fib + 0.3; t -= Math.floor(t); t = t < 0.5 ? t * 2 : 2 - t * 2;
        return R0(smooth(0, 1, t), out);
      };
    },
    // tongues: colour rising into colour, each boundary toothed like flame, violet over red over gold (0)
    flame(rand, w, h, C, s) {
      const n = Math.max(3, Math.round(w / Math.min(w, h) * 3)), amp = 0.22 + rand() * 0.06, R0 = ramp(C), ph = [rand() * 9, rand() * 9, rand() * 9];
      const teeth = (x, k) => {   // a row of tongues, uneven in width and height
        const u = x / w * n * (1 + 0.3 * k) + ph[k] + 0.45 * Math.sin(x / w * 5 + ph[k]), i = Math.floor(u), f = u - i, tri = 1 - Math.abs(f - 0.5) * 2;
        return (0.35 + 0.9 * hash(i, k, s)) * (Math.pow(tri, 1.6) - 0.35);
      };
      return (x, y, out) => {
        const v = y / h, wob = fbm(x / w * 4, v * 1.4, s) - 0.5, k = smooth(0.15, 0.6, v);
        return R0(v + amp * (teeth(x, 0) * (1 - k) + teeth(x, 1) * k) + wob * 0.16, out);
      };
    },
    // a blot on grey paper: one crisp side, one side sprayed, a pink bleed under it (11)
    blot(rand, w, h, C, s) {
      const S = Math.min(w, h), P = C.map(hex), cx = w * (0.56 + rand() * 0.12), cy = h * (0.4 + rand() * 0.1), R = S * (0.36 + rand() * 0.06);
      const soft = rand() * TAU, ph = rand() * TAU, bx = cx + R * 0.45, by = cy + R * 0.85;
      return (x, y, out) => {
        const paper = (fbm(x / S * 6, y / S * 6, s) - 0.5) * 10;
        let c = [P[0][0] + paper, P[0][1] + paper, P[0][2] + paper];
        const bd = Math.hypot((x - bx) / (R * 0.55), (y - by) / (R * 0.8));   // the bleed
        c = mix(c, P[3], smooth(1.25, 0.2, bd) * 0.8); c = mix(c, P[2], smooth(0.9, 0.1, bd) * 0.85);
        const dx = x - cx, dy = (y - cy) / 1.15, th = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
        const edge = R * (1 + 0.1 * Math.sin(2 * th + ph) + 0.05 * Math.sin(3 * th + ph * 2) + 0.12 * (fbm(Math.cos(th) * 2, Math.sin(th) * 2, s + 3) - 0.5));
        const e = 0.012 + 0.42 * Math.pow(0.5 + 0.5 * Math.cos(th - soft), 2.5), d = (edge - r) / R;
        c = mix(c, P[1], smooth(-e, e * 0.4, d));
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
        return out;
      };
    },
  };
  function field(canvas, opts) {
    const form = FORMS[opts && opts.form] ? opts.form : 'fold', F = FIELD[form];
    const o = opt({ seed: 1, grain: 0.09, chroma: 0.3, sat: 1 }, { scatter: F.scatter }, opts);
    const { w, h } = setup(canvas, o, 0.3), rand = mulberry32(o.seed >>> 0), soft = Math.hypot(w, h) * F.soft, st = stage(w, h, Math.ceil(soft * 1.6 + h * (F.drag || 0)));
    paint(st, FORMS[form](rand, w, h, o.colors || F.colors, (o.seed | 0) + 11));
    const img = F.drag ? motion(defocus(st.c, soft), h * F.drag, Math.PI / 2) : defocus(st.c, soft);
    return finish(canvas, st, img, o);
  }

  // ---- III. ribbon: one band of colour turning in the air over cream paper, its edges sprayed (36, 41)
  const PATHS = {   // points in the unit square, the band's width as a fraction of the short side, how often it turns over
    shift: { pts: [[0.64, 0.03], [0.7, 0.2], [0.52, 0.4], [0.37, 0.56], [0.47, 0.71], [0.64, 0.8], [0.56, 0.97]], width: 0.13, turns: 1.2 },
    wave:  { pts: [[-0.02, 0.2], [0.2, 0.15], [0.44, 0.27], [0.58, 0.42], [0.76, 0.5], [0.88, 0.64]], width: 0.17, turns: 0.8 },
    ember: { pts: [[0.44, -0.02], [0.3, 0.18], [0.42, 0.4], [0.66, 0.54], [0.54, 0.74], [0.3, 0.86]], width: 0.15, turns: 1.4 },
    smoke: { pts: [[0.56, 0.0], [0.44, 0.18], [0.58, 0.37], [0.44, 0.57], [0.57, 0.76], [0.47, 0.96]], width: 0.1, turns: 2.2 },
  };
  function spline(pts, n) {   // Catmull-Rom through the points, n samples
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) * (pts.length - 1), k = Math.min(pts.length - 2, u | 0), t = u - k;
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
    return out;
  }
  /**
   * A band seen turning in light: along its length the ramp; across it, one edge crisp and deep
   * (the edge facing you) and the other fading out as haze. The crisp side swaps as the band turns.
   * Every segment offers its own density at a point and the strongest wins, so the field stays
   * continuous where the band doubles back.
   */
  function bandAt(pts, widthAt, R0, turns, ph, paperAt) {
    const n = pts.length - 1, seg = [];
    let reach = 0;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i], dx = pts[i + 1][0] - ax, dy = pts[i + 1][1] - ay, t0 = i / n, t1 = (i + 1) / n;
      const hw0 = widthAt(t0), hw1 = widthAt(t1);
      seg.push({ ax, ay, dx, dy, il: 1 / (dx * dx + dy * dy || 1), t0, hw0, hw1, tw0: Math.sin(t0 * Math.PI * turns + ph), tw1: Math.sin(t1 * Math.PI * turns + ph) });
      reach = Math.max(reach, hw0, hw1);
    }
    reach = (reach * 3.2) * (reach * 3.2);
    const c = [0, 0, 0];
    return (x, y, out) => {
      let best = 0, bt = 0, bs = 0;
      for (let i = 0; i < n; i++) {
        const s = seg[i], u = clamp(((x - s.ax) * s.dx + (y - s.ay) * s.dy) * s.il, 0, 1), ex = x - s.ax - s.dx * u, ey = y - s.ay - s.dy * u, d2 = ex * ex + ey * ey;
        if (d2 > reach) continue;
        const t = s.t0 + u / n, hw = s.hw0 + (s.hw1 - s.hw0) * u, tw = s.tw0 + (s.tw1 - s.tw0) * u;
        const a = Math.sqrt(d2) / hw * ((s.dx * ey - s.dy * ex) < 0 ? -1 : 1), aa = Math.abs(a), k = 0.5 + 0.5 * tw * (a < 0 ? -1 : 1);
        const fw = 0.16 + 1.1 * (1 - k), core = aa < 0.55 ? 1 : Math.exp(-Math.pow((aa - 0.55) / fw, 2));
        const al = core * smooth(0, 0.12, t) * smooth(1, 0.86, t);
        if (al > best) { best = al; bt = t; bs = a * tw; }
      }
      const p = paperAt(x, y);
      if (best < 0.002) { out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; }
      R0(bt, c);
      const deep = smooth(-0.3, 1, bs) * 0.5, lift = smooth(0.2, -1.4, bs) * 0.22, al = best * 0.97;
      const r = c[0] * (1 - deep) + 255 * lift, g = c[1] * (1 - deep * 1.15) + 250 * lift, b = c[2] * (1 - deep * 0.8) + 245 * lift;
      out[0] = p[0] + (r - p[0]) * al; out[1] = p[1] + (g - p[1]) * al; out[2] = p[2] + (b - p[2]) * al;
      return out;
    };
  }
  function ribbon(canvas, opts) {
    const form = RIBBON[opts && opts.form] ? opts.form : 'shift';
    const o = Object.assign({ seed: 1, grain: 0.075, scatter: 4, chroma: 0.25, paper: PALETTES.cream }, opts);
    const { w, h } = setup(canvas, o, 0.4), rand = mulberry32(o.seed >>> 0), S = Math.min(w, h), s = (o.seed | 0) + 23;
    const blur = S * 0.02, st = stage(w, h, Math.ceil(blur * 1.6)), R0 = ramp(o.ramp || RIBBON[form].ramp), P0 = hex(o.paper);
    const paperAt = (x, y) => { const v = (fbm(x / S * 3, y / S * 3, s) - 0.5) * 9; return [P0[0] + v, P0[1] + v, P0[2] + v * 1.1]; };
    let fn;
    if (form === 'orb') {   // a sphere of colour: dark at the core, its lit rim spraying out
      const cx = w * (0.5 + (rand() - 0.5) * 0.06), cy = h * (0.36 + (rand() - 0.5) * 0.04), R = S * (0.34 + rand() * 0.04), lt = rand() * TAU, c = [0, 0, 0];
      fn = (x, y, out) => {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) / R, lit = 0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) - lt), p = paperAt(x, y);
        R0(clamp(r * (0.5 + 0.62 * lit), 0, 1), c);
        const al = smooth(1.1 + 0.4 * lit, 0.88 - 0.1 * lit, r);
        out[0] = p[0] + (c[0] - p[0]) * al; out[1] = p[1] + (c[1] - p[1]) * al; out[2] = p[2] + (c[2] - p[2]) * al;
        return out;
      };
    } else {
      let pts, width, turns;
      if (form === 'swirl') {   // a band wound once and a half round a still centre
        const cx = w * (0.5 + (rand() - 0.5) * 0.06), cy = h * 0.38, r = S * 0.4;
        pts = []; width = S * 0.12; turns = 2.4;
        for (let i = 0; i < 90; i++) { const t = i / 89, a = -0.4 + t * TAU * 1.3, rr = r * (1 - t * 0.78); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]); }
      } else {
        const P = PATHS[form];
        pts = spline(P.pts.map(p => [(p[0] + (rand() - 0.5) * 0.05) * w, (p[1] + (rand() - 0.5) * 0.03) * h]), 90); width = S * P.width * (0.9 + rand() * 0.2); turns = P.turns;
      }
      const ph = rand() * TAU, wph = rand() * TAU;
      const widthAt = t => width * (0.3 + 0.85 * Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.7)) * (1 + 0.15 * Math.sin(t * 8 + wph));
      fn = bandAt(pts, widthAt, R0, turns, ph, paperAt);
    }
    paint(st, fn);
    return finish(canvas, st, defocus(st.c, blur), o);
  }

  // ---- IV. silk: satin folds under one light; height, then shading, then a ramp from crease to sheen (9, 12)
  function silk(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'rouge', grain: 0.075, scatter: 0.8, chroma: 0.2 }, opts);
    const pal = PALETTES[o.palette] && PALETTES[o.palette].ramp ? PALETTES[o.palette] : PALETTES.rouge;
    const { w, h } = setup(canvas, o, 0.4), rand = mulberry32(o.seed >>> 0), L = Math.hypot(w, h), st = stage(w, h, 2), W = st.c.width, H = st.c.height;
    // folds: long ridges, most running one way, pinched toward one corner the way cloth hangs from a point
    const main = -0.95 + (rand() - 0.5) * 0.5, px = w * (rand() < 0.5 ? -0.1 : 1.1), py = h * (1.1 + rand() * 0.2), folds = [];
    for (let i = 0; i < 9; i++) {
      const a = main + (rand() - 0.5) * 0.5, off = (i / 8 - 0.5) * L * 1.1 + (rand() - 0.5) * L * 0.08;
      folds.push({ a, ca: Math.cos(a), sa: Math.sin(a), off, amp: (0.5 + rand() * 0.8) * (rand() < 0.3 ? -1 : 1), wid: L * (0.018 + rand() * 0.05), bow: (rand() - 0.5) * 1.6 / L });
    }
    const s = (o.seed | 0) + 17, Hf = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = i - 2, y = j - 2, wx = x + (fbm(x / L * 2.2, y / L * 2.2, s) - 0.5) * L * 0.16, wy = y + (fbm(x / L * 2.2 + 5, y / L * 2.2, s + 3) - 0.5) * L * 0.16;
      const pinch = 0.55 + 0.45 * Math.min(1, Math.hypot(wx - px, wy - py) / L);   // folds crowd together near the pinch
      let v = 0;
      for (const f of folds) {
        const al = (wx - w / 2) * f.ca + (wy - h / 2) * f.sa, ac = -(wx - w / 2) * f.sa + (wy - h / 2) * f.ca;
        const d = (ac - f.off * pinch - f.bow * al * al) / f.wid;
        v += f.amp * f.wid * Math.exp(-d * d);
      }
      Hf[j * W + i] = v;
    }
    const R0 = ramp(pal.ramp), lx = -0.45, ly = -0.62, lz = 0.64, hl = Math.hypot(lx, ly, lz + 1), hx = lx / hl, hy = ly / hl, hz = (lz + 1) / hl;
    paint(st, (x, y, out) => {
      const i = clamp(x + 2, 1, W - 2), j = clamp(y + 2, 1, H - 2), k = j * W + i;
      const gx = (Hf[k + 1] - Hf[k - 1]) * 0.5, gy = (Hf[k + W] - Hf[k - W]) * 0.5, nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
      const dif = Math.max(0, nx * lx + ny * ly + nz * lz), nh = Math.max(0, nx * hx + ny * hy + nz * hz);
      const v = 0.06 + 0.55 * dif * dif + 0.38 * Math.pow(nh, 36) + 0.22 * Math.pow(nh, 6) - 0.12 * smooth(0.2, 1, 1 - nz);
      return R0(v, out);
    });
    const img = defocus(st.c, L * 0.004);
    return finish(canvas, st, img, o);
  }

  // ---- V. meadow: a field seen from a moving train; everything drawn out into streaks (19)
  function meadow(canvas, opts) {
    const o = Object.assign({ seed: 1, grain: 0.08, scatter: 0.6, chroma: 0.25, speed: 0.34, angle: 0.035, sat: 1.06 }, opts);
    const pal = PALETTES.meadow, { w, h } = setup(canvas, o, 0.3), rand = mulberry32(o.seed >>> 0);
    const len = w * o.speed, m = Math.ceil(len * 0.9), st = stage(w, h, m), ctx = st.ctx, S = Math.min(w, h), slope = (rand() - 0.3) * 0.25;
    // bands: haze, the tree line, grass, the rapeseed, sloping a little, the way land does from a window
    const edge = (f, x) => h * f + (x - w / 2) * slope;
    const bands = [[-0.3, pal.sky], [0.2 + rand() * 0.06, pal.trees], [0.36 + rand() * 0.06, pal.grass[0]], [0.5, pal.grass[1]], [0.6 + rand() * 0.06, pal.grass[2]], [0.72 + rand() * 0.06, pal.yellow[0]], [0.9, pal.yellow[1]]];
    bands.forEach(([f, col], i) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-m, edge(f, -m));
      for (let x = -m; x <= w + m; x += 8) ctx.lineTo(x, edge(f, x) + Math.sin(x / w * 7 + i) * S * 0.02);
      ctx.lineTo(w + m, h + m); ctx.lineTo(-m, h + m); ctx.closePath(); ctx.fill();
    });
    // everything that makes a streak: tufts, leaves, flowers, each a small blot at its own height
    for (let i = 0; i < 1400; i++) {
      const x = -m + rand() * (w + 2 * m), f = rand(), y = edge(f * 1.1 - 0.05, x), r = S * (0.004 + rand() * 0.018) * (0.4 + f);
      let col;
      if (f < 0.35) col = rand() < 0.6 ? pal.trees : pal.sky;
      else if (f < 0.7) col = rand() < 0.5 ? pal.grass[rand() * 3 | 0] : rand() < 0.5 ? pal.trees : pal.yellow[0];
      else col = rand() < 0.7 ? pal.yellow[rand() * 2 | 0] : pal.grass[rand() * 3 | 0];
      if (f > 0.5 && rand() < 0.12) col = pal.poppy;
      if (rand() < 0.03) col = pal.white;
      ctx.fillStyle = rgba(col, 0.55 + rand() * 0.45);
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r, 0, 0, TAU); ctx.fill();
    }
    let img = motion(defocus(st.c, S * 0.006), len, o.angle);
    redraw(st, img);
    // the nearest grass, right under the window, passes fastest: another, longer smear along the bottom
    const g = ctx.createLinearGradient(0, h * 0.8, 0, h + m); g.addColorStop(0, rgba(pal.yellow[0], 0)); g.addColorStop(1, rgba(pal.grass[2], 0.5));
    ctx.fillStyle = g; ctx.fillRect(-m, h * 0.8, w + 2 * m, h * 0.2 + m);
    img = motion(st.c, len * 0.5, o.angle);
    return finish(canvas, st, img, o);
  }

  // ---- VI. poppies: cups on long stems, swaying past a slow shutter (39)
  function poppyCup(ctx, rand, pal, x, y, size, axis, k, a) {
    const sq = { ang: axis + Math.PI / 2, k }, deep = [pal.petal[0], pal.petal[1], pal.petal[2], pal.petal[3]], pale = [pal.petal[1], pal.petal[2], pal.petal[3], rgba(pal.petal[3], 0.5)];
    for (let i = 0; i < 3; i++) {   // the back of the cup, paler, wide open
      const p = petalSpec(rand, x, y, axis + (i - 1) * 0.95 + (rand() - 0.5) * 0.3, size * (0.95 + rand() * 0.2), 0.95, 0.08);
      paintPetal(ctx, p, pale, a * 0.9, sq, 0.3); rim(ctx, p, pal.petal[0], 0.2, size * 0.01, sq);
    }
    for (let i = 0; i < 2; i++) {   // the front pair, deeper, closing over the heart
      const p = petalSpec(rand, x, y, axis + (i ? 0.5 : -0.5) + (rand() - 0.5) * 0.3, size * (0.85 + rand() * 0.2), 0.8, 0.07);
      paintPetal(ctx, p, deep, a * 0.9, sq, 0.3); rim(ctx, p, pal.petal[0], 0.25, size * 0.01, sq);
    }
    wash(ctx, x + Math.cos(axis) * size * 0.12, y + Math.sin(axis) * size * 0.12, size * 0.3, '#4a1510', 0.4 * a);
  }
  function poppies(canvas, opts) {
    const o = Object.assign({ seed: 1, grain: 0.075, scatter: 1.2, chroma: 0.25, veil: 0.03, sat: 1.08 }, opts);
    const pal = PALETTES.poppy, { w, h } = setup(canvas, o, 0.34), rand = mulberry32(o.seed >>> 0);
    const D0 = Math.hypot(w, h), ang = o.angle == null ? -0.95 + (rand() - 0.5) * 0.4 : o.angle, sweep = D0 * (o.speed == null ? 0.05 : o.speed);
    const m = Math.ceil(D0 * 0.03 + sweep), st = stage(w, h, m), ctx = st.ctx, S = Math.min(w, h), L = Math.max(w, h);
    const g = ctx.createLinearGradient(0, -m, 0, h + m);
    pal.ground.forEach((c, i) => g.addColorStop(i / (pal.ground.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
    wash(ctx, w * (0.1 + rand() * 0.3), h * (0.6 + rand() * 0.2), D0 * 0.35, pal.wash, 0.5);   // a pink blur low left: a bloom too near to see
    // blooms in the corners and on the edges, never the middle: the middle is where the name goes
    const slots = [[0.08, 0.12, 0.62], [0.96, 0.58, 0.66], [0.12, 0.66, 0.44], [0.78, 0.96, 0.44], [0.9, 0.08, 0.3]];
    const blooms = slots.map(([x, y, s]) => ({ x: w * (x + (rand() - 0.5) * 0.12), y: h * (y + (rand() - 0.5) * 0.08), size: (S * 0.55 + L * 0.2) * s * (0.85 + rand() * 0.3), axis: -Math.PI / 2 + (x < 0.5 ? 0.6 : -0.6) + (rand() - 0.5) * 0.8, k: 0.5 + rand() * 0.35 }));
    ctx.lineCap = 'round';
    for (const b of blooms) {   // long stems off the bottom of the frame, bowed
      const x1 = b.x + (w * 0.5 - b.x) * (0.3 + rand() * 0.5), cxq = (b.x + x1) / 2 + (rand() - 0.5) * w * 0.3;
      ctx.strokeStyle = rgba(pal.stem, 0.85); ctx.lineWidth = S * (0.02 + rand() * 0.015);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(cxq, (b.y + h) / 2, x1, h + m); ctx.stroke();
    }
    const nearI = [0, 1][rand() * 2 | 0];
    blooms.forEach((b, i) => { if (i !== nearI) poppyCup(ctx, rand, pal, b.x, b.y, b.size, b.axis, b.k, 0.95); });
    let img = motion(defocus(st.c, D0 * 0.026), sweep, ang);
    redraw(st, img);
    const b = blooms[nearI];
    poppyCup(ctx, rand, pal, b.x, b.y, b.size * 1.1, b.axis, b.k, 0.9);
    img = motion(defocus(st.c, D0 * 0.009), sweep * 0.6, ang);
    return finish(canvas, st, img, Object.assign({ veilColor: pal.veil }, o));
  }

  // ---- your photograph, through one of the looks
  const LOOKS = {
    bloom:   { grain: 0.085, scatter: 1.5, chroma: 0.3, sat: 1.25, veil: 0.04, veilColor: '#fff0e4' },
    poppies: { grain: 0.075, scatter: 1.2, chroma: 0.25, sat: 1.15, veil: 0.05, veilColor: '#fbeee6' },
    meadow:  { grain: 0.08, scatter: 0.6, chroma: 0.25, sat: 1.2 },
    field:   { grain: 0.09, scatter: 3, chroma: 0.3, sat: 1.5 },
    silk:    { grain: 0.075, scatter: 0.8, chroma: 0.2, sat: 1.1 },
  };
  function develop(canvas, image, opts) {
    const o = Object.assign({ seed: 1, look: 'bloom' }, opts), look = LOOKS[o.look] ? o.look : 'bloom';
    const { w, h } = setup(canvas, o, 0.34), D = Math.hypot(w, h);
    const m = Math.ceil(D * (look === 'meadow' ? 0.25 : look === 'field' ? 0.12 : 0.06)), st = stage(w, h, m), ctx = st.ctx;
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height, k = Math.max((w + 2 * m) / iw, (h + 2 * m) / ih);
    ctx.drawImage(image, w / 2 - iw * k / 2, h / 2 - ih * k / 2, iw * k, ih * k);
    let img;
    if (look === 'bloom') {   // warmed, and out of focus
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = rgba('#ff7a4a', 0.35); ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
      img = defocus(st.c, D * 0.018);
    } else if (look === 'poppies') {
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba('#f7c2aa', 0.18); ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
      img = motion(defocus(st.c, D * 0.008), D * 0.05, -1.15);
    } else if (look === 'meadow') img = motion(defocus(st.c, D * 0.004), w * 0.34, 0.03);
    else if (look === 'field') img = defocus(defocus(st.c, D * 0.05), D * 0.03);   // so far out of focus only the colours are left
    else img = defocus(st.c, D * 0.006);
    return finish(canvas, st, img, Object.assign({}, LOOKS[look], { seed: o.seed }, opts));
  }

  /** A fixed grain overlay for animated plates: a noise tile as the element's background. */
  function grain(el, opts) {
    const o = Object.assign({ opacity: 0.12, tile: 220, seed: 5 }, opts), c = mk(o.tile, o.tile), ctx = c.getContext('2d');
    const img = ctx.createImageData(o.tile, o.tile), d = img.data;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const v = 128 + (hash(j % o.tile, j / o.tile | 0, o.seed) + hash(j % o.tile, j / o.tile | 0, o.seed + 1) - 1) * 150;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    Object.assign(el.style, { backgroundImage: `url(${c.toDataURL()})`, backgroundSize: `${o.tile / 2}px`, opacity: o.opacity, mixBlendMode: 'overlay', pointerEvents: 'none' });
    return el;
  }

  root.Haze = { bloom, field, ribbon, silk, meadow, poppies, develop, grain, defocus, motion, PALETTES, FIELD, RIBBON, LOOKS, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
