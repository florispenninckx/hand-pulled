/* riso.js — a risograph print simulator for <canvas>.
 *
 * Model: every ink is a separate drum. You draw each drum's master in black
 * (grey = partial density) on its own offscreen canvas; print() screens each
 * master, knocks it slightly out of register, modulates it with drum mottle,
 * and overprints the inks multiplicatively onto paper — the way translucent
 * soy inks actually stack. Nothing here is random unless seeded.
 *
 *   const out = await Riso.print(canvas, {
 *     width: 900, height: 1200, seed: 7, paper: 'natural',
 *     layers: [
 *       { ink: 'blue',             draw: ctx => { ... }, screen: 'grain' },
 *       { ink: 'fluorescent-pink', draw: ctx => { ... }, screen: 'halftone', angle: 15, cell: 7 },
 *     ],
 *   });
 *
 * Original implementation. Prior art: Robpayot/risograph-grain-shader (grain
 * idea), jywarren/risoAtHome (per-ink halftone separation), p5.riso (ink table).
 */
(function (root) {
  'use strict';

  // Screen values for common Riso inks (as tabulated by p5.riso / riso studios).
  // Approximate: always check the swatch book of the shop that will print it.
  const INKS = {
    black: '#000000', 'federal-blue': '#3d5588', blue: '#0078bf',
    'medium-blue': '#3255a4', aqua: '#5ec8e5', teal: '#00838a',
    green: '#00a95c', 'hunter-green': '#407060', yellow: '#ffe800',
    sunflower: '#ffb511', orange: '#ff6c2f', 'bright-red': '#f15060',
    'fluorescent-pink': '#ff48b0', 'fluorescent-orange': '#ff7477',
    burgundy: '#914e72', purple: '#765ba7', 'flat-gold': '#bb8b41',
    'fluorescent-green': '#44d62c', brown: '#925f52', 'light-gray': '#88898a',
  };

  // Paper stocks: base tone and fibre strength.
  const PAPERS = {
    natural: { tone: '#f3eee2', fibre: 0.035 },
    white: { tone: '#f7f6f2', fibre: 0.025 },
    cream: { tone: '#efe4cc', fibre: 0.04 },
    newsprint: { tone: '#e6e1d3', fibre: 0.06 },
    kraft: { tone: '#c9a77c', fibre: 0.08 },
  };

  // ---------- seeded randomness ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Integer hash -> [0,1). Used for per-pixel grain; stateless so it is
  // identical however the loop is ordered.
  function hash2(x, y, s) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function makeNoise(rand) {
    const p = new Uint8Array(512), perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const g = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), X = xi & 255, Y = yi & 255;
      x -= xi; y -= yi;
      const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
      const n00 = g(p[a], x, y), n10 = g(p[b], x - 1, y), n01 = g(p[a + 1], x, y - 1), n11 = g(p[b + 1], x - 1, y - 1);
      return (n00 + u * (n10 - n00)) + v * ((n01 + u * (n11 - n01)) - (n00 + u * (n10 - n00)));
    };
  }
  function fbm(noise, x, y, oct) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; }
    return s;
  }
  // Low-frequency field evaluated on a coarse grid, bilinearly upsampled:
  // mottle does not need per-pixel noise calls.
  function coarseField(w, h, step, fn) {
    const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2;
    const g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * step, j * step);
    return function (x, y) {
      const fx = x / step, fy = y / step, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
      const a = g[k] + (g[k + 1] - g[k]) * tx, b = g[k + gw] + (g[k + gw + 1] - g[k + gw]) * tx;
      return a + (b - a) * ty;
    };
  }

  const hex = c => { const n = parseInt(c.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  function inkRGB(ink) {
    if (Array.isArray(ink)) return ink;
    if (INKS[ink]) return hex(INKS[ink]);
    if (typeof ink === 'string' && ink[0] === '#') return hex(ink);
    throw new Error(`riso: unknown ink "${ink}". Use one of: ${Object.keys(INKS).join(', ')} or a #hex.`);
  }

  // Render a drum master: white sheet, caller draws in black.
  function master(w, h, draw, rand) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    draw(ctx, w, h, rand);
    const d = ctx.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = 1 - (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    return out;
  }

  function sample(field, w, h, x, y) {
    // bilinear, clamped: misregistration moves by sub-pixel amounts
    if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return 0;
    const i = x | 0, j = y | 0, tx = x - i, ty = y - j, k = j * w + i;
    const a = field[k] + (field[k + 1] - field[k]) * tx, b = field[k + w] + (field[k + w + 1] - field[k + w]) * tx;
    return a + (b - a) * ty;
  }

  /**
   * print(canvas, opts) -> Promise<{ canvas, masters, seed }>
   * opts.width/height    output size in device pixels (default: canvas size)
   * opts.seed            integer; same seed, same print
   * opts.paper           key of PAPERS or { tone, fibre }
   * opts.misregister     scale of registration error, 0 = perfect (default 1)
   * opts.scale           resolution scale: grain & dots scale with it (default 1)
   * layer.ink            key of INKS, '#hex', or [r,g,b]
   * layer.draw(ctx,w,h,rand) draw the master in black
   * layer.screen         'grain' (stochastic, riso's default look) | 'halftone' | 'solid'
   * layer.angle, cell    halftone screen angle (deg) and cell size (px @ scale 1)
   * layer.density        ink density multiplier (default 1)
   */
  async function print(canvas, opts) {
    const o = Object.assign({ seed: 1, paper: 'natural', misregister: 1, scale: 1 }, opts);
    const w = o.width || canvas.width, h = o.height || canvas.height, S = o.scale;
    canvas.width = w; canvas.height = h;
    const rand = mulberry32(o.seed >>> 0);
    const noise = makeNoise(rand);
    const paper = typeof o.paper === 'string' ? PAPERS[o.paper] : o.paper;
    if (!paper) throw new Error(`riso: unknown paper "${o.paper}". Use one of: ${Object.keys(PAPERS).join(', ')}.`);
    const pt = hex(paper.tone);

    // paper fibre: faint long streaks + flecks
    const fibre = coarseField(w, h, 3 * S, (x, y) => fbm(noise, x / (180 * S), y / (14 * S), 3));

    const out = new Float32Array(w * h * 3);
    for (let p = 0, k = 0; p < w * h; p++, k += 3) {
      const x = p % w, y = (p / w) | 0;
      const f = 1 - paper.fibre * (0.5 + fibre(x, y)) - (hash2(x, y, 911) > 0.9993 ? 0.12 : 0);
      out[k] = pt[0] * f; out[k + 1] = pt[1] * f; out[k + 2] = pt[2] * f;
    }

    const masters = [];
    for (let li = 0; li < o.layers.length; li++) {
      const L = Object.assign({ screen: 'grain', angle: 15 + 30 * li, cell: 6, density: 1 }, o.layers[li]);
      const ink = inkRGB(L.ink);
      const m = master(w, h, L.draw, mulberry32((o.seed + 1013 * (li + 1)) >>> 0));
      masters.push(m);

      // registration error: every drum lands a little differently
      const R = o.misregister * S;
      const dx = (rand() * 2 - 1) * 2.4 * R, dy = (rand() * 2 - 1) * 2.4 * R;
      const rot = (rand() * 2 - 1) * 0.0022 * o.misregister, cr = Math.cos(rot), sr = Math.sin(rot);
      const cx = w / 2, cy = h / 2;

      // drum mottle: uneven ink laydown, streaked in the feed direction
      const mottle = coarseField(w, h, 6 * S, (x, y) =>
        0.7 * fbm(noise, x / (260 * S) + 31 * li, y / (260 * S), 3) + 0.3 * noise(x / (900 * S) + 7 * li, y / (22 * S)));

      const ang = (L.angle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang), cell = L.cell * S;
      const seedL = (o.seed * 131 + li * 7919) | 0;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ux = cx + (x - cx - dx) * cr - (y - cy - dy) * sr;
          const uy = cy + (x - cx - dx) * sr + (y - cy - dy) * cr;
          let d = sample(m, w, h, ux, uy);
          if (d < 0.004) continue;
          d = Math.min(1, d * L.density * (0.95 + 0.18 * mottle(x, y)));

          let c;
          if (L.screen === 'halftone') {
            // AM dot: rotate into screen space, distance to cell centre
            const sx = (x * ca + y * sa) / cell, sy = (-x * sa + y * ca) / cell;
            const fx = sx - Math.floor(sx) - 0.5, fy = sy - Math.floor(sy) - 0.5;
            const r = Math.sqrt(d) * 0.72, dist = Math.sqrt(fx * fx + fy * fy);
            c = smooth(r + 0.06, r - 0.06, dist);
          } else if (L.screen === 'solid') {
            c = d;
          } else {
            // stochastic grain: threshold against clumped noise, soft edge = ink spread
            const g = 0.6 * hash2(x, y, seedL) + 0.4 * hash2((x / 2) | 0, (y / 2) | 0, seedL + 1);
            c = smooth(g - 0.15, g + 0.15, d * 1.12);
          }
          // solids are never solid: starved specks of paper show through
          if (hash2(x, y, seedL + 2) < 0.035 * d) c *= 0.35;
          if (c <= 0) continue;
          const k = (y * w + x) * 3;
          out[k] *= 1 - c + (c * ink[0]) / 255;
          out[k + 1] *= 1 - c + (c * ink[1]) / 255;
          out[k + 2] *= 1 - c + (c * ink[2]) / 255;
        }
      }
      if (o.onLayer) await o.onLayer(li);
      else await new Promise(r => setTimeout(r, 0)); // let the page breathe between drums
    }

    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let p = 0, k = 0, q = 0; p < w * h; p++, k += 3, q += 4) {
      img.data[q] = out[k]; img.data[q + 1] = out[k + 1]; img.data[q + 2] = out[k + 2]; img.data[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas, masters, seed: o.seed };
  }

  root.Riso = { print, INKS, PAPERS, mulberry32, makeNoise, fbm, hash2 };
})(typeof window !== 'undefined' ? window : globalThis);
