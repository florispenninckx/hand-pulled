/* haze.js — soft-focus photographs made in code: defocus, motion, shade and grain.
 *
 *   Haze.petals(canvas, { width, height, seed, palette: 'blush' });   // translucent petals, out of focus
 *   Haze.poppies(canvas, { width, height, seed, palette: 'coral' });  // cut flowers moving past the lens
 *   Haze.shade(canvas, { width, height, seed, t });                   // a leaf sun print on green paper; t sways the leaves
 *   Haze.streak(canvas, { width, height, seed });                     // a figure in sepia motion blur
 *   Haze.develop(canvas, image, { width, height, look: 'sepia' });    // any photograph through one of the four looks
 *   Haze.grain(element, { opacity });                                 // a static grain overlay, for animated plates
 *
 * Every image is made the way a camera makes it. A scene is drawn small (it is
 * all soft, so a third of the pixels is plenty) with a margin round it, then
 * blurred the way a lens blurs: defocus averages the scene over a disc (a real
 * aperture, not a gaussian), motion averages it along a line. Near things are
 * drawn over the blurred far things and blurred less — depth of field. The small
 * image is scaled up, and only then does grain go on, at full device resolution,
 * strongest in the midtones, the way film grain is.
 *
 * No WebGL, no ctx.filter (not portable), no dependencies. Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, GA = Math.PI * (3 - Math.sqrt(5));

  const PALETTES = {
    // dusty rose-beige air, translucent pink petals deepening where they overlap, an ochre-green bloom low down
    blush: { ground: ['#d9ccc4', '#cdb8ad', '#d6cbc3'], wash: '#c9a49a', petal: ['#98505e', '#c6848c', '#e3bdb8'], rim: '#8f4f58', heart: '#c9a060', bud: ['#9c7a3e', '#c9b27c', '#e0d4b4'], veil: '#e6ddd6' },
    // milky pink-cream, poppies from oxblood through coral to peach, sap-green stems
    coral: { ground: ['#efe6df', '#ecd2d2', '#e6c7cb'], wash: '#d98aa0', petal: ['#8a2a1e', '#d2472b', '#ec7b47', '#f4b590'], stem: '#7b9451', veil: '#f3ebe6' },
    // a sun print on green paper: olive where the light fell, pale butter where a leaf kept it off
    sage: { ground: '#b3b467', deep: '#a2a65a', leaf: '#e2d49e', border: '#ebe2b8', veil: '#e6dcb0' },
    // a sepia print: brown-black shadows, warm browns, parchment highlights
    sepia: { ramp: ['#2e2210', '#4c3a1c', '#766140', '#a38e6c', '#cdbd9f', '#e6dcc6'] },
  };

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
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a == null ? 1 : a})`; };
  const grey = (v, a) => `rgba(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0},${a == null ? 1 : a})`;

  // ---- the lens -------------------------------------------------------------
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
    const once = spread(src, disc(r, Math.min(44, 14 + Math.round(r))));
    return r > 2.5 ? spread(once, disc(r * 0.3, 10)) : once;
  }
  /** Moving: the scene averaged along a line of `len` px at `ang`. */
  function motion(src, len, ang) {
    if (len < 1) return src;
    const n = Math.min(56, Math.max(8, Math.round(len / 1.2))), pts = [];
    for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * len; pts.push([Math.cos(ang) * t, Math.sin(ang) * t]); }
    return spread(src, pts);
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

  /**
   * Upscale the stage into the output canvas, then — at full resolution — map
   * through a tone ramp, vignette, veil and grain.
   *   grain     0..~0.2, amplitude as a fraction of full scale (0.07 reads as film)
   *   veil      0..1, lift toward veilColor (a milky, low-contrast print)
   *   vignette  0..1, corners darkened by this much
   *   ramp      optional array of hex stops: luminance is re-coloured through it
   */
  function finish(canvas, st, src, o) {
    const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, st.m, st.m, st.w, st.h, 0, 0, W, H); ctx.restore();
    const amp = (o.grain == null ? 0.07 : o.grain) * 255, veil = o.veil || 0, vig = o.vignette || 0;
    const vc = hex(o.veilColor || '#ffffff'), ramp = o.ramp ? o.ramp.map(hex) : null, seed = (o.seed | 0) * 7 + 1;
    if (!amp && !veil && !vig && !ramp) return canvas;
    const img = ctx.getImageData(0, 0, W, H), d = img.data, cx = W / 2, cy = H / 2, inv = 1 / (cx * cx + cy * cy);
    const gs = Math.max(1, Math.round(Math.min(W, H) / 700));   // grain clumps scale with the print, not the screen
    const last = ramp ? ramp.length - 1 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (ramp) {
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255 * last, k = Math.min(last - 1, l | 0), u = l - k, c0 = ramp[k], c1 = ramp[k + 1];
        r = c0[0] + (c1[0] - c0[0]) * u; g = c0[1] + (c1[1] - c0[1]) * u; b = c0[2] + (c1[2] - c0[2]) * u;
      }
      if (vig) { const q = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * inv, f = 1 - vig * q * q; r *= f; g *= f; b *= f; }
      if (veil) { r += (vc[0] - r) * veil; g += (vc[1] - g) * veil; b += (vc[2] - b) * veil; }
      if (amp) {
        const l = (r + g + b) / 765;
        const n = (hash(x, y, seed) + hash(x, y, seed + 1) - 1 + 0.7 * (hash(x / gs | 0, y / gs | 0, seed + 2) - 0.5)) * amp * (0.35 + 2.6 * l * (1 - l));
        r += n; g += n; b += n;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
  function setup(canvas, o, scale) {
    const W = o.width || canvas.width, H = o.height || canvas.height;
    canvas.width = W; canvas.height = H;
    const s = (o.resolution || scale) * (o.cssWidth ? o.cssWidth / W : 1);
    return { W, H, w: Math.max(16, Math.round(W * s)), h: Math.max(16, Math.round(H * s)) };
  }

  // ---- flower parts ----------------------------------------------------------
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
  /** Paint one petal: a colour pass that can lighten, then a multiply pass so overlaps deepen like tissue. */
  function paintPetal(ctx, p, cols, a, squash) {
    ctx.save(); tilt(ctx, p, squash);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.len * 1.05);
    cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c));
    fan(ctx, p); ctx.fillStyle = g;
    ctx.globalAlpha = a * 0.55; ctx.globalCompositeOperation = 'source-over'; ctx.fill();
    ctx.globalAlpha = a * 0.45; ctx.globalCompositeOperation = 'multiply'; ctx.fill();
    ctx.restore();
  }
  /** The petal's folded rim: a thin darker line along its edge, the thing that stays legible when all else is blur. */
  function rim(ctx, p, col, a, lw, squash) {
    ctx.save(); tilt(ctx, p, squash);
    fan(ctx, p); ctx.clip();   // inside only, so the line fades into the petal and not the air
    fan(ctx, p); ctx.globalCompositeOperation = 'multiply'; ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw * 2; ctx.stroke();
    ctx.restore();
  }

  // ---- I. petals: a bloom so close and so out of focus it is only colour and edges
  function petals(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'blush', grain: 0.08, veil: 0.06, vignette: 0.08 }, opts);
    const pal = PALETTES[o.palette] || PALETTES.blush, { w, h } = setup(canvas, o, 0.34), rand = mulberry32(o.seed >>> 0);
    const D0 = Math.hypot(w, h), S = Math.min(w, h), far = S * 0.038, m = Math.ceil(far * 1.6), st = stage(w, h, m), ctx = st.ctx;
    const gr = ctx.createLinearGradient(0, -m, w * 0.3, h + m);
    pal.ground.forEach((c, i) => gr.addColorStop(i / (pal.ground.length - 1), c));
    ctx.fillStyle = gr; ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
    wash(ctx, w * (0.3 + 0.4 * rand()), h * (0.3 + 0.3 * rand()), D0 * 0.5, pal.wash, 0.55);
    // the bloom: a centre above the middle, seen at an angle, petals big enough to leave the frame
    const cx = w * (0.34 + rand() * 0.3), cy = h * (0.26 + rand() * 0.16), n = 5, rot = rand() * TAU, len = S * (0.66 + rand() * 0.12);
    const sq = { ang: rand() * Math.PI, k: 0.72 + rand() * 0.2 };
    const outer = [], inner = [];
    for (let i = 0; i < n; i++) outer.push(petalSpec(rand, cx, cy, rot + i * TAU / n + (rand() - 0.5) * 0.5, len * (0.8 + rand() * 0.4), TAU / n * (0.62 + rand() * 0.2), 0.06 + rand() * 0.05));
    for (let i = 0; i < 3; i++) inner.push(petalSpec(rand, cx, cy, rot + (i + 0.5) * TAU / 3 + (rand() - 0.5) * 0.6, len * (0.45 + rand() * 0.2), 0.9 + rand() * 0.3, 0.08));
    const cols = [pal.petal[0], pal.petal[1], pal.petal[2], rgba(pal.petal[2], 0.55)];
    const lw = S * 0.004;
    // a pale bloom low in the frame, ochre to cream, further off
    const bx = w * (0.5 + rand() * 0.4), by = h * (0.9 + rand() * 0.12), bl = S * (0.32 + rand() * 0.1), bsq = { ang: rand() * Math.PI, k: 0.55 };
    for (let i = 0; i < 5; i++) { const p = petalSpec(rand, bx, by, i * TAU / 5 + rand(), bl * (0.8 + rand() * 0.3), 0.8, 0.06); paintPetal(ctx, p, [pal.bud[0], pal.bud[1], pal.bud[2], rgba(pal.bud[2], 0.3)], 0.85, bsq); rim(ctx, p, pal.bud[0], 0.3, lw, bsq); }
    for (const p of outer) { paintPetal(ctx, p, cols, 1, sq); rim(ctx, p, pal.rim, 0.3, lw * 1.6, sq); }
    for (const p of inner) { paintPetal(ctx, p, cols, 0.7, sq); rim(ctx, p, pal.rim, 0.22, lw * 1.6, sq); }
    wash(ctx, cx, cy, len * 0.28, pal.heart, 0.5);   // the heart, warm and blurred to nothing
    let img = defocus(st.c, far);
    // the nearest petals in better focus, laid thin over the blur: their edges come forward, nothing is outlined
    redraw(st, img);
    const near = outer.slice().sort(() => rand() - 0.5).slice(0, 2);
    for (const p of near) { paintPetal(ctx, p, cols, 0.3, sq); rim(ctx, p, pal.rim, 0.14, lw * 2, sq); }
    img = defocus(st.c, S * 0.012);
    return finish(canvas, st, img, Object.assign({ veilColor: pal.veil }, o));
  }

  // ---- II. poppies: cups on long stems, swaying past a slow shutter
  function poppyCup(ctx, rand, pal, x, y, size, axis, k, a) {
    const sq = { ang: axis + Math.PI / 2, k }, deep = [pal.petal[0], pal.petal[1], pal.petal[2], pal.petal[3]], pale = [pal.petal[1], pal.petal[2], pal.petal[3], rgba(pal.petal[3], 0.5)];
    for (let i = 0; i < 3; i++) {   // the back of the cup, paler, wide open
      const p = petalSpec(rand, x, y, axis + (i - 1) * 0.95 + (rand() - 0.5) * 0.3, size * (0.95 + rand() * 0.2), 0.95, 0.08);
      paintPetal(ctx, p, pale, a, sq); rim(ctx, p, pal.petal[0], 0.2, size * 0.01, sq);
    }
    for (let i = 0; i < 2; i++) {   // the front pair, deeper, closing over the heart
      const p = petalSpec(rand, x, y, axis + (i ? 0.5 : -0.5) + (rand() - 0.5) * 0.3, size * (0.85 + rand() * 0.2), 0.8, 0.07);
      paintPetal(ctx, p, deep, a, sq); rim(ctx, p, pal.petal[0], 0.25, size * 0.01, sq);
    }
    wash(ctx, x + Math.cos(axis) * size * 0.12, y + Math.sin(axis) * size * 0.12, size * 0.3, '#4a1510', 0.4 * a);
  }
  function poppies(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'coral', grain: 0.065, veil: 0.05, vignette: 0.05 }, opts);
    const pal = PALETTES[o.palette] || PALETTES.coral, { w, h } = setup(canvas, o, 0.34), rand = mulberry32(o.seed >>> 0);
    const D0 = Math.hypot(w, h), ang = o.angle == null ? -0.95 + (rand() - 0.5) * 0.4 : o.angle, sweep = D0 * (o.speed == null ? 0.05 : o.speed);
    const m = Math.ceil(D0 * 0.03 + sweep), st = stage(w, h, m), ctx = st.ctx, S = Math.min(w, h), L = Math.max(w, h);
    const g = ctx.createLinearGradient(0, -m, 0, h + m);
    pal.ground.forEach((c, i) => g.addColorStop(i / (pal.ground.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
    wash(ctx, w * (0.1 + rand() * 0.3), h * (0.6 + rand() * 0.2), D0 * 0.35, pal.wash, 0.55);   // a magenta blur low left: a bloom too near to see
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

  // ---- III. shade: leaves laid over sun-sensitive paper; the near ones print sharp, the lifted ones soft
  function leafPath(ctx, x, y, ang, len, wid) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.22, -wid * 1.05, len * 0.72, -wid * 0.85, len, 0);
    ctx.bezierCurveTo(len * 0.72, wid * 0.85, len * 0.22, wid * 1.05, 0, 0);
    ctx.fill(); ctx.restore();
  }
  /** Draw a branch: a stem across the frame with alternate leaves on short stalks, and side shoots. */
  function branch(ctx, rand, t, x, y, ang, len, S, depth) {
    const steps = 16, ds = len / steps;
    let a = ang, px = x, py = y;
    const sway = Math.sin(t * 0.7 + rand() * TAU) * 0.035;
    ctx.lineCap = 'round';
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.12 + sway / steps * 4;
      const nx = px + Math.cos(a) * ds, ny = py + Math.sin(a) * ds;
      ctx.lineWidth = S * (depth ? 0.009 : 0.016) * (1 - i / steps * 0.6);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      if (i > 1 && rand() < 0.8) {
        const side = i % 2 ? 1 : -1, la = a + side * (0.7 + rand() * 0.5) + 0.25 + Math.sin(t * 1.1 + i) * 0.08;
        const pl = S * 0.03, lx = nx + Math.cos(la) * pl, ly = ny + Math.sin(la) * pl;
        ctx.lineWidth = S * 0.003; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(lx, ly); ctx.stroke();
        const L = S * (0.13 + rand() * 0.1) * (depth ? 0.75 : 1);
        const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * (0.6 + rand() * 0.4);   // a leaf lifted off the paper lets some light under it
        leafPath(ctx, lx, ly, la + (rand() - 0.5) * 0.4, L, L * (0.34 + rand() * 0.14));
        ctx.globalAlpha = a0;
      }
      if (!depth && i > 4 && i < steps - 4 && rand() < 0.14) branch(ctx, rand, t, nx, ny, a + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5), len * 0.35, S, 1);
      px = nx; py = ny;
    }
  }
  function shade(canvas, opts) {
    const o = Object.assign({ seed: 1, palette: 'sage', t: 0, grain: 0.05, veil: 0.03, vignette: 0.04, border: 0.045 }, opts);
    const pal = PALETTES[o.palette] || PALETTES.sage, { w, h } = setup(canvas, o, 0.4), S = Math.min(w, h), D0 = Math.hypot(w, h);
    const rand = mulberry32(o.seed >>> 0), t = o.t, far = D0 * 0.028, m = Math.ceil(far * 1.6), st = stage(w, h, m), ctx = st.ctx;
    // the exposed paper: green, deepest along the top where the sun sat longest
    const g = ctx.createLinearGradient(0, -m, 0, h + m);
    g.addColorStop(0, pal.deep); g.addColorStop(0.35, pal.ground); g.addColorStop(1, pal.ground);
    ctx.fillStyle = g; ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
    ctx.fillStyle = ctx.strokeStyle = pal.leaf;
    // leaves held high above the paper print as broad soft pale shapes
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 3; i++) branch(ctx, rand, t * 0.6, w * (rand() * 1.1 - 0.05), h * (0.25 + rand() * 0.3), Math.PI / 2 + (rand() - 0.5) * 1.6, h * 0.8, S * 1.8, 0);
    ctx.globalAlpha = 1;
    wash(ctx, w * rand() * 0.4, h * (0.8 + rand() * 0.2), S * 0.45, pal.leaf, 0.55);   // a pale drift low down: something large, far off
    let img = defocus(st.c, far);
    redraw(st, img);
    ctx.fillStyle = ctx.strokeStyle = pal.leaf;
    // grass blades and a spray of leaves lying almost on the paper: these print nearly sharp
    for (let i = 0; i < 2 + (rand() * 2 | 0); i++) {
      const x = w * (0.35 + rand() * 0.6), a = Math.PI / 2 + 0.35 + rand() * 0.3, L = h * (0.25 + rand() * 0.25), bw = S * (0.012 + rand() * 0.012);
      ctx.beginPath(); ctx.moveTo(x - bw, -m); ctx.lineTo(x + bw, -m); ctx.lineTo(x + Math.cos(a) * L, -m + Math.sin(a) * L); ctx.closePath(); ctx.fill();
    }
    branch(ctx, rand, t, w * (0.5 + rand() * 0.5), h * (0.55 + rand() * 0.2), -Math.PI / 2 - 0.3 - rand() * 0.6, h * 0.55, S * 1.15, 0);
    img = defocus(st.c, D0 * 0.011);
    if (o.border) {   // the print sits on a sheet with a margin, its edge a little uneven where the paper lifted
      redraw(st, img);
      const b = S * o.border, jag = S * 0.004, frame = new Path2D();
      frame.rect(-m, -m, w + 2 * m, h + 2 * m);
      frame.moveTo(b, b);
      for (let i = 0; i <= 40; i++) frame.lineTo(b + (w - 2 * b) * i / 40, b + (rand() - 0.5) * jag);
      for (let i = 0; i <= 40; i++) frame.lineTo(w - b + (rand() - 0.5) * jag, b + (h - 2 * b) * i / 40);
      for (let i = 40; i >= 0; i--) frame.lineTo(b + (w - 2 * b) * i / 40, h - b + (rand() - 0.5) * jag);
      for (let i = 40; i >= 0; i--) frame.lineTo(b + (rand() - 0.5) * jag, b + (h - 2 * b) * i / 40);
      ctx.fillStyle = pal.border; ctx.fill(frame, 'evenodd');
      img = defocus(st.c, 0.8);
    }
    return finish(canvas, st, img, Object.assign({ veilColor: pal.veil }, o));
  }

  // ---- IV. streak: someone moving through the frame, in sepia
  function blob(ctx, x, y, rx, ry, rot, v, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, grey(v, a)); g.addColorStop(0.55, grey(v, a * 0.8)); g.addColorStop(1, grey(v, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
  }
  function figure(ctx, rand, w, h) {
    ctx.fillStyle = grey(0.5); ctx.fillRect(-w, -h, 3 * w, 3 * h);
    blob(ctx, w * 0.5, h * 0.08, w * 0.9, h * 0.1, 0, 0.22, 0.9);                                       // a dark ledge across the top
    const hx = w * (0.25 + rand() * 0.35), hy = h * (0.22 + rand() * 0.1);
    blob(ctx, hx, hy, w * 0.2, h * 0.13, (rand() - 0.5) * 0.4, 0.1, 1);                                 // hair
    blob(ctx, hx + w * 0.12, hy + h * 0.08, w * 0.08, h * 0.09, 0.3, 0.82, 0.9);                         // cheek and neck in light
    blob(ctx, w * 0.5, hy + h * 0.25, w * 0.5, h * 0.06, (rand() - 0.5) * 0.15, 0.85, 0.85);             // a bare arm, lit
    blob(ctx, w * 0.45, hy + h * 0.38, w * 0.55, h * 0.09, (rand() - 0.5) * 0.1, 0.2, 0.9);              // a dark sleeve
    blob(ctx, w * 0.62, h * 0.8, w * 0.5, h * 0.12, (rand() - 0.5) * 0.2, 0.78, 0.7);                    // pale cloth
    for (let i = 0; i < 7; i++) blob(ctx, w * rand(), h * (0.3 + rand() * 0.7), w * (0.08 + rand() * 0.2), h * (0.03 + rand() * 0.06), (rand() - 0.5) * 0.6, rand() < 0.5 ? 0.12 + rand() * 0.2 : 0.7 + rand() * 0.2, 0.7);
  }
  function streakFrom(st, rand, len, ang) {
    const sharp = defocus(st.c, st.D * 0.004);
    let img = motion(st.c, len, ang);
    img = motion(img, len * 0.25, ang + 0.02);
    redraw(st, img);
    const ctx = st.ctx;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.2; ctx.drawImage(sharp, (rand() - 0.5) * len * 0.3, 0); ctx.restore();   // the ghost where the shutter opened
    for (let i = 0; i < 1 + (rand() * 2 | 0); i++) {   // a pale streak where something bright crossed
      const y = st.h * (0.2 + rand() * 0.7), x0 = st.w * rand() * 0.4, x1 = x0 + st.w * (0.4 + rand() * 0.6);
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, grey(1, 0)); g.addColorStop(0.3 + rand() * 0.4, grey(0.9, 0.3)); g.addColorStop(1, grey(1, 0));
      ctx.strokeStyle = g; ctx.lineWidth = 2 + rand() * 3;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y + (rand() - 0.5) * 3); ctx.stroke();
    }
    return defocus(st.c, 1.6);
  }
  function streak(canvas, opts) {
    const o = Object.assign({ seed: 1, grain: 0.2, vignette: 0.3, ramp: PALETTES.sepia.ramp }, opts);
    const { w, h } = setup(canvas, o, 0.34), rand = mulberry32(o.seed >>> 0), len = w * (0.22 + rand() * 0.12);
    const st = stage(w, h, Math.ceil(len * 0.7)); figure(st.ctx, rand, w, h);
    return finish(canvas, st, streakFrom(st, rand, len, (rand() - 0.5) * 0.08), o);
  }

  // ---- your photograph, through one of the four looks
  const LOOKS = {
    blush: { grain: 0.075, veil: 0.14, veilColor: '#f1e9e4', vignette: 0.05 },
    coral: { grain: 0.07, veil: 0.1, veilColor: '#f7eee9', vignette: 0.04 },
    sage: { grain: 0.05, veil: 0.03, veilColor: '#e6dcb0', vignette: 0.04 },
    sepia: { grain: 0.15, vignette: 0.32, ramp: PALETTES.sepia.ramp },
  };
  function develop(canvas, image, opts) {
    const o = Object.assign({ seed: 1, look: 'sepia' }, opts), look = LOOKS[o.look] ? o.look : 'sepia';
    const { w, h } = setup(canvas, o, 0.34), D = Math.hypot(w, h), rand = mulberry32(o.seed >>> 0);
    const m = Math.ceil(D * (look === 'sepia' ? 0.2 : 0.06)), st = stage(w, h, m), ctx = st.ctx;
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height, k = Math.max((w + 2 * m) / iw, (h + 2 * m) / ih);
    ctx.drawImage(image, w / 2 - iw * k / 2, h / 2 - ih * k / 2, iw * k, ih * k);
    let img;
    if (look === 'blush') {
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgba('#dca4a9', 0.5); ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba('#efe4de', 0.35); ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
      img = defocus(st.c, D * 0.018);
    } else if (look === 'coral') {
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba('#f4c9b4', 0.22); ctx.fillRect(-m, -m, w + 2 * m, h + 2 * m);
      img = motion(defocus(st.c, D * 0.008), D * 0.05, -1.15);
    } else if (look === 'sage') {   // the photograph printed as a sun print: its lights become the pale of the paper
      const px = ctx.getImageData(0, 0, st.c.width, st.c.height), d = px.data, Q = hex(PALETTES.sage.deep), P = hex(PALETTES.sage.ground), L = hex(PALETTES.sage.leaf);
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255, s = Math.min(1, Math.max(0, (l - 0.2) / 0.6)), v = s * s * (3 - 2 * s);
        for (let c = 0; c < 3; c++) d[i + c] = v < 0.4 ? Q[c] + (P[c] - Q[c]) * v / 0.4 : P[c] + (L[c] - P[c]) * (v - 0.4) / 0.6;
      }
      ctx.putImageData(px, 0, 0);
      img = defocus(st.c, D * 0.006);
    } else img = streakFrom(st, rand, w * 0.22, 0.02);
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

  root.Haze = { petals, poppies, shade, streak, develop, grain, defocus, motion, PALETTES, LOOKS, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
