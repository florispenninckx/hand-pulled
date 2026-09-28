/* surface.js — abstract textures for <canvas>: a colour field seen through a pane.
 *
 *   Surface.reeded(canvas, { width, height, seed, palette: 'ember' });  // colour behind fluted glass
 *   Surface.satin(canvas,  { width, height, seed, palette: 'mint' });   // warped marbling, lit like silk
 *   Surface.aurora(canvas, { width, height, seed, palette: 'veil' });   // a curtain, halo or plume of light
 *   Surface.streak(canvas, { width, height, seed, palette: 'coral' });  // rows dragged along and torn
 *   Surface.bloom(canvas,  { width, height, seed, palette: 'lilac' });  // flowers moving past an open shutter
 *   Surface.coordinate(canvas, { width, height, seed });                // dithered orbs and a flare on grey stock
 *   Surface.glass(canvas, panes, { seed });                             // any canvas through any panes
 *   Surface.words('streak', { palette: 'signal' });                     // the words a plate prints, for its aria-label
 *
 * Every plate also takes `image` (a photograph that becomes the field), `panes` (replaces the
 * plate's panes: [] shows the bare field, ['reed'] one pane with the plate's own settings),
 * `grain` (a multiplier on the grain) and `text` (the poster's words; false for none).
 * Each returns a Promise of the canvas. Output is deterministic per seed.
 *
 * Model. A plate is two things: a FIELD, which is the colour, and PANES, which are the surface
 * you see it through. The field is soft, so it is computed in floating point at a third of the
 * size and scaled up. The panes act afterwards, at full resolution, on the scaled-up pixels:
 * fluted glass that refracts each strip, rows dragged by a running average, blocks torn out of
 * place, a halftone screen, grain, dust. Small type goes on last and stays crisp, because a
 * rough surface under clean type is the whole look.
 *
 * No WebGL, no ctx.filter, no dependencies. Original implementation.
 */
