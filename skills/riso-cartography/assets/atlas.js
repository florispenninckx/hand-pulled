/* atlas.js — "Figure & Ground": riso-printed town and river sheets, built on riso.js and cartography.js (load both first).
 *
 *   await Atlas.blocks(canvas, { width, height, seed, mode, ink, image, text });   // a town as figure and ground
 *         mode 'solid'  bright red, twice: every block inked, the streets and the river left as paper
 *         mode 'wash'   cornflower: each block its own wash, dried darker at the rim, in a ragged town
 *         mode 'plan'   fluorescent pink + bright red: house footprints, a motorway interchange, low cloud
 *         mode 'hatch'  teal on cream: every block hatched, crossed, stippled or scribbled
 *   await Atlas.river(canvas,  { width, height, seed, text });  // purple + black: a river and every course it has had
 *   await Atlas.zoning(canvas, { width, height, seed, text });  // pink, purple, teal: land use washed over a site plan
 *   await Atlas.poster(canvas, { width, height, seed, text });  // green + black: a valley map under huge lowercase words
 *
 * Each sheet is a real separation: one master per drum, drawn in black on white in sheet units
 * (1000 wide, 1414 tall: an A-series page), then screened, knocked out of register and overprinted
 * by Riso.print. The towns are grown by Carto.city and the rivers migrated by Carto.meander, so no
 * two seeds share a street. The type is printed too, on a drum, so it misregisters with everything
 * else. `text` overrides the words on a sheet. Seeded. Original implementation.
 */
