/* cyanotype.js — a grain compositor for <canvas>, one indigo/violet hue family.
 *
 * Everything this file draws is the same three-step pipeline:
 *   1. build a scalar field T(x,y) in [0,1] — procedural pools of light
 *      (field), a blurred photogram mask (print), a photograph's luminance
 *      (tone), a lit relief, a halo, a marbled sheet, or any field of your own
 *      (develop);
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
 *   Cyanotype.develop(canvas, T, { palette: 'dusk' });                         // any field of your own, with grain
 *   Cyanotype.relief(canvas, { seed });                                        // pins: lit silk dunes, peach on cobalt
 *   Cyanotype.halo(canvas, { seed });                                          // pins: a cream eclipse with a fringe
 *   Cyanotype.stipple(canvas, D, { ink: 'spray' });                            // pins: ink spray, a particle orb
 *   Cyanotype.screen(canvas, L, { cell: 0.03 });                               // pins: a halftone screen under a loupe
 *   Cyanotype.marble(canvas, { kind: 'river' | 'wash' });                      // pins: marbled paper
 *   Cyanotype.caustics(w, h, seed) → Float32Array                              // pins: pool light, for develop()
 *
 * print() and tone() end in finish(): `levels` burns the highlights out and
 * `brush` leaves a hand-brushed coat with ragged edges (sun-bleached photographs).
 *
 * Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // Ramps in one hue family: white/paper through ultramarine/cobalt/violet
  // to near-black, teal at one edge and violet at the other. Cream and peach
  // appear only as light (ridge, eclipse), never as a ground. `ground` is the resting colour with no field at all;
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

    // -- light forms in the dark. These run dark → pale: t is light, not ink. --
    // a lit surface: olive-black sky, navy and cobalt flanks, peach where the light lands
    ridge: { ground: '#0e1309', stops: [[0, '#0d1209'], [0.1, '#10171c'], [0.24, '#142a5c'], [0.4, '#2250bd'], [0.54, '#3a66d9'], [0.68, '#8397d6'], [0.8, '#c9bccf'], [0.9, '#ecd1cc'], [1, '#f8e9e3']] },
    // a cream light cut out of navy by a black band; 0.8–0.9 is the thin colour fringe at its edge
    eclipse: { ground: '#03031a', stops: [[0, '#03031a'], [0.14, '#0a1446'], [0.3, '#1b3e8c'], [0.46, '#4a82cc'], [0.6, '#9cc3ec'], [0.72, '#c6d3e4'], [0.79, '#d9e3ea'], [0.83, '#bfe6d2'], [0.865, '#f1e9a6'], [0.9, '#fcf1dc'], [1, '#fffbf2']] },
    // navy dissolving into brown-black: a glow in a corner of a dark sheet
    dusk: { ground: '#0a0a0c', stops: [[0, '#0a0a0b'], [0.2, '#0c1224'], [0.42, '#11306e'], [0.64, '#1d62b0'], [0.84, '#3f9ad6'], [1, '#a6d8f0']] },
    // stipple specks, sparse → dense, on a ground of `ground`
    orb: { ground: '#02021a', stops: [[0, '#4a4aa6'], [0.3, '#5566c0'], [0.6, '#4f9ccb'], [0.85, '#72c2df'], [1, '#a4def0']] },

    // -- prints. These run pale → ink, like navy/lily/paperblue. --
    // pale butterfly on flat ultramarine
    ultramarine: { ground: '#1e3590', stops: [[0, '#e8e7df'], [0.22, '#bcc4d6'], [0.5, '#6377c2'], [0.78, '#2a40a0'], [1, '#1c328c']] },
    // blue moths printed on pale sky: the wing is the ink
    sky: { ground: '#86c0fd', stops: [[0, '#8cc4fd'], [0.28, '#63acfa'], [0.55, '#2d84e8'], [0.8, '#135fc6'], [1, '#093f96']] },
    // soft moths in teal dark water
    deepwater: { ground: '#061a30', stops: [[0, '#a9c4dc'], [0.3, '#6890b3'], [0.56, '#265a7c'], [0.8, '#0b3552'], [1, '#061a30']] },
    // pale sky over a cobalt sea
    horizon: { ground: '#0e5bbd', stops: [[0, '#e2f0f4'], [0.28, '#bcd9ee'], [0.52, '#6ea8e3'], [0.76, '#2069cb'], [1, '#0d58ba']] },
    // a photograph left too long in the sun: white highlights, saturated mid-blue, no black
    sunprint: { ground: '#f3f5f8', stops: [[0, '#f3f5f8'], [0.16, '#d4e0ef'], [0.36, '#9cb9e2'], [0.56, '#5084c6'], [0.76, '#2159aa'], [1, '#123c8e']] },
    // marbled paper: chalk-white size, cerulean and navy inks
    marble: { ground: '#f6fafb', stops: [[0, '#fbfdfd'], [0.16, '#dcedf3'], [0.36, '#a9d0e6'], [0.55, '#6fa4d0'], [0.72, '#3b76b0'], [0.87, '#245a95'], [1, '#172f6c']] },
    // ultramarine ink sprayed on paper
    spray: { ground: '#eff0f4', stops: [[0, '#eff0f4'], [0.22, '#d3d8ea'], [0.5, '#8e9fd8'], [0.76, '#3f53be'], [1, '#1b2699']] },
    // a halftone screen: pale cells, navy lattice
    screen: { ground: '#141d45', stops: [[0, '#dfe8f5'], [0.24, '#91b1e0'], [0.48, '#5475be'], [0.72, '#2d4682'], [1, '#131c44']] },
    // a cobalt poster ground with navy-black stipple
    island: { ground: '#0666b4', stops: [[0, '#4aa2e2'], [0.3, '#0d80cf'], [0.55, '#0663b3'], [0.8, '#0c3f78'], [1, '#0a1120']] },
    // a faded navy poster: light on a pool floor
    pool: { ground: '#323f62', stops: [[0, '#e3ebea'], [0.22, '#a9bccb'], [0.45, '#6a84a1'], [0.7, '#3f5177'], [1, '#2b3555']] },
  };
  const pal = p => (p && typeof p === 'object') ? p : (PALETTES[p] || PALETTES.cobalt);

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
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), X = xi & 255, Y = yi & 255; x -= xi; y -= yi;
      const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
      const n0 = g(p[a], x, y) + u * (g(p[b], x - 1, y) - g(p[a], x, y));
      const n1 = g(p[a + 1], x, y - 1) + u * (g(p[b + 1], x - 1, y - 1) - g(p[a + 1], x, y - 1));
      return n0 + v * (n1 - n0);
    };
    n.perm = p;                    // the table itself, so live.js can run the same noise on the GPU
    return n;
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
  // `ry` defaults to `r`; a different vertical radius gives a directional smear (0 skips that axis).
  function blur(src, w, h, r, ry) {
    if (ry == null) ry = r;
    r = Math.round(r); ry = Math.round(ry);
    if (r < 1 && ry < 1) return src;
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    for (let pass = 0; pass < 3; pass++) {
      if (r >= 1) {
      for (let y = 0; y < h; y++) {
        let acc = 0; const row = y * w;
        for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          b[row + x] = acc / (2 * r + 1);
          acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      [a, b] = [b, a];
      }
      if (ry >= 1) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -ry; y <= ry; y++) acc += a[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
          b[y * w + x] = acc / (2 * ry + 1);
          acc += a[Math.min(h - 1, y + ry + 1) * w + x] - a[Math.max(0, y - ry) * w + x];
        }
      }
      [a, b] = [b, a];
      }
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
    // live.js passes `capture`: hand over the finished field instead of painting it, so the GPU
    // runs this same step per frame (the grain below, ported to GLSL, with the same hashes)
    if (o.capture) { o.capture({ w, h, T, pal, rand, o }); return; }
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
    compose(canvas.getContext('2d'), w, h, pal(o.palette), T, o, mulberry32((o.seed * 17 + 3) >>> 0));
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
   *             in front) in grey. A layer's smear: [sx, sy] (fractions of the
   *             short side) is a directional blur first: a wing that moved
   *   bg        optional: an ink density behind the subject, independent of the
   *             mask. Positive: { from, to } is a wash from ink at `from` to paper
   *             at `to` (fractions of width), or a function (u, v) → 0..1 of the
   *             fractional position (pin: ink dense on one side, dissolving into
   *             paper). Negative: a function only; the ground takes its density
   *             and the subject stays pale over it (pin: sky over a sea horizon)
   *   levels, brush  see finish()
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
    function blendedB(objectsFn, focus, haze, soft, offset, smear) {
      let L0 = maskLayer(objectsFn, offset);
      // smear [sx, sy]: a directional blur before the lens blur — a wing that moved, a long exposure
      if (smear) L0 = blur(L0, w, h, (smear[0] || 0) * s, (smear[1] || 0) * s);
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
        const { L0, out } = blendedB(layer.objects, layer.focus ?? o.focus, layer.haze ?? o.haze, layer.soft ?? o.soft, idx * 13, layer.smear);
        if (layer.mode === 'multiply') for (let i = 0; i < B.length; i++) B[i] *= out[i];
        else for (let i = 0; i < B.length; i++) {
          B[i] = 1 - (1 - B[i]) * (1 - out[i]);
          if (L0[i] > B0[i]) B0[i] = L0[i];
        }
      });
    } else {
      const r = blendedB(o.objects, o.focus, o.haze, o.soft, 0, o.smear);
      B0 = r.L0; B = r.out;
    }

    const T = new Float32Array(w * h);
    for (let i = 0; i < T.length; i++) T[i] = o.polarity === 'positive' ? B[i] : 1 - B[i];
    if (o.polarity !== 'positive' && typeof o.bg === 'function') {
      // a negative print over a ground that is not flat ink: the ground's density is
      // bg(u, v), and what the objects shaded stays pale on top of it
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) T[y * w + x] *= clamp01(o.bg(x / w, y / h));
    }
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
    finish(T, w, h, o);
    compose(canvas.getContext('2d'), w, h, pal(o.palette || 'navy'), T, Object.assign({}, o, { edge }), mulberry32((o.seed * 53 + 9) >>> 0));

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
    finish(T, w, h, o);
    compose(canvas.getContext('2d'), w, h, pal(o.palette || 'lily'), T, o, mulberry32(o.seed >>> 0));
    return canvas;
  }

  /**
   * The two last steps of a sun print, shared by print() and tone():
   *   levels  [lo, hi]: T below lo prints as bare paper, above hi as full ink.
   *           [0.15, 0.9] is the sun-bleached look: highlights burn out, no true black.
   *   brush   margin as a fraction of the short side: the sensitiser was brushed on
   *           by hand, so outside a ragged, streaky rectangle the paper stays paper
   *           (pins: the brushed edges of sun-printed photographs).
   */
  function finish(T, w, h, o) {
    if (o.levels) {
      const lo = o.levels[0], k = 1 / Math.max(1e-3, o.levels[1] - lo);
      for (let i = 0; i < T.length; i++) T[i] = clamp01((T[i] - lo) * k);
    }
    if (o.brush) {
      const cov = brushMask(w, h, (o.seed | 0) + 4242, o.brush);
      for (let i = 0; i < T.length; i++) T[i] *= cov[i];
    }
  }

  /**
   * Coverage 0..1 of a hand-brushed coat: a rectangle inset by `margin` of the short
   * side whose edges are torn up by bristle streaks. Strokes run across the sheet, so
   * the streaks are long horizontally and fine vertically, and the left and right ends
   * of the coat are the raggedest.
   */
  function brushMask(w, h, seed, margin) {
    const rand = mulberry32(seed >>> 0), n = makeNoise(rand), s = Math.min(w, h), m = margin * s;
    const out = new Float32Array(w * h), soft = Math.max(1, 0.005 * s);
    const blot = coarse(w, h, 4, (x, y) => fbm(n, x / (0.09 * s) + 11, y / (0.09 * s) + 5, 3));
    for (let y = 0; y < h; y++) {
      // each band of stroke ends where it ends: the side margins wander per stroke
      const band = n(3.1, y / (0.07 * s)) * 0.9 + n(7.7, y / (0.025 * s)) * 0.3;
      for (let x = 0; x < w; x++) {
        const bristle = n(x / (0.3 * s) + 40, y / (0.011 * s) + 40) + 0.45 * n(x / (0.09 * s) + 90, y / (0.0045 * s));
        const side = Math.min(x, w - 1 - x) - m * (1 + 0.55 * band) + bristle * m * 0.45;
        const top = Math.min(y, h - 1 - y) - m * 0.8 + (blot(x, y) * 0.9 + bristle * 0.25) * m;
        const d = Math.min(side, top);
        out[y * w + x] = clamp01(d / soft) * clamp01(0.86 + 0.3 * bristle + 0.4 * clamp01(d / (m * 1.5)));
      }
    }
    return out;
  }

  /** develop(canvas, T, opts): run your own density field (Float32Array w*h, 0..1) through a ramp with grain. */
  function develop(canvas, T, opts) {
    const o = Object.assign({ seed: 1, palette: 'cobalt', grain: 1 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    canvas.width = w; canvas.height = h;
    finish(T, w, h, o);
    compose(canvas.getContext('2d'), w, h, pal(o.palette), T, o, mulberry32((o.seed * 29 + 5) >>> 0));
    return canvas;
  }

  const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  /** Swells for relief(): one long crest with humps, one broad wave, one low near swell. */
  function autoSwells(rand) {
    const j = (a, b) => a + rand() * (b - a), right = rand() < 0.5;
    const cx = right ? j(0.62, 0.8) : j(0.2, 0.38);
    return [
      { x: cx, dx: (right ? 1 : -1) * j(0.05, 0.18), z: j(0.42, 0.6), wx: j(0.11, 0.16), wz: j(0.3, 0.45), amp: j(0.24, 0.32), humps: j(2.6, 3.6), rip: j(0.3, 0.42) },
      { x: right ? j(0.05, 0.3) : j(0.7, 0.95), dx: j(-0.1, 0.1), z: j(0.45, 0.7), wx: j(0.2, 0.3), wz: j(0.16, 0.24), amp: j(0.16, 0.24), humps: 0, rip: 0 },
      { x: j(0.3, 0.7), dx: 0, z: j(0.04, 0.14), wx: j(0.26, 0.4), wz: j(0.08, 0.12), amp: j(0.05, 0.1), humps: 0, rip: 0 },
    ];
  }

  /**
   * relief(canvas, opts) — a lit surface fading into the dark (pins: the silk-dune
   * gradients, peach light on cobalt under an olive-black sky). A height field is
   * raised in front of the viewer and scanned column by column from the near edge
   * back, each depth row drawn only where it rises above everything nearer (the
   * old voxel-landscape trick). Every row leaves a hairline at its top edge, which
   * is where the fine stacked-contour texture on the flanks comes from; depth of
   * field blurs the near and far rows, and the far rows go to black.
   *   swells   [{ x, dx, z, wx, wz, amp, humps, rip }] in frame units; default autoSwells
   *   horizon  where the far edge sits, fraction of the height (default 0.2)
   *   light    [x, depth, up] key light direction (default front-left, low)
   *   lines    strength of the row hairlines (default 1)
   *   focus    depth (0 near … 1 far) that is sharp (default 0.45)
   *   warm     how far the light low in the frame climbs into the peach (default 0.2)
   */
  function relief(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'ridge', grain: 0.8, horizon: 0.2, lines: 1, focus: 0.45, dof: 1, light: [-0.62, -0.62, 0.48], lift: 0.9, warm: 0.2 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    canvas.width = w; canvas.height = h;
    const rand = mulberry32(o.seed >>> 0), n = makeNoise(rand), s = Math.min(w, h);
    const sw = (o.swells || autoSwells(rand)).map(q => Object.assign({ ph: rand() * TAU }, q));
    const aspect = w / h;
    const Hf = (X, Z) => {
      let v = 0.035 * n(X * 2.2 * aspect + 9, Z * 2.6 + 3);
      for (const q of sw) {
        const ex = (X - q.x - q.dx * Z) * aspect, ez = Z - q.z;
        const g = Math.exp(-ex * ex / (2 * q.wx * q.wx) - ez * ez / (2 * q.wz * q.wz));
        v += q.amp * g * (1 + q.rip * Math.sin(q.humps * Z * TAU + q.ph));
      }
      return v;
    };
    const K = Math.round(h / 2.3), yb = Z => h * (1.03 - (1.03 - o.horizon) * Math.pow(Z, 0.85));
    const lift = Z => h * o.lift * (1 - 0.4 * Z);
    // height grid over (column, row) so normals are cheap
    const G = new Float32Array(K * w);
    for (let k = 0; k < K; k++) { const Z = k / (K - 1); for (let x = 0; x < w; x++) G[k * w + x] = Hf(x / w, Z); }
    let L = o.light; { const d = Math.hypot(L[0], L[1], L[2]); L = [L[0] / d, L[1] / d, L[2] / d]; }
    const T = new Float32Array(w * h), Zb = new Float32Array(w * h).fill(1);
    const dX = 1 / w, dZ = 1 / (K - 1), depthPx = h * 1.8;
    for (let x = 0; x < w; x++) {
      let ymin = h;
      for (let k = 0; k < K; k++) {
        const Z = k * dZ, H = G[k * w + x];
        const y = yb(Z) - H * lift(Z);
        if (y >= ymin) continue;
        // normal of the surface (x right, z away, up), light, and a rim toward the viewer
        const hx = (G[k * w + Math.min(w - 1, x + 1)] - G[k * w + Math.max(0, x - 1)]) / (2 * dX) * (h * o.lift) / w;
        const hz = (G[Math.min(K - 1, k + 1) * w + x] - G[Math.max(0, k - 1) * w + x]) / (2 * dZ) * (h * o.lift) / depthPx;
        const nl = Math.hypot(hx, hz, 1), nx = -hx / nl, nz = -hz / nl, nu = 1 / nl;
        const diff = Math.max(0, nx * L[0] + nz * L[1] + nu * L[2]);
        const facing = Math.max(0, -nz * 0.8 + nu * 0.6);
        const rim = Math.pow(1 - facing, 3) * 0.35;
        let t = 0.25 + 0.56 * Math.pow(diff, 1.9) + rim * (0.3 + diff) * 0.7;
        t = t * (1 - smooth(0.5, 1, Z) * 0.92) + 0.03 * smooth(0.5, 1, Z);     // far rows go to black
        const y0 = Math.max(0, Math.ceil(y)), y1 = Math.min(h - 1, Math.floor(ymin - 1e-6));
        const band = ymin - y;
        for (let py = y0; py <= y1; py++) {
          const i = py * w + x, fromTop = py - y;
          const hair = band > 2.2 && fromTop < 1 ? o.lines * 0.16 * (1 - fromTop) * (0.35 + (1 - diff)) : 0;
          const warm = o.warm * smooth(0.35, 1.1, (1 - x / w) * 0.55 + (py / h) * 0.75) * diff;   // peach only low in the light
          T[i] = clamp01(t + warm - hair); Zb[i] = Z;
        }
        ymin = y;
      }
      for (let py = 0; py < Math.min(h, Math.ceil(ymin)); py++) T[py * w + x] = 0.02 + 0.03 * (py / h);
    }
    if (o.dof) {
      const Tb = blur(T, w, h, 0.016 * s * o.dof);
      for (let i = 0; i < T.length; i++) {
        const d = Math.min(1, Math.abs(Zb[i] - o.focus) * 1.7), a = d * d * (3 - 2 * d);
        T[i] = T[i] * (1 - a) + Tb[i] * a;
      }
    }
    compose(canvas.getContext('2d'), w, h, pal(o.palette), T, o, mulberry32((o.seed * 41 + 13) >>> 0));
    return canvas;
  }

  /**
   * halo(canvas, opts) — one cream light pressing in from the edge, a thin colour
   * fringe where it ends, then a black band, then pale again beyond it (pin: the
   * eclipse / light-leak gradient). Runs on the dark → pale `eclipse` ramp.
   *   x, y     centre of the light, fractions of the frame (default just off the left edge)
   *   r        radius, fraction of the frame height (default 0.42)
   *   angle    which way the light points (default 0: to the right)
   *   point    how much it narrows toward its tip, 0..1 (default 0.55)
   */
  function halo(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'eclipse', grain: 1.1, x: -0.16, y: 0.38, r: 0.42, angle: 0.12, point: 0.55, warp: 1 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    canvas.width = w; canvas.height = h;
    const rand = mulberry32(o.seed >>> 0), n = makeNoise(rand), R = o.r * h, cx = o.x * w, cy = o.y * h;
    const ca = Math.cos(o.angle), sa = Math.sin(o.angle), s = Math.min(w, h);
    const hf = coarse(w, h, 3, (x, y) => {
      const wx = x + n(x / (0.5 * s) + 3, y / (0.5 * s)) * 0.08 * R * o.warp, wy = y + n(x / (0.5 * s), y / (0.5 * s) + 7) * 0.08 * R * o.warp;
      const dx = (wx - cx) * ca + (wy - cy) * sa, dy = -(wx - cx) * sa + (wy - cy) * ca;
      const k = 1 + o.point * clamp01(dx / R) * 1.2;
      const u = Math.hypot(dx, dy * k) / R;
      const core = u <= 1 ? 1 - 0.08 * Math.pow(u, 6) : 0.7 * Math.exp(-Math.pow((u - 1) / 0.36, 1.5));
      const edge = u <= 1 ? 0 : clamp01(1 - (u - 1) / 0.1) * 0.24;          // a short steep ramp: the fringe lives on it
      // beyond the dark band the frame lightens again, most toward the far lower corner
      const far = smooth(1.5, 2.5, u), low = smooth(0.35, 1.0, y / h + 0.25 * (x / w - 0.5));
      const outer = far * (0.16 + 0.58 * low) + 0.05 * n(x / (0.3 * s) + 20, y / (0.3 * s));
      return Math.max(core + edge, outer);
    });
    const T = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) T[y * w + x] = clamp01(hf(x, y));
    compose(canvas.getContext('2d'), w, h, pal(o.palette), T, o, mulberry32((o.seed * 43 + 1) >>> 0));
    return canvas;
  }

  /**
   * stipple(canvas, D, opts) — lay specks over what is already on the canvas, one
   * speck per pixel, per 2×2 or as a round 3–5 px dot, with probability rising with
   * the density D (Float32Array w*h or (x, y) → 0..1). A speck takes its colour from
   * `ink`, a ramp read at the local density, so sparse specks and dense ones differ.
   * Nothing is drawn as a vector: this is spray, not a pattern (pins: ink spray on
   * paper, a particle orb, stippled islands).
   *   ink    palette for specks (default 'spray'); `lo`,`hi` = where on it to read
   *   sizes  [fine, 2×2, dot] rates (default [0.55, 0.3, 0.12])
   *   ground optional palette: first develops D itself onto the canvas as a soft wash
   */
  function stipple(canvas, D, opts) {
    const o = Object.assign({ seed: 1, ink: 'spray', lo: 0.45, hi: 1, sizes: [0.55, 0.3, 0.12], gamma: 1 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    const get = typeof D === 'function' ? D : (x, y) => D[y * w + x];
    if (o.ground) {
      const G = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) G[y * w + x] = clamp01(get(x, y) * (o.wash == null ? 0.35 : o.wash));
      develop(canvas, G, { width: w, height: h, seed: o.seed, palette: o.ground, grain: o.groundGrain == null ? 0.6 : o.groundGrain });
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h), px = img.data, P = pal(o.ink), sd = o.seed | 0;
    const [a1, a2, a3] = o.sizes, cell = 4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.pow(clamp01(get(x, y)), o.gamma);
      if (d <= 0) continue;
      let hit = hash2(x, y, sd) < d * a1 || hash2(x >> 1, y >> 1, sd + 17) < d * d * a2;
      if (!hit && a3) {
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        if (hash2(cx, cy, sd + 29) < d * d * d * a3) {
          const ox = cx * cell + 0.5 + hash2(cx, cy, sd + 31) * (cell - 1), oy = cy * cell + 0.5 + hash2(cx, cy, sd + 37) * (cell - 1);
          const r = 0.9 + 1.2 * hash2(cx, cy, sd + 41);
          hit = (x + 0.5 - ox) ** 2 + (y + 0.5 - oy) ** 2 < r * r;
        }
      }
      if (!hit) continue;
      const c = ramp(P, o.lo + (o.hi - o.lo) * clamp01(d * 0.75 + 0.35 * (hash2(x, y, sd + 53) - 0.3)));
      const k = (y * w + x) * 4;
      px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2];
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /**
   * screen(canvas, L, opts) — a coarse halftone screen over a soft image, the way a
   * printed photograph looks under a loupe (pin: the bulging navy lattice). L is
   * brightness 0..1 per pixel. Each cell of a rotated grid holds one pale rounded
   * square whose size follows L; the grid itself is bent by a slow warp so it reads
   * as a screen on a curved sheet, not a CSS pattern.
   *   cell   cell size, fraction of the short side (default 0.014)
   *   angle  screen angle (default 0.3 rad); warp (default 1); round 2 (circle) … 6 (square)
   */
  function screen(canvas, L, opts) {
    const o = Object.assign({ seed: 1, palette: 'screen', grain: 0.55, cell: 0.026, angle: 0.3, warp: 1, round: 3.4 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    canvas.width = w; canvas.height = h;
    const rand = mulberry32(o.seed >>> 0), n = makeNoise(rand), s = Math.min(w, h), c = Math.max(4, o.cell * s);
    const ca = Math.cos(o.angle), sa = Math.sin(o.angle), A = c * 2.2 * o.warp, P = o.round;
    const wx = coarse(w, h, 6, (x, y) => fbm(n, x / (0.3 * s) + 5, y / (0.3 * s) + 1, 2) * A);
    const wy = coarse(w, h, 6, (x, y) => fbm(n, x / (0.3 * s) + 31, y / (0.3 * s) + 17, 2) * A);
    const T = new Float32Array(w * h), e = 0.07;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x + wx(x, y), Y = y + wy(x, y);
      const u = (X * ca + Y * sa) / c, v = (-X * sa + Y * ca) / c;
      const fu = Math.abs(u - Math.round(u)) * 2, fv = Math.abs(v - Math.round(v)) * 2;   // 0 at the cell centre, 1 at its edge
      const q = Math.pow(Math.pow(fu, P) + Math.pow(fv, P), 1 / P);
      const l = clamp01(L[y * w + x]);
      const r = 0.34 + 0.62 * Math.sqrt(l);                     // brighter → bigger pale cell, thinner lattice
      const inCell = smooth(r + e, r - e, q);
      const pale = 0.25 + 0.75 * l, dark = 0.06 + 0.2 * l;
      T[y * w + x] = 1 - (inCell * pale * (1 - 0.3 * q * q) + (1 - inCell) * dark);
    }
    const Tb = blur(T, w, h, Math.max(1, c * 0.08));
    compose(canvas.getContext('2d'), w, h, pal(o.palette), Tb, o, mulberry32((o.seed * 47 + 3) >>> 0));
    return canvas;
  }

  /** F2 − F1 of a jittered point grid at (u, v): 0 on a cell border, larger inside. */
  function cellGap(u, v, seed) {
    const iu = Math.floor(u), iv = Math.floor(v);
    let f1 = 9, f2 = 9;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const gx = iu + a, gy = iv + b;
      const dx = gx + 0.1 + 0.8 * hash2(gx, gy, seed) - u, dy = gy + 0.1 + 0.8 * hash2(gx, gy, seed + 3) - v;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
  }

  /**
   * Two marbling recipes after the tray. 'river': pale size, a few big deep drops
   * that the comb and wave pull into a navy river, ring stacks, a sprinkle of pale
   * stones, dark stones last with a pale ring so they stay round. 'wash': a mid-blue
   * size, broad drops of deep and pale, a fine comb down the tray and a slow shear
   * across it, so the sheet reads as streaked bands of wash.
   */
  function autoMarble(w, h, rand, kind) {
    const s = Math.min(w, h), j = (a, b) => a + rand() * (b - a), ops = [], pick = a => a[(rand() * a.length) | 0];
    const deep = [0.97, 0.88, 0.78], mid = [0.6, 0.5, 0.4], pale = [0.22, 0.14, 0.06, 0.0];
    const drop = (x, y, r, t, rim) => ops.push({ type: 'drop', x, y, r, t, rim });
    const area = (w * h) / (s * s * 1.6);
    if (kind === 'wash') {
      for (let k = 0; k < 10; k++) drop(j(-0.1, 1.1) * w, j(-0.1, 1.1) * h, j(0.08, 0.2) * s, k % 2 === 0 ? pick(pale) : k % 4 === 1 ? pick(deep) : pick(mid), 1);
      for (let k = 0; k < Math.round(50 * area); k++) drop(j(-0.05, 1.05) * w, j(-0.05, 1.05) * h, j(0.01, 0.045) * s, rand() < 0.75 ? 0 : pick(deep), 1.4);
      ops.push({ type: 'shear', nx: 1, ny: 0, mx: 0, my: 1, len: j(0.12, 0.18) * s, amp: j(0.5, 0.7) * s, k: rand() * 99 });    // streaks down
      ops.push({ type: 'shear', nx: 0, ny: 1, mx: 1, my: 0, len: j(0.35, 0.5) * s, amp: j(0.14, 0.22) * s, k: rand() * 99 });   // bands across
      ops.push({ type: 'comb', nx: 1, ny: 0, mx: 0, my: 1, sp: j(0.03, 0.05) * s, amp: j(0.02, 0.035) * s, sharp: 0.01 * s, off: rand() * s });
      for (let k = 0; k < 5; k++) drop(j(0.05, 0.95) * w, j(0.05, 0.95) * h, j(0.004, 0.012) * s, 0.98, 0.4);
      return { ops, ground: 0.4 };
    }
    for (let k = 0; k < 3; k++) drop(j(0.1, 0.9) * w, j(0, 1) * h, j(0.12, 0.2) * s, k === 1 ? pick(mid) : pick(deep), 1);
    for (let k = 0; k < 2; k++) {                                // drops on one spot become rings
      const x = j(0, 1) * w, y = j(0, 1) * h, r = j(0.05, 0.09) * s, m = 3 + (rand() * 3 | 0);
      for (let i = 0; i < m; i++) drop(x, y, r * j(0.6, 1), i % 2 ? pick(pale) : pick(mid), 1);
    }
    for (let k = 0; k < Math.round(50 * area); k++) drop(j(-0.05, 1.05) * w, j(-0.05, 1.05) * h, j(0.01, 0.035) * s, rand() < 0.8 ? pick(pale) : pick(mid), 1.5);
    const a1 = Math.PI / 2 + j(-0.3, 0.3);                     // a wide comb dragged slowly down the tray
    ops.push({ type: 'comb', nx: Math.cos(a1 - Math.PI / 2), ny: Math.sin(a1 - Math.PI / 2), mx: Math.cos(a1), my: Math.sin(a1), sp: j(0.28, 0.4) * s, amp: j(0.12, 0.2) * s, sharp: j(0.06, 0.1) * s, off: rand() * s });
    ops.push({ type: 'shear', nx: 1, ny: 0, mx: 0, my: 1, len: j(0.25, 0.35) * s, amp: j(0.7, 1) * s, k: rand() * 99 });
    ops.push({ type: 'shear', nx: 0, ny: 1, mx: 1, my: 0, len: j(0.4, 0.6) * s, amp: j(0.25, 0.35) * s, k: rand() * 99 });
    ops.push({ type: 'swirl', x: j(0.25, 0.75) * w, y: j(0.25, 0.75) * h, r: j(0.12, 0.25) * s, turn: j(-2, 2) });
    for (let k = 0; k < 3; k++) {                                 // a dark stone with the pale ring it pushes open
      const x = j(0.1, 0.9) * w, y = j(0.15, 0.9) * h, r = j(0.02, 0.05) * s;
      drop(x, y, r * j(1.3, 1.6), pick(pale), 0.3); drop(x, y, r, 0.98, 0.6);
    }
    ops.push({ type: 'wave', nx: 1, ny: 0, mx: 0, my: 1, len: j(0.25, 0.45) * s, amp: j(0.012, 0.025) * s, ph: rand() * TAU });
    return { ops, ground: 0.13 };
  }

  /**
   * marble(canvas, opts) — marbled paper, computed backwards: for every pixel the
   * operations are undone in reverse order until the point lands inside a drop (or
   * on the bare size). A drop pushes all earlier ink outward by the area it
   * takes; a comb drags ink along its tines, most at the tine; a wave shears it; a
   * swirl turns it. Every step is exactly invertible. The texture of the ink (a
   * lace of fine cells, a slow wash, granulation, pigment piled at a drop's rim) is
   * read where the point landed, before any of the moves, so the combing drags the
   * lace into veins with the ink. At the end the pigment bleeds a little into the
   * wet paper (pins: blue marbling in streaked washes, a navy river through lace).
   *   kind   'river' (default) or 'wash': which autoMarble recipe
   *   ops    [{type:'drop',x,y,r,t,rim} | {type:'comb',nx,ny,mx,my,sp,amp,sharp,off}
   *          | {type:'wave',nx,ny,mx,my,len,amp,ph} | {type:'shear',nx,ny,mx,my,len,amp,k}
   *          | {type:'swirl',x,y,r,turn}] in px; a shear moves ink along m by a noise
   *          profile across n, so it pulls streaks without ever folding
   *   ground ink density of the bare size (default from the recipe)
   *   lace   strength of the cell lace (default 0.22); wash (default 0.18); bleed (default 0.35)
   *   res    the field is solved on a grid this many px on its long side (default 820)
   *          and interpolated up; grain is added at full size
   */
  function marble(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'marble', grain: 0.6, rim: 0.12, granulate: 0.05, lace: 0.22, wash: 0.18, bleed: 0.35, res: 820 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height;
    canvas.width = w; canvas.height = h;
    const rand = mulberry32(o.seed >>> 0), n = makeNoise(rand), s = Math.min(w, h);
    const rec = o.ops ? { ops: o.ops, ground: 0.07 } : autoMarble(w, h, rand, o.kind);
    const ops = rec.ops, ground = o.ground == null ? rec.ground : o.ground;
    const k = Math.min(1, o.res / Math.max(w, h)), gw = Math.ceil(w * k) + 1, gh = Math.ceil(h * k) + 1;
    const G = new Float32Array(gw * gh), no = ops.length, gs = 0.012 * s, ls = 0.022 * s, ws = 0.22 * s, sd = o.seed | 0;
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let px = gx / k, py = gy / k, t = ground, rim = 0, hit = -1;
      for (let i = no - 1; i >= 0; i--) {
        const op = ops[i];
        if (op.type === 'drop') {
          const dx = px - op.x, dy = py - op.y, d2 = dx * dx + dy * dy, r2 = op.r * op.r;
          if (d2 < r2) { t = op.t; rim = (op.rim || 0) * smooth(0.75, 1, Math.sqrt(d2 / r2)); hit = i; break; }
          const f = Math.sqrt(1 - r2 / d2); px = op.x + dx * f; py = op.y + dy * f;
        } else if (op.type === 'comb') {
          const p = px * op.nx + py * op.ny - (op.off || 0), d = Math.abs(p - Math.round(p / op.sp) * op.sp);
          const z = op.amp * op.sharp / (d + op.sharp);
          px -= op.mx * z; py -= op.my * z;
        } else if (op.type === 'wave') {
          const z = op.amp * Math.sin((px * op.nx + py * op.ny) / op.len * TAU + op.ph);
          px -= op.mx * z; py -= op.my * z;
        } else if (op.type === 'shear') {
          const p = (px * op.nx + py * op.ny) / op.len, z = op.amp * fbm(n, p + op.k, op.k * 0.37, 2);
          px -= op.mx * z; py -= op.my * z;
        } else if (op.type === 'swirl') {
          const dx = px - op.x, dy = py - op.y, a = -op.turn * Math.exp(-Math.hypot(dx, dy) / op.r);
          const c = Math.cos(a), sn = Math.sin(a);
          px = op.x + dx * c - dy * sn; py = op.y + dx * sn + dy * c;
        }
      }
      // texture in the ink's own coordinates: lace lines (darker on pale ink, paler on deep),
      // a slow wash, granulation, and pigment piled at the rim
      const lace = Math.max(Math.exp(-cellGap(px / ls, py / ls, sd + hit * 7) / 0.1), 0.7 * Math.exp(-cellGap(px / (ls * 0.45), py / (ls * 0.45), sd + hit * 7 + 1) / 0.08))
        * (0.45 + 0.55 * smooth(-0.3, 0.4, n(px / (0.12 * s) + 3, py / (0.12 * s))));
      const wash = fbm(n, px / ws + hit * 1.7, py / ws, 3);
      const g = fbm(n, px / gs + 11, py / gs, 2);
      const sign = t > 0.6 ? -0.6 : 1;
      G[gy * gw + gx] = clamp01(t + sign * (o.lace * lace + o.rim * rim) + o.wash * wash * (0.5 + t) + o.granulate * g * (0.4 + t));
    }
    let T = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = x * k, fy = y * k, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, q = j * gw + i;
      const a = G[q] + (G[q + 1] - G[q]) * tx, b = G[q + gw] + (G[q + gw + 1] - G[q + gw]) * tx;
      T[y * w + x] = a + (b - a) * ty;
    }
    if (o.bleed) {                                                // wet pigment spreads a little past every edge
      const B = blur(T, w, h, 0.012 * s), E = blur(T, w, h, Math.max(1, 0.0012 * s));
      for (let i = 0; i < T.length; i++) T[i] = E[i] * (1 - o.bleed) + Math.max(E[i], B[i]) * o.bleed;
    }
    compose(canvas.getContext('2d'), w, h, pal(o.palette), T, o, mulberry32((o.seed * 59 + 7) >>> 0));
    return canvas;
  }

  /**
   * caustics(w, h, seed, opts) → Float32Array 0..1: the bright net that sunlight
   * through ripples throws on a pool floor. It is the gap between the nearest and
   * second-nearest of a jittered set of points (F2 − F1), bright where the gap
   * closes, on a warped and vertically squashed plane (the floor seen at an angle).
   * One such web alone reads as cobblestones, so two are laid over each other at
   * different sizes and angles, and the line width and brightness drift across the
   * floor: thin hard filaments in one place, broad soft ones in the next.
   * Feed it to develop() or print() through a mask (pin: the pool-light band).
   *   cell    fraction of the short side (default 0.09)
   *   squash  vertical squash (default 0.6)
   *   warp    domain warp strength (default 1)
   *   width   line width in cell units (default 0.16)
   *   second  brightness of the second, finer web, 0..1 (default 0.6)
   */
  function caustics(w, h, seed, opts) {
    const o = Object.assign({ cell: 0.09, squash: 0.6, warp: 1, width: 0.16, second: 0.6 }, opts);
    const rand = mulberry32(seed >>> 0), n = makeNoise(rand), s = Math.min(w, h), c = o.cell * s;
    const out = new Float32Array(w * h);
    function web(u, v, sd) {
      const iu = Math.floor(u), iv = Math.floor(v);
      let f1 = 9, f2 = 9;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const gx = iu + a, gy = iv + b;
        const dx = gx + 0.1 + 0.8 * hash2(gx, gy, sd) - u, dy = gy + 0.1 + 0.8 * hash2(gx, gy, sd + 3) - v;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      return f2 - f1;
    }
    const ws = 0.35 * s, ca = Math.cos(0.7), sa = Math.sin(0.7);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = x + fbm(n, x / ws, y / ws + 4, 2) * c * 0.9 * o.warp;
      const wy = y + fbm(n, x / ws + 9, y / ws, 2) * c * 0.9 * o.warp;
      const lw = o.width * (0.55 + 0.9 * (0.5 + 0.5 * n(x / (0.3 * s) + 21, y / (0.3 * s))));
      const A = Math.exp(-web(wx / c, wy / (c * o.squash), seed) / lw);
      const rx = (wx * ca - wy * sa) / (c * 0.62), ry = (wx * sa + wy * ca) / (c * 0.62 * o.squash);
      const Bw = Math.exp(-web(rx, ry, seed + 17) / (lw * 0.8)) * o.second;
      const gain = 0.6 + 0.4 * (0.5 + 0.5 * n(x / (0.45 * s) + 33, y / (0.45 * s) + 7));
      out[y * w + x] = (1 - (1 - A) * (1 - Bw)) * gain;
    }
    return out;
  }

  root.Cyanotype = { field, print, tone, develop, relief, halo, stipple, screen, marble, caustics, blur, brushMask, PALETTES, ramp, mulberry32, noise: makeNoise, fbm, hash2, autoPools, compose };
})(typeof window !== 'undefined' ? window : globalThis);
