/* cyanotype.js — a grain compositor for <canvas>, one indigo/violet hue family.
 *
 * Everything this file draws is the same three-step pipeline:
 *   1. build a scalar field T(x,y) in [0,1] — either procedural pools of light
 *      (field), a blurred photogram mask (print), or a photograph's luminance
 *      (tone);
 *   2. perturb T per pixel with stochastic, multi-scale grain — never a flat
 *      opacity overlay, always a real shift along the ramp, so every grain
 *      speck is still a colour from the same duotone and the hue family holds;
 *   3. look T up in a named colour ramp (PALETTES) and paint the pixel.
 *
 * Because grain perturbs T *before* the ramp lookup rather than jittering RGB
 * channels independently, no grain speck can ever drift outside the ramp's
 * hue — that is what keeps a heavily-grained image still reading as "one
 * indigo family" instead of RGB static.
 *
 *   Cyanotype.field(canvas, { palette: 'nightglow', seed: 3 });               // pins: grain-gradient / glow
 *   Cyanotype.print(canvas, { palette: 'navy', objects: (ctx,w,h,rand)=>{} }); // pins: photogram / silhouette
 *   Cyanotype.tone(canvas, imageElement, { palette: 'lily' });                 // pins: your own photograph
 *
 * Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // Five ramps, one hue family: white/paper through ultramarine/cobalt/violet
  // to near-black. `ground` is the resting colour with no field at all;
  // `stops` are [t, hex] pairs the ramp interpolates between.
  const PALETTES = {
    // cyan-turquoise pooling into white — a grain-gradient field
    cobalt: { ground: '#ffffff', stops: [[0, '#ffffff'], [0.28, '#d9f0ff'], [0.48, '#56c8ff'], [0.72, '#2f9fdb'], [1, '#1c7fc4']] },
    // violet-pink glow dissolving into near-black — a grain-gradient field
    nightglow: { ground: '#07070d', stops: [[0, '#06060c'], [0.24, '#181043'], [0.48, '#4a3db2'], [0.68, '#9483e8'], [0.85, '#e7d0ee'], [1, '#faeef8']] },
    // pale lilac umbel on a flat mid-cobalt ground — the mask stays lilac, the ground is the flat colour
    navy: { ground: '#2c3c8c', stops: [[0, '#c4cbf2'], [0.35, '#93a2d8'], [0.7, '#4d5da8'], [1, '#2c3c8c']] },
    // a soft cyanotype photograph: pale highlights, blue midtones, deep shadows
    lily: { ground: '#0e1c52', stops: [[0, '#f5f2fb'], [0.24, '#a3b8ea'], [0.48, '#3f66c4'], [0.72, '#1c3c8c'], [1, '#0a1740']] },
    // ultramarine silhouette on white paper, coarse grain at the edge
    paperblue: { ground: '#faf9f4', stops: [[0, '#faf9f4'], [0.42, '#dfe4f4'], [0.66, '#5163c2'], [0.84, '#2d3aa8'], [1, '#1d2586']] },
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, s) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function makeNoise(rand) {
    const p = new Uint8Array(512), perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0;[perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10), g = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), X = xi & 255, Y = yi & 255; x -= xi; y -= yi;
      const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
      const n0 = g(p[a], x, y) + u * (g(p[b], x - 1, y) - g(p[a], x, y));
      const n1 = g(p[a + 1], x, y - 1) + u * (g(p[b + 1], x - 1, y - 1) - g(p[a + 1], x, y - 1));
      return n0 + v * (n1 - n0);
    };
  }
  const fbm = (n, x, y, o) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * n(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };
  function coarse(w, h, step, fn) {
    const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2, g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * step, j * step);
    return (x, y) => {
      const fx = x / step, fy = y / step, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
      const a = g[k] + (g[k + 1] - g[k]) * tx, b = g[k + gw] + (g[k + gw + 1] - g[k + gw]) * tx;
      return a + (b - a) * ty;
    };
  }
  // Separable box blur, three passes ~= gaussian. Portable (ctx.filter is not everywhere).
  function blur(src, w, h, r) {
    if (r < 1) return src;
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {
        let acc = 0; const row = y * w;
        for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          b[row + x] = acc / (2 * r + 1);
          acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      [a, b] = [b, a];
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += a[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
          b[y * w + x] = acc / (2 * r + 1);
          acc += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
        }
      }
      [a, b] = [b, a];
    }
    return a;
  }
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const clamp255 = x => x < 0 ? 0 : x > 255 ? 255 : x;

  /** Look a density t∈[0,1] up in a named ramp; the only way colour enters an image here. */
  function ramp(pal, t) {
    t = clamp01(t);
    const s = pal._s || (pal._s = pal.stops.map(([p, c]) => [p, hex(c)]));
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) {
        const [p0, c0] = s[i - 1], [p1, c1] = s[i], u = p1 > p0 ? (t - p0) / (p1 - p0) : 0;
        return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
      }
    }
    return s[s.length - 1][1];
  }

  function grey(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data, out = new Float32Array(canvas.width * canvas.height);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    return out;
  }

  /**
   * The one paint step every renderer shares: look T up in `pal`, perturb the
   * lookup position with layered stochastic grain (never the RGB directly, so
   * the hue family can't drift), and write pixels.
   *   grain      overall grain strength, ~1 reads clearly at 100% zoom (default 1)
   *   edge       optional Float32Array, 0..1: boosts grain where it is high
   *              (a silhouette's contact band — pin: coarse grain falloff)
   *   weave      optional 0..1: a faint fixed crosshatch, for a screened fill
   *   coarse     optional 0..1: an extra chunky (5-8px) dither layer, for a hard
   *              stochastic transition rather than a smooth blend (pins: the
   *              blue-into-white edge, the ink-into-paper wash)
   */
  function compose(ctx, w, h, pal, T, o, rand) {
    const gAmt = o.grain == null ? 1 : o.grain, seed = o.seed | 0;
    const n = makeNoise(rand);
    const blotch = coarse(w, h, 6, (x, y) => fbm(n, x / 230 + 70, y / 230 + 70, 3));
    const edge = o.edge, edgeBoost = o.edgeBoost == null ? 1.7 : o.edgeBoost, weave = o.weave || 0;
    const coarseAmt = o.coarse || 0, gr = 10;
    const img = ctx.createImageData(w, h), px = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      let t = T[k];
      const fine = hash2(x, y, seed) - 0.5;
      const blk2 = hash2(x >> 1, y >> 1, seed + 101) - 0.5;
      const blk4 = hash2(x >> 2, y >> 2, seed + 202) - 0.5;
      const bmod = 0.6 + 0.75 * Math.abs(blotch(x, y));
      let amp = (fine * 0.50 + blk2 * 0.32 + blk4 * 0.18) * 0.30 * gAmt * bmod;
      if (coarseAmt) {
        // only where T is actually transitioning — a wide-baseline gradient estimate —
        // so flat pools/paper keep their ordinary fine grain instead of turning
        // into visible tiles; the dither itself stays per-pixel (stochastic, not
        // a blocky mosaic) so a "hard" edge still reads as grain, not pixel art
        const x0 = x < gr ? 0 : x - gr, x1 = x + gr >= w ? w - 1 : x + gr;
        const y0 = y < gr ? 0 : y - gr, y1 = y + gr >= h ? h - 1 : y + gr;
        const gx = T[y * w + x1] - T[y * w + x0], gy = T[y1 * w + x] - T[y0 * w + x];
        const gate = clamp01(Math.hypot(gx, gy) * 4.5);
        amp += (hash2(x, y, seed + 555) - 0.5) * 0.95 * coarseAmt * gate;
      }
      if (edge) amp *= 1 + edge[k] * edgeBoost;
      if (weave) amp += weave * (Math.sin((x + y) * 0.9) + Math.sin((x - y) * 0.9)) * 0.018;
      t = clamp01(t + amp);
      const c = ramp(pal, t);
      const jitter = (hash2(x, y, seed + 777) - 0.5) * 8;
      px[k * 4] = clamp255(c[0] + jitter);
      px[k * 4 + 1] = clamp255(c[1] + jitter);
      px[k * 4 + 2] = clamp255(c[2] + jitter);
      px[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function segDist2(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + t * dx, cy = y1 + t * dy, ex = px - cx, ey = py - cy;
    return ex * ex + ey * ey;
  }

  /** Hand-placed pools per named palette; `field()` warps and sums these into T. */
  function autoPools(name, w, h, rand) {
    const s = Math.min(w, h), j = a => (rand() - 0.5) * 2 * a;
    if (name === 'nightglow') return [
      { type: 'blob', cx: w * 0.15 + j(20), cy: h * 0.15 + j(20), sigma: s * 0.28, amp: 0.74 },
      { type: 'band', x1: w * 0.02, y1: h * 0.44, x2: w * 0.95, y2: h * 0.58, sigma: s * 0.12, amp: 0.42 },
      { type: 'blob', cx: w * 0.52 + j(30), cy: h * 0.30, sigma: s * 0.16, amp: 0.16 },
    ];
    if (name === 'paperblue') return [
      { type: 'blob', cx: w * 0.5, cy: h * 1.05, sigma: s * 0.62, amp: 0.9 },
    ];
    // cobalt / default: one deep pool low-left dissolving to white
    return [
      { type: 'blob', cx: w * 0.30 + j(25), cy: h * 0.55 + j(25), sigma: s * 0.58, amp: 1.2 },
      { type: 'blob', cx: w * 0.10, cy: h * 1.0, sigma: s * 0.30, amp: 0.45 },
    ];
  }

  /**
   * field(canvas, opts) — a grain-gradient / glow: no subject, just soft
   * warped pools of light summed into one density field, then grain.
   *   palette   a PALETTES name (default 'cobalt')
   *   pools     override the auto pools: [{ type:'blob', cx,cy,sigma,amp } | { type:'band', x1,y1,x2,y2,sigma,amp }]
   *   softness  how strongly pool edges are noise-warped, 0..~2 (default 1)
   *   grain     grain strength (default 1.1)
   */
  function field(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'cobalt', softness: 1, grain: 1.1, scale: 1 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    canvas.width = w; canvas.height = h;
    const rand = mulberry32(o.seed >>> 0);
    const n = makeNoise(rand);
    const pools = (o.pools || autoPools(o.palette, w, h, rand)).map(p => Object.assign({ _ox: rand() * 1000, _oy: rand() * 1000 }, p));
    const warpScale = 260 * o.scale;
    const hf = coarse(w, h, 4, (x, y) => {
      let v = 0;
      for (const p of pools) {
        const wx = x + n(x / warpScale + p._ox, y / warpScale + p._ox) * p.sigma * 0.55 * o.softness;
        const wy = y + n(x / warpScale + p._oy, y / warpScale + p._oy) * p.sigma * 0.55 * o.softness;
        const d2 = p.type === 'band' ? segDist2(wx, wy, p.x1, p.y1, p.x2, p.y2) : (wx - p.cx) * (wx - p.cx) + (wy - p.cy) * (wy - p.cy);
        v += p.amp * Math.exp(-d2 / (2 * p.sigma * p.sigma));
      }
      return v;
    });
    const T = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) T[y * w + x] = clamp01(hf(x, y));
    compose(canvas.getContext('2d'), w, h, PALETTES[o.palette] || PALETTES.cobalt, T, o, mulberry32((o.seed * 17 + 3) >>> 0));
    return canvas;
  }

  /**
   * print(canvas, opts) — a photogram: objects(ctx,w,h,rand) draws a subject
   * in white (opaque) / grey (translucent) on black, exactly as light would
   * see it; the result is blurred for soft focus, then developed through a
   * ramp in one of two directions.
   *   polarity  'negative' (default): the subject stays pale, the ground
   *             goes to ink — a true photogram (pins: white lily on navy).
   *             'positive': the subject prints in ink on a pale ground, with
   *             grain concentrated in a band at its edge (pins: silhouette).
   *   focus     small "contact" blur, 0..~2 (default 0.6)
   *   haze      large soft-focus blur, 0..~2 (default 1)
   *   soft      how much of `haze` blends into `focus`, 0..1 (default 0.55)
   *   layers    optional [{ objects, focus, haze, soft, mode }, ...] instead of
   *             one `objects` — each draws and blurs on its own (a real depth of
   *             field: one sharp layer, others hazier), then the results
   *             screen-blend together in order (pin: several blooms, mixed
   *             focus). mode: 'multiply' instead darkens what is already there:
   *             the layer fills white itself and paints shadow (stems, leaves
   *             in front) in grey
   *   bg        optional, positive polarity only: an ink density behind the
   *             subject, independent of the mask. { from, to } is a wash from
   *             ink at `from` to paper at `to` (fractions of width); a function
   *             (u, v) → 0..1 of the fractional position gives any shape
   *             (pin: ink dense on one side, dissolving into paper on the other)
   *   bgDither  0..1: turns that density into stochastic ink specks instead of
   *             a smooth tint (pin: the speckled paper in front of a profile)
   *   accents   optional [{ x, y, r, a }, ...] (canvas px): a faint violet
   *             glow blended in after grain, for a bloom's throat
   */
  function print(canvas, opts) {
    let o = Object.assign({ seed: 1, palette: 'navy', polarity: 'negative', focus: 0.6, haze: 1, soft: 0.55, grain: 1, scale: 1 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    canvas.width = w; canvas.height = h;
    const s = Math.min(w, h) * o.scale;

    function maskLayer(objectsFn, offset) {
      const m = document.createElement('canvas'); m.width = w; m.height = h;
      const mctx = m.getContext('2d', { willReadFrequently: true });
      mctx.fillStyle = '#000'; mctx.fillRect(0, 0, w, h); mctx.fillStyle = '#fff'; mctx.strokeStyle = '#fff';
      if (objectsFn) objectsFn(mctx, w, h, mulberry32((o.seed * 31 + 7 + offset) >>> 0));
      return grey(m);
    }
    function blendedB(objectsFn, focus, haze, soft, offset) {
      const L0 = maskLayer(objectsFn, offset);
      const lf = blur(L0, w, h, Math.max(1, Math.round(focus * 0.007 * s)));
      const lh = blur(L0, w, h, Math.max(1, Math.round(haze * 0.020 * s)));
      const out = new Float32Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = lf[i] * (1 - soft) + lh[i] * soft;
      return { L0, out };
    }

    let B0, B;
    if (o.layers && o.layers.length) {
      B = new Float32Array(w * h);
      B0 = new Float32Array(w * h);
      o.layers.forEach((layer, idx) => {
        const { L0, out } = blendedB(layer.objects, layer.focus ?? o.focus, layer.haze ?? o.haze, layer.soft ?? o.soft, idx * 13);
        if (layer.mode === 'multiply') for (let i = 0; i < B.length; i++) B[i] *= out[i];
        else for (let i = 0; i < B.length; i++) {
          B[i] = 1 - (1 - B[i]) * (1 - out[i]);
          if (L0[i] > B0[i]) B0[i] = L0[i];
        }
      });
    } else {
      const r = blendedB(o.objects, o.focus, o.haze, o.soft, 0);
      B0 = r.L0; B = r.out;
    }

    const T = new Float32Array(w * h);
    for (let i = 0; i < T.length; i++) T[i] = o.polarity === 'positive' ? B[i] : 1 - B[i];
    let edge = null;
    if (o.polarity === 'positive') {
      const Bfocus = blur(B0, w, h, Math.max(1, Math.round(o.focus * 0.007 * s)));
      const Bband = blur(B0, w, h, Math.max(2, Math.round(0.16 * s)));
      edge = new Float32Array(w * h);
      for (let i = 0; i < edge.length; i++) edge[i] = clamp01(Math.abs(Bfocus[i] - Bband[i]) * 2.4);
      o = Object.assign({ weave: 0.5 }, o);
      if (o.bg) {
        const from = o.bg.from ?? 0, to = o.bg.to ?? 0.7;
        const dens = typeof o.bg === 'function' ? o.bg : u => 1 - (u - from) / (to - from);
        const dith = o.bgDither || 0, sd = (o.seed | 0) + 909;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x;
          let g = clamp01(dens(x / w, y / h));
          if (dith) g = g * (1 - dith) + ((0.55 * hash2(x >> 1, y >> 1, sd) + 0.45 * hash2(x, y, sd + 1)) < g ? dith : 0);
          T[i] = B[i] + (1 - B[i]) * g;
        }
      }
    }
    compose(canvas.getContext('2d'), w, h, PALETTES[o.palette] || PALETTES.navy, T, Object.assign({}, o, { edge }), mulberry32((o.seed * 53 + 9) >>> 0));

    if (o.accents && o.accents.length) {
      // A plain alpha-blended wash, not a blend mode: the throat itself is
      // drawn near-white, and soft-light (or any luminosity-based mode)
      // barely moves a base that bright regardless of alpha, so the accent
      // was disappearing exactly where it needed to show. Direct blending
      // tints it lilac no matter how pale the pixels underneath are.
      const actx = canvas.getContext('2d');
      actx.save();
      for (const ac of o.accents) {
        const g = actx.createRadialGradient(ac.x, ac.y, 0, ac.x, ac.y, ac.r);
        g.addColorStop(0, `rgba(150,110,220,${ac.a ?? 0.30})`);
        g.addColorStop(0.6, `rgba(150,110,220,${(ac.a ?? 0.30) * 0.45})`);
        g.addColorStop(1, 'rgba(150,110,220,0)');
        actx.fillStyle = g;
        actx.beginPath(); actx.arc(ac.x, ac.y, ac.r, 0, TAU); actx.fill();
      }
      actx.restore();
    }
    return canvas;
  }

  /** Print a photograph in the same treatment: dark areas deepen to ink, light stays pale. */
  function tone(canvas, image, opts) {
    const o = Object.assign({ seed: 1, palette: 'lily', focus: 0.5, haze: 1.1, soft: 0.6, grain: 1.15, gamma: 1.15, scale: 1 }, opts);
    const w = o.width || image.naturalWidth || image.width, h = o.height || image.naturalHeight || image.height;
    canvas.width = w; canvas.height = h;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(image, 0, 0, w, h);
    const L = grey(c), s = Math.min(w, h) * o.scale;
    const Lf = blur(L, w, h, Math.max(1, Math.round(o.focus * 0.006 * s)));
    const Lh = blur(L, w, h, Math.max(1, Math.round(o.haze * 0.016 * s)));
    const T = new Float32Array(w * h);
    for (let i = 0; i < T.length; i++) T[i] = Math.pow(1 - (Lf[i] * (1 - o.soft) + Lh[i] * o.soft), 1 / o.gamma);
    compose(canvas.getContext('2d'), w, h, PALETTES[o.palette] || PALETTES.lily, T, o, mulberry32(o.seed >>> 0));
    return canvas;
  }

  root.Cyanotype = { field, print, tone, PALETTES, ramp, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
