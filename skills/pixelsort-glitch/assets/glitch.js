/* glitch.js — five broken-file plates built on pixelsort.js. Load pixelsort.js first.
 *
 *   Glitch.melt(canvas, { width, height, cssWidth, seed, image });      // macroblocks, then the picture drips down its columns
 *   Glitch.tear(canvas, { width, height, cssWidth, seed, image });      // 1-bit scanlines that overrun, black bars on white
 *   Glitch.printout(canvas, { width, height, cssWidth, seed, text });   // a code listing on paper, smeared by a moving scanner
 *   Glitch.mojibake(canvas, { width, height, cssWidth, seed, image, bytes }); // a file's bytes opened as MacRoman text
 *   Glitch.mosaic(canvas, { width, height, cssWidth, seed, image, mode: 'lavender' | 'cut' | 'blocks' });
 *   Glitch.eye(ctx, w, h, rand);                                         // the stand-in photograph: a b/w close-up of an eye
 *
 * Every plate is made from a picture by doing something a file or a machine does to it:
 * blocks that lose their motion vectors, runs that overrun a scanline, a sheet dragged
 * through a scanner, bytes read in the wrong encoding, a grid of tiles that failed to
 * load. Pass `image` (any <img> or canvas) to break your own photograph instead of the
 * stand-in. Work is done at a coarse pixel size and scaled up nearest-neighbour, so
 * pixels stay square. Seeded; no dependencies beyond pixelsort.js. Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const PS = () => root.PixelSort;
  const rng = s => PS().mulberry32(s >>> 0);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const grey = (v, a) => `rgba(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0},${a == null ? 1 : a})`;
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const PALETTES = {
    mint: { ground: ['#e9f7f5', '#cdeeed', '#b9e2e0'], mass: ['#27353a', '#3d5b5c', '#6c9d9b', '#8c7652', '#a7d8d5', '#f6fcfb'] },
    paper: { paper: '#efede6', ink: '#76777c', green: '#3c9656', red: '#c4473d', blue: '#5a78c8', smear: ['#ff72b6', '#8fb8ff'] },
    file: { bands: ['#8b3a1c', '#b8552a', '#d9844a', '#e8b27a', '#6b2f2a', '#a0522d', '#5b3b6e', '#c9695a', '#3f6fb5'], highlight: '#e3e64b', mint: '#5fe3c3', purple: '#4a2a6a', term: '#79e07f' },
    lavender: '#c8c6e2',
  };

  /** Canvas sizes: the output in device pixels, the work canvas in "pixels" of `pixel` CSS px each. */
  function setup(canvas, o, pixel) {
    const W = Math.round(o.width || canvas.width), H = Math.round(o.height || canvas.height);
    canvas.width = W; canvas.height = H;
    const css = o.cssWidth ? o.cssWidth / W : 1, p = (o.pixel || pixel) / css;   // device px per work px
    return { W, H, w: Math.max(8, Math.round(W / p)), h: Math.max(8, Math.round(H / p)), dpr: 1 / css };
  }
  function blit(canvas, work, smooth) {
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.imageSmoothingEnabled = !!smooth; ctx.drawImage(work, 0, 0, canvas.width, canvas.height); ctx.restore();
    return canvas;
  }
  /** Draw `image` to cover a w×h canvas (centre crop). */
  function cover(ctx, image, w, h) {
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height, k = Math.max(w / iw, h / ih);
    ctx.drawImage(image, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
  }
  function bez(p, t) {   // cubic bezier point, p = [x0,y0,x1,y1,x2,y2,x3,y3]
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
  }

  // ---- the stand-in photograph ---------------------------------------------------
  /**
   * A black-and-white close-up of an eye: brow hairs, a lid crease, an almond opening,
   * an iris of radial fibres with a dark limbal ring, a catchlight, lashes curling out
   * toward the outer corner, and skin with pores and grain. Drawn, not traced.
   */
  function eye(ctx, w, h, rand, o) {
    o = o || {};
    const E = Math.min(w * 0.82, h * 1.15), cx = w * (0.5 + (rand() - 0.5) * 0.08), cy = h * (o.cy || 0.54);
    const sk = ctx.createRadialGradient(cx - E * 0.2, cy - E * 0.35, 0, cx, cy, Math.hypot(w, h) * 0.7);
    sk.addColorStop(0, grey(0.72)); sk.addColorStop(0.55, grey(0.56)); sk.addColorStop(1, grey(0.3));
    ctx.fillStyle = sk; ctx.fillRect(0, 0, w, h);
    const soft = (x, y, r, v, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, grey(v, a)); g.addColorStop(1, grey(v, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); };
    soft(cx, cy + E * 0.3, E * 0.45, 0.25, 0.28);        // the hollow under the eye
    soft(cx + E * 0.1, cy - E * 0.62, E * 0.5, 0.85, 0.3); // brow bone in light
    soft(cx - E * 0.55, cy - E * 0.05, E * 0.3, 0.2, 0.3); // the socket by the nose
    const inner = [cx - E * 0.5, cy + E * 0.04], outer = [cx + E * 0.5, cy - E * 0.03];
    const up = [inner[0], inner[1], cx - E * 0.26, cy - E * 0.36, cx + E * 0.24, cy - E * 0.37, outer[0], outer[1]];
    const lo = [outer[0], outer[1], cx + E * 0.26, cy + E * 0.19, cx - E * 0.22, cy + E * 0.24, inner[0], inner[1]];
    // brow: short hairs along an arch, flowing out toward the temple
    const lw = Math.max(1, E * 0.0032);
    ctx.lineCap = 'round';
    for (let i = 0; i < 1600; i++) {
      const t = rand(), x = cx - E * 0.62 + t * E * 1.3, y = cy - E * 0.66 + Math.pow((t - 0.45) * 1.6, 2) * E * 0.16 + (rand() - 0.5) * E * 0.11 * (1 - Math.abs(t - 0.4));
      const a = -0.5 + t * 0.55 + (rand() - 0.5) * 0.3, L = E * (0.05 + rand() * 0.06);
      ctx.strokeStyle = grey(0.06 + rand() * 0.2, 0.55); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.6, y + Math.sin(a) * L * 0.6 - L * 0.1, x + Math.cos(a + 0.2) * L, y + Math.sin(a + 0.2) * L); ctx.stroke();
    }
    // the lid crease, a soft fold above the lashes
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = grey(0.18, 0.12); ctx.lineWidth = E * (0.012 + k * 0.012);
      ctx.beginPath(); ctx.moveTo(inner[0] + E * 0.05, inner[1] - E * 0.12);
      ctx.bezierCurveTo(cx - E * 0.2, cy - E * 0.5, cx + E * 0.25, cy - E * 0.5, outer[0] + E * 0.02, outer[1] - E * 0.16); ctx.stroke();
    }
    // the opening
    const opening = new Path2D();
    opening.moveTo(up[0], up[1]); opening.bezierCurveTo(up[2], up[3], up[4], up[5], up[6], up[7]);
    opening.bezierCurveTo(lo[2], lo[3], lo[4], lo[5], lo[6], lo[7]); opening.closePath();
    ctx.save(); ctx.clip(opening);
    const sc = ctx.createLinearGradient(inner[0], 0, outer[0], 0);
    sc.addColorStop(0, grey(0.5)); sc.addColorStop(0.3, grey(0.84)); sc.addColorStop(0.7, grey(0.86)); sc.addColorStop(1, grey(0.52));
    ctx.fillStyle = sc; ctx.fillRect(inner[0], cy - E * 0.4, E, E * 0.7);
    const ix = cx + E * (0.02 + (rand() - 0.5) * 0.08), iy = cy - E * 0.04, r = E * 0.2, pr = r * (0.34 + rand() * 0.08);
    ctx.fillStyle = grey(0.42); ctx.beginPath(); ctx.arc(ix, iy, r, 0, TAU); ctx.fill();
    for (let i = 0; i < 900; i++) {   // stroma: radial fibres, light and dark
      const a = rand() * TAU, r0 = pr * (1 + rand() * 0.15), r1 = r * (0.55 + rand() * 0.45), wob = (rand() - 0.5) * 0.12;
      ctx.strokeStyle = rand() < 0.55 ? grey(0.18 + rand() * 0.2, 0.4) : grey(0.6 + rand() * 0.3, 0.35); ctx.lineWidth = Math.max(0.6, E * 0.0022);
      ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0);
      ctx.quadraticCurveTo(ix + Math.cos(a + wob) * (r0 + r1) / 2, iy + Math.sin(a + wob) * (r0 + r1) / 2, ix + Math.cos(a) * r1, iy + Math.sin(a) * r1); ctx.stroke();
    }
    ctx.strokeStyle = grey(0.75, 0.25); ctx.lineWidth = E * 0.01; ctx.beginPath(); ctx.arc(ix, iy, pr * 1.55, 0, TAU); ctx.stroke();   // collarette
    for (let k = 0; k < 5; k++) { ctx.strokeStyle = grey(0.08, 0.22); ctx.lineWidth = E * (0.006 + k * 0.007); ctx.beginPath(); ctx.arc(ix, iy, r - E * 0.004 * k, 0, TAU); ctx.stroke(); }   // limbal ring
    ctx.fillStyle = grey(0.03); ctx.beginPath(); ctx.arc(ix, iy, pr, 0, TAU); ctx.fill();
    const lid = ctx.createLinearGradient(0, cy - E * 0.36, 0, cy - E * 0.1);   // the upper lid's shadow on the eyeball
    lid.addColorStop(0, grey(0, 0.75)); lid.addColorStop(1, grey(0, 0));
    ctx.fillStyle = lid; ctx.fillRect(inner[0], cy - E * 0.4, E, E * 0.3);
    ctx.fillStyle = grey(1, 0.92); ctx.beginPath(); ctx.ellipse(ix - r * 0.32, iy - r * 0.28, r * 0.13, r * 0.1, -0.4, 0, TAU); ctx.fill();   // catchlight
    ctx.restore();
    // lid margins
    ctx.strokeStyle = grey(0.08, 0.9); ctx.lineWidth = E * 0.014;
    ctx.beginPath(); ctx.moveTo(up[0], up[1]); ctx.bezierCurveTo(up[2], up[3], up[4], up[5], up[6], up[7]); ctx.stroke();
    ctx.strokeStyle = grey(0.78, 0.6); ctx.lineWidth = E * 0.008;
    ctx.beginPath(); ctx.moveTo(lo[0], lo[1]); ctx.bezierCurveTo(lo[2], lo[3], lo[4], lo[5], lo[6], lo[7]); ctx.stroke();
    // lashes: long on the upper lid, curling up and out; short and sparse below
    const lash = (p, t, len, dir, v, a) => {
      const [x, y] = bez(p, t), [x2, y2] = bez(p, Math.min(1, t + 0.01)), tx = x2 - x, ty = y2 - y, n = Math.hypot(tx, ty) || 1;
      let nx = ty / n * dir, ny = -tx / n * dir;
      const bend = 0.55 * dir, ang = Math.atan2(ny, nx) + (t - 0.35) * 0.9 * dir;
      nx = Math.cos(ang); ny = Math.sin(ang);
      const ex = x + nx * len + Math.cos(ang + bend) * len * 0.35, ey = y + ny * len + Math.sin(ang + bend) * len * 0.35;
      ctx.strokeStyle = grey(v, a);
      for (let s = 0; s < 2; s++) {   // a thick root and a fine tip: the lash tapers
        ctx.lineWidth = E * (s ? 0.002 : 0.0042);
        const f = s ? 1 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + nx * len * 0.6 * f, y + ny * len * 0.6 * f, x + (ex - x) * f, y + (ey - y) * f); ctx.stroke();
      }
    };
    // lashes grow in clumps: a few centres along the lid, each with a handful of hairs leaning together
    for (let c = 0; c < 26; c++) {
      const t0 = 0.08 + rand() * 0.9, n = 3 + (rand() * 6 | 0), L = E * (0.06 + 0.08 * Math.sin(Math.PI * Math.min(1, t0 * 1.1)));
      for (let i = 0; i < n; i++) lash(up, clamp(t0 + (rand() - 0.5) * 0.035, 0, 1), L * (0.5 + rand() * 0.7), 1, 0.04 + rand() * 0.16, 0.4 + rand() * 0.4);
    }
    for (let i = 0; i < 40; i++) { const t = 0.05 + rand() * 0.7; lash(lo, t, E * (0.02 + rand() * 0.03), 1, 0.15 + rand() * 0.15, 0.4 + rand() * 0.3); }
  }
  /** Skin and film: pores, blotches, grain. Applied at full size after the eye is softened. */
  function skin(ctx, w, h, sd) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, n = (hash(x, y, sd) - 0.5) * 34 + (hash(x >> 3, y >> 3, sd + 1) - 0.5) * 10 + (hash(x >> 5, y >> 5, sd + 3) - 0.5) * 8 - (hash(x, y, sd + 2) > 0.985 ? 26 : 0);
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }
  /** The picture a plate breaks: your image, cropped to fit, or the stand-in eye, drawn at half size and enlarged so it is soft like a lens, then grained. */
  function source(o, w, h, rand, eyeOpts) {
    const c = mk(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    if (o.image) { cover(ctx, o.image, w, h); return c; }
    const k = 0.5, s = mk(w * k, h * k);
    eye(s.getContext('2d'), s.width, s.height, rand, eyeOpts);
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(s, 0, 0, w, h);
    skin(ctx, w, h, (rand() * 1e6) | 0);
    return c;
  }

  // ---- tools ---------------------------------------------------------------------
  /** Replace each size×size block with its mean: the picture as a codec at the bottom of its bitrate sees it. */
  function macroblock(img, size, x0, y0, x1, y1) {
    const { width: w, data: d } = img;
    for (let by = y0; by < y1; by += size) for (let bx = x0; bx < x1; bx += size) {
      let r = 0, g = 0, b = 0, n = 0;
      const ey = Math.min(y1, by + size), ex = Math.min(x1, bx + size);
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      r /= n; g /= n; b /= n;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; }
    }
    return img;
  }
  /** Ordered (Bayer 4×4) dither of luminance to `levels` greys. */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dither(img, levels) {
    const { width: w, height: h, data: d } = img, n = levels - 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const v = Math.floor(l * n + (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16) / n * 255;
      d[i] = d[i + 1] = d[i + 2] = clamp(v, 0, 255);
    }
    return img;
  }
  /** Map luminance through two colours (a duotone). */
  function duotone(img, a, b) {
    const A = hex(a), B = hex(b), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      d[i] = A[0] + (B[0] - A[0]) * l; d[i + 1] = A[1] + (B[1] - A[1]) * l; d[i + 2] = A[2] + (B[2] - A[2]) * l;
    }
    return img;
  }

  // ---- I. melt: macroblocks above, the columns dripping below ------------------------
  function melt(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 2, palette: 'mint' }, opts);
    const pal = PALETTES[o.palette] || PALETTES.mint, { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 31 + 7);
    const c = mk(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    const g = ctx.createLinearGradient(0, 0, 0, h);
    pal.ground.forEach((col, i) => g.addColorStop(i / (pal.ground.length - 1), col));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const top = h * (0.3 + rand() * 0.06), bot = h * (0.5 + rand() * 0.06);
    if (o.image) {   // your picture, laid in as the band that breaks
      const s = mk(w, h); cover(s.getContext('2d'), o.image, w, h);
      ctx.drawImage(s, 0, top - h * 0.1, w, bot - top + h * 0.2, 0, top - h * 0.1, w, bot - top + h * 0.2);
    } else {         // a dark mass: figures, a doorway, a car, something the file used to hold
      for (let i = 0; i < 40; i++) {
        const bw = w * (0.02 + rand() * 0.12), bh = (bot - top) * (0.3 + rand() * 0.8), x = w * (0.08 + rand() * 0.72), y = top + (bot - top) * rand() * 0.6;
        ctx.fillStyle = pal.mass[rand() < 0.45 ? (rand() * 2 | 0) : 2 + (rand() * 4 | 0)]; ctx.globalAlpha = 0.7 + rand() * 0.3; ctx.fillRect(x, y, bw, bh);
      }
      ctx.globalAlpha = 1;
    }
    let img = ctx.getImageData(0, 0, w, h);
    const B = Math.max(4, Math.round(Math.min(w, h) / 22));
    // the band loses its detail in macroblocks, some split once more
    macroblock(img, B, 0, Math.floor(top / B) * B - B, w, Math.ceil(bot / B) * B);
    const d = img.data;
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
      const x = rand() * w | 0, y = (rand() * Math.sqrt(rand()) * top) | 0, sx = rand() * w | 0, sy = (top + rand() * (bot - top)) | 0, i = (y * w + x) * 4, j = (sy * w + sx) * 4;
      const s = 1 + (rand() * 2 | 0);
      for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) if (x + xx < w && y + yy < h) d.set(d.subarray(j, j + 3), ((y + yy) * w + x + xx) * 4);
    }
    // the drip: each run of columns is stretched down from the band, a different amount per run
    const src = new Uint8ClampedArray(d);
    for (let x = 0; x < w;) {
      const run = 1 + (rand() * rand() * 5 | 0), y0 = Math.round(bot - (bot - top) * rand() * 0.7), k = 0.12 + rand() * rand() * 0.8, reach = rand() < 0.2 ? 0.5 + rand() * 0.4 : 1;
      for (let xx = x; xx < Math.min(w, x + run); xx++) {
        const end = y0 + (h - y0) * reach;
        for (let y = y0; y < end; y++) {
          const sy = Math.min(h - 1, Math.round(y0 + (y - y0) * k)), i = (y * w + xx) * 4, j = (sy * w + xx) * 4;
          d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2];
        }
      }
      x += run;
    }
    // and inside the drip, the columns are sorted: lighter pixels slide to the bottom of each interval
    const mask = new ImageData(w, h);
    for (let y = Math.round(bot); y < h; y++) for (let x = 0; x < w; x++) mask.data[(y * w + x) * 4] = 255;
    img = PS().sort(img, { mode: 'threshold', key: 'lightness', lo: 0.08, hi: 0.86, angle: 90, randomness: 0.35, seed: o.seed, mask });
    ctx.putImageData(img, 0, 0);
    return blit(canvas, c, false);
  }

  // ---- II. tear: a 1-bit picture whose scanlines overrun -----------------------------
  function tear(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 2 }, opts);
    const { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 17 + 3);
    const s = source(o, w, h, rand, { cy: 0.5 }), L = s.getContext('2d').getImageData(0, 0, w, h).data;
    const c = mk(w, h), ctx = c.getContext('2d'), out = ctx.createImageData(w, h), d = out.data;
    const lum = (x, y) => (0.299 * L[(y * w + x) * 4] + 0.587 * L[(y * w + x) * 4 + 1] + 0.114 * L[(y * w + x) * 4 + 2]) / 255;
    const prof = new Float32Array(w), sample = [];
    for (let k = 0; k < 4000; k++) sample.push(lum(rand() * w | 0, rand() * h | 0));
    sample.sort((a, b) => a - b);
    const thr = sample[(sample.length * (o.ink || 0.2)) | 0];   // the level that leaves about a third of the plate black once runs overrun, whatever the picture
    for (let y = 0; y < h;) {
      const bh = 1 + (rand() * rand() * 9 | 0), stipple = rand() < 0.18, bias = (rand() - 0.5) * 0.08, shift = rand() < 0.1 ? Math.round((rand() - 0.5) * w * 0.3) : 0;
      for (let x = 0; x < w; x++) { let v = 0; for (let yy = y; yy < Math.min(h, y + bh); yy++) v += lum(clamp(x - shift, 0, w - 1), yy); prof[x] = v / Math.min(bh, h - y); }
      // walk the row: once a run goes black it overruns for a while, the way a stuck line does
      let x = 0;
      const row = new Uint8Array(w);
      while (x < w) {
        const v = prof[x] + bias;
        if (stipple && v > thr - 0.08 && v < thr + 0.14) { row[x] = hash(x, y, o.seed) > (v - thr + 0.08) / 0.22 ? 1 : 0; x++; continue; }
        if (v < thr) {
          const len = 1 + Math.round((rand() * rand()) * w * 0.22);
          for (let i = x; i < Math.min(w, x + len); i++) row[i] = 1;
          x += len;
        } else x++;
      }
      for (let yy = y; yy < Math.min(h, y + bh); yy++) for (let x2 = 0; x2 < w; x2++) {
        const i = (yy * w + x2) * 4, v = row[x2] ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      y += bh;
      if (rand() < 0.3) {   // a white gap: the line dropped
        const gap = 1 + (rand() * 3 | 0);
        for (let yy = y; yy < Math.min(h, y + gap); yy++) for (let x2 = 0; x2 < w; x2++) { const i = (yy * w + x2) * 4; d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255; }
        y += gap;
      }
    }
    ctx.putImageData(out, 0, 0);
    return blit(canvas, c, false);
  }

  // ---- III. printout: a listing on paper, dragged through the scanner ---------------------
  function printout(canvas, opts) {
    const o = Object.assign({ seed: 1, font: '"IBM Plex Mono", ui-monospace, monospace' }, opts);
    const pal = PALETTES.paper, { W, H, dpr } = setup(canvas, o, 1), rand = rng(o.seed * 13 + 5);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), w = W / dpr, h = H / dpr;
    ctx.save(); ctx.scale(dpr, dpr);
    ctx.fillStyle = pal.paper; ctx.fillRect(0, 0, w, h);
    const text = (o.text || String(tear) + '\n' + String(melt)).split('\n');
    const fs = clamp(Math.round(Math.min(w, h) / 44), 10, 15), lh = fs * 1.6, x0 = Math.max(16, w * 0.07);
    let line = (rand() * text.length) | 0;
    ctx.font = `400 ${fs}px ${o.font}`; ctx.textBaseline = 'alphabetic';
    for (let y = h * 0.05; y < h * 1.02; y += lh) {
      const t = text[line++ % text.length].replace(/\t/g, '  ');
      if (!t.trim() || rand() < 0.22) continue;   // blank lines, and lines the printer skipped
      const r = rand(), col = r < 0.16 ? pal.green : r < 0.22 ? pal.red : r < 0.27 ? pal.blue : pal.ink;
      ctx.fillStyle = col; ctx.globalAlpha = 0.4 + rand() * 0.5;   // toner: some lines hardly took
      ctx.fillText(t.slice(0, 110), x0, y);
      if (rand() < 0.05) { ctx.font = `400 ${fs * 0.8}px ${o.font}`; ctx.fillStyle = pal.red; ctx.fillText('— ' + t.trim().slice(0, 18), w * (0.72 + rand() * 0.1), y - lh * 0.5); ctx.font = `400 ${fs}px ${o.font}`; }   // a note in the margin
    }
    ctx.globalAlpha = 1; ctx.restore();
    let img = ctx.getImageData(0, 0, W, H), d = img.data;
    // the scanner's optics: a light 3×3 softening, so the type sits in the paper
    let src = new Uint8ClampedArray(d);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) for (let ch = 0; ch < 3; ch++) {
      const i = (y * W + x) * 4 + ch, n = src[i - 4] + src[i + 4] + src[i - W * 4] + src[i + W * 4];
      d[i] = src[i] * 0.5 + n * 0.125;
    }
    // the smear: where the sheet moved, each row is stretched sideways from a point, channels apart
    src = new Uint8ClampedArray(d);
    const cy = H * (0.28 + rand() * 0.25), bh = H * (0.06 + rand() * 0.04), ax = W * (0.1 + rand() * 0.3);
    const tint = pal.smear.map(hex);
    for (let y = Math.max(0, Math.round(cy - bh)); y < Math.min(H, Math.round(cy + bh * 1.4)); y++) {
      const t = Math.max(0, 1 - Math.abs(y - cy) / bh), k = 1 + t * (4 + rand() * 8), off = [0, Math.round(t * 5 * dpr), Math.round(-t * 8 * dpr)];
      // the lamp's colour: pink across the tear, blue just under it, in streaks that vary row by row
      const u = (y - cy) / bh, col = u < 0.35 ? tint[0] : tint[1], a = (u < 0.35 ? Math.exp(-u * u * 1.6) * 0.7 : Math.exp(-(u - 0.8) * (u - 0.8) * 4) * 0.45) * (0.35 + 0.65 * hash(0, y >> 1, o.seed));
      for (let x = 0; x < W; x++) {
        const fade = clamp((x - ax * 0.5) / (W * 0.35), 0, 1) * clamp((W * 0.97 - x) / (W * 0.1), 0, 1), m = a * fade;
        for (let ch = 0; ch < 3; ch++) {
          const sx = clamp(Math.round(ax + (x - ax) / k) + off[ch], 0, W - 1), v = t > 0 ? src[(y * W + sx) * 4 + ch] : src[(y * W + x) * 4 + ch];
          d[(y * W + x) * 4 + ch] = v * (1 - m * (1 - col[ch] / 255));
        }
      }
    }
    // paper tooth and a little scanner noise
    const sd = o.seed * 7;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = (hash(x, y, sd) - 0.5) * 10 + (hash(x >> 3, y, sd + 1) - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // ---- IV. mojibake: the file opened as text -----------------------------------------
  const MACROMAN = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ?ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
  /** Bytes read as MacRoman, the way an old text editor opens a JPEG. Control bytes are dropped. */
  function asText(bytes) {
    let s = '';
    for (const b of bytes) s += b >= 128 ? MACROMAN[b - 128] : b >= 32 && b < 127 ? String.fromCharCode(b) : '';
    return s;
  }
  /** A canvas encoded as JPEG, returned from the start of its scan data: the picture itself, not the header. */
  function bytesOf(c) {
    const b64 = c.toDataURL('image/jpeg', 0.5).split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    for (let i = 0; i < u.length - 3; i++) if (u[i] === 0xff && u[i + 1] === 0xda) return u.subarray(i + 2 + ((u[i + 2] << 8) | u[i + 3]));
    return u;
  }
  function mojibake(canvas, opts) {   // opts.bytes (a Uint8Array of any file) is read instead of the picture's own JPEG
    const o = Object.assign({ seed: 1, mono: '"IBM Plex Mono", ui-monospace, monospace', sans: 'Archivo, Helvetica, Arial, sans-serif' }, opts);
    const pal = PALETTES.file, { W, H, dpr } = setup(canvas, o, 1), rand = rng(o.seed * 23 + 1);
    const w = W / dpr, h = H / dpr, ctx = canvas.getContext('2d');
    // the picture that became the file: yours, or a warm stand-in
    const pic = mk(160, 120), pc = pic.getContext('2d');
    if (o.image) cover(pc, o.image, 160, 120);
    else {
      for (let y = 0; y < 120; y += 2 + (rand() * 6 | 0)) { pc.fillStyle = pal.bands[rand() * pal.bands.length | 0]; pc.fillRect(0, y, 160, 8); }
      for (let k = 0; k < 14; k++) {   // soft shapes, so a single row of it changes colour along its length
        const x = rand() * 160, y = rand() * 120, r = 12 + rand() * 50, g = pc.createRadialGradient(x, y, 0, x, y, r), [R, G, B] = hex(pal.bands[rand() * pal.bands.length | 0]);
        g.addColorStop(0, `rgba(${R},${G},${B},.9)`); g.addColorStop(1, `rgba(${R},${G},${B},0)`); pc.fillStyle = g; pc.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    }
    const text = asText(o.bytes ? o.bytes.subarray(0, 60000) : bytesOf(pic)) || '?';
    let ti = (rand() * 400) | 0;
    const take = n => { let s = ''; while (s.length < n) { s += text[ti % text.length]; ti++; } return s; };
    ctx.save(); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fdfdfb'; ctx.fillRect(0, 0, w, h);
    const S = Math.min(w, h), fs = clamp(Math.round(S / 60), 9, 13);
    // A. the picture's rows, each stretched across as a band: the image read one line at a time
    const bx = 0, bw = w * (0.5 + rand() * 0.1), by = 0, bhh = h * (0.36 + rand() * 0.08);
    const rows = pc.getImageData(0, 0, 160, 120).data;
    for (let y = by; y < by + bhh;) {
      const t = (rand() * 120) | 0, sh = 1 + (rand() * rand() * 9 | 0), i = (t * 160 + (rand() * 160 | 0)) * 4, bw2 = rand() < 0.12 ? w : bw * (0.7 + rand() * 0.3);
      if (rand() < 0.6) { ctx.imageSmoothingEnabled = false; ctx.drawImage(pic, 0, t, 160, 1, bx, y, bw2, sh); }   // a whole row, stretched
      else { ctx.fillStyle = `rgb(${rows[i]},${rows[i + 1]},${rows[i + 2]})`; ctx.fillRect(bx, y, bw2, sh); }       // one pixel of it, stretched further
      y += sh;
    }
    // tiny text over the bands: the editor's view of the same bytes
    ctx.font = `400 ${fs * 0.75}px ${o.mono}`; ctx.fillStyle = '#1a1a1a';
    for (let y = fs; y < h * 0.24; y += fs * 0.9) if (rand() < 0.55) { ctx.globalAlpha = 0.5 + rand() * 0.5; ctx.fillText(take(90), bw * rand() * 0.4, y); }
    ctx.globalAlpha = 1;
    // B. a heading: a few bytes set large, as if someone pasted them into a layout
    ctx.font = `700 ${clamp(S * 0.06, 22, 52)}px ${o.sans}`; ctx.fillStyle = '#111';
    ctx.fillText(take(9).replace(/\s/g, 'x'), w * (0.52 + rand() * 0.1), h * 0.1);
    // C. lines of mojibake with highlighter bars behind stretches of them
    ctx.font = `500 ${fs * 1.3}px ${o.mono}`;
    const ly = h * (0.4 + rand() * 0.05);
    for (let k = 0; k < 5; k++) {
      const y = ly + k * fs * 1.9, s = take(34 + (rand() * 20 | 0)), x = w * rand() * 0.08, cw = ctx.measureText('M').width;
      const hs = rand() * s.length * 0.5 | 0, he = hs + 6 + (rand() * 22 | 0);
      ctx.fillStyle = rand() < 0.75 ? pal.highlight : pal.purple; const hl = ctx.fillStyle;
      ctx.fillRect(x + hs * cw, y - fs * 1.2, (he - hs) * cw, fs * 1.6);
      ctx.fillStyle = hl === pal.purple ? '#f3eefa' : pal.purple; ctx.fillText(s.slice(hs, he), x + hs * cw, y);
      ctx.fillStyle = '#231a2c'; ctx.fillText(s.slice(0, hs), x, y); ctx.fillText(s.slice(he), x + he * cw, y);
    }
    // D. a mint bar with a torn edge
    const my = h * (0.62 + rand() * 0.04);
    ctx.fillStyle = pal.mint; ctx.fillRect(0, my, w * (0.35 + rand() * 0.25), fs * 0.9);
    for (let x = 0; x < w * 0.3; x += 4) if (rand() < 0.4) ctx.fillRect(x, my + fs * 0.9, 4, 1 + rand() * 4);
    // E. sparse punctuation drifting over the white: the bytes that were only ever spaces and marks
    ctx.font = `400 ${fs}px ${o.mono}`;
    const marks = '^~`\',.;:"-_<>/\\|()*';
    for (let y = h * 0.52; y < h * 0.95; y += fs * 1.3) for (let x = w * 0.3; x < w; x += fs * 0.9) {
      const r = hash(x | 0, y | 0, o.seed);
      if (r < 0.1) { ctx.fillStyle = r < 0.012 ? '#c0392b' : r < 0.02 ? '#27884a' : '#222'; ctx.fillText(marks[(r * 1000 | 0) % marks.length], x, y); }
    }
    // F. a terminal in the corner: dark, green glyphs
    const tx = 0, ty = h * (0.8 + rand() * 0.04), tw = w * (0.3 + rand() * 0.12);
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(tx, ty, tw, h - ty);
    ctx.font = `400 ${fs * 0.85}px ${o.mono}`; ctx.fillStyle = pal.term;
    for (let y = ty + fs; y < h; y += fs) { ctx.globalAlpha = 0.4 + rand() * 0.6; ctx.fillText(take(Math.ceil(tw / (fs * 0.5))), tx + 3, y); }
    ctx.globalAlpha = 1;
    // G. a strip of characters packed so tight it reads as a barcode
    ctx.font = `700 ${fs * 0.7}px ${o.mono}`; ctx.fillStyle = '#111';
    const sy = h * (0.88 + rand() * 0.03);
    for (let x = tw; x < w * (0.6 + rand() * 0.3); x += fs * 0.22) ctx.fillText(take(1), x, sy);
    // H. a thin column of the bands down the left edge
    for (let y = bhh; y < h * 0.8; y += 3) { const i = ((rand() * 120 | 0) * 160) * 4; ctx.fillStyle = `rgb(${rows[i]},${rows[i + 1]},${rows[i + 2]})`; ctx.fillRect(0, y, fs * (1 + rand()), 3); }
    ctx.restore();
    return canvas;
  }

  // ---- V. mosaic: a photograph in tiles that did not all arrive ------------------------
  function mosaic(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 1, mode: 'lavender' }, opts);
    const { w, h } = setup(canvas, o, o.pixel), rand = rng(o.seed * 41 + 9);
    const photo = source(o, w, h, rand), pctx = photo.getContext('2d', { willReadFrequently: true });
    let img = pctx.getImageData(0, 0, w, h);
    const c = mk(w, h), ctx = c.getContext('2d');
    const cell = Math.round(Math.min(w, h) / (o.mode === 'cut' ? 16 : o.mode === 'blocks' ? 20 : 8));
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    if (o.mode === 'lavender') {
      duotone(img, '#2a2320', '#ece5dc'); pctx.putImageData(img, 0, 0);   // a warm grey print
      ctx.drawImage(photo, 0, 0);
      ctx.fillStyle = PALETTES.lavender;
      // columns of uneven width, each a stack of tiles that either arrived (the photo) or did not (lavender)
      const cw = w / (5 + (rand() * 2 | 0)), tall = h / (8 + (rand() * 3 | 0));
      for (let x = 0; x < w;) {
        const colw = Math.round(cw * (rand() < 0.3 ? 0.5 : 1));
        let y = -Math.round(rand() * tall);
        while (y < h) {
          const span = Math.round(tall * (1 + (rand() * rand() * 3 | 0))), mid = Math.hypot((x + colw / 2) / w - 0.5, (y + span / 2) / h - 0.5);
          if (rand() < 0.3 + mid * 0.5) ctx.fillRect(x + (rand() < 0.15 ? Math.round(colw / 2) : 0), y, colw, span);
          y += span;
        }
        x += colw;
      }
    } else if (o.mode === 'cut') {
      duotone(img, '#161412', '#f0eeea'); pctx.putImageData(img, 0, 0);
      ctx.fillStyle = '#f1f0ed'; ctx.fillRect(0, 0, w, h);
      const ccx = cols * (0.4 + rand() * 0.2), ccy = rows * (0.42 + rand() * 0.1), R = Math.min(cols, rows) * 0.42;
      for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
        const dd = Math.hypot((gx - ccx) / 0.8, gy - ccy) / R + (hash(gx, gy, o.seed) - 0.5) * 0.7;
        if (dd > 1) continue;
        const r = hash(gx, gy, o.seed + 1);
        if (r < 0.08) continue;                                  // a hole
        const off = r > 0.9 ? [(rand() < 0.5 ? -1 : 1) * cell * (1 + (rand() * 3 | 0)), 0] : [0, 0];   // a tile from the wrong place
        ctx.drawImage(photo, gx * cell + off[0], gy * cell + off[1], cell, cell, gx * cell, gy * cell, cell, cell);
      }
    } else {   // 'blocks': a dithered grey print, white pixels stepping in from the edges
      dither(img, 6); pctx.putImageData(img, 0, 0);
      ctx.drawImage(photo, 0, 0);
      ctx.fillStyle = '#ffffff';
      // staircases: each walker starts on the top or bottom edge and steps diagonally inward, a tile at a time
      for (let k = 0; k < 9; k++) {
        const edge = k % 2, dir = rand() < 0.5 ? -1 : 1;
        let gx = rand() * cols | 0, gy = edge ? rows - 1 : 0;
        for (let n = 4 + (rand() * 12 | 0); n > 0; n--) {
          ctx.fillRect(gx * cell, gy * cell, cell * (rand() < 0.25 ? 2 : 1), cell);
          const r = rand();
          if (r < 0.55) { gx += dir; gy += edge ? -1 : 1; } else if (r < 0.8) gx += dir * 2; else { gy += edge ? -2 : 2; gx -= dir; }
          if (gy < 0 || gy >= rows || rand() < 0.04) break;
        }
      }
      for (let k = 0; k < cols; k++) { const gx = rand() * cols | 0, gy = rand() < 0.5 ? (rand() * rand() * rows * 0.25 | 0) : rows - 1 - (rand() * rand() * rows * 0.25 | 0); ctx.fillRect(gx * cell, gy * cell, cell, cell); }
    }
    return blit(canvas, c, o.pixel < 1);
  }

  root.Glitch = { melt, tear, printout, mojibake, mosaic, eye, macroblock, dither, duotone, asText, PALETTES };
})(typeof window !== 'undefined' ? window : globalThis);