(function (root) {
  'use strict';
  const R = root.Riso, C = root.Carto;
  const SW = 1000, SH = 1414, TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const frac = v => v - Math.floor(v);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif', SERIF = '"Instrument Serif", Georgia, serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';

  /** A drum's draw function in sheet units. */
  const sheet = fn => (ctx, w, h, rand) => { ctx.save(); ctx.scale(w / SW, h / SH); fn(ctx, rand); ctx.restore(); };
  /** A density field painted as grey (1 = full ink), one sample every `res` sheet units, smoothed up. Multiplies over what is there. */
  function field(ctx, fn, x0, y0, w, h, res) {
    res = res || 4;
    const c = mk(w / res, h / res), g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
      const v = 255 * (1 - clamp(fn(x0 + (i + 0.5) * res, y0 + (j + 0.5) * res), 0, 1)), k = (j * c.width + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true; ctx.drawImage(c, x0, y0, w, h); ctx.restore();
  }
  /** A height grid in cartography.js's shape, from any function: isolines and tints work on it. */
  function grid(fn, width, height, step) {
    const gw = Math.ceil(width / step) + 1, gh = Math.ceil(height / step) + 1, z = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) z[j * gw + i] = fn(i * step, j * step);
    return { z, gw, gh, step, width, height, sea: 0.5 };
  }
  /** `fn` sampled every `s` units and read back bilinearly: cheap enough to call for every pixel. */
  function coarse(fn, W, H, s) {
    const gw = Math.ceil(W / s) + 2, gh = Math.ceil(H / s) + 2, z = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) z[j * gw + i] = fn(i * s, j * s);
    return (x, y) => {
      const fx = clamp(x / s, 0, gw - 1.001), fy = clamp(y / s, 0, gh - 1.001), i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
      return (z[k] * (1 - tx) + z[k + 1] * tx) * (1 - ty) + (z[k + gw] * (1 - tx) + z[k + gw + 1] * tx) * ty;
    };
  }
  /** A pen stipple: in a share `p` of cells `s` wide, one dot of radius `r`, jittered in its cell. */
  function stip(x, y, s, p, r, seed) {
    const i = Math.floor(x / s), j = Math.floor(y / s);
    if (R.hash2(i, j, seed) > p) return 0;
    const cx = (i + 0.25 + 0.5 * R.hash2(i, j, seed + 1)) * s, cy = (j + 0.25 + 0.5 * R.hash2(i, j, seed + 2)) * s;
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r ? 1 : 0;
  }
  /** Your photograph as darkness over a box (0 paper, 1 full ink), contrast stretched. */
  function tones(img, w, h) {
    const c = mk(w / 4, h / 4), g = c.getContext('2d', { willReadFrequently: true }), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.max(c.width / iw, c.height / ih);
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, (c.width - iw * s) / 2, (c.height - ih * s) / 2, iw * s, ih * s);
    const d = g.getImageData(0, 0, c.width, c.height).data, cw = c.width, ch = c.height;
    let lo = 1, hi = 0;
    const L = new Float32Array(cw * ch);
    for (let k = 0; k < L.length; k++) { L[k] = 1 - (0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2]) / 255; lo = Math.min(lo, L[k]); hi = Math.max(hi, L[k]); }
    return (x, y) => sstep(lo, hi, L[clamp((y / 4) | 0, 0, ch - 1) * cw + clamp((x / 4) | 0, 0, cw - 1)]);
  }
  function lines(ctx, list, x, y, lh) { list.forEach((s, i) => ctx.fillText(s, x, y + i * lh)); }
  /** `drums`: print only these drums (indices), for a proof of one separation. */
  const printOpts = (o, layers, paper) => ({ width: o.width, height: o.height, seed: o.seed, paper: paper || 'natural', misregister: o.misregister == null ? 1 : o.misregister, scale: Math.max(0.6, o.width / 900), layers: o.drums ? layers.filter((_, i) => o.drums.includes(i)) : layers });
  function prep(canvas, o) {
    o.width = Math.round(o.width || canvas.width); o.height = Math.round(o.height || o.width * SH / SW);
    return R.mulberry32((o.seed * 9301 + 49297) >>> 0);
  }

  // ---- lines on the map ---------------------------------------------------------------------
  const trace = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
  const stroke = (ctx, pts, w) => { ctx.lineWidth = w; trace(ctx, pts); ctx.stroke(); };
  /** A polyline moved sideways by d (positive: to the right of travel). */
  const offset = (pts, d) => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] - dy / L * d, p[1] + dx / L * d];
  });
  /** A road from a to b that wanders off the straight line by up to `amp`. */
  function wander(noise, a, b, amp, k) {
    const out = [], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, s = Math.sin(Math.PI * t) * amp * R.fbm(noise, t * 2.2 + k, k * 3.1, 2);
      out.push([a[0] + dx * t - dy / L * s, a[1] + dy * t + dx / L * s]);
    }
    return out;
  }
  /** A closed, lumpy outline round (x, y): towns, lakes, zones. */
  function blob(noise, x, y, rx, ry, rough, k) {
    const out = [];
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * TAU, r = 1 + rough * R.fbm(noise, Math.cos(a) * 1.4 + k, Math.sin(a) * 1.4 - k, 3);
      out.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]);
    }
    return out;
  }
  function arcLen(P) { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return c; }
  function pointAt(P, c, s) {
    let i = 1;
    while (i < P.length - 1 && c[i] < s) i++;
    const t = clamp((s - c[i - 1]) / (c[i] - c[i - 1] || 1), 0, 1), a = P[i - 1], b = P[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  /** Letters set along a line from arc length s0, turned so they read left to right. */
  function along(ctx, text, P, s0, track) {
    let c = arcLen(P);
    const chars = [...text], ws = chars.map(ch => ctx.measureText(ch).width), tw = ws.reduce((s, w) => s + w + track, 0);
    if (pointAt(P, c, s0 + tw)[0] < pointAt(P, c, s0)[0]) { P = P.slice().reverse(); c = arcLen(P); s0 = c[c.length - 1] - s0 - tw; }
    ctx.save(); ctx.textBaseline = 'middle';
    let s = s0;
    chars.forEach((ch, i) => {
      const [x, y, a] = pointAt(P, c, s + ws[i] / 2);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillText(ch, -ws[i] / 2, 0); ctx.restore();
      s += ws[i] + track;
    });
    ctx.restore();
  }
  /** Arc length along P of its point nearest (x, y). */
  function nearest(P, x, y) {
    const c = arcLen(P); let best = Infinity, s = 0;
    P.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < best) { best = d; s = c[i]; } });
    return s;
  }
  function north(ctx, x, y, h) {
    ctx.save(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x - 6, y + 14); ctx.lineTo(x, y + 10); ctx.closePath(); ctx.fill();
    ctx.font = `500 15px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('N', x, y - 10); ctx.restore();
  }
  function scaleBar(ctx, x, y, w, label) {
    ctx.save(); ctx.lineWidth = 1.4; ctx.strokeRect(x, y, w, 7);
    for (let i = 0; i < 4; i += 2) ctx.fillRect(x + i * w / 4, y, w / 4, 7);
    ctx.font = `400 12px ${MONO}`; ctx.fillText('0', x - 3, y + 24); ctx.textAlign = 'right'; ctx.fillText(label, x + w + 3, y + 24); ctx.restore();
  }

  // ---- the town ------------------------------------------------------------------------------
  /** Where a town's arterials cross water: the runs of each street that are bridges. */
  function bridges(T) {
    const out = [];
    for (const s of T.streets) {
      if (!s.major || s.fixed) continue;
      let run = null, prev = null;
      for (const p of s.pts) {
        if (T.kindAt(p[0], p[1]) === 2) { if (!run) run = prev ? [prev] : []; run.push(p); }
        else if (run) { run.push(p); if (run.length > 2) out.push({ pts: run, width: s.width }); run = null; }
        prev = p;
      }
    }
    return out;
  }
  /** A river migrated for a few decades, then a town grown round it. `river: 0` for a dry town. */
  function town(o, rand, opt) {
    opt = Object.assign({ W: SW, H: SH, river: 64, years: 50, spacing: 36, widths: [12, 6], roads: [], outline: null, radial: 0.9, grids: 4, curvy: 0.22, suburb: 0.3, plaza: null }, opt);
    const from = [opt.W * (0.42 + 0.25 * rand()), -80], to = [-80, opt.H * (0.55 + 0.2 * rand())];
    const riv = opt.river ? C.meander({ seed: o.seed, from: opt.from || from, to: opt.to || to, width: opt.river * 0.62, years: opt.years, valley: 150 }) : null;
    const T = C.city({ seed: o.seed, width: opt.W, height: opt.H, spacing: opt.spacing, widths: opt.widths, radial: opt.radial, grids: opt.grids, curvy: opt.curvy,
      suburb: opt.suburb, outline: opt.outline, roads: opt.roads, plaza: opt.plaza, water: riv ? [{ pts: riv.path, width: opt.river }] : [] });
    T.river = riv; T.riverWidth = opt.river; T.bridges = bridges(T);
    return T;
  }
  /** Every block of a town painted pixel by pixel: fn(block, d, x, y) is the ink there (d: distance to the street). */
  function blocksCanvas(T, fn) {
    const c = mk(T.RW, T.RH), g = c.getContext('2d'), img = g.createImageData(T.RW, T.RH), px = img.data, q = T.q;
    for (let j = 0, i = 0; j < T.RH; j++) for (let k = 0; k < T.RW; k++, i++) {
      const l = T.label[i], v = l ? clamp(fn(T.blocks[l], T.dist[i], k / q, j / q), 0, 1) : 0;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255 - 255 * v; px[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const put = (ctx, c, x, y, w, h) => { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(c, x, y, w, h); ctx.restore(); };
  /** House footprints: rows of lots along the street, gaps between them, a few in the middle of the block. */
  function footprint(b, d, x, y, lot) {
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle), u = (x * ca + y * sa) / lot, v = (-x * sa + y * ca) / (lot * 1.2);
    if (d < 1.6 || frac(u) < 0.16 || frac(v) < 0.16) return 0;
    const h = R.hash2(Math.floor(u), Math.floor(v), 7 + ((b.r * 997) | 0));
    return (d < lot * (1 + b.r) ? h > 0.16 : h > 0.86) ? 1 : 0;
  }

  // ---- I. blocks: figure and ground, four ways -------------------------------------------------
  const MODES = { solid: ['bright-red', 'white'], wash: ['cornflower', 'white'], plan: ['fluorescent-pink', 'white'], hatch: ['teal', 'cream'] };
  function blocks(canvas, opts) {
    const o = Object.assign({ seed: 1, mode: 'solid' }, opts), m = MODES[o.mode];
    if (!m) throw new Error(`atlas: unknown mode "${o.mode}". Use one of: ${Object.keys(MODES).join(', ')}.`);
    o.ink = o.ink || m[0];
    const rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T0 = Object.assign({ title: 'Stavmere', river: 'R I V E R   W E N N', note: ['PLAN OF THE TOWN, 1 : 12 500', 'STAVMERE PRINT CLUB', 'SHEET I · ONE INK, TWO HITS'] }, o.text);
    return ({ solid, wash, plan, hatch })[o.mode](canvas, o, rand, noise, T0, m[1]);
  }

  /** Solid: the Nolli way. Every block is ink, the public ground is paper, and one ink goes on twice for depth. */
  function solid(canvas, o, rand, noise, T0, paper) {
    const B = { x: 40, y: 40, w: 920, h: 1236 };
    const mw = wander(noise, [B.w * (0.72 + 0.2 * rand()), -40], [B.w * (0.3 + 0.2 * rand()), B.h + 40], 170, 3);   // the motorway, on its long curve
    const T = town(o, rand, { W: B.w, H: B.h, roads: [{ pts: mw, width: 24 }] });
    const dark = o.image ? tones(o.image, B.w, B.h) : null;
    const district = coarse((x, y) => R.fbm(noise, x / 420 + 17, y / 420 - 5, 2), B.w, B.h, 16);
    const c = blocksCanvas(T, (b, d, x, y) => {
      let v = 1;
      const big = b.area > 2600;
      if (big && b.r < 0.1) v = d < 2.4 ? 1 : stip(x, y, 6, 0.55, 1.7, 3);   // a park: its railings, then stipple
      else if (b.r > 0.975) v = d < 2.4 ? 1 : 0;                             // an open square
      else if (district(b.x, b.y) > 0.26) {                                  // an estate of slabs on open ground
        const u = x * Math.cos(b.angle) + y * Math.sin(b.angle);
        v = d < 2 ? 1 : d > 5 && frac(u / 17) < 0.42 ? 1 : 0;
      } else if (big && b.r < 0.55) v = d > 6.5 && d < 9 ? 0 : 1;             // a perimeter block round its courtyard
      return dark ? v * (0.08 + 0.92 * dark(x, y)) : v;
    });
    const s0 = nearest(T.river.path, B.w * 0.35, B.h * 0.3);
    const red = sheet(ctx => {
      ctx.save(); ctx.beginPath(); ctx.rect(B.x, B.y, B.w, B.h); ctx.clip(); ctx.translate(B.x, B.y);
      put(ctx, c, 0, 0, B.w, B.h);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // the river is paper between two bank lines; bridges are drawn over it
      ctx.strokeStyle = '#000'; stroke(ctx, T.river.path, T.riverWidth + 3.5);
      ctx.strokeStyle = '#fff'; stroke(ctx, T.river.path, T.riverWidth);
      for (const b of T.bridges) { ctx.strokeStyle = '#000'; stroke(ctx, b.pts, b.width + 3); ctx.strokeStyle = '#fff'; stroke(ctx, b.pts, b.width); }
      // the motorway: two carriageways, a verge between
      ctx.strokeStyle = '#000'; stroke(ctx, offset(mw, -3.5), 1.2); stroke(ctx, offset(mw, 3.5), 1.2);
      // the old square, with its monument
      const [px, py] = T.centre;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, T.plaza - 7, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
      ctx.font = `500 14px ${SANS}`; along(ctx, T0.river, T.river.path, s0, 1);
      ctx.restore();
      ctx.lineWidth = 2; ctx.strokeRect(B.x, B.y, B.w, B.h);
      ctx.font = `italic 400 124px ${SERIF}`; ctx.fillText(T0.title, B.x - 4, SH - 34);
      ctx.font = `400 13px ${MONO}`; ctx.textAlign = 'right'; lines(ctx, T0.note, SW - B.x, SH - 76, 19); ctx.textAlign = 'left';
      scaleBar(ctx, SW - B.x - 200, SH - 118, 200, '500 m');
      north(ctx, SW - B.x - 250, SH - 104, 58);
    });
    return R.print(canvas, printOpts(o, [
      { ink: o.ink, draw: red, screen: 'grain', density: 1 },
      { ink: o.ink, draw: red, screen: 'grain', density: 0.85 },
    ], paper));
  }

  /** Wash: each block its own wash of one ink, pooled darker where it dried at the rim, inside a ragged town. */
  function wash(canvas, o, rand, noise, T0, paper) {
    const edge = blob(noise, SW * 0.5, SH * 0.46, 390, 520, 0.36, 5);
    const T = town(o, rand, { outline: [edge], spacing: 28, widths: [9, 5], river: 58, radial: 0.5, grids: 5, curvy: 0.34, from: [SW * (0.72 + 0.15 * rand()), -80], to: [SW * (0.05 + 0.15 * rand()), SH + 80] });
    const base = coarse((x, y) => R.fbm(noise, x / 90, y / 90, 2), SW, SH, 12), bloom = coarse((x, y) => R.fbm(noise, x / 22 + 40, y / 22, 2), SW, SH, 5);
    const c = blocksCanvas(T, (b, d, x, y) => {
      if (b.edge && b.r < 0.45) return 0;   // the ragged edge: some outer blocks never printed
      return 0.34 + 0.36 * b.r + 0.2 * base(x, y) + 0.55 * Math.exp(-d / 1.9) + 0.18 * bloom(x, y) + (b.r > 0.88 ? 0.3 : 0);
    });
    const ink = sheet(ctx => {
      put(ctx, c, 0, 0, SW, SH);
      ctx.font = `italic 400 44px ${SERIF}`; ctx.fillText(`${T0.title}, in water`, 60, SH - 70);
      ctx.font = `400 13px ${MONO}`; ctx.fillText('ONE DRUM · EVERY BLOCK ITS OWN WASH', 62, SH - 44);
    });
    return R.print(canvas, printOpts(o, [{ ink: o.ink, draw: ink, screen: 'grain', density: 0.95 }], paper));
  }

  /** Plan: house footprints in pink, a motorway interchange across the middle, a red ramp and low cloud. */
  function plan(canvas, o, rand, noise, T0, paper) {
    const y0 = SH * (0.34 + 0.08 * rand()), mw = wander(noise, [-60, y0 + 110], [SW + 60, y0 - 90], 50, 11);
    const cs = arcLen(mw), J = pointAt(mw, cs, cs[cs.length - 1] * (0.55 + 0.15 * rand())), tx = Math.cos(J[2]), ty = Math.sin(J[2]);
    const cross = [[J[0] + ty * 900, J[1] - tx * 900], [J[0], J[1]], [J[0] - ty * 900, J[1] + tx * 900]];
    const loops = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const lx = J[0] + tx * a * 58 - ty * b * 58, ly = J[1] + ty * a * 58 + tx * b * 58, ring = [];
      for (let i = 0; i <= 40; i++) ring.push([lx + Math.cos(i / 40 * TAU) * 40, ly + Math.sin(i / 40 * TAU) * 40]);
      loops.push(ring);
    }
    const T = town(o, rand, { river: 0, spacing: 30, widths: [8, 4.5], radial: 0.5, roads: [{ pts: mw, width: 74 }, { pts: cross, width: 22 }].concat(loops.map(p => ({ pts: p, width: 9 }))) });
    const district = coarse((x, y) => R.fbm(noise, x / 300 + 3, y / 300 + 8, 2), SW, SH, 16);
    const pink = blocksCanvas(T, (b, d, x, y) => district(b.x, b.y) > 0.3 ? 0 : footprint(b, d, x, y, 8));
    const redC = blocksCanvas(T, (b, d, x, y) => district(b.x, b.y) > 0.3 ? footprint(b, d, x, y, 8) : 0);
    // low cloud: heaps of round puffs that hide the plan under a pale tint
    const clouds = [];
    for (let k = 0; k < 6; k++) {
      const x = rand() * SW, y = SH * (0.08 + 0.84 * rand()), n = 5 + (rand() * 6 | 0), heap = [];
      for (let i = 0; i < n; i++) heap.push([x + (rand() - 0.5) * 220, y + (rand() - 0.5) * 60 - i * 3, 30 + rand() * 50]);
      clouds.push(heap);
    }
    const puffs = (ctx, grow) => { for (const h of clouds) { ctx.beginPath(); for (const [x, y, r] of h) { ctx.moveTo(x + r + grow, y); ctx.arc(x, y, r + grow, 0, TAU); } ctx.fill(); } };
    const ramp = { x: SW * 0.56, y: 56, w: SW * 0.38, h: 300 };
    const pinkD = sheet(ctx => {
      put(ctx, pink, 0, 0, SW, SH);
      ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = -3; k <= 3; k++) stroke(ctx, offset(mw, k * 11), k % 3 ? 1 : 2.2);   // the lanes
      stroke(ctx, offset(cross, -8), 1.4); stroke(ctx, offset(cross, 8), 1.4);
      for (const p of loops) { stroke(ctx, offset(p, -3), 1.4); stroke(ctx, offset(p, 3), 1.4); }
      ctx.fillStyle = '#fff'; puffs(ctx, 3); ctx.fillStyle = '#dcdcdc'; puffs(ctx, 0);
      ctx.fillStyle = '#000'; ctx.font = `400 13px ${MONO}`;
      lines(ctx, [`${T0.title.toUpperCase()} · NORTH INTERCHANGE`, 'FOOTPRINTS 1 : 5 000'], 44, SH - 58, 19);
    });
    const redD = sheet(ctx => {
      put(ctx, redC, 0, 0, SW, SH);
      field(ctx, (x, y) => (x > ramp.x && x < ramp.x + ramp.w && y > ramp.y && y < ramp.y + ramp.h) ? 0.06 + 0.94 * sstep(0, 1, (x - ramp.x) / ramp.w) : 0, ramp.x - 8, ramp.y - 8, ramp.w + 16, ramp.h + 16, 2);
      ctx.fillStyle = '#fff'; puffs(ctx, 3);
    });
    return R.print(canvas, printOpts(o, [
      { ink: o.ink, draw: pinkD, screen: 'grain', density: 0.95 },
      { ink: 'bright-red', draw: redD, screen: 'grain', density: 0.9 },
    ], paper));
  }

  /** Hatch: every block ruled in one ink, each block its own texture; the avenues are paper. */
  function hatch(canvas, o, rand, noise, T0, paper) {
    const d1 = wander(noise, [-60, SH * (0.05 + 0.1 * rand())], [SW + 60, SH * (0.7 + 0.1 * rand())], 80, 21);
    const d2 = wander(noise, [SW * (0.1 + 0.2 * rand()), SH + 60], [SW * (0.75 + 0.2 * rand()), -60], 60, 27);
    const T = town(o, rand, { river: 0, spacing: 46, widths: [15, 7], radial: 0.4, grids: 3, roads: [{ pts: d1, width: 24 }, { pts: d2, width: 24 }] });
    const wob = coarse((x, y) => R.fbm(noise, x / 40, y / 40, 1), SW, SH, 6), scrib = coarse((x, y) => R.fbm(noise, x / 70 + 9, y / 70, 2), SW, SH, 4);
    const c = blocksCanvas(T, (b, d, x, y) => {
      if (d < 2.2) return 1;
      const k = (b.r * 6) | 0, a = b.angle + [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4, 0, 0][k];
      const u = x * Math.cos(a) + y * Math.sin(a), w = -x * Math.sin(a) + y * Math.cos(a);
      let knock;
      if (k === 4) knock = frac(u / 5) < 0.3 || frac(w / 5) < 0.3;         // crossed
      else if (k === 5) knock = frac(scrib(x, y) * 28) < 0.3;              // scribbled
      else if (k === 3 && b.area > 3000) knock = stip(x, y, 4.5, 0.6, 1.3, 9);   // stippled
      else knock = frac((u + 3 * wob(x, y)) / 4.6) < 0.32;                 // hatched, the line wandering a little
      return knock ? 0.28 : 0.94;
    });
    const ink = sheet(ctx => {
      put(ctx, c, 0, 0, SW, SH);
      ctx.strokeStyle = '#000'; ctx.lineCap = 'round';
      ctx.setLineDash([10, 7]); T.streets.forEach(s => s.major && stroke(ctx, s.pts, 1.2)); ctx.setLineDash([]);   // centre lines down the avenues
      ctx.fillStyle = '#fff'; ctx.fillRect(SW - 330, SH - 92, 290, 54);
      ctx.fillStyle = '#000'; ctx.font = `400 13px ${MONO}`; lines(ctx, [`${T0.title.toUpperCase()} · THE SOUTH GRID`, 'EVERY BLOCK RULED BY ITSELF'], SW - 316, SH - 68, 19);
    });
    return R.print(canvas, printOpts(o, [{ ink: o.ink, draw: ink, screen: 'grain', density: 0.95 }], paper));
  }

  // ---- II. river: every course it has had --------------------------------------------------
  /** Dendritic creeks: each forks, thins and bends away from the channel it feeds. */
  function grow(rand, x, y, a, wd, depth, out) {
    const L = 30 + wd * (6 + rand() * 6), bend = (rand() - 0.5) * 0.8;
    const x1 = x + Math.cos(a + bend) * L, y1 = y + Math.sin(a + bend) * L, mx = x + Math.cos(a) * L * 0.55, my = y + Math.sin(a) * L * 0.55;
    out.push({ x, y, mx, my, x1, y1, wd });
    if (wd < 0.9 || depth > 5 || x1 < -80 || x1 > SW + 80 || y1 < -80 || y1 > SH + 80) return;
    const a1 = a + bend, s = 0.35 + rand() * 0.45, main = rand() < 0.5 ? -1 : 1;
    grow(rand, x1, y1, a1 + main * s * 0.4, wd * 0.8, depth + 1, out);
    if (rand() < 0.7) grow(rand, x1, y1, a1 - main * s * 1.3, wd * 0.55, depth + 1, out);
  }
  function river(canvas, opts) {
    const o = Object.assign({ seed: 1 }, opts), rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T0 = Object.assign({ title: 'The Wenn', sub: ['EVERY COURSE THE RIVER HAS TAKEN', 'BELOW STAVMERE, 1790 TO NOW'], name: 'R I V E R   W E N N', key: ['the river now', 'its old courses, older fainter', 'oxbow lakes', 'Stavmere'] }, o.text);
    const w = 28, M = C.meander({ seed: o.seed, from: [SW * (0.42 + 0.16 * rand()), -40], to: [SW * (0.35 + 0.3 * rand()), SH + 40], width: w, years: 200, keep: 6, wander: 1.4 });
    // the town keeps to one side, off the floodplain
    const mean = M.path.reduce((s, p) => s + p[0], 0) / M.path.length, side = mean < SW / 2 ? 1 : -1;
    const tx = SW / 2 + side * 330, ty = SH * (0.45 + 0.12 * rand());
    const T = C.city({ seed: o.seed, width: SW, height: SH, spacing: 19, widths: [4.5, 2.4], plaza: 0, radial: 1, outline: [blob(noise, tx, ty, 230, 330, 0.4, 13)], water: M.history.concat([M.path]).map(p => ({ pts: p, width: w * 2.4 })) });
    const tc = blocksCanvas(T, (b, d) => d < 1.3 ? 0 : b.r > 0.93 ? 0.25 : 0.8);   // the town as figure and ground, a few blocks left as greens
    const creeks = [];
    for (let k = 0; k < 14; k++) {
      const i = 10 + (rand() * (M.path.length - 20) | 0), p = M.path[i], q = M.path[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]), sd = k % 2 ? 1 : -1;
      grow(rand, p[0] - Math.sin(a) * sd * w * 3, p[1] + Math.cos(a) * sd * w * 3, a + sd * (1.3 + rand() * 0.6) - 0.5 * sd, 4.5, 0, creeks);
    }
    const roads = [wander(noise, [tx, ty], [side > 0 ? SW + 60 : -60, SH * 0.1], 90, 31), wander(noise, [tx, ty], [SW / 2 - side * 520, SH * 0.9], 120, 37), wander(noise, [tx, ty], [SW / 2 + side * 560, SH + 60], 60, 41)];
    const s0 = nearest(M.path, SW / 2, SH * 0.72);
    const purple = sheet(ctx => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
      ctx.globalAlpha = 0.09; M.history.forEach(h => stroke(ctx, h, w * 4));          // the meander belt
      M.history.forEach((h, i) => { ctx.globalAlpha = 0.2 + 0.07 * i; stroke(ctx, h, w * 1.1); });
      ctx.globalAlpha = 0.5; M.history.forEach(h => { stroke(ctx, offset(h, w * 0.95), 0.9); stroke(ctx, offset(h, -w * 0.95), 0.9); });   // scroll bars
      ctx.globalAlpha = 0.85; M.oxbows.forEach(x => stroke(ctx, x.pts, w * 1.05));
      ctx.globalAlpha = 1; stroke(ctx, M.path, w * 1.3);
      for (const b of creeks) { ctx.lineWidth = b.wd; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(b.mx, b.my, b.x1, b.y1); ctx.stroke(); }
      const kx = 60, ky = SH - 150;   // key swatches, on this drum
      ctx.fillRect(kx, ky - 8, 36, 12); ctx.globalAlpha = 0.3; ctx.fillRect(kx, ky + 16, 36, 12); ctx.globalAlpha = 0.85; ctx.fillRect(kx, ky + 40, 36, 12); ctx.globalAlpha = 1;
    });
    const black = sheet(ctx => {
      put(ctx, tc, 0, 0, SW, SH);
      ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
      roads.forEach(r => stroke(ctx, r, 1.1)); ctx.globalAlpha = 1;
      ctx.font = `500 13px ${SANS}`; along(ctx, T0.name, offset(M.path, -w * 1.5), s0, 1);
      ctx.font = `italic 400 110px ${SERIF}`; ctx.fillText(T0.title, 52, 140);
      ctx.font = `500 14px ${SANS}`; lines(ctx, T0.sub, 58, 176, 20);
      ctx.font = `400 13px ${MONO}`; lines(ctx, T0.key.slice(0, 3), 110, SH - 148, 24);
      ctx.fillRect(60, SH - 80, 36, 12); ctx.fillText(T0.key[3], 110, SH - 69);
      north(ctx, SW - 70, 70, 60);
      scaleBar(ctx, SW - 262, SH - 72, 200, '2 km');
    });
    return R.print(canvas, printOpts(o, [
      { ink: 'purple', draw: purple, screen: 'grain', density: 0.95 },
      { ink: 'black', draw: black, screen: 'grain', density: 0.9 },
    ], 'white'));
  }

  // ---- III. zoning: land in use, washed over a site plan ---------------------------------------
  function zoning(canvas, opts) {
    const o = Object.assign({ seed: 1 }, opts), rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T0 = Object.assign({ title: 'Stavmere in use', sub: 'LAND IN USE AND LAND PROPOSED · 2026', places: ['STAVMERE', 'WENN LAKE', 'MILL DISTRICT', 'NORTH FIELDS', 'THE COMMONS', 'OLD QUAY'], key: ['HOMES', 'FIELDS', 'WORKS', 'COMMONS', 'PROPOSED'] }, o.text);
    const lake = blob(noise, SW * (0.66 + 0.1 * rand()), SH * 0.17, 100, 130, 0.3, 7);
    const riv = C.meander({ seed: o.seed + 5, from: [SW * (0.5 + 0.2 * rand()), SH * 0.2], to: [SW * (0.25 + 0.2 * rand()), SH + 60], width: 16, years: 120, valley: 130 });
    const T = C.city({ seed: o.seed, width: SW, height: SH, spacing: 64, widths: [7, 3], radial: 0.6, grids: 3, curvy: 0.12, suburb: 0.15, water: [{ pts: riv.path, width: 24 }, { poly: lake }] });
    const zone = coarse((x, y) => R.fbm(noise, x / 480 + 2, y / 480 - 4, 3), SW, SH, 16);
    const kind = b => { const z = zone(b.x, b.y) + (b.r - 0.5) * 0.12; return z > 0.12 ? 0 : z > 0.04 ? 2 : z > -0.16 ? 1 : 3; };   // homes, works, fields, commons
    const mass = coarse((x, y) => R.fbm(noise, x / 360 + 30, y / 360, 3) + 0.18 - Math.hypot(x - SW * 0.55, y - SH * 0.55) / 1500, SW, SH, 8);
    const pinkC = blocksCanvas(T, (b, d) => d < 2 ? 0 : [0.42, 0.14, 0, 0][kind(b)]);
    const purpleC = blocksCanvas(T, (b, d) => kind(b) === 2 && d > 2 ? 0.5 : 0);
    const tealC = blocksCanvas(T, (b, d, x, y) => kind(b) === 3 && d > 3 ? stip(x, y, 7, 0.5, 1.6, 21) : 0);
    const topo = grid((x, y) => 0.5 + 0.45 * R.fbm(noise, x / 600 + 11, y / 600 + 2, 4) - y / SH * 0.1, SW, SH, 10);
    // three proposals: hollow arrows from the town out to the land it wants
    const arrows = [];
    for (let k = 0; k < 3; k++) { const a = -0.4 + k * 0.9 + (rand() - 0.5) * 0.5, r0 = 150 + rand() * 60; arrows.push([T.centre[0] + Math.cos(a) * r0, T.centre[1] + Math.sin(a) * r0, a, 150 + rand() * 90]); }
    const hollow = (ctx, [x, y, a, L]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(L - 34, -11); ctx.lineTo(L - 34, -26); ctx.lineTo(L, 0); ctx.lineTo(L - 34, 26); ctx.lineTo(L - 34, 11); ctx.lineTo(0, 11); ctx.closePath();
      ctx.stroke(); ctx.restore();
    };
    const places = [[T.centre[0] - 50, T.centre[1] - 50], [lake[60][0] - 40, lake[60][1] - 30]];
    [2, 1, 3, 0].forEach(k => { const b = T.blocks.find((b, i) => i && kind(b) === k && b.area > 2500 && b.x > 120 && b.x < SW - 260 && b.y > 260 && b.y < SH - 280 && places.every(p => Math.hypot(p[0] - b.x + 40, p[1] - b.y) > 170)); places.push(b ? [b.x - 40, b.y] : [-999, -999]); });
    const KX = SW - 220, KY = SH - 250;   // the key
    // every word sits in a box of paper, knocked out of all three drums
    const m = mk(8, 8).getContext('2d'), boxes = [[KX - 16, KY - 22, 196, 168]];
    m.font = `500 14px ${MONO}`; T0.places.forEach((s, i) => { const [x, y] = places[i] || [-999, -999]; boxes.push([x - 5, y - 15, m.measureText(s).width + 10, 21]); });
    m.font = `italic 400 76px ${SERIF}`; boxes.push([40, 44, m.measureText(T0.title).width + 22, 86]);
    m.font = `400 13px ${MONO}`; boxes.push([44, 128, m.measureText(T0.sub).width + 20, 22]);
    const clear = ctx => { ctx.fillStyle = '#fff'; boxes.forEach(b => ctx.fillRect(...b)); ctx.fillStyle = '#000'; };
    const pink = sheet(ctx => {
      put(ctx, pinkC, 0, 0, SW, SH);
      ctx.fillStyle = '#b8b8b8'; [[SW - 250, 300, 170, 130], [60, SH * 0.52, 140, 190], [SW * 0.42, SH - 200, 190, 110]].forEach(r => ctx.fillRect(...r));   // inset panels
      clear(ctx); ctx.globalAlpha = 0.42; ctx.fillRect(KX, KY, 26, 16); ctx.globalAlpha = 0.14; ctx.fillRect(KX, KY + 28, 26, 16); ctx.globalAlpha = 1;
    });
    const purple = sheet(ctx => {
      put(ctx, purpleC, 0, 0, SW, SH);
      const Q = 22;   // the proposal, in whole parcels: a stepped edge, the way a planner colours a grid
      for (let y = 0; y < SH; y += Q) for (let x = 0; x < SW; x += Q) { if (mass(x + Q / 2, y + Q / 2) > 0) { ctx.globalAlpha = 0.28; ctx.fillRect(x, y, Q + 0.5, Q + 0.5); } }
      ctx.globalAlpha = 1;
      // sites: solid dots on homes near the centre
      T.blocks.forEach((b, i) => { if (i && kind(b) === 0 && b.area > 900 && Math.hypot(b.x - T.centre[0], b.y - T.centre[1]) < 330 && R.hash2(i, 3, o.seed) < 0.5) { ctx.beginPath(); ctx.arc(b.x, b.y, 6 + 3 * b.r, 0, TAU); ctx.fill(); } });
      clear(ctx); ctx.globalAlpha = 0.34; ctx.fillRect(KX, KY + 56, 26, 16); ctx.globalAlpha = 1;
    });
    const teal = sheet(ctx => {
      put(ctx, tealC, 0, 0, SW, SH);
      ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, SW, SH); boxes.forEach(b => ctx.rect(b[0] + b[2], b[1], -b[2], b[3])); ctx.clip();   // no line runs through a word
      ctx.globalAlpha = 0.35; C.contours(ctx, topo, { interval: 0.03, above: 0.2, width: 0.6, indexWidth: 1.1 }); ctx.globalAlpha = 1;
      T.streets.forEach(s => stroke(ctx, s.pts, s.major ? 2.2 : 0.9));
      stroke(ctx, offset(riv.path, 12), 1.3); stroke(ctx, offset(riv.path, -12), 1.3);
      ctx.lineWidth = 1.5; trace(ctx, lake); ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 2.4; arrows.forEach(a => hollow(ctx, a));
      ctx.restore();
      ctx.font = `500 14px ${MONO}`;
      T0.places.forEach((s, i) => { const [x, y] = places[i] || [-999, -999]; ctx.fillText(s, x, y); });
      ctx.font = `italic 400 76px ${SERIF}`; ctx.fillText(T0.title, 50, 110);
      ctx.font = `400 13px ${MONO}`; ctx.fillText(T0.sub, 54, 142);
      T0.key.forEach((s, i) => ctx.fillText(s, KX + 40, KY + 13 + i * 28));
      ctx.lineWidth = 1; ctx.strokeRect(KX, KY + 84, 26, 16);
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(KX + 5 + (i % 3) * 8, KY + 88 + (i / 3 | 0) * 8, 1.6, 0, TAU); ctx.fill(); }
      ctx.lineWidth = 1.6; hollow(ctx, [KX, KY + 120, 0, 26]);
      north(ctx, SW - 70, 70, 60); scaleBar(ctx, 54, SH - 64, 160, '1 km');
    });
    return R.print(canvas, printOpts(o, [
      { ink: 'fluorescent-pink', draw: pink, screen: 'grain', density: 0.9 },
      { ink: 'purple', draw: purple, screen: 'halftone', angle: 22, cell: 5.5, density: 0.95 },
      { ink: 'teal', draw: teal, screen: 'solid', density: 1 },
    ], 'white'));
  }

  // ---- IV. poster: a valley map under huge lowercase words -------------------------------------
  function poster(canvas, opts) {
    const o = Object.assign({ seed: 1 }, opts); o.ink = o.ink || 'green'; const rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T0 = Object.assign({ lines: ['stav', 'mere'], head: ['Stavmere,', 'from the', 'river up'], top: 'STAVMERE PRINT CLUB · A WALK IN SIX STOPS · SPRING 2026', stops: ['The old quay', 'Mill weir', 'Wenn Lake', 'North fields', 'The commons', 'Chalk pit'] }, o.text);
    const riv = C.meander({ seed: o.seed + 9, from: [-60, SH * (0.2 + 0.1 * rand())], to: [SW + 60, SH * (0.55 + 0.1 * rand())], width: 14, years: 140, valley: 110 });
    const rail = wander(noise, [-60, SH * 0.36], [SW + 60, SH * 0.78], 60, 51), road = wander(noise, [-60, SH * 0.12], [SW + 60, SH * 0.5], 90, 57);
    const rc = arcLen(riv.path), villages = [0.2, 0.5, 0.8].map((t, i) => { const p = pointAt(riv.path, rc, rc[rc.length - 1] * t); return blob(noise, p[0] + (i - 1) * 30, p[1] - 50 + 100 * rand(), 70 + 40 * rand(), 55 + 30 * rand(), 0.35, 60 + i * 7); });
    const T = C.city({ seed: o.seed, width: SW, height: SH, spacing: 46, widths: [3.2, 2.2], plaza: 0, radial: 0.2, grids: 5, curvy: 0.35, suburb: 0.6, water: [{ pts: riv.path, width: 20 }], roads: [{ pts: rail, width: 10 }, { pts: road, width: 12 }] });
    const vill = mk(SW / 2, SH / 2), vg = vill.getContext('2d', { willReadFrequently: true });
    vg.scale(0.5, 0.5); vg.fillStyle = '#000'; villages.forEach(v => { trace(vg, v); vg.fill(); });
    const vd = vg.getImageData(0, 0, vill.width, vill.height).data, inVillage = (x, y) => vd[(clamp((y / 2) | 0, 0, vill.height - 1) * vill.width + clamp((x / 2) | 0, 0, vill.width - 1)) * 4 + 3] > 0;
    const forest = coarse((x, y) => R.fbm(noise, x / 260 + 70, y / 260, 4), SW, SH, 6);
    const c = blocksCanvas(T, (b, d, x, y) => {
      if (inVillage(x, y)) return footprint(b, d, x, y, 5);
      if (forest(x, y) > 0.16) return stip(x, y, 5, 0.5, 1.8, 31) ? 0.25 : 0.8;   // woods: dark, with crowns of paper
      return d < 1.4 ? 0 : 0.1 + 0.3 * b.r;                                        // fields, each its own tint
    });
    const topo = grid((x, y) => 0.5 + 0.5 * R.fbm(noise, x / 500 + 3, y / 500 + 1, 4), SW, SH, 8);
    // the words, as big as the sheet allows; the six stops keep above them
    const L = T0.lines.filter(Boolean).slice(0, 3), m = mk(8, 8).getContext('2d');
    m.font = `500 100px ${SANS}`;
    const widest = Math.max(1, ...L.map(s => m.measureText(s).width)), fs = Math.min(420, 100 * (SW - 60) / widest, 1000 / (L.length * 0.86 + 0.2));
    const base = SH - 170, top = base - (L.length - 1) * fs * 0.86 - fs * 0.78;
    const stopsAt = [villages[0][0], villages[1][30], villages[2][60], [SW * 0.8, SH * 0.2], [SW * 0.3, SH * 0.3], [SW * 0.62, SH * 0.36]].map(p => [clamp(p[0], 60, SW - 60), clamp(p[1], 250, Math.max(280, top - 40))]);
    const green = sheet(ctx => {
      put(ctx, c, 0, 0, SW, SH);
      ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.55; C.contours(ctx, topo, { interval: 0.035, above: 0.1, width: 0.7, indexWidth: 1.3 }); ctx.globalAlpha = 1;
      stroke(ctx, riv.path, 21); ctx.strokeStyle = '#fff'; stroke(ctx, riv.path, 17);
      ctx.strokeStyle = '#000'; stroke(ctx, road, 11); ctx.strokeStyle = '#fff'; stroke(ctx, road, 7.5);
      ctx.strokeStyle = '#000'; stroke(ctx, rail, 2.2);
      const lc = arcLen(rail);
      ctx.lineWidth = 1.6;
      for (let s = 0; s < lc[lc.length - 1]; s += 16) { const [x, y, a] = pointAt(rail, lc, s); ctx.beginPath(); ctx.moveTo(x - Math.sin(a) * 5, y + Math.cos(a) * 5); ctx.lineTo(x + Math.sin(a) * 5, y - Math.cos(a) * 5); ctx.stroke(); }
    });
    const black = sheet(ctx => {
      ctx.font = `400 13px ${MONO}`; ctx.fillText(T0.top, 40, 40);
      ctx.font = `500 50px ${SANS}`; lines(ctx, T0.head, SW * 0.6, 108, 52);
      ctx.font = `500 ${fs}px ${SANS}`;
      L.forEach((s, i) => ctx.fillText(s, 22, base - (L.length - 1 - i) * fs * 0.86));
      ctx.lineWidth = 2;
      stopsAt.forEach(([x, y], i) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#000'; ctx.font = `500 17px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(i + 1, x, y + 6); ctx.textAlign = 'left'; });
      T0.stops.forEach((s, i) => {
        const x = 40 + (i % 3) * 310, y = SH - 104 + (i / 3 | 0) * 42;
        ctx.beginPath(); ctx.arc(x + 12, y - 5, 12, 0, TAU); ctx.stroke();
        ctx.font = `500 13px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(i + 1, x + 12, y); ctx.textAlign = 'left';
        ctx.font = `400 15px ${SANS}`; ctx.fillText(s, x + 34, y);
      });
    });
    return R.print(canvas, printOpts(o, [
      { ink: o.ink, draw: green, screen: 'grain', density: 0.95 },
      { ink: 'black', draw: black, screen: 'grain', density: 1 },
    ], 'white'));
  }

  root.Atlas = { blocks, river, zoning, poster, SW, SH };
})(typeof window !== 'undefined' ? window : globalThis);
