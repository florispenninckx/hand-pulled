/* pour.js — liquid colour for a loud maximalist page. Poured, marbled, foiled and moshed colour:
 * soft grain swirls and blooms, agate bands, moiré and maze line fields, veined marbling and
 * splash pours, liquid chrome and oil-slick foil, watercolour bleed, spin blur, pool caustics,
 * a halftone grid, glitch dashes, flat fields and gradients, a texture collage, and a photograph
 * poured like paint. Seeded. No dependencies. Original implementation.
 *
 *   Pour.paint(canvas, { mode: 'chrome', ramp: 'mercury', seed: 3 })   // fills the canvas at its own size
 *   Pour.plate(el, { mode: 'swirl', ramp: 'klein citric' })              // a canvas that fills el, painted when seen
 *   Pour.photo(canvas, img, { warp: 1, map: 'klein aquamarine citric' }) // pour a photograph
 *
 * Colour comes only from PALETTES, the colours read off the board's colour pins, by name:
 * 'klein', 'citric', 'jade'... A name can be tinted toward white or black: 'citric+40',
 * 'klein-60'. A ramp is a list of names, dark to light unless a mode wants another order.
 *
 * Structure comes from the modes. Every mode is the same pipeline, so a fragment shader can
 * carry it: one or two scalar fields (value noise, warped by noise) → the mode's shading of the
 * field (a ramp lookup, bands, lines, normals) → optional mask onto a ground → buffer passes
 * that only move pixels (row shift, macroblocks, scanlines, scatter) → grain. The fields are
 * solved on a coarse grid and read per pixel with their slope, so line widths, veins and
 * outlines are set in pixels and stay sharp at any size.
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
  const seedInt = seed => typeof seed === 'number' ? Math.floor(seed * 9973) + 17 : hashStr(String(seed));
  const rng = seed => mulberry32(seedInt(seed));
  // A stateless hash of two integers and a seed, in [0, 1): what a shader's hash does per cell or pixel.
  const hash = (i, j, s) => {
    let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  /* ------------------------------------------------------------------ palettes */
  // The colours the graphics may use, read off the board's colour pins. Names are ours.
  const PALETTES = {
    record:   { from: 'pin 5, a named colour strip',   colors: { klein: '#4100f5', citric: '#cdf564', aquamarine: '#9bf0e1', fuchsia: '#f037a5', tangerine: '#ff4632', soot: '#191414' } },
    flats:    { from: 'pins 4 and 17, flat fields',    colors: { acid: '#8ace00', ultra: '#1b2f94' } },
    neon:     { from: 'pin 25, chips under a poster',  colors: { mint: '#5efcd4', jade: '#27e65f', magenta: '#f31dac', sky: '#2db9fb', lavender: '#7572bb', night: '#090c08' } },
    wave:     { from: 'pin 21, the strip under a wave', colors: { lime: '#3bfe48', fern: '#1f973e', cornflower: '#2a68d5', ultramarine: '#021999', navy: '#030b56' } },
    oil:      { from: 'pin 41, dots beside an oil pour', colors: { azure: '#17a7fe', butter: '#f9f377', iris: '#864ff2', pistachio: '#baffa6', orchid: '#e67df3', turquoise: '#02fdd4' } },
    spot:     { from: 'pin 31, spot chips beside a pour', colors: { glacier: '#6cd1ef', celery: '#bfde8e', rose: '#d0428c', marigold: '#f79b2e', harbour: '#1e4f91' } },
    canvas:   { from: 'pin 30, chips under a painting', colors: { cobalt: '#0b57ab', indigo: '#092e75', apricot: '#e8773b', mulberry: '#72214c', aubergine: '#2d1539' } },
    reef:     { from: 'pin 34, a list on a reef',      colors: { abyss: '#0d0828', deepsea: '#16194e', tide: '#25387a', violet: '#5950b9', lagoon: '#1ea499' } },
    lakeside: { from: 'pin 9, pills on a lake photo',  colors: { moss: '#52634e', denim: '#496b78', tomato: '#a9413d', sunlight: '#c99645', clay: '#b65f47', cream: '#d8c6a8' } },
  };
  const COLORS = {};
  for (const p of Object.values(PALETTES)) Object.assign(COLORS, p.colors);

  // Named ramps: each one a family's usual colours. Any list of names works the same way.
  const RAMPS = {
    pour:      'ultra klein cornflower acid citric',          // the cover: Klein blobs in acid green (pin 8)
    meadow:    'fern acid citric+30',                          // green grain (pin 19)
    lawn:      'fern-30 acid citric+70',                       // a green swirl on white (pin 15)
    shallows:  'cornflower cornflower+20 lime+30 lime+50',     // green on blue (pin 40)
    lagoon:    'klein-30 cornflower azure glacier butter',     // blue to yellow (pin 44)
    agate:     'navy cornflower citric-10 citric',             // yellow-green and blue bands (pin 38)
    mercury:   'soot soot+25 soot+60 soot+92',                 // liquid chrome (pins 3, 33)
    foil:      'navy klein cornflower glacier+60',             // blue foil (pin 49)
    slick:     'klein iris orchid+50 magenta azure glacier+70 butter tangerine iris', // oil-slick hues (pins 18, 24, 41)
    acidnight: 'night fern jade citric',                       // acid ribbons on black (pin 20)
    ember:     'harbour azure tangerine apricot soot+55',      // orange and blue marbling (pin 48)
    ice:       'night navy cornflower glacier glacier+80 apricot', // black, ice blue and a thread of apricot (pin 46)
    bloom:     'night fern acid butter butter+50',             // a blurred yellow bloom (pin 39)
    teal:      'night lagoon-40 lagoon mint+40',               // teal depth (pins 32, 45)
    sunset:    'lagoon celery butter marigold tangerine fuchsia+30', // coral to sage (pin 13)
    claret:    'tomato-60 tomato fuchsia+60',                  // a dark red gradient (pin 6)
    plum:      'night fern-40 magenta fuchsia iris',           // magenta lines on green-black (pin 26)
    lilac:     'deepsea violet lavender+20 orchid+40',         // lavender ripples (pin 42)
    pool:      'navy cobalt azure glacier',                    // pool water (pin 35)
    spin:      'navy ultramarine klein tangerine apricot',     // spun orange on blue (pin 10)
    wash:      'cream+40 fuchsia+70 rose+30 tomato',           // watercolour on paper (pin 1)
    moshgreen: 'night fern-40 fern jade lime+40',              // green datamosh (pins 27, 36, 37)
    splash:    'navy cornflower glacier mint lavender marigold rose azure', // flat pours (pin 12)
    reef:      'abyss deepsea violet lagoon',                  // a reef maze (pin 34)
    canvas:    'indigo cobalt mulberry apricot marigold',      // a painted canvas (pin 30)
    lake:      'moss denim tomato sunlight clay cream',        // earth colours (pin 9)
  };

  const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  /** 'klein', 'citric+40' (40 % toward white), 'klein-60' (60 % toward black) or '#rrggbb' → [r, g, b]. */
  function color(spec) {
    if (Array.isArray(spec)) return spec;
    const m = /^(#[0-9a-f]{6}|[a-z]+)(?:([+-])(\d+))?$/i.exec(String(spec).trim());
    if (!m) throw new Error('pour.js: not a colour: ' + spec);
    const hex = m[1][0] === '#' ? m[1] : COLORS[m[1].toLowerCase()];
    if (!hex) throw new Error('pour.js: no colour named ' + m[1]);
    const c = hexRgb(hex);
    if (!m[2]) return c;
    const k = Math.min(100, +m[3]) / 100, to = m[2] === '+' ? 255 : 0;
    return c.map(v => v + (to - v) * k);
  }
  const hexOf = spec => rgbHex(color(spec));
  function rampOf(spec) {
    if (spec == null) spec = 'pour';
    if (typeof spec === 'string') spec = (RAMPS[spec] || spec).trim().split(/\s+/);
    return spec.map(color);
  }

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
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const fract = x => x - Math.floor(x);

  /* ------------------------------------------------------------------ the fields */
  // Solved on a grid every `step` pixels, normalised to the 2nd–98th percentile so every seed
  // fills the whole ramp. g is the mode's field; g2 the warped field under a combed one; g3 an
  // independent field for masks, granulation and colour drift.
  function solve(W, H, o) {
    const step = o.step, gw = Math.ceil(W / step) + 2, gh = Math.ceil(H / step) + 2;
    const g = new Float32Array(gw * gh), g2 = o.comb != null ? new Float32Array(gw * gh) : null;
    const g3 = o.third ? new Float32Array(gw * gh) : null;
    const n = makeNoise(o.seed), n3 = g3 && makeNoise(o.seed + ':3'), R = rng(o.seed + ':off');
    const ca = Math.cos((o.comb || 0) * Math.PI / 180), sa = Math.sin((o.comb || 0) * Math.PI / 180);
    const off = Array.from({ length: 12 }, () => R() * 100);
    const S = Math.min(W, H) * o.scale, sx = o.stretch[0], sy = o.stretch[1];
    const cx = o.center[0] * W, cy = o.center[1] * H, rr = Math.min(W, H);
    const S3 = Math.min(W, H) * (o.scale3 || o.scale * 1.3);
    const warped = (nz, x, y, k, oct, of) => {
      const qx = fbm(nz, x + of[0], y + of[1], 4), qy = fbm(nz, x + of[2], y + of[3], 4);
      const rx = fbm(nz, x + k * qx + of[4], y + k * qy + of[5], 4), ry = fbm(nz, x + k * qx + of[6], y + k * qy + of[7], 4);
      return [fbm(nz, x + k * rx, y + k * ry, oct), qx, qy];
    };
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const X = i * step, Y = j * step, at = j * gw + i;
        let v;
        if (o.mode === 'bloom') {
          // petals round a centre, their reach varied by noise (pin 39)
          const dx = (X - cx) / rr, dy = (Y - cy) / rr, rho = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
          const w = fbm(n, dx * 2.2 + off[0], dy * 2.2 + off[1], 3) * o.warp;
          const petals = 0.5 + 0.5 * Math.cos(o.petals * th + o.twist * rho * 6 + w * 3);
          const reach = o.radius * (0.55 + 0.9 * (0.5 + fbm(n, Math.cos(th) * 1.3 + off[4], Math.sin(th) * 1.3 + off[5], 2)));
          const fall = Math.exp(-Math.pow(rho / reach, 2));
          v = Math.pow(petals, 0.8) * fall * (0.55 + 0.9 * rho / (rho + 0.12)) + fbm(n, dx * 3 + off[2], dy * 3 + off[3], 2) * 0.12;
        } else if (o.mode === 'spin') {
          // blobs smeared round a centre, as by a turning camera (pin 10). The angle is blended
          // across the seam so the field closes on itself.
          // Several samples along the arc are averaged: the shutter smear. Near the centre the
          // angular frequency falls away, so the arcs do not pinch into a star.
          const dx = (X - cx) / rr, dy = (Y - cy) / rr, rho = Math.hypot(dx, dy), th0 = Math.atan2(dy, dx);
          const rq = rho * o.rings + o.warp * fbm(n, dx * 2 + off[0], dy * 2 + off[1], 3), ka = o.arcs * Math.min(1, rho / 0.18);
          const ns = o.smear ? 7 : 1;
          v = 0;
          for (let s = 0; s < ns; s++) {
            let th = th0 + (ns > 1 ? (s / (ns - 1) - 0.5) * o.smear : 0);
            if (th > Math.PI) th -= 2 * Math.PI; else if (th < -Math.PI) th += 2 * Math.PI;
            const wt = (th + Math.PI) / (2 * Math.PI);
            const a = fbm(n, rq + off[2], th * ka + off[3], o.octaves), b = fbm(n, rq + off[2], (th - 2 * Math.PI) * ka + off[3], o.octaves);
            v += (a * (1 - wt) + b * wt) / ns;
          }
          v -= o.eye * Math.exp(-rho * rho / 0.02);
        } else {
          let X2 = X, Y2 = Y;
          if (o.twirl) {                                            // one vortex round the centre (pin 15)
            const dx = X - cx, dy = Y - cy, a = o.twirl * Math.exp(-3 * (dx * dx + dy * dy) / (rr * rr)), c = Math.cos(a), s = Math.sin(a);
            X2 = cx + dx * c - dy * s; Y2 = cy + dx * s + dy * c;
          }
          const x = X2 / S / sx, y = Y2 / S / sy, k = o.warp;
          const [w, qx, qy] = warped(n, x, y, k, o.octaves, off);
          v = w;
          if (o.ridge) v -= o.ridge * Math.abs(fbm(n, x * 2.1 + k * qx + off[8], y * 2.1 + k * qy + off[9], 3));   // creases (pins 33, 49)
          if (o.burst) { const dx = (X - cx) / rr, dy = (Y - cy) / rr; v += o.burst * Math.hypot(dx, dy); }        // a splash from a point (pin 12)
          if (g2) {
            // combed: straight stripes across the sheet, pushed sideways by the warped field, so bands keep one width
            g2[at] = v;
            v = (X2 * ca + Y2 * sa) / S + o.wander * fbm(n, x + k * qx + off[6], y + k * qy + off[7], 2);
          }
        }
        g[at] = v;
        if (g3) g3[at] = warped(n3, X / S3, Y / S3, o.warp3 != null ? o.warp3 : 1, o.octaves3 || 3, off.slice(4))[0];
      }
    }
    const norm = a => {
      const sample = []; for (let i = 0; i < a.length; i += 7) sample.push(a[i]);
      sample.sort((x, y) => x - y);
      const lo = sample[Math.floor(sample.length * 0.02)], hi = sample[Math.floor(sample.length * 0.98)], sc = 1 / ((hi - lo) || 1);
      for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * sc;
    };
    norm(g); if (g2) norm(g2); if (g3) norm(g3);
    return { g, g2, g3, gw, gh, step };
  }

  /* ------------------------------------------------------------------ modes */
  // Defaults per mode. Every value can be passed to paint(); see SKILL.md for what each does.
  const MODES = {
    swirl:    { ramp: 'pour', scale: 1.1, warp: 1.2, octaves: 3, contrast: 1.2, twirl: 0, grain: 0.34 },
    bloom:    { ramp: 'bloom', petals: 5, twist: 0.6, radius: 0.62, warp: 2.2, octaves: 3, contrast: 1.4, grain: 0.36, center: [0.52, 0.47] },
    spin:     { ramp: 'spin', rings: 12, arcs: 3, smear: 0.35, warp: 0.15, octaves: 3, eye: 0.4, contrast: 1.5, grain: 0.4 },
    bands:    { ramp: 'agate', scale: 0.5, warp: 0.9, octaves: 2, comb: 0, wander: 1, bands: 11, sharp: 1.15, core: 0, grain: 0.36, stretch: [1.4, 2.2] },
    moire:    { ramp: 'plum', scale: 0.45, warp: 1, octaves: 2, comb: 90, wander: 0.8, bands: 60, line: 1.3, grain: 0.22 },
    marble:   { ramp: 'acidnight', scale: 1.15, warp: 1.8, octaves: 3, levels: 4, vein: 1.8, veinColor: 'night', sharp: 0.8, grain: 0.4 },
    splash:   { ramp: 'splash', scale: 0.9, warp: 1.6, octaves: 4, levels: 9, vein: 2.4, veinColor: 'cream+60', burst: 0.9, sharp: 0.6, shade: 0.18, grain: 0.18 },
    chrome:   { ramp: 'mercury', scale: 0.9, warp: 1.5, octaves: 4, ridge: 0.5, relief: 1.6, rings: 2.2, lift: 1.4, light: 35, shine: 60, spec: 0.8, contrast: 1.3, deep: 0.3, cycle: 0, step: 2, grain: 0.14 },
    bleed:    { ramp: 'wash', scale: 0.8, warp: 1.4, octaves: 6, levels: 5, rim: 0.7, rimWidth: 3, third: true, scale3: 0.05, octaves3: 4, gran: 0.35, grain: 0.3 },
    caustic:  { ramp: 'pool', scale: 0.35, warp: 1.2, octaves: 3, bands: 5, line: 2.2, lineColor: 'glacier+70', dark: 0.6, darkColor: 'navy-60', fall: 0.5, third: true, stretch: [2.4, 1], grain: 0.2 },
    halftone: { ramp: 'harbour+40 butter-10', scale: 0.7, warp: 1.1, octaves: 5, cut: 0.52, cell: 9, line: 1.6, grain: 0.24 },
    dash:     { ramp: 'moshgreen', scale: 0.8, warp: 1.4, octaves: 3, cell: 9, line: 1.8, cut: 0.25, dim: 0.35, glow: 0.8, grain: 0.3 },
    field:    { ramp: 'acid', scale: 1.4, warp: 0.6, octaves: 2, angle: 90, wobble: 0, radial: false, grain: 0.3 },
  };

  /** Paint a mode into a canvas at its own pixel size. Returns the canvas. */
  function paint(canvas, opts) {
    opts = opts || {};
    if (opts.mode === 'collage') return collage(canvas, opts);
    const o = Object.assign({ seed: 1, step: 3, stretch: [1, 1], center: [0.5, 0.5], mode: 'swirl' }, MODES[opts.mode || 'swirl'], opts);
    if (opts.palette && !opts.ramp) o.ramp = opts.palette;           // the older name for a ramp
    if (o.mask) o.third = true;
    const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    const cols = rampOf(o.ramp), NC = cols.length;
    const img = ctx.createImageData(W, H), d = img.data;
    const out = [0, 0, 0];
    const rampAt = (cs, t) => {
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (cs.length === 1) { out[0] = cs[0][0]; out[1] = cs[0][1]; out[2] = cs[0][2]; return; }
      const x = t * (cs.length - 1), i = Math.min(cs.length - 2, Math.floor(x)), u = x - i, a = cs[i], b = cs[i + 1];
      out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; out[2] = a[2] + (b[2] - a[2]) * u;
    };
    const ramp = t => rampAt(cols, t);
    const mix = (c, k) => { out[0] += (c[0] - out[0]) * k; out[1] += (c[1] - out[1]) * k; out[2] += (c[2] - out[2]) * k; };

    const flat = o.mode === 'field' && (NC === 1 || !o.wobble);
    const F = flat && !o.mask ? null : solve(W, H, o);
    if (o.capture) o.capture({ W, H, F, o, si: seedInt(o.seed) });   // live.js: the field under the paint
    const g = F && F.g, g2 = F && F.g2, g3 = F && F.g3, gw = F ? F.gw : 0, step = o.step;
    const at = (G, x, y) => { const X = x / step, Y = y / step, i = Math.floor(X), j = Math.floor(Y), u = X - i, v = Y - j, k = j * gw + i; return G[k] * (1 - u) * (1 - v) + G[k + 1] * u * (1 - v) + G[k + gw] * (1 - u) * v + G[k + gw + 1] * u * v; };

    const nb = o.bands, lv = o.levels, mn = Math.min(W, H);
    const vein = color(o.veinColor || 'night'), core = color(o.coreColor || 'night');
    const lineC = color(o.lineColor || 'citric+70'), darkC = color(o.darkColor || 'night');
    const alt = o.alt ? rampOf(o.alt) : null, lines = cols.slice(1);
    const lc = Math.cos((o.light || 0) * Math.PI / 180), ls = Math.sin((o.light || 0) * Math.PI / 180);
    const Lz = 0.8, Ln = Math.hypot(lc * 0.6, ls * 0.6, Lz), Lx = lc * 0.6 / Ln, Ly = ls * 0.6 / Ln, Lzz = Lz / Ln;
    const white = [255, 255, 255], ground = o.mask ? color(o.mask.ground || 'night') : null;
    const acos = Math.cos((o.angle || 0) * Math.PI / 180), asin = Math.sin((o.angle || 0) * Math.PI / 180);
    const si = seedInt(o.seed);
    const pre = [0, 0, 0];

    for (let y = 0; y < H; y++) {
      const fy = y / step, j = Math.floor(fy), v = fy - j;
      for (let x = 0; x < W; x++) {
        let t = 0, gx = 0, gy = 0, gm = 1e-6, k = 0, u = 0, t3 = 0.5;
        if (F) {
          const fx = x / step, i = Math.floor(fx); u = fx - i; k = j * gw + i;
          const a = g[k], b = g[k + 1], c = g[k + gw], e = g[k + gw + 1];
          t = a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
          // slope in field units per pixel, for widths measured in pixels
          gx = ((b - a) * (1 - v) + (e - c) * v) / step; gy = ((c - a) * (1 - u) + (e - b) * u) / step;
          gm = Math.hypot(gx, gy) + 1e-6;
          if (g3) { const a3 = g3[k], b3 = g3[k + 1], c3 = g3[k + gw], e3 = g3[k + gw + 1]; t3 = a3 + (b3 - a3) * u + (c3 - a3) * v + (a3 - b3 - c3 + e3) * u * v; }
        }

        switch (o.mode) {
          case 'swirl': case 'bloom': case 'spin':
            ramp(0.5 + (t - 0.5) * o.contrast);
            break;
          case 'field': {
            // flat colour (pins 4, 17), or one slow gradient, linear or from a point (pin 6)
            let s;
            if (o.radial) s = Math.hypot(x / W - o.center[0], (y / H - o.center[1]) * H / W) / (o.radius || 1);
            else s = 0.5 + ((x / W - 0.5) * acos + (y / H - 0.5) * asin);
            if (F) s += (t - 0.5) * o.wobble;
            ramp(s);
            break;
          }
          case 'bands': {
            // each band is one smooth swing from the first colour to the last and back (pin 38); with
            // comb: null the field is not combed and the bands close into a maze (pin 34)
            const sb = t * nb, f = sb - Math.floor(sb), w = 0.5 - 0.5 * Math.cos(2 * Math.PI * f);
            ramp(Math.pow(w, o.sharp));
            if (o.core) { const pm = Math.abs(f - 0.5) / (nb * gm); mix(core, 0.9 * (1 - sstep(o.core * 0.5, o.core * 0.5 + 1.2, pm))); }
            break;
          }
          case 'moire': {
            // fine lines on the first colour, taking their colour from the warped field under them (pin 26)
            out[0] = cols[0][0]; out[1] = cols[0][1]; out[2] = cols[0][2];
            const s = t * nb, f = s - Math.floor(s), pm = Math.abs(f - 0.5) / (nb * gm);
            const cov = 1 - sstep(o.line - 0.7, o.line + 0.7, pm);
            if (cov > 0) {
              const t2 = g2 ? g2[k] + (g2[k + 1] - g2[k]) * u + (g2[k + gw] - g2[k]) * v : t3;
              const x2 = Math.min(0.999, Math.max(0, t2)) * (lines.length - 1), li = Math.floor(x2), lu = x2 - li;
              const L0 = lines[li], L1 = lines[Math.min(lines.length - 1, li + 1)];
              pre[0] = L0[0] + (L1[0] - L0[0]) * lu; pre[1] = L0[1] + (L1[1] - L0[1]) * lu; pre[2] = L0[2] + (L1[2] - L0[2]) * lu;
              mix(pre, cov);
            }
            break;
          }
          case 'marble': case 'splash': {
            // levels of the field with a vein between them (pins 20, 48); splash gives each level
            // one flat colour and a pale outline, like paint thrown from a point (pin 12)
            const sl = t * lv, bi = Math.floor(sl), f = sl - bi, tri = Math.pow(1 - Math.abs(2 * f - 1), o.sharp);
            if (o.mode === 'splash') {
              const c = cols[o.order ? ((bi % NC) + NC) % NC : Math.floor(hash(bi, 7, si) * NC)];
              out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
              mix(white, o.shade * (1 - tri));
            } else if (alt && (bi & 1)) rampAt(alt, tri); else ramp(tri);
            const pe = Math.min(f, 1 - f) / (lv * gm);                // pixels to the nearest level edge
            if (o.vein) mix(vein, 1 - sstep(o.vein * 0.5, o.vein * 0.5 + 1.1, pe));
            if (o.threads) {
              // bundles of thin lines along the edge, like pulled paint (pin 46)
              for (let q = 1; q <= o.threads; q++) {
                const at1 = Math.abs(f - q * o.threadGap) / (lv * gm);
                const cov = 1 - sstep(0.4, 1.4, at1);
                if (cov > 0) mix(q & 1 ? lineC : vein, cov * 0.85);
              }
            }
            break;
          }
          case 'chrome': {
            // a height field lit like polished metal: the surface normal picks a band of the
            // environment, the height shifts it, and a hot spot sits where the normal meets the lamp
            const sl = o.relief * mn;
            let nx = -gx * sl, ny = -gy * sl; const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= inv; ny *= inv;
            const nz = inv, uu = nx * lc + ny * ls;
            let e = 0.5 + 0.5 * Math.sin(Math.PI * (o.rings * uu + o.lift * t));
            e = Math.min(1, Math.max(0, 0.5 + (e - 0.5) * o.contrast));
            if (o.cycle) e = fract(e * 0.5 + t * o.cycle + uu * 0.3);       // oil-slick: run the ramp round (pins 18, 24)
            ramp(e * (1 - o.deep * (1 - nz)));
            const sp = Math.pow(Math.max(0, nx * Lx + ny * Ly + nz * Lzz), o.shine);
            mix(white, sp * o.spec);
            break;
          }
          case 'bleed': {
            // watercolour: washes laid one over the other, pigment pooled at the rim inside each (pin 1)
            const sl = t * lv + (t3 - 0.5) * o.gran, bi = Math.floor(sl), f = sl - bi;
            const pe = f / (lv * gm);
            ramp((bi + 1) / lv); pre[0] = out[0]; pre[1] = out[1]; pre[2] = out[2];
            ramp(bi / lv + f * 0.15 / lv);
            if (bi > 0) mix(pre, o.rim * Math.exp(-pe / o.rimWidth));
            break;
          }
          case 'caustic': {
            // pool water: a deep-to-light ground, bright wavering lines on one set of levels and dark
            // ones between them, the bright lines fatter where the light is strong (pin 35)
            ramp(o.fall * (y / H) + (1 - o.fall) * t3);
            const s = t * nb, f = s - Math.floor(s);
            const w = o.line * (0.35 + t3);
            const pb = Math.abs(f - 0.5) / (nb * gm), pd = Math.min(f, 1 - f) / (nb * gm);
            mix(darkC, o.dark * (1 - sstep(w * 0.4, w * 0.4 + 1, pd)));
            mix(lineC, 1 - sstep(w * 0.5 - 0.5, w * 0.5 + 0.8, pb));
            break;
          }
          case 'halftone': {
            // a square grid over paint blots; the grid is inked in the other colour (pin 47)
            const blot = sstep(o.cut - 0.015, o.cut + 0.015, t);
            const cx = x % o.cell, cy = y % o.cell, dl = Math.min(cx, o.cell - cx, cy, o.cell - cy);
            const onLine = 1 - sstep(o.line * 0.5 - 0.5, o.line * 0.5 + 0.5, dl);
            const A = cols[0], B = cols[NC - 1];
            out[0] = A[0] + (B[0] - A[0]) * blot; out[1] = A[1] + (B[1] - A[1]) * blot; out[2] = A[2] + (B[2] - A[2]) * blot;
            pre[0] = B[0] + (A[0] - B[0]) * blot; pre[1] = B[1] + (A[1] - B[1]) * blot; pre[2] = B[2] + (A[2] - B[2]) * blot;
            mix(pre, onLine * (0.35 + 0.65 * Math.abs(2 * t - 1)));
            break;
          }
          case 'dash': {
            // a matrix of short strokes turned along the field, lit where the field is high (pin 27)
            const c = o.cell, ci = Math.floor(x / c), cj = Math.floor(y / c), cxp = (ci + 0.5) * c, cyp = (cj + 0.5) * c;
            const tc = at(g, Math.min(W - 1, cxp), Math.min(H - 1, cyp));
            ramp(t * o.dim);
            const th = Math.atan2(gy, gx) + Math.PI / 2 + (hash(ci, cj, si) - 0.5) * 0.6;
            const lx = x - cxp, ly = y - cyp, al = lx * Math.cos(th) + ly * Math.sin(th), ac = -lx * Math.sin(th) + ly * Math.cos(th);
            const len = c * 0.45 * (0.3 + 0.7 * tc), dd = Math.hypot(Math.max(0, Math.abs(al) - len), ac);
            const cov = (1 - sstep(o.line * 0.5 - 0.5, o.line * 0.5 + 0.5, dd)) * sstep(o.cut, o.cut + 0.2, tc);
            if (cov > 0) {
              const b0 = out[0], b1 = out[1], b2 = out[2];
              rampAt(cols, 0.4 + 0.6 * tc);
              out[0] = b0 + (out[0] - b0) * cov; out[1] = b1 + (out[1] - b1) * cov; out[2] = b2 + (out[2] - b2) * cov;
            }
            if (o.glow < 1) mix(cols[NC - 1], 0.85 * sstep(o.glow, 1, t));
            break;
          }
        }

        if (o.mask) {
          // the pour sits on a ground; near its edge it breaks into a dot screen (pin 24)
          const m = o.mask, kk = sstep(m.cut - (m.soft || 0.02), m.cut + (m.soft || 0.02), t3);
          pre[0] = out[0]; pre[1] = out[1]; pre[2] = out[2];
          let cov = kk;
          if (m.dots) {
            const dc = m.dots, ddx = (x % dc) - dc / 2, ddy = (y % dc) - dc / 2, r = dc * 0.55 * sstep(m.cut - (m.fade || 0.12), m.cut, t3);
            cov = Math.max(kk, 1 - sstep(r - 0.6, r + 0.6, Math.hypot(ddx, ddy)));
          }
          out[0] = ground[0]; out[1] = ground[1]; out[2] = ground[2];
          mix(pre, cov);
        }
        if (o.vignette) {
          const r = Math.hypot(x / W - 0.5, (y / H - 0.5)) * 1.41;
          mix(cols[0], o.vignette * sstep(0.35, 1, r));
        }
        const q = (y * W + x) * 4;
        d[q] = out[0]; d[q + 1] = out[1]; d[q + 2] = out[2]; d[q + 3] = 255;
      }
    }
    passes(d, W, H, o, si);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /* ------------------------------------------------------------------ buffer passes */
  // Each pass only moves or dims pixels of the painted buffer, so a shader does it as a second
  // pass reading the first as a texture at shifted coordinates.
  function passes(d, W, H, o, si) {
    const moves = o.shift || o.wave || o.mosh || o.scatter;
    if (moves) {
      const src = new Uint8ClampedArray(d);
      const B = o.block || 24;
      for (let y = 0; y < H; y++) {
        // row shift: bands of rows pushed sideways, plus a sine that zig-zags every edge (pin 37)
        let dxRow = 0;
        if (o.shift) { const band = Math.floor(y / (o.shiftBand || 12)); if (hash(band, 3, si) < (o.shiftP || 0.35)) dxRow = Math.round((hash(band, 4, si) - 0.5) * 2 * o.shift * W); }
        if (o.wave) dxRow += Math.round(o.wave * W * Math.sin(y / H * Math.PI * 2 * (o.waves || 30) + hash(Math.floor(y / 40), 5, si) * 6));
        for (let x = 0; x < W; x++) {
          let sx = x + dxRow, sy = y;
          if (o.mosh) {
            // macroblocks: some copied from elsewhere, some smeared from their first column (pin 36)
            const bi = Math.floor(x / B), bj = Math.floor(y / B), r = hash(bi, bj, si + 11);
            if (r < o.mosh * 0.45) sx = bi * B;
            else if (r < o.mosh) { sx += Math.round((hash(bi, bj, si + 12) - 0.5) * 6) * B; sy += Math.round((hash(bi, bj, si + 13) - 0.5) * 4) * B; }
          }
          if (o.scatter) {
            // a few pixels thrown off their place, so edges break into specks (pins 7, 47)
            if (hash(x, y, si + 21) < (o.scatterP || 0.3)) { sx += Math.round((hash(x, y, si + 22) - 0.5) * 2 * o.scatter); sy += Math.round((hash(x, y, si + 23) - 0.5) * 2 * o.scatter); }
          }
          sx = ((sx % W) + W) % W; sy = Math.min(H - 1, Math.max(0, sy));
          const p = (sy * W + sx) * 4, q = (y * W + x) * 4;
          d[q] = src[p]; d[q + 1] = src[p + 1]; d[q + 2] = src[p + 2];
        }
      }
    }
    if (o.scan) {
      // scanlines: rows between the lines drop toward black, as off a screen (pin 37)
      const P = o.scan, duty = o.scanDuty || 0.45, k = 1 - (o.scanDark != null ? o.scanDark : 0.75);
      for (let y = 0; y < H; y++) {
        if ((y % P) / P < duty) continue;
        for (let x = 0, q = y * W * 4; x < W; x++, q += 4) { d[q] *= k; d[q + 1] *= k; d[q + 2] *= k; }
      }
    }
    if (o.grain) {
      // monochrome film grain, in blocks of grainSize pixels
      const gn = o.grain * 46, gs = o.grainSize || 1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n = (hash(Math.floor(x / gs), Math.floor(y / gs), si + 31) - 0.5) * gn, q = (y * W + x) * 4;
        d[q] += n; d[q + 1] += n; d[q + 2] += n;
      }
    }
  }

  /* ------------------------------------------------------------------ collage */
  // Rectangles of texture cut and butted together, each its own small pour (pin 16).
  function collage(canvas, opts) {
    const o = Object.assign({ seed: 1, tiles: [{ mode: 'chrome', ramp: 'mercury' }, { mode: 'marble' }], cuts: 5, grain: 0.2 }, opts);
    const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d'), R = rng(o.seed + ':cut');
    let rects = [[0, 0, W, H]];
    for (let c = 0; c < o.cuts; c++) {
      rects.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
      const [x, y, w, h] = rects.shift(), f = 0.35 + R() * 0.3;
      if (w > h) rects.push([x, y, Math.round(w * f), h], [x + Math.round(w * f), y, w - Math.round(w * f), h]);
      else rects.push([x, y, w, Math.round(h * f)], [x, y + Math.round(h * f), w, h - Math.round(h * f)]);
    }
    rects.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    rects.forEach((r, i) => {
      const c = document.createElement('canvas'); c.width = Math.max(2, r[2]); c.height = Math.max(2, r[3]);
      paint(c, Object.assign({ seed: o.seed * 7 + i }, o.tiles[i % o.tiles.length]));
      ctx.drawImage(c, r[0], r[1]);
    });
    return canvas;
  }

  /** Pour a photograph: push its pixels along the warped field, then map it through a ramp. */
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
    const fx = solve(W, H, Object.assign({}, o, { seed: o.seed + ':x', warp: 1.4, comb: null, third: false })), fy = solve(W, H, Object.assign({}, o, { seed: o.seed + ':y', warp: 1.4, comb: null, third: false }));
    const amp = Math.min(W, H) * 0.09 * o.warp;
    const M = o.map ? rampOf(o.map) : null;
    const img = ctx.createImageData(W, H), d = img.data;
    const bil = (F, x, y) => { const X = x / F.step, Y = y / F.step, i = Math.floor(X), j = Math.floor(Y), u = X - i, v = Y - j, k = j * F.gw + i, g = F.g; return g[k] * (1 - u) * (1 - v) + g[k + 1] * u * (1 - v) + g[k + F.gw] * (1 - u) * v + g[k + F.gw + 1] * u * v; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sx = x + (bil(fx, x, y) - 0.5) * 2 * amp, sy = y + (bil(fy, x, y) - 0.5) * 2 * amp;
      sx = Math.min(W - 1.001, Math.max(0, sx)); sy = Math.min(H - 1.001, Math.max(0, sy));
      const i = Math.floor(sx), j = Math.floor(sy), u = sx - i, v = sy - j, p = (j * W + i) * 4;
      const c = [0, 1, 2].map(ch => S[p + ch] * (1 - u) * (1 - v) + S[p + 4 + ch] * u * (1 - v) + S[p + W * 4 + ch] * (1 - u) * v + S[p + W * 4 + 4 + ch] * u * v);
      if (M && M.length > 1) {
        const l = Math.min(1, Math.max(0, (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255));
        const t = l * (M.length - 1), mi = Math.min(M.length - 2, Math.floor(t)), mu = t - mi;
        for (let ch = 0; ch < 3; ch++) c[ch] += ((M[mi][ch] + (M[mi + 1][ch] - M[mi][ch]) * mu) - c[ch]) * o.amount;
      }
      const q = (y * W + x) * 4;
      d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
    }
    passes(d, W, H, o, seedInt(o.seed));
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
    const c = el.querySelector('canvas.pour') || el.insertBefore(Object.assign(document.createElement('canvas'), { className: 'pour' }), el.firstChild);
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

  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  /** WCAG contrast ratio of two colours (names or hex). */
  const contrast = (a, b) => { const x = lum(color(a)), y = lum(color(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  root.Pour = { paint, photo, plate, fit, collage, color: hexOf, ramp: s => rampOf(s).map(rgbHex), PALETTES, COLORS, RAMPS, MODES, contrast, rng, hash, seedInt, rgb: color };
})(window);