(function (root) {
  'use strict';
  const SW = 1000, RATIO = 16 / 9, TAU = Math.PI * 2;

  // ---- numbers ---------------------------------------------------------------
  function rng(seed) {
    let s = (seed | 0) + 0x6d2b79f5;
    return function () {
      s = (s + 0x9e3779b9) | 0;
      let z = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
    };
  }
  // Stateless per-pixel hash, so grain is the same however a loop is ordered.
  function hashU(x, y, s) {
    let h = Math.imul((x | 0) ^ 0x632be5ab, 0x85ebca6b) ^ Math.imul(s | 0, 0x27d4eb2f);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) + Math.imul(y | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const hash = (x, y, s) => hashU(x, y, s) / 4294967296;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // Gradient noise on a seeded lattice of unit vectors, quintic fade, roughly -1..1.
  function makeNoise(rand) {
    const P = new Uint16Array(512), GX = new Float32Array(256), GY = new Float32Array(256);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
    for (let i = 0; i < 256; i++) { const a = rand() * TAU; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
    const f = function (x, y) {
      const fx = Math.floor(x), fy = Math.floor(y), X = fx & 255, Y = fy & 255, u = x - fx, v = y - fy;
      const i00 = P[P[X] + Y], i10 = P[P[X + 1] + Y], i01 = P[P[X] + Y + 1], i11 = P[P[X + 1] + Y + 1];
      const a = GX[i00] * u + GY[i00] * v, b = GX[i10] * (u - 1) + GY[i10] * v;
      const c = GX[i01] * u + GY[i01] * (v - 1), d = GX[i11] * (u - 1) + GY[i11] * (v - 1);
      const su = u * u * u * (u * (u * 6 - 15) + 10), sv = v * v * v * (v * (v * 6 - 15) + 10);
      const ab = a + (b - a) * su, cd = c + (d - c) * su;
      return (ab + (cd - ab) * sv) * 1.41;
    };
    f.P = P; f.GX = GX; f.GY = GY;   // live.js uploads the lattice so the shader draws the same noise
    return f;
  }
  // Octaves turned against each other, so no lattice axis shows through.
  function fbm(n, x, y, oct, gain) {
    let s = 0, a = 0.5, t;
    for (let i = 0; i < oct; i++) {
      s += a * n(x, y);
      t = x; x = (0.8 * t - 0.6 * y) * 2.03 + 17.1; y = (0.6 * t + 0.8 * y) * 2.03 + 3.7;
      a *= gain || 0.5;
    }
    return s;
  }

  // ---- colour ----------------------------------------------------------------
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  /** A colour ramp: [[t, '#hex'], ...] -> at(t, out, i) writes r, g, b (0..1), eased between stops. */
  function ramp(stops) {
    const T = stops.map(s => s[0]), C = stops.map(s => rgb(s[1])), n = T.length;
    return function (t, out, i) {
      i = i || 0;
      let a, b, u;
      if (t <= T[0]) { a = b = C[0]; u = 0; }
      else if (t >= T[n - 1]) { a = b = C[n - 1]; u = 0; }
      else { let k = 1; while (T[k] < t) k++; a = C[k - 1]; b = C[k]; u = (t - T[k - 1]) / (T[k] - T[k - 1]); u = u * u * (3 - 2 * u); }
      out[i] = a[0] + (b[0] - a[0]) * u; out[i + 1] = a[1] + (b[1] - a[1]) * u; out[i + 2] = a[2] + (b[2] - a[2]) * u;
      return out;
    };
  }
  function over(d, i, c, a) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; }
  // A thin-film colour: the rainbow an oil film or a soap skin shows, softened toward white.
  function film(h, soft, out, i) {
    for (let c = 0; c < 3; c++) out[i + c] = soft + (1 - soft) * (0.5 + 0.5 * Math.cos(TAU * (h + c / 3)));
    return out;
  }

  // ---- the field: floating-point colour at a fraction of the output size ------
  const field = (w, h) => ({ w, h, d: new Float32Array(w * h * 3) });
  /** fn(x, y, d, i) for every pixel, with x in 0..1 across and y in 0..1 down. */
  function paint(f, fn) {
    const { w, h, d } = f;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn((x + 0.5) / w, (y + 0.5) / h, d, (y * w + x) * 3);
  }
  function sample(f, x, y, out) {
    const { w, h, d } = f;
    x = clamp(x - 0.5, 0, w - 1); y = clamp(y - 0.5, 0, h - 1);
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), u = x - x0, v = y - y0;
    const a = (y0 * w + x0) * 3, b = (y0 * w + x1) * 3, c = (y1 * w + x0) * 3, e = (y1 * w + x1) * 3;
    for (let ch = 0; ch < 3; ch++) {
      const top = d[a + ch] + (d[b + ch] - d[a + ch]) * u, bot = d[c + ch] + (d[e + ch] - d[c + ch]) * u;
      out[ch] = top + (bot - top) * v;
    }
    return out;
  }
  // A running box along one line of the buffer, edges held.
  function boxLine(d, start, stride, n, r, tmp) {
    const norm = 1 / (2 * r + 1);
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += d[start + clamp(k, 0, n - 1) * stride + c];
      for (let i = 0; i < n; i++) {
        tmp[i * 3 + c] = acc * norm;
        acc += d[start + Math.min(n - 1, i + r + 1) * stride + c] - d[start + Math.max(0, i - r) * stride + c];
      }
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) d[start + i * stride + c] = tmp[i * 3 + c];
  }
  /** Soften: box passes across and down (three passes approach a gaussian). */
  function soften(f, rx, ry, passes) {
    const { w, h, d } = f, tmp = new Float32Array(Math.max(w, h) * 3);
    rx = Math.round(rx); ry = Math.round(ry == null ? rx : ry);
    for (let p = 0; p < (passes || 3); p++) {
      if (rx > 0) for (let y = 0; y < h; y++) boxLine(d, y * w * 3, 3, w, rx, tmp);
      if (ry > 0) for (let x = 0; x < w; x++) boxLine(d, x * 3, w * 3, h, ry, tmp);
    }
    return f;
  }
  /**
   * Average each pixel along a path: {dx, dy} is a straight move (motion), {cx, cy, zoom} a ray
   * out from a centre. `fall` weights the path so its start is kept harder than its tail: the
   * flash, then the drag of a slow shutter.
   */
  function sweep(f, o) {
    const { w, h } = f, n = o.n || 28, fall = o.fall || 0, out = new Float32Array(f.d.length), c = [0, 0, 0];
    const wt = new Float32Array(n); let sum = 0;
    for (let k = 0; k < n; k++) { wt[k] = 1 - fall * k / (n - 1); sum += wt[k]; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      const px = x + 0.5, py = y + 0.5;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        if (o.zoom) { const s = 1 - o.zoom * t; sample(f, o.cx + (px - o.cx) * s, o.cy + (py - o.cy) * s, c); }
        else sample(f, px - o.dx * t, py - o.dy * t, c);
        r += c[0] * wt[k]; g += c[1] * wt[k]; b += c[2] * wt[k];
      }
      const i = (y * w + x) * 3; out[i] = r / sum; out[i + 1] = g / sum; out[i + 2] = b / sum;
    }
    f.d = out;
    return f;
  }
  function fromCanvas(c) {
    const w = c.width, h = c.height, p = c.getContext('2d').getImageData(0, 0, w, h).data, f = field(w, h);
    for (let i = 0, j = 0; j < p.length; i += 3, j += 4) { f.d[i] = p[j] / 255; f.d[i + 1] = p[j + 1] / 255; f.d[i + 2] = p[j + 2] / 255; }
    return f;
  }
  /** A photograph, cropped to fill the field. */
  function fromImage(image, w, h) {
    const c = mk(w, h), x = c.getContext('2d'), iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const s = Math.max(w / iw, h / ih);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(image, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
    return fromCanvas(c);
  }
  /** Scale the field up into the output canvas. The 8-bit step is dithered so gradients do not band. */
  function show(f, canvas, seed) {
    const { w, h, d } = f, s = mk(w, h), sx = s.getContext('2d'), img = sx.createImageData(w, h), p = img.data;
    for (let i = 0, j = 0, n = 0; i < d.length; i += 3, j += 4, n++) {
      const e = hash(n, 7, seed) - 0.5;
      p[j] = d[i] * 255 + e; p[j + 1] = d[i + 1] * 255 + e; p[j + 2] = d[i + 2] * 255 + e; p[j + 3] = 255;
    }
    sx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s, 0, 0, canvas.width, canvas.height); ctx.restore();
  }

  // ---- panes: the surface, at full resolution --------------------------------
  /**
   * Reeded glass. Each flute is a cylinder lens: it shows a mirrored, squeezed slice of what is
   * behind it (power < 0), a little higher at one side than the other (shear), with red and blue
   * bent by different amounts (fringe). One edge catches the light and the far side is in shade.
   *   width (sheet units), power, shear, bow, fringe, light, shadow, phase
   */
  function reed(img, o, k) {
    const { width: W, height: H, data: d } = img, src = d.slice();
    const fw = Math.max(3, (o.width || 26) * k), power = o.power == null ? -2.4 : o.power;
    const shear = (o.shear || 0) * fw, bow = (o.bow || 0) * fw, fr = o.fringe == null ? 0.1 : o.fringe;
    const hl = o.light == null ? 0.3 : o.light, sh = o.shadow == null ? 0.2 : o.shadow, off = (o.phase || 0.37) * fw;
    const XR = new Int32Array(W), XG = new Int32Array(W), XB = new Int32Array(W), DY = new Float32Array(W), L = new Float32Array(W), S = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const q = (x + off) / fw, i = Math.floor(q), u = q - i, e = u - 0.5, cx = (i + 0.5) * fw - off, bend = e * fw * power;
      XR[x] = clamp(Math.round(cx + bend * (1 + fr)), 0, W - 1);
      XG[x] = clamp(Math.round(cx + bend), 0, W - 1);
      XB[x] = clamp(Math.round(cx + bend * (1 - fr)), 0, W - 1);
      DY[x] = shear * e + bow * (e * e - 1 / 12);
      L[x] = hl * Math.exp(-Math.pow((u - 0.06) / 0.045, 2));
      S[x] = 1 - sh * Math.pow(Math.max(0, (u - 0.4) / 0.6), 2);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const row = clamp(Math.round(y + DY[x]), 0, H - 1) * W, j = (y * W + x) * 4, l = L[x], s = S[x];
      const r = src[(row + XR[x]) * 4] * s, g = src[(row + XG[x]) * 4 + 1] * s, b = src[(row + XB[x]) * 4 + 2] * s;
      d[j] = r + (255 - r) * l; d[j + 1] = g + (255 - g) * l; d[j + 2] = b + (255 - b) * l;
    }
  }
  /**
   * Streak. Each row (or column) is run through a running average, so colour is dragged along
   * it and fades out slowly behind whatever it passed. How hard a row is dragged comes from a
   * slow band noise times a per-row jitter, so it arrives in bands with ragged edges. `tear`
   * shifts whole bands sideways, the way a bad signal slips.
   *   dir (right, left, up, down), amount 0..1, drag and band and tear (sheet units), jag 0..1
   */
  function streak(img, o, k, rand, seed) {
    const { width: W, height: H, data: d } = img, dir = o.dir || 'right';
    const vert = dir === 'up' || dir === 'down', back = dir === 'left' || dir === 'up';
    const lines = vert ? W : H, len = vert ? H : W, n = makeNoise(rand);
    const band = (o.band || 40) * k, drag = (o.drag || 160) * k, tear = (o.tear || 0) * k;
    const amount = o.amount == null ? 0.5 : o.amount, jag = o.jag == null ? 0.5 : o.jag, L = new Float32Array(len * 3);
    for (let li = 0; li < lines; li++) {
      const slow = 0.5 + 0.8 * fbm(n, li / band, 0.37, 3);
      const s = smooth(1 - amount, 1.3 - amount, slow) * (1 - jag + jag * hash(li, 1, seed));
      if (s < 0.01) continue;
      const a = 1 / (1 + s * drag), keep = Math.sqrt(s);
      const sh = tear ? Math.round((hash(Math.floor(li / Math.max(1, band * 0.3)), 2, seed) - 0.5) * 2 * tear * s) : 0;
      for (let p = 0; p < len; p++) { const j = vert ? (p * W + li) * 4 : (li * W + p) * 4; L[p * 3] = d[j]; L[p * 3 + 1] = d[j + 1]; L[p * 3 + 2] = d[j + 2]; }
      let r = 0, g = 0, b = 0;
      for (let q = 0; q < len; q++) {
        const p = back ? len - 1 - q : q, sp = clamp(p - sh, 0, len - 1) * 3, vr = L[sp], vg = L[sp + 1], vb = L[sp + 2];
        if (q === 0) { r = vr; g = vg; b = vb; } else { r += (vr - r) * a; g += (vg - g) * a; b += (vb - b) * a; }
        const j = vert ? (p * W + li) * 4 : (li * W + p) * 4;
        d[j] = vr + (r - vr) * keep; d[j + 1] = vg + (g - vg) * keep; d[j + 2] = vb + (b - vb) * keep;
      }
    }
  }
  /**
   * Shift: a frame decoded badly. Bands of rows split into blocks; a block is copied from
   * somewhere to the side, or holds its first column across its width, or is knocked to a
   * dither of one dark ink. Most bands are left alone.
   *   amount 0..1, reach, tall, wide (sheet units), ink '#hex'
   */
  function shift(img, o, k, rand) {
    const { width: W, height: H, data: d } = img, src = d.slice(), seed = (rand() * 1e9) | 0;
    const ink = o.ink ? rgb(o.ink).map(v => v * 255) : null, reach = (o.reach || 140) * k, amount = o.amount == null ? 0.5 : o.amount;
    let y = 0;
    while (y < H) {
      const bh = Math.max(1, Math.round((3 + Math.pow(rand(), 2) * (o.tall || 60)) * k)), y1 = Math.min(H, y + bh);
      if (rand() < amount) {
        let x = 0;
        while (x < W) {
          const x1 = Math.min(W, x + Math.max(2, Math.round((10 + Math.pow(rand(), 1.5) * (o.wide || 420)) * k))), kind = rand();
          if (kind < 0.4) {
            const dx = Math.round((rand() - 0.5) * 2 * reach), dy = Math.round((rand() - 0.5) * bh);
            for (let yy = y; yy < y1; yy++) for (let xx = x; xx < x1; xx++) {
              const s = (clamp(yy + dy, 0, H - 1) * W + clamp(xx + dx, 0, W - 1)) * 4, j = (yy * W + xx) * 4;
              d[j] = src[s]; d[j + 1] = src[s + 1]; d[j + 2] = src[s + 2];
            }
          } else if (kind < 0.62) {
            for (let yy = y; yy < y1; yy++) {
              const s = (yy * W + x) * 4;
              for (let xx = x; xx < x1; xx++) { const j = (yy * W + xx) * 4; d[j] = src[s]; d[j + 1] = src[s + 1]; d[j + 2] = src[s + 2]; }
            }
          } else if (kind < 0.74 && ink) {
            const p = 0.25 + rand() * 0.4;
            for (let yy = y; yy < y1; yy++) for (let xx = x; xx < x1; xx++) {
              if (hash(xx, yy, seed) > p) continue;
              const j = (yy * W + xx) * 4; d[j] = ink[0]; d[j + 1] = ink[1]; d[j + 2] = ink[2];
            }
          }
          x = x1;
        }
      }
      y = y1;
    }
  }
  /** A halftone screen of fine dots, heavier in the darks, the way a printed photograph shows its dots. cell (sheet units), angle, amount */
  function screen(img, o, k) {
    const { width: W, height: H, data: d } = img, cell = (o.cell || 8) * k, a = (o.angle == null ? 45 : o.angle) * Math.PI / 180;
    const f = TAU / cell, ca = Math.cos(a) * f, sa = Math.sin(a) * f, amt = o.amount == null ? 0.1 : o.amount;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 4, l = (d[j] + d[j + 1] + d[j + 2]) / 765;
      const s = (Math.cos(x * ca + y * sa) * Math.cos(y * ca - x * sa) + 1) * 0.5, m = 1 - amt * s * (0.35 + 0.65 * (1 - l));
      d[j] *= m; d[j + 1] *= m; d[j + 2] *= m;
    }
  }
  /**
   * Grain: two hashes summed (a triangular spread) plus a clump a few pixels wide, strongest in
   * the midtones. `chroma` adds independent noise per channel, the coloured speckle of a fast
   * film or a cheap scan.  amount (fraction of full scale), chroma 0..1
   */
  function grain(img, o, k, seed) {
    const { width: W, height: H, data: d } = img, amt = (o.amount == null ? 0.1 : o.amount) * 255;
    const chroma = o.chroma == null ? 0.3 : o.chroma, cs = Math.max(1, Math.round(W / 480));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 4, r = d[j], g = d[j + 1], b = d[j + 2], l = (r + g + b) / 765;
      const u = hashU(x, y, seed), v = hashU(x, y, seed + 1), c = hashU(x / cs | 0, y / cs | 0, seed + 2);
      const m = ((u >>> 24) + (v >>> 24) - 255) / 255 * 0.9 + ((c >>> 24) / 255 - 0.5) * 0.9, w = amt * (0.3 + 2.8 * l * (1 - l));
      d[j] = r + (m + chroma * ((u & 255) / 255 - 0.5)) * w;
      d[j + 1] = g + (m + chroma * ((u >>> 8 & 255) / 255 - 0.5)) * w;
      d[j + 2] = b + (m + chroma * ((v & 255) / 255 - 0.5)) * w;
    }
  }
  /** Dust on the print: specks, a few hairs, and the creases of a sheet that has been handled. Light only ('screen'). */
  function dust(ctx, W, H, o, k, rand) {
    const col = o.color || '#ffffff', sheets = (W * H) / (k * k * SW * SW * RATIO);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
    const n = Math.round((o.specks == null ? 220 : o.specks) * sheets);
    for (let i = 0; i < n; i++) {
      const x = rand() * W, y = rand() * H, r = (0.4 + Math.pow(rand(), 5) * 2.4) * k;
      ctx.globalAlpha = 0.15 + rand() * 0.55; ctx.beginPath(); ctx.ellipse(x, y, r * (1 + rand()), r, rand() * TAU, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < (o.hairs || 0); i++) {
      const x = rand() * W, y = rand() * H, len = (18 + rand() * 60) * k, a = rand() * TAU, b = a + (rand() - 0.5) * 2;
      ctx.globalAlpha = 0.2 + rand() * 0.3; ctx.lineWidth = (0.5 + rand() * 0.6) * k;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(b) * len * 0.6, y + Math.sin(b) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
    const todo = [];
    for (let i = 0; i < (o.creases || 0); i++) {
      const across = i === 0;   // the first is the fold: straight across the sheet
      todo.push(across ? [0, H * (0.3 + rand() * 0.4), (rand() - 0.5) * 0.06, W * 1.1, 0.05] : [rand() * W, rand() * H, rand() * TAU, (120 + rand() * 500) * k, 0.4]);
    }
    let guard = 0;
    while (todo.length && guard++ < 400) {
      let [x, y, a, len, wobble] = todo.pop();
      const seg = 7 * k, steps = Math.max(2, Math.round(len / seg));
      ctx.globalAlpha = 0.06 + rand() * 0.1; ctx.lineWidth = (0.5 + rand() * 0.7) * k;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < steps; s++) {
        a += (rand() - 0.5) * wobble; x += Math.cos(a) * seg; y += Math.sin(a) * seg; ctx.lineTo(x, y);
        if (rand() < 0.035 && todo.length < 60) todo.push([x, y, a + (rand() < 0.5 ? 1 : -1) * (0.6 + rand()), len * 0.35, 0.5]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  const PANES = { reed, streak, shift, screen, grain };

  /** Run pixel panes over a canvas, then dust. Panes are {pane: 'reed', ...settings}. */
  function glassOver(canvas, panes, seed, g) {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, k = W / SW;
    const px = panes.filter(p => PANES[p.pane]);
    if (px.length) {
      const img = ctx.getImageData(0, 0, W, H);
      px.forEach((p, i) => {
        const s = (seed | 0) * 131 + i * 977 + p.pane.length;
        const q = p.pane === 'grain' && g != null ? Object.assign({}, p, { amount: (p.amount == null ? 0.1 : p.amount) * g }) : p;
        PANES[p.pane](img, q, k, rng(s), s);
      });
      ctx.putImageData(img, 0, 0);
    }
    panes.filter(p => p.pane === 'dust').forEach(p => dust(ctx, W, H, p, k, rng((seed | 0) * 71 + 5)));
  }
  function glass(canvas, panes, o) {
    o = o || {};
    glassOver(canvas, (panes || []).map(p => (typeof p === 'string' ? { pane: p } : p)), o.seed || 1, o.grain);
    return Promise.resolve(canvas);
  }

  // ---- type: small and crisp, set after the surface ---------------------------
  const MONO = '"Geist Mono", ui-monospace, Menlo, monospace', SANS = '"Geist", "Helvetica Neue", Arial, sans-serif', SERIF = '"Cormorant Garamond", "Cormorant", Georgia, serif';
  /** Set one line in sheet units. o: family, size, weight, style, color, track (em), align, rot, alpha. Returns its width. */
  function say(ctx, s, x, y, o) {
    ctx.save();
    ctx.font = `${o.style || 'normal'} ${o.weight || 400} ${o.size}px ${o.family}`;
    ctx.fillStyle = o.color; ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.textBaseline = o.base || 'alphabetic'; ctx.textAlign = 'left';
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); if (o.sx) ctx.scale(o.sx, 1);
    const tr = (o.track || 0) * o.size, chars = Array.from(s), ws = tr ? chars.map(c => ctx.measureText(c).width) : null;
    const w = tr ? ws.reduce((a, b) => a + b, 0) + tr * (chars.length - 1) : ctx.measureText(s).width;
    let cx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
    if (!tr) ctx.fillText(s, cx, 0);
    else chars.forEach((c, i) => { ctx.fillText(c, cx, 0); cx += ws[i] + tr; });
    ctx.restore();
    return w;
  }
  const TYPE = {
    // two small columns of mono caps, a title in the second, the number of the series at the right
    block(ctx, t, H) {
      const y = (t.y == null ? 0.47 : t.y) * H, col = t.color || '#f3f1ec', a = 140, b = 345;
      const sm = { family: MONO, size: 15, weight: 500, color: col, track: 0.02 };
      (t.a || []).forEach((s, i) => say(ctx, s, a, y + i * 20, sm));
      (t.b || []).forEach((s, i) => say(ctx, s, b, y + i * 20, sm));
      (t.c || []).forEach((s, i) => say(ctx, s, a, y + 64 + i * 20, sm));
      if (t.title) say(ctx, t.title, b, y + 92, { family: MONO, size: 44, weight: 500, color: col, track: 0.04 });
      if (t.no) say(ctx, t.no, 860, y + 88, Object.assign({}, sm, { size: 14, align: 'right' }));
    },
    // thin serif capitals in a stack, a small italic note, a line of caps up the right edge
    serif(ctx, t, H) {
      const col = t.color || '#c4f1ec', big = { family: SERIF, size: 104, weight: 300, color: col, track: 0.02 };
      const cap = { family: SERIF, size: 19, weight: 500, color: col, track: 0.18 };
      if (t.no) {
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(98, 110, 44, 0, TAU); ctx.stroke(); ctx.restore();
        say(ctx, t.no, 98, 126, { family: SERIF, size: 44, weight: 400, color: col, align: 'center' });
      }
      if (t.top) say(ctx, t.top, 968, 44, Object.assign({}, cap, { size: 30, align: 'right', track: 0.1 }));
      let y = H * 0.25;
      (t.lines || []).forEach((s, i) => {
        say(ctx, s, 30, y, big);
        if (i === 0 && t.sub) { say(ctx, t.sub, 34, y + 42, cap); y += 44; }
        y += 100;
      });
      if (t.wave) {
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
        for (let x = 0; x <= 150; x += 3) { const yy = y - 150 + Math.sin(x / 150 * TAU * 3) * 6; x ? ctx.lineTo(800 + x, yy) : ctx.moveTo(800, yy); }
        ctx.stroke(); ctx.restore();
      }
      if (t.note) wrap(ctx, t.note, 34, y - 30, 440, 25, { family: SERIF, size: 20, weight: 400, style: 'italic', color: col });
      if (t.side) say(ctx, t.side, 948, H - 50, Object.assign({}, cap, { size: 44, weight: 400, track: 0.08, rot: -Math.PI / 2 }));
      if (t.foot) say(ctx, t.foot, 500, H - 40, Object.assign({}, cap, { size: 14, align: 'center' }));
    },
    // one bold word, set up the sheet
    word(ctx, t, H) {
      say(ctx, t.word || 'ANNEAL', 540, H * 0.5, { family: SANS, size: 118, weight: 800, color: t.color || '#e6412b', align: 'center', rot: -Math.PI / 2, track: -0.01, sx: 0.86 });
    },
    // a design-school poster: year split in the corners, coordinates, hairline hatches, crosshairs, sideways notes
    grid(ctx, t, H) {
      const ink = t.color || '#1b1b1d', mono = { family: MONO, size: 15, weight: 400, color: ink, track: 0.12 }, sans = { family: SANS, size: 20, weight: 600, color: ink, track: 0.04 };
      say(ctx, t.left, 46, 88, { family: SANS, size: 58, weight: 500, color: ink });
      say(ctx, t.right, 954, 88, { family: SANS, size: 58, weight: 500, color: ink, align: 'right' });
      say(ctx, t.title, 500, 64, Object.assign({}, sans, { align: 'center' }));
      (t.from || []).forEach((s, i) => say(ctx, s, 52, H * 0.14 + i * 26, mono));
      (t.to || []).forEach((s, i) => say(ctx, s, 946, H * 0.36 + i * 26, Object.assign({}, mono, { align: 'right' })));
      const side = { family: SANS, size: 17, weight: 600, color: ink, track: 0.06, rot: Math.PI / 2 };
      say(ctx, t.sideR, 944, 150, side);
      say(ctx, t.sideR2, 920, 150, Object.assign({}, side, { weight: 400, size: 15 }));
      say(ctx, t.sideL, 64, H * 0.66, Object.assign({}, side, { rot: -Math.PI / 2 }));
      say(ctx, t.sideL2, 88, H * 0.66, Object.assign({}, side, { rot: -Math.PI / 2, weight: 400, size: 15 }));
      (t.foot || []).forEach((s, i) => say(ctx, s, 50, H - 60 + i * 22, Object.assign({}, sans, { size: 15 })));
      (t.foot2 || []).forEach((s, i) => say(ctx, s, 950, H - 60 + i * 22, Object.assign({}, sans, { size: 15, align: 'right' })));
      ctx.save(); ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
      [[500, 120], [500, H - 120]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); });
      [[262, H * 0.29], [880, H * 0.42], [760, H * 0.6]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke(); });
      // hatches: groups of hairlines of uneven length, as if ruled by a plotter
      const r = rng(t.seed || 5);
      [[180, H * 0.04, 9, 300], [205, H * 0.56, 7, 240], [800, H * 0.16, 6, 180]].forEach(([x0, y0, n, len]) => {
        for (let i = 0; i < n; i++) {
          const x = x0 + i * 7, l = len * (0.45 + 0.55 * r());
          ctx.globalAlpha = 0.55 + 0.4 * r(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y0 + (len - l) * 0.5); ctx.lineTo(x, y0 + (len + l) * 0.5); ctx.stroke();
        }
      });
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc(812 + (i % 3) * 9, H * 0.47 + (i / 3 | 0) * 9, 1.4, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
  };
  function wrap(ctx, text, x, y, width, lead, o) {
    ctx.save(); ctx.font = `${o.style || 'normal'} ${o.weight || 400} ${o.size}px ${o.family}`;
    const words = text.split(' '); let line = '', n = 0;
    words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > width && line) { say(ctx, line, x, y + n++ * lead, o); line = w; } else line = t; });
    if (line) say(ctx, line, x, y + n * lead, o);
    ctx.restore();
  }
  const WORDS = {
    block: { a: ['LATE', 'LISTENING'], b: ['ORRIN', 'GLASSWORKS'], c: ['SIDE A', 'SLOW GLASS'], title: 'KILN HOURS', no: '03/06' },
    serif: {
      no: '06', top: 'KILN HOURS', lines: ['AFTERGLOW', 'SLOW', 'GLASS'], sub: 'OF THE ANNEALING HALL', wave: true,
      note: '“Glass is never finished, only cooled. We turn the lights down and let it settle from eleven hundred degrees to the warmth of a hand.”',
      side: 'COOLING THROUGH THE NIGHT', foot: 'ORRIN GLASSWORKS',
    },
    word: { word: 'ANNEAL' },
    grid: {
      left: '20', right: '26', title: 'KILN HOURS', from: ['( 11.4 , -3.2 )', '↓', '( 8.7 , 5.9 )'], to: ['( 12 . 4 )', '↓', '( 12 . 11 )'],
      sideR: 'ORRIN GLASSWORKS · LATE LISTENING', sideR2: 'SIX NIGHTS IN THE ANNEALING HALL',
      sideL: 'SIX NIGHTS IN THE ANNEALING HALL', sideL2: 'ORRIN GLASSWORKS · LATE LISTENING',
      foot: ['SLOW GLASS', 'SESSIONS'], foot2: ['SIDE B', 'KILN HOURS'],
    },
  };
  function typeset(canvas, o, layout, H) {
    if (o.text === false || (!layout && !o.text)) return;
    const t = Object.assign({}, WORDS[(o.text && o.text.layout) || layout || 'block'], o.text && typeof o.text === 'object' ? o.text : null);
    const ctx = canvas.getContext('2d'), k = canvas.width / SW;
    ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0);
    TYPE[t.layout || layout || 'block'](ctx, Object.assign({ seed: o.seed }, t), H);
    ctx.restore();
  }

  // ---- the driver ------------------------------------------------------------
  /**
   * def: { res, make(f, c), panes: [...], type }. make() fills the field (or, when it holds a
   * photograph already, works on it); c carries the aspect A (height / width), rand, noise.
   */
  async function run(canvas, o, def) {
    o = o || {};
    const W = Math.round(o.width || canvas.width || 700), H = Math.round(o.height || W * RATIO);
    canvas.width = W; canvas.height = H;
    const seed = o.seed == null ? 1 : o.seed, rand = rng(seed * 7 + 1), res = o.resolution || def.res || 0.33;
    const fw = Math.max(24, Math.round(W * res)), fh = Math.max(24, Math.round(H * res));
    const f = o.image ? fromImage(o.image, fw, fh) : field(fw, fh);
    const c = { A: H / W, rand, noise: makeNoise(rand), image: !!o.image, px: fw / SW, seed };
    const out = def.make(f, c) || f;
    show(out, canvas, seed);
    // live.js: `capture(stage, canvas)` hands back the bare field and the finished still, and runs synchronously
    if (o.capture) o.capture('field', canvas); else await tick();
    const own = def.panes || [];
    const panes = (o.panes || own).map(p => (typeof p === 'string' ? own.find(q => q.pane === p) || { pane: p } : p));
    glassOver(canvas, panes, seed, o.grain);
    typeset(canvas, o, def.type, SW * H / W);
    if (o.capture) o.capture('still', canvas);
    return canvas;
  }
  const pick = (table, name, first) => table[name] || table[first];

  // ---- reeded: colour behind fluted glass --------------------------------------
  const REEDED = {
    // warm light behind reeds: yellow at the top, a red band, pink and lilac low down, butter at the foot
    ember: {
      field: 'mesh', base: [[0, '#fbb04a'], [0.22, '#f97a52'], [0.45, '#f45a5a'], [0.62, '#ec8aa2'], [0.8, '#f2b6c0'], [1, '#f6d9ae']],
      blobs: [[0.16, 0.06, 0.34, 0.14, '#ffcf4f', 0.9], [0.62, 0.42, 0.55, 0.08, '#f2364a', 0.75], [0.08, 0.66, 0.3, 0.16, '#c5a2de', 0.85],
        [0.9, 0.84, 0.36, 0.22, '#f8e3a4', 0.9], [0.95, 0.46, 0.22, 0.14, '#f7bcc0', 0.6], [0.4, 0.93, 0.26, 0.1, '#f3a0c4', 0.7]],
      reed: { width: 25, power: -4.2, fringe: 0.16, light: 0.4, shadow: 0.3 }, grain: { amount: 0.07, chroma: 0.2 },
    },
    // cobalt with black swells, a warm mauve low down: the reeds shear the edges into steps
    cobalt: {
      field: 'bands', freq: 0.62, amp: 0.34, turn: 0.2,
      ramp: [[0, '#6474e0'], [0.3, '#4769d8'], [0.5, '#3659b6'], [0.64, '#2b3a7a'], [0.78, '#1d1f2b'], [1, '#141418']],
      blobs: [[0.62, 0.9, 0.4, 0.12, '#b27aa6', 0.8], [0.72, 0.95, 0.2, 0.06, '#e3945a', 0.75]],
      reed: { width: 46, power: -1.3, shear: 1.6, bow: 0.8, fringe: 0.06, light: 0.14, shadow: 0.35 }, grain: { amount: 0.08, chroma: 0.25 }, screen: { cell: 6, amount: 0.05 },
    },
  };
  function mesh(f, c, p) {
    const base = ramp(p.base), n = c.noise, rand = c.rand;
    const blobs = p.blobs.map(b => ({ x: b[0] + (rand() - 0.5) * 0.14, y: b[1] + (rand() - 0.5) * 0.06, rx: b[2], ry: b[3], c: rgb(b[4]), a: b[5] }));
    paint(f, (x, y, d, i) => {
      const wx = x + 0.07 * fbm(n, x * 2.2, y * 2.2, 3), wy = y + 0.04 * fbm(n, x * 2.2 + 9, y * 2.2 + 4, 3);
      base(wy, d, i);
      for (const b of blobs) { const dx = (wx - b.x) / b.rx, dy = (wy - b.y) / b.ry; over(d, i, b.c, Math.exp(-(dx * dx + dy * dy)) * b.a); }
    });
  }
  function bands(f, c, p) {
    const r = ramp(p.ramp), n = c.noise, ph = c.rand() * TAU;
    const blobs = (p.blobs || []).map(b => ({ x: b[0], y: b[1], rx: b[2], ry: b[3], c: rgb(b[4]), a: b[5] }));
    paint(f, (x, y, d, i) => {
      const yy = y * c.A, t = Math.sin(TAU * (yy * p.freq + p.amp * Math.sin(TAU * x * 0.55 + ph) + p.turn * x) + 0.9 * fbm(n, x * 1.4, yy * 1.4, 3));
      r(0.5 + 0.5 * t, d, i);
      for (const b of blobs) { const dx = (x - b.x) / b.rx, dy = (y - b.y) / b.ry; over(d, i, b.c, Math.exp(-(dx * dx + dy * dy)) * b.a); }
    });
  }
  function reeded(canvas, o) {
    o = o || {};
    const p = pick(REEDED, o.palette, 'ember');
    const panes = [Object.assign({ pane: 'reed' }, p.reed)];
    if (p.screen) panes.push(Object.assign({ pane: 'screen' }, p.screen));
    panes.push(Object.assign({ pane: 'grain' }, p.grain));
    return run(canvas, o, {
      res: 0.3, panes, type: p.type,
      make: (f, c) => { if (!c.image) (p.field === 'bands' ? bands : mesh)(f, c, p); },
    });
  }

  // ---- satin: folds and marbling by domain warping, lit like silk --------------
  /*
   * A fold is a stripe: sin() of one coordinate. Push that coordinate around with noise that is
   * itself pushed around by noise (a warp of a warp) and the stripes bend into the S-curves of
   * satin, marbled paper or poured paint. `folds` is how many stripes cross the sheet, `swirl`
   * how far the warp bends them, `oct` how crumpled the bending is. Light comes from the slope.
   * The 'pool' model thresholds the warped noise itself instead: blots with thin-film rims.
   */
  const SATIN = {
    mint: { folds: 2.6, swirl: 0.95, warp: 1.0, scale: 0.7, oct: 2, turn: -0.55, contrast: 0.58, bump: 26, light: 0.4, gloss: 0.06,
      ramp: [[0, '#177a6c'], [0.3, '#2f9484'], [0.55, '#62b19c'], [0.78, '#a6d4b6'], [1, '#d9ecc8']], grain: { amount: 0.15, chroma: 0.25 } },
    rose: { folds: 2.1, swirl: 1.0, warp: 1.0, scale: 0.8, oct: 2, turn: 0.75, contrast: 0.6, bump: 26, light: 0.4, gloss: 0.3,
      ramp: [[0, '#e8416f'], [0.3, '#f35681'], [0.55, '#f595ae'], [0.8, '#fbc0cf'], [1, '#fde2e9']], screen: { cell: 6.5, angle: 30, amount: 0.16 }, grain: { amount: 0.05, chroma: 0.1 } },
    crimson: { folds: 2.8, swirl: 1.5, warp: 1.3, scale: 0.75, oct: 2, turn: 1.3, contrast: 0.62, bump: 30, light: 0.55, gloss: 0.05, dark: [0.9, 0.55, 0.45], shade: ['#2a0712', 0.62, 0.36, 0.7],
      ramp: [[0, '#7a1c3c'], [0.3, '#b52a55'], [0.55, '#cf4a70'], [0.8, '#e08aa0'], [1, '#f1c6cc']], grain: { amount: 0.13, chroma: 0.2 } },
    neon: { folds: 1.5, swirl: 1.1, warp: 1.1, scale: 0.6, oct: 2, turn: -0.9, contrast: 0.52, bump: 10, light: 0.25, gloss: 0, glow: ['#ff3fa0', 0.82, 0.5, 0.26],
      ramp: [[0, '#0d1113'], [0.22, '#10191b'], [0.36, '#1d4a45'], [0.48, '#3f8e7a'], [0.58, '#1c3a38'], [0.66, '#141719'], [0.74, '#5c1440'], [0.82, '#c0287a'], [0.9, '#ff5a9e'], [0.95, '#ffb0b8'], [1, '#e04a8c']], grain: { amount: 0.1, chroma: 0.2 } },
    opal: { folds: 1.8, swirl: 1.2, warp: 1.1, scale: 0.6, oct: 2, turn: 0.3, contrast: 0.5, bump: 0, light: 0, gloss: 0, film: [0.3, 0.62], rim: 0.03,
      ramp: [[0, '#8f8ad0'], [0.45, '#9aa0d6'], [0.58, '#b4b6e2'], [0.68, '#dcdcef'], [1, '#eeeff5']], grain: { amount: 0.17, chroma: 0.6 } },
  };
  function satinField(f, c, p) {
    const { w, h } = f, n = c.noise, F = new Float32Array(w * h), ca = Math.cos(p.turn), sa = Math.sin(p.turn), wp = p.warp;
    const photo = c.image ? { w, h, d: f.d.slice() } : null, tmp = [0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = (x + 0.5) / w, Y = (y + 0.5) / h * c.A, u = (X * ca - Y * sa) * p.scale, v = (X * sa + Y * ca) * p.scale;
      const q1 = fbm(n, u, v, p.oct), q2 = fbm(n, u + 5.2, v + 1.3, p.oct);
      const r1 = fbm(n, u + wp * q1 + 1.7, v + wp * q2 + 9.2, p.oct), r2 = fbm(n, u + wp * q1 + 8.3, v + wp * q2 + 2.8, p.oct);
      F[y * w + x] = p.model === 'pool' ? fbm(n, u + wp * r1, v + wp * r2, p.oct)
        : Math.sin(TAU * ((X * sa + Y * ca) * p.folds / c.A * 1.2 + p.swirl * (r1 + 0.5 * r2)));
      if (photo) { sample(photo, x + 0.5 + r1 * w * 0.3, y + 0.5 + r2 * w * 0.3, tmp); const i = (y * w + x) * 3; f.d[i] = tmp[0]; f.d[i + 1] = tmp[1]; f.d[i + 2] = tmp[2]; }
    }
    const shade = p.shade ? { c: rgb(p.shade[0]), x: p.shade[1], w: p.shade[2], a: p.shade[3] } : null;
    const r = ramp(p.ramp), step = SW / w, L = [-0.45, -0.62, 0.64], Hh = [-0.25, -0.35, 1.2], hl = Math.hypot(...Hh);
    const glow = p.glow ? { c: rgb(p.glow[0]), x: p.glow[1], y: p.glow[2], r: p.glow[3] } : null, pal = [0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x, i = j * 3, t = 0.5 + F[j] * p.contrast;
      if (!photo) r(t, f.d, i);
      if (p.film) p.film.forEach(th => { const e = (t - th) / p.rim, a = Math.exp(-e * e); if (a > 0.01) over(f.d, i, film(0.62 + e * 0.12 + th, 0.42, pal, 0), a * 0.85); });
      if (glow) { const dx = ((x + 0.5) / w - glow.x) / glow.r, dy = ((y + 0.5) / h - glow.y) * c.A / glow.r; over(f.d, i, glow.c, 0.8 * Math.exp(-(dx * dx + dy * dy)) * smooth(0.3, 0.6, t) * (1 - smooth(0.74, 0.8, t))); }
      if (p.bump) {
        const gx = (F[y * w + Math.min(w - 1, x + 1)] - F[y * w + Math.max(0, x - 1)]) / (2 * step) * p.bump;
        const gy = (F[Math.min(h - 1, y + 1) * w + x] - F[Math.max(0, y - 1) * w + x]) / (2 * step) * p.bump;
        const nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
        const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), spec = Math.pow(Math.max(0, (nx * Hh[0] + ny * Hh[1] + nz * Hh[2]) / hl), 22) * p.gloss;
        const s = 1 - p.light + p.light * diff * 1.35;
        for (let ch = 0; ch < 3; ch++) f.d[i + ch] = f.d[i + ch] * s * (p.dark && s < 1 ? 1 - (1 - s) * (p.dark[ch] - 0.4) : 1) + spec;
      }
      // a deep shadow falling across one side of the cloth
      if (shade) { const e = ((x + 0.5) / w - shade.x) / shade.w; if (e > 0) over(f.d, i, shade.c, clamp(e, 0, 1) * shade.a * (0.6 + 0.4 * Math.sin(F[j] * 2))); }
    }
  }
  function satin(canvas, o) {
    o = o || {};
    const p = pick(SATIN, o.palette, 'mint'), panes = [];
    if (p.screen) panes.push(Object.assign({ pane: 'screen' }, p.screen));
    panes.push(Object.assign({ pane: 'grain' }, p.grain));
    return run(canvas, o, { res: 0.34, panes, type: p.type, make: (f, c) => satinField(f, c, p) });
  }

  // ---- aurora: a curtain, a halo or a plume of light, in grain ----------------
  const AURORA = {
    // a white glow over a V of spectrum: lilac, pink, orange, a pale yellow edge, then deep navy
    veil: { form: 'curtain', vx: 0.54, vy: 0.74, ly: 0.44, ry: 0.3,
      ramp: [[-0.62, '#fbfaf5'], [-0.4, '#eceaf3'], [-0.24, '#aea4e6'], [-0.12, '#9d86d8'], [-0.06, '#c58fcf'], [-0.03, '#f09ab8'], [-0.012, '#f7a060'],
        [0.004, '#f8d98e'], [0.018, '#f5f0c6'], [0.04, '#7c78d6'], [0.1, '#3c44a4'], [0.25, '#2a3475'], [0.6, '#1f2762']],
      side: '#8e88dc', panes: [{ pane: 'streak', dir: 'right', amount: 0.3, drag: 50, band: 18, jag: 0.8 }, { pane: 'grain', amount: 0.15, chroma: 0.35 }, { pane: 'dust', specks: 260, hairs: 6 }] },
    // a black hole in creased paper with a rim of yellow, green and cyan that floods out to the left
    halo: { form: 'halo', cx: 0.68, cy: 0.66, rx: 0.4, ry: 0.62,
      ramp: [[-0.02, '#1c1d1e'], [0, '#6b5a2a'], [0.008, '#e7c84a'], [0.02, '#6fe07a'], [0.045, '#28d4b2'], [0.1, '#1fb49a'], [0.2, '#1c7a68'], [0.36, '#1f4a42'], [0.6, '#1d2624']],
      panes: [{ pane: 'streak', dir: 'right', amount: 0.42, drag: 120, band: 22, tear: 14, jag: 0.8 }, { pane: 'grain', amount: 0.12, chroma: 0.25 }, { pane: 'dust', specks: 160, hairs: 4, creases: 9 }] },
    // cyan plumes curling up through deep teal, with thin serif capitals
    north: { form: 'plume', type: 'serif',
      ramp: [[0, '#05303f'], [0.3, '#07425a'], [0.45, '#0f6e80'], [0.62, '#2f9ea8'], [0.78, '#6cc8cd'], [0.9, '#a8e4e0'], [1, '#e2fbf6']],
      panes: [{ pane: 'grain', amount: 0.09, chroma: 0.2 }] },
    // a pastel wash: sage to sky to lilac to pink-white, all grain
    wash: { form: 'drift', axis: 'y',
      ramp: [[0, '#6c978a'], [0.22, '#6fa29e'], [0.38, '#78b2cd'], [0.52, '#b0b3ec'], [0.66, '#e9c3f3'], [0.82, '#f6dcf4'], [1, '#fbeef7']],
      blobs: [[1.0, 0.12, 0.12, 0.08, '#e3a9e6', 0.9]], panes: [{ pane: 'grain', amount: 0.2, chroma: 0.6 }] },
    // soft vertical bands of ice, petrol and navy, one bold word up the middle
    dusk: { form: 'drift', axis: 'x', type: 'word',
      ramp: [[0, '#e6e9ea'], [0.12, '#a6c6cc'], [0.24, '#3f8aa3'], [0.36, '#1b3a5c'], [0.5, '#16233f'], [0.62, '#23557c'], [0.74, '#4295ab'], [0.86, '#1c2b48'], [1, '#141d33']],
      panes: [{ pane: 'grain', amount: 0.11, chroma: 0.25 }] },
  };
  function auroraField(f, c, p) {
    const n = c.noise, r = ramp(p.ramp), A = c.A, side = p.side ? rgb(p.side) : null;
    if (c.image) {    // a photograph: its light mapped through the palette, then the same surface
      const lo = p.ramp[0][0], hi = p.ramp[p.ramp.length - 1][0];
      paint(f, (x, y, d, i) => r(lo + (hi - lo) * (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]), d, i));
      return;
    }
    const blobs = (p.blobs || []).map(b => ({ x: b[0], y: b[1], rx: b[2], ry: b[3], c: rgb(b[4]), a: b[5] }));
    const ph = c.rand() * 10;
    paint(f, (x, y, d, i) => {
      const Y = y * A;
      let t;
      if (p.form === 'curtain') {
        const lx = x - p.vx, sl = lx < 0 ? (p.vy - p.ly) / p.vx : (p.vy - p.ry) / (1 - p.vx);
        const yc = (p.vy - sl * Math.sqrt(lx * lx + 0.0025)) * A + 0.05 * fbm(n, x * 2.5 + ph, 1.3, 3);
        t = (Y - yc) + 0.012 * fbm(n, x * 3, Y * 40, 2) + 0.03 * fbm(n, x * 5, Y * 5, 3);
        r(t, d, i);
        if (side) over(d, i, side, (1 - Math.exp(-Math.pow((x - 0.46) / 0.3, 2))) * smooth(-0.08, -0.35, t) * 0.85);
      } else if (p.form === 'halo') {
        const dx = (x - p.cx) / p.rx, dy = (Y - p.cy * A) / (p.ry * A * 0.95), a = Math.atan2(dy, dx);
        const edge = 1 + 0.1 * fbm(n, Math.cos(a) * 1.2 + ph, Math.sin(a) * 1.2, 2), rr = Math.hypot(dx, dy * (dy > 0 ? 0.7 : 1)) / edge;
        const left = Math.max(0, -Math.cos(a)), reach = 0.25 + 1.6 * left * left + 0.25 * Math.max(0, Math.sin(a));
        t = (rr - 1) * p.rx / reach + 0.004 * fbm(n, x * 30, Y * 6, 2);
        r(t, d, i);
        if (t < 0) { const m = 0.9 + 0.12 * fbm(n, x * 6, Y * 6, 4); d[i] *= m; d[i + 1] *= m; d[i + 2] *= m; }
      } else if (p.form === 'plume') {
        const u = x * 0.8, v = Y * 0.6, q1 = fbm(n, u, v, 3), q2 = fbm(n, u + 4.1, v + 7.7, 3);
        const g = fbm(n, u + 2.2 * q1 + ph, v + 2.2 * q2, 3), e = g - 0.05, e2 = g + 0.22;
        t = 0.12 + 0.44 * Math.exp(-e * e / 0.08) + 0.14 * Math.exp(-e * e / 0.008) + 0.22 * Math.exp(-e2 * e2 / 0.03) + 0.08 * (1 - Y / A);
        r(t, d, i);
      } else {
        t = (p.axis === 'x' ? x : y) + 0.13 * fbm(n, x * 1.2 + ph, Y * (p.axis === 'x' ? 0.6 : 1.4), 3) + 0.05 * fbm(n, x * 4, Y * 4, 2);
        r(t, d, i);
      }
      for (const b of blobs) { const ex = (x - b.x) / b.rx, ey = (y - b.y) / b.ry; over(d, i, b.c, Math.exp(-(ex * ex + ey * ey)) * b.a); }
    });
  }
  function aurora(canvas, o) {
    o = o || {};
    const p = pick(AURORA, o.palette, 'veil');
    return run(canvas, o, { res: 0.3, panes: p.panes, type: p.type, make: (f, c) => auroraField(f, c, p) });
  }

  // ---- streak: rows dragged along and torn -------------------------------------
  const STREAK = {
    // coral on grey-green, maroon smudges and teal lozenges, every row pulled to the right
    coral: { make: 'smudge', ground: [[0, '#f08a84'], [0.45, '#e98c86'], [0.62, '#a38a80'], [1, '#7a8a82']],
      marks: [['#3b2124', 12, [-0.05, 0.5], [0.08, 0.3], [0.01, 0.045]], ['#46b3a8', 8, [0.02, 0.62], [0.03, 0.1], [0.006, 0.016]], ['#c95a60', 7, [0.15, 0.75], [0.06, 0.22], [0.008, 0.03]], ['#5f5858', 5, [0.3, 0.9], [0.05, 0.2], [0.01, 0.04]]],
      panes: [{ pane: 'streak', dir: 'right', amount: 0.85, drag: 220, band: 24, tear: 34, jag: 0.6 }, { pane: 'grain', amount: 0.15, chroma: 0.3 }] },
    // orange-red strokes on navy-black with pale blue breaks: a signal slipping sideways
    signal: { make: 'strokes', type: 'block', angle: -1.15, freq: 2.2,
      ramp: [[0, '#03011c'], [0.3, '#0a0526'], [0.42, '#3a0a14'], [0.52, '#b8290a'], [0.68, '#e2360a'], [1, '#ff6224']], sky: '#8aabb8',
      panes: [{ pane: 'streak', dir: 'right', amount: 0.55, drag: 140, band: 26, tear: 36, jag: 0.5 }, { pane: 'grain', amount: 0.16, chroma: 0.25 }] },
    // colour at the foot pulled up into black in spikes: blue, cyan, a red crest, cream at the bottom
    drip: { make: 'pool', top: '#060a13', ramp: [[0, '#d33b24'], [0.16, '#2a86c8'], [0.4, '#1d74b5'], [0.55, '#8ad3ee'], [0.72, '#3c9fd6'], [0.86, '#eaa6b8'], [1, '#f6ecdc']],
      panes: [{ pane: 'streak', dir: 'up', amount: 0.95, drag: 260, band: 12, jag: 0.9 }, { pane: 'streak', dir: 'up', amount: 0.6, drag: 60, band: 4, jag: 1 }, { pane: 'grain', amount: 0.06, chroma: 0.15 }] },
    // a pale blotchy frame with its blocks slipped, held and dithered
    shift: { make: 'blotch', ramp: [[0, '#2c3024'], [0.14, '#6a6353'], [0.28, '#b2a299'], [0.42, '#c9bab4'], [0.56, '#e0d4c8'], [0.68, '#f6d6bd'], [0.8, '#dfa39c'], [0.9, '#e06b76'], [1, '#ec3a5c']],
      blobs: [[0.12, 0.62, 0.22, 0.05, '#a4dcb6', 0.9], [0.8, 0.66, 0.2, 0.05, '#ea3558', 0.8]],
      panes: [{ pane: 'shift', amount: 0.62, reach: 120, tall: 50, wide: 380, ink: '#2a2d22' }, { pane: 'streak', dir: 'right', amount: 0.35, drag: 60, band: 10, jag: 0.9 }, { pane: 'grain', amount: 0.1, chroma: 0.25 }] },
  };
  function streakField(f, c, p) {
    if (c.image) return;
    const n = c.noise, rand = c.rand, A = c.A;
    if (p.make === 'smudge') {
      const g = ramp(p.ground), marks = [];
      p.marks.forEach(([col, count, xs, rx, ry]) => {
        for (let m = 0; m < count; m++) marks.push({ c: rgb(col), x: xs[0] + rand() * (xs[1] - xs[0]), y: 0.05 + rand() * 0.9, rx: rx[0] + rand() * (rx[1] - rx[0]), ry: ry[0] + rand() * (ry[1] - ry[0]) });
      });
      paint(f, (x, y, d, i) => {
        g(x + 0.12 * fbm(n, x * 2, y * 3, 3), d, i);
        for (const m of marks) {
          const dx = (x - m.x) / m.rx + 0.5 * fbm(n, x * 5, y * 30, 2), dy = (y - m.y) * A / m.ry + 0.5 * fbm(n, x * 9, y * 9, 2), e = dx * dx + dy * dy;
          if (e < 4) over(d, i, m.c, smooth(1.1, 0.5, e));
        }
      });
    } else if (p.make === 'strokes') {
      const r = ramp(p.ramp), sky = rgb(p.sky), ca = Math.cos(p.angle), sa = Math.sin(p.angle);
      paint(f, (x, y, d, i) => {
        const Y = y * A, u = x * ca - Y * sa, v = fbm(n, x * 1.5, Y * 1.5, 3);
        const s = Math.sin(TAU * (u * p.freq + 0.6 * v)) * 0.5 + 0.5 + 0.35 * fbm(n, u * 3, x * sa + Y * ca, 3);
        r(s, d, i);
        const b = fbm(n, x * 2.4 + 3, Y * 1.1, 3) + (y < 0.1 ? 0.4 : 0) + (y > 0.9 ? 0.35 : 0) - (x > 0.5 ? 0.25 : 0);
        over(d, i, sky, smooth(0.28, 0.4, b));
      });
    } else if (p.make === 'pool') {
      const r = ramp(p.ramp), top = rgb(p.top);
      paint(f, (x, y, d, i) => {
        const edge = 0.52 + 0.16 * fbm(n, x * 2.2, 0.5, 3) + 0.05 * fbm(n, x * 11, 1.7, 2), t = (y - edge) / (1 - edge) + 0.12 * fbm(n, x * 4, y * 3, 3);
        if (y < edge) { d[i] = top[0]; d[i + 1] = top[1]; d[i + 2] = top[2]; return; }
        r(t, d, i);
      });
    } else {
      const r = ramp(p.ramp), blobs = (p.blobs || []).map(b => ({ x: b[0], y: b[1], rx: b[2], ry: b[3], c: rgb(b[4]), a: b[5] }));
      paint(f, (x, y, d, i) => {
        r(0.55 + 0.9 * fbm(n, x * 3.2, y * A * 7, 4) + 0.2 * (y - 0.5), d, i);
        for (const b of blobs) { const ex = (x - b.x) / b.rx, ey = (y - b.y) / b.ry; over(d, i, b.c, Math.exp(-(ex * ex + ey * ey)) * b.a); }
      });
    }
  }
  function streakPlate(canvas, o) {
    o = o || {};
    const p = pick(STREAK, o.palette, 'coral');
    return run(canvas, o, { res: 0.3, panes: p.panes, type: p.type, make: (f, c) => streakField(f, c, p) });
  }

  // ---- bloom: flowers moving past an open shutter -----------------------------
  const BLOOM = {
    // red and orange poppies on lilac, dragged down and to the left: a flash, then the drag
    lilac: { ground: ['#8f7cbf', '#b3a0da', '#a591cf'], move: [-0.2, 0.07], fall: 0.5, ghost: 0.35,
      flowers: [[0.62, 0.3, 0.21, 5, '#7c0c12', '#e3301f', '#f0503a', '#f4c24a'], [0.8, 0.09, 0.14, 6, '#d9531c', '#f39238', '#f7b85a', '#f6d86a'],
        [0.16, 0.33, 0.17, 6, '#d24a1c', '#f08a34', '#f6b252', '#f6d86a'], [0.3, 0.19, 0.1, 5, '#c33a1f', '#ee7a32', '#f4a44c', null],
        [0.64, 0.66, 0.17, 5, '#9c1a1a', '#e2402a', '#f07048', null], [0.26, 0.6, 0.13, 5, '#b8341e', '#ec6a36', '#f19250', null]],
      stems: '#5f9a4c', grain: { amount: 0.07, chroma: 0.2 } },
    // one orange flower, petals thrown outward by a zoom, on blush
    blush: { ground: ['#f9ecf0', '#f7dbe4', '#f4cfdc'], zoom: 0.34, soft: 0.022, center: [0.5, 0.43],
      flowers: [[0.5, 0.43, 0.3, 7, '#f45a3c', '#fd6c4c', '#fea08a', '#fcd07a']], grain: { amount: 0.05, chroma: 0.12 } },
    // fuchsia smeared sideways on pale pink, in a white border
    fuchsia: { ground: ['#ffe6ee', '#fcd0de', '#ffe2ea'], move: [0.3, -0.04], fall: 0.4, ghost: 0.3, soft: 0.02, frame: 0.045,
      flowers: [[0.34, 0.32, 0.34, 5, '#b0083e', '#e8356e', '#fb8fb0', null], [0.84, 0.22, 0.26, 6, '#c2104c', '#ee4c80', '#fcaac4', null], [0.52, 0.72, 0.3, 5, '#d63a70', '#f78eb0', '#fdd0dc', null]],
      grain: { amount: 0.05, chroma: 0.15 } },
    // a pale flower on black, doubled, with its colours pulled apart at the edges
    night: { ground: ['#0f1113', '#141719', '#0c0e10'], move: [0.05, -0.12], fall: 0.4, ghost: 0.5, split: 0.012, flash: 0.35,
      flowers: [[0.62, 0.36, 0.46, 6, '#b8564a', '#dba4a6', '#efe0dc', '#f2c6c8']], stems: '#78b24e', grain: { amount: 0.08, chroma: 0.25 } },
  };
  function drawFlower(x, fl, px, A, rand, stems) {
    const [cx, cy, R, n, deep, mid, tip, heart] = fl, X = cx * SW * px, Y = cy * SW * A * px, r = R * SW * px, a0 = rand() * TAU;
    if (stems) {
      x.strokeStyle = stems; x.lineWidth = r * 0.07; x.lineCap = 'round'; x.globalAlpha = 0.9;
      x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + (rand() - 0.5) * r * 1.5, Y + r * 2.5, X + (rand() - 0.5) * r * 2, SW * A * px * 1.05); x.stroke();
    }
    for (let i = 0; i < n; i++) {
      const a = a0 + i * TAU / n + (rand() - 0.5) * 0.5, len = r * (0.8 + rand() * 0.35), wid = r * (n > 6 ? 0.22 : 0.5) * (0.8 + rand() * 0.4);
      const g = x.createRadialGradient(X, Y, 0, X, Y, len);
      g.addColorStop(0, deep); g.addColorStop(0.35, mid); g.addColorStop(1, tip);
      x.save(); x.translate(X, Y); x.rotate(a); x.fillStyle = g; x.globalAlpha = 0.86;
      x.beginPath(); x.moveTo(0, 0);
      x.bezierCurveTo(len * 0.3, -wid, len * 0.9, -wid * 1.1, len, 0);
      x.bezierCurveTo(len * 0.9, wid * 1.1, len * 0.3, wid, 0, 0);
      x.setTransform(1, 0, 0, 1, 0, 0); x.fill(); x.restore();
    }
    if (heart) {
      const g = x.createRadialGradient(X, Y, 0, X, Y, r * 0.3);
      g.addColorStop(0, heart); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.9; x.fillStyle = g; x.beginPath(); x.arc(X, Y, r * 0.3, 0, TAU); x.fill();
    }
    x.globalAlpha = 1;
  }
  function bloomField(f, c, p) {
    const { w, h } = f, A = c.A, px = c.px, rand = c.rand;
    let src = f;
    if (!c.image) {
      const cv = mk(w, h), x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, w * 0.3, h);
      p.ground.forEach((col, i) => g.addColorStop(i / (p.ground.length - 1), col));
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      p.flowers.forEach(fl => drawFlower(x, fl, px, A, rand, p.stems));
      src = fromCanvas(cv);
    }
    const hard = { w, h, d: src.d.slice() };
    let out = src;
    if (p.zoom) out = sweep(out, { cx: p.center[0] * w, cy: p.center[1] * h, zoom: p.zoom, n: 36 });
    if (p.move) out = sweep(out, { dx: p.move[0] * w, dy: p.move[1] * w, n: 40, fall: p.fall });
    if (p.soft) soften(out, p.soft * w, p.soft * w, 3);
    // the flash: the flower as it was when the shutter opened, laid faintly over its own drag
    if (p.ghost) { const gh = soften({ w, h, d: hard.d.slice() }, w * 0.006, w * 0.006, 2).d; for (let i = 0; i < out.d.length; i++) out.d[i] += (gh[i] - out.d[i]) * p.ghost * (p.flash ? 1 : 0.6); }
    if (p.split) {    // red and blue pulled apart along the move, as through cheap glass
      const dx = p.split * w * Math.sign(p.move ? p.move[0] || 1 : 1), dy = p.split * w, cpy = { w, h, d: out.d.slice() }, t = [0, 0, 0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        out.d[i] = sample(cpy, x + 0.5 + dx, y + 0.5 + dy, t)[0];
        out.d[i + 2] = sample(cpy, x + 0.5 - dx, y + 0.5 - dy, t)[2];
      }
    }
    if (p.frame) {
      const m = p.frame;
      paint(out, (x, y, d, i) => { if (x < m || x > 1 - m || y < m / A || y > 1 - m / A * 1.6) { d[i] = 1; d[i + 1] = 0.995; d[i + 2] = 0.99; } });
    }
    return out;
  }
  function bloom(canvas, o) {
    o = o || {};
    const p = pick(BLOOM, o.palette, 'lilac');
    return run(canvas, o, { res: 0.25, panes: [Object.assign({ pane: 'grain' }, p.grain)], type: p.type, make: (f, c) => bloomField(f, c, p) });
  }

  // ---- coordinate: grain-gradient orbs on grey stock, a flare, small type ------
  /**
   * Computed at full size, because the orbs dissolve into dither: each pixel is either in a
   * shape or out of it, with a probability that follows the shape's soft edge. That is how a
   * gradient looks when a laser printer or a riso screens it, and it is the grain of this plate.
   */
  function coordinateField(f, c) {
    const { w, h, d } = f, A = c.A, n = c.noise, seed = c.seed * 17 + 3;
    const paper = rgb('#dedbd6'), red = ramp([[0, '#e2361a'], [0.3, '#ef5a2c'], [0.62, '#f4a078'], [1, '#e9d6cb']]);
    const dark = ramp([[0, '#0e0e10'], [0.5, '#3a3a3c'], [1, '#a9a8a6']]), blue = ramp([[0, '#0b1230'], [0.45, '#1e3a8f'], [0.8, '#6f86c6'], [1, '#c8cfe2']]);
    const tmp = [0, 0, 0], jit = c.rand() * 0.04;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = (x + 0.5) / w, Y = (y + 0.5) / h * A, i = (y * w + x) * 3;
      d[i] = paper[0]; d[i + 1] = paper[1]; d[i + 2] = paper[2];
      const dither = (a, k2) => { const b = a / 0.55; return b >= 1 ? 1 : clamp((b - hash(x, y, seed + k2)) * 4 + 0.5, 0, 1); };
      // the red glow: a soft four-pointed shape, half circle and half diamond
      { const dx = (X - 0.47 - jit) / 0.38, dy = (Y - 0.5 * A) / 0.46, e = 0.55 * Math.hypot(dx, dy) + 0.45 * (Math.abs(dx) + Math.abs(dy)) * 0.8;
        const a = Math.pow(clamp(1 - e, 0, 1), 1.3); if (a > 0) over(d, i, red(e, tmp), dither(a, 1)); }
      // the dark sphere, top right, lit from below left
      { const dx = (X - 0.72) / 0.19, dy = (Y - 0.26 * A) / 0.19, e = Math.hypot(dx, dy);
        const a = smooth(1.05, 0.55, e) * smooth(-0.9, 0.3, dx * 0.7 - dy * 0.7 + 0.2); if (a > 0) over(d, i, dark(clamp(0.5 - dx * 0.4 + dy * 0.4, 0, 1), tmp), dither(a, 2)); }
      // a blue-black crescent, low left
      { const dx = (X - 0.26) / 0.25, dy = (Y - 0.8 * A) / 0.25, e = Math.hypot(dx, dy), e2 = Math.hypot(dx - 0.38, dy + 0.3);
        const a = smooth(1.02, 0.8, e) * smooth(0.85, 1.25, e2); if (a > 0) over(d, i, blue(clamp(e2 - 0.9, 0, 1) * 1.4, tmp), dither(a, 3)); }
      // a blue orb, low right, dissolving at its edge
      { const dx = (X - 0.68) / 0.24, dy = (Y - 0.68 * A) / 0.26, e = Math.hypot(dx, dy);
        const a = Math.pow(clamp(1 - e, 0, 1), 0.7); if (a > 0) over(d, i, blue(clamp(e * 0.9 + 0.1 * fbm(n, X * 8, Y * 8, 2), 0, 1), tmp), dither(a, 4)); }
      // the flare: a star of light where the glow is densest
      { const dx = X - 0.47 - jit, dy = Y - 0.5 * A, ax = Math.abs(dx), ay = Math.abs(dy);
        const beam = Math.exp(-Math.pow(dy / 0.0016, 2)) * Math.exp(-ax / 0.22) + Math.exp(-Math.pow(dx / 0.0016, 2)) * Math.exp(-ay / 0.25), core = Math.exp(-(dx * dx + dy * dy) / 0.00012);
        const a = clamp(beam * 0.9 + core, 0, 1); if (a > 0.01) over(d, i, [1, 0.86, 0.55], a); }
    }
  }
  function coordinate(canvas, o) {
    o = o || {};
    return run(canvas, Object.assign({}, o, { image: null }), {
      res: 1, type: 'grid', make: (f, c) => coordinateField(f, c),
      panes: [{ pane: 'grain', amount: 0.07, chroma: 0.12 }],
    });
  }

  /** The words a plate prints with these options, in reading order: what its aria-label should repeat. */
  const TABLES = { reeded: REEDED, satin: SATIN, aurora: AURORA, streak: STREAK, bloom: BLOOM };
  function words(plate, o) {
    o = o || {};
    const table = TABLES[plate], own = plate === 'coordinate' ? 'grid' : table ? pick(table, o.palette, Object.keys(table)[0]).type : null;
    const layout = (o.text && o.text.layout) || own || (o.text ? 'block' : null);
    if (o.text === false || !layout) return [];
    const t = Object.assign({}, WORDS[layout], typeof o.text === 'object' ? o.text : null), list = [];
    const add = v => (Array.isArray(v) ? v : [v]).forEach(s => { if (s && s !== '↓') list.push(s); });
    ({ block: ['a', 'b', 'c', 'title', 'no'], serif: ['no', 'top', 'lines', 'sub', 'note', 'side', 'foot'], word: ['word'],
      grid: ['left', 'title', 'right', 'from', 'to', 'sideR', 'sideR2', 'sideL', 'sideL2', 'foot', 'foot2'] })[layout].forEach(k => add(t[k]));
    return list;
  }

  root.Surface = {
    reeded, satin, aurora, streak: streakPlate, bloom, coordinate, glass, words,
    PALETTES: { reeded: Object.keys(REEDED), satin: Object.keys(SATIN), aurora: Object.keys(AURORA), streak: Object.keys(STREAK), bloom: Object.keys(BLOOM), coordinate: ['stock'] },
    SW, RATIO, rng,
    // for live.js, which draws the reeded and streak fields in a shader from the same numbers
    _engine: { rng, makeNoise, fbm, hash, hashU, smooth, rgb, typeset, tables: TABLES, SW },
  };
})(typeof window !== 'undefined' ? window : globalThis);
