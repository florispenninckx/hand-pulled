/* atlas.js — four riso-printed map sheets, built on riso.js and cartography.js (load both first).
 *
 *   await Atlas.estuary(canvas, { width, height, seed, image, text });  // aqua: a white estuary and its drainage, fluorescent green dots
 *   await Atlas.windows(canvas, { width, height, seed, image, ink });   // green: a riverbed from above and a moor from the bank, in stepped windows, red rules
 *   await Atlas.chart(canvas,   { width, height, seed, image, text });  // yellow + grey: an island chain on a grid, grey insets with brown rock drawings
 *   await Atlas.rain(canvas,    { width, height, seed, text, ink });    // green only: a mass of type spread by the drum, over cloud contours
 *
 * Each sheet is a real separation: one master per drum, drawn in black on white in sheet
 * units (1000 wide, 1414 tall: an A-series page), then screened, knocked out of register
 * and overprinted by Riso.print. The type is printed too, on a drum, so it misregisters
 * with everything else. `text` overrides the words on the sheet; `image` puts your
 * photograph into the sheet's picture areas. Seeded. Original implementation.
 */
(function (root) {
  'use strict';
  const R = root.Riso, C = root.Carto;
  const SW = 1000, SH = 1414;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
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
  /** Three box passes over a canvas's luminance: the ink spread of type printed too heavy. */
  function spread(c, r, gain) {
    const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data, w = c.width, h = c.height;
    let a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) a[p] = d[p * 4];
    for (let pass = 0; pass < 3; pass++) for (const horiz of [true, false]) {
      const n = horiz ? w : h, m = horiz ? h : w;
      for (let q = 0; q < m; q++) {
        const at = i => a[horiz ? q * w + clamp(i, 0, n - 1) : clamp(i, 0, n - 1) * w + q];
        let s = 0;
        for (let i = -r; i <= r; i++) s += at(i);
        for (let i = 0; i < n; i++) { b[horiz ? q * w + i : i * w + q] = s / (2 * r + 1); s += at(i + r + 1) - at(i - r); }
      }
      [a, b] = [b, a];
    }
    for (let p = 0; p < w * h; p++) d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = 255 - clamp((255 - a[p]) * (gain || 1), 0, 255);
    g.putImageData(img, 0, 0);
  }
  /** Your photograph into a box: its darks become ink, lightened by `k` so the drum does not flood. */
  function photo(ctx, img, x, y, w, h, k) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.max(w / iw, h / ih);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'luminosity'; ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,255,255,${1 - (k || 0.8)})`; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  function spaced(ctx, s, x, y, track) {
    for (const ch of s) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + track; }
  }
  function lines(ctx, list, x, y, lh) { list.forEach((s, i) => ctx.fillText(s, x, y + i * lh)); }
  /** `drums`: print only these drums (indices), for a proof of one separation. */
  const printOpts = (o, layers, paper) => ({ width: o.width, height: o.height, seed: o.seed, paper: paper || 'natural', misregister: o.misregister == null ? 1 : o.misregister, scale: Math.max(0.6, o.width / 900), layers: o.drums ? layers.filter((_, i) => o.drums.includes(i)) : layers });
  function prep(canvas, o) {
    o.width = Math.round(o.width || canvas.width); o.height = Math.round(o.height || o.width * SH / SW);
    return R.mulberry32((o.seed * 9301 + 49297) >>> 0);
  }
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    return Math.hypot(px - ax - vx * t, py - ay - vy * t);
  }

  // ---- I. estuary: pin 0 -----------------------------------------------------------------
  /** Dendritic drainage: each creek forks, thins and bends away from the channel it feeds. */
  function grow(rand, x, y, a, wd, depth, out) {
    const L = 40 + wd * (5 + rand() * 5), bend = (rand() - 0.5) * 0.8;
    const x1 = x + Math.cos(a + bend) * L, y1 = y + Math.sin(a + bend) * L, mx = x + Math.cos(a) * L * 0.55, my = y + Math.sin(a) * L * 0.55;
    out.push({ x, y, mx, my, x1, y1, wd });
    if (wd < 1.6 || depth > 6 || x1 < -80 || x1 > SW + 80 || y1 < -80 || y1 > SH + 80) return;
    const a1 = a + bend;
    if (rand() > 0.8) { grow(rand, x1, y1, a1 + (rand() - 0.5) * 0.4, wd * 0.8, depth + 1, out); return; }
    const s = 0.35 + rand() * 0.45, main = rand() < 0.5 ? -1 : 1;   // one limb keeps most of the water
    grow(rand, x1, y1, a1 + main * s * 0.4, wd * 0.78, depth + 1, out);
    grow(rand, x1, y1, a1 - main * s * 1.3, wd * 0.5, depth + 1, out);
  }
  function estuary(canvas, opts) {
    const o = Object.assign({ seed: 1, ink: 'aqua' }, opts), rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T = Object.assign({ title: 'Low Water', big: 'Ebb', kicker: ['THE LAST EBB', 'OF SPRING', '— AT HOLMSEY'], date: ['(2026)', '10 · 08'], body: ['LOW WATER ®', 'THE RIVER EMPTIES', 'AND THE MUD COMES', 'UP TO MEET THE LIGHT.'], foot: 'HOLMSEY PRINT CLUB  ·  RISO, THREE DRUMS  ·  SHEET I' }, o.text);
    // the main channel: a spine from the lower left to the upper right, opening into a bay
    const spine = [], n = 60, sx = 0.04 + rand() * 0.14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (sx + t * (0.9 - sx)) * SW + R.fbm(noise, t * 2.5, 7.1, 3) * 150 * Math.sin(t * Math.PI);
      const y = (1.03 - t * 0.9) * SH + R.fbm(noise, t * 2.5 + 9, 2.3, 3) * 110;
      spine.push([x, y, 26 + Math.pow(t, 2.4) * (260 + rand() * 140)]);
    }
    const net = [];
    for (let k = 0; k < 16; k++) {
      const i = 3 + (rand() * (n - 12) | 0), [x, y, wd] = spine[i], [x2, y2] = spine[i + 1], a = Math.atan2(y2 - y, x2 - x), side = k % 2 ? -1 : 1;
      grow(rand, x + Math.cos(a + side * Math.PI / 2) * wd * 0.35, y + Math.sin(a + side * Math.PI / 2) * wd * 0.35, a + side * (0.9 + rand() * 0.7), 9 + rand() * 11, 0, net);
    }
    const dots = [];
    for (let k = 0; k < 12; k++) dots.push([30 + rand() * (SW - 60), 60 + rand() * (SH - 120)]);
    const channel = (ctx, extra) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < spine.length; i++) { ctx.lineWidth = spine[i][2] + extra; ctx.beginPath(); ctx.moveTo(spine[i - 1][0], spine[i - 1][1]); ctx.lineTo(spine[i][0], spine[i][1]); ctx.stroke(); }
    };
    const creeks = (ctx, extra) => {
      ctx.lineCap = 'round';
      for (const b of net) { ctx.lineWidth = b.wd + extra; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(b.mx, b.my, b.x1, b.y1); ctx.stroke(); }
    };
    const blue = sheet((ctx) => {
      // the flats seen from above: pale silt with dense wet patches, and field texture at a finer scale
      field(ctx, (x, y) => {
        const wet = sstep(0, 0.4, R.fbm(noise, x / 380 + 3, y / 240, 5));
        return 0.42 + 0.4 * wet + 0.16 * R.fbm(noise, x / 60 + 50, y / 40, 3) + 0.1 * R.fbm(noise, x / 10, y / 10, 1);
      }, 0, 0, SW, SH, 4);
      if (o.image) photo(ctx, o.image, 0, 0, SW, SH, 0.8);
      ctx.strokeStyle = '#fff'; channel(ctx, 0); creeks(ctx, 0);
    });
    const black = sheet((ctx) => {
      // banks: each creek printed as a hairline either side, so the water reads as paper
      ctx.globalAlpha = 0.72; ctx.strokeStyle = '#000'; channel(ctx, 3); creeks(ctx, 2.6);
      ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; channel(ctx, 0); creeks(ctx, 0);
      ctx.fillStyle = '#000';
      ctx.font = `500 23px ${SANS}`; lines(ctx, T.kicker, 44, 100, 25);
      ctx.font = `500 46px ${SANS}`; lines(ctx, T.date, SW - 250, 110, 46);
      ctx.font = `400 250px ${SERIF}`; ctx.fillText(T.big, SW * 0.52, SH * 0.5);
      ctx.font = `italic 400 104px ${SERIF}`; ctx.fillText(T.title, SW * 0.4, SH * 0.66);
      ctx.font = `500 21px ${SANS}`; lines(ctx, T.body, SW * 0.4 + 8, SH * 0.66 + 46, 24);
      ctx.font = `500 15px ${SANS}`; spaced(ctx, T.foot, 44, SH - 40, 1.2);
      ctx.save(); ctx.translate(SW - 34, 270); ctx.rotate(Math.PI / 2); ctx.font = `500 15px ${SANS}`; spaced(ctx, 'SHEET I · ESTUARY · 51°13′N 3°12′E', 0, 0, 2); ctx.restore();
    });
    const green = sheet((ctx) => { for (const [x, y] of dots) { ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill(); } });
    return R.print(canvas, printOpts(o, [
      { ink: o.ink, draw: blue, screen: 'grain', density: 0.95 },
      { ink: 'black', draw: black, screen: 'grain', density: 1 },
      { ink: 'fluorescent-green', draw: green, screen: 'solid' },
    ], 'white'));
  }

  // ---- II. windows: pins 2 and 6 ---------------------------------------------------------
  function windows(canvas, opts) {
    const o = Object.assign({ seed: 1, ink: 'green' }, opts), rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T = Object.assign({ tag: 'SHEET II · THE RIVERBED FROM ABOVE, THE MOOR FROM THE BANK', notes: ['A. riverbed, 1:2 500', 'B. riverbed, 1:10 000', 'C. moor, eye level', 'D. the old track'] }, o.text);
    const G = SW / 12, j = () => (rand() * 2 | 0);
    // a staircase of four windows on a 12-column grid, each overlapping the last by a row
    const cell = (c0, r0, c1, r1) => ({ x: c0 * G, y: r0 * G, w: (c1 - c0) * G, h: (r1 - r0) * G });
    const rA = 1, rB = 5 + j(), rC = rB + 3 + j(), rD = rC + 3;
    const rects = [cell(3 + j(), rA, 11, rA + 5), cell(0, rB, 7 + j(), rB + 5), cell(2 + j(), rC, 11, rC + 4), cell(5 + j(), rD, 11, rD + 2)];
    const riverbed = (x, y) => {   // the braided bed from above: fine bands pushed round by a slow warp
      const wx = R.fbm(noise, x / 600, y / 600, 3), wy = R.fbm(noise, x / 600 + 7, y / 600 + 3, 3);
      const u = (x * 0.8 - y * 0.6) / 16 + wx * 60 + wy * 25 + R.fbm(noise, x / 90, y / 90, 2) * 3;
      const band = sstep(-0.7, 0.5, Math.sin(u)) * (0.55 + 0.45 * Math.sin(u * 0.31 + 1));
      const bed = sstep(-0.6, 0.05, R.fbm(noise, x / 380 + 20, y / 380, 3) + wy);
      return 0.14 + bed * 0.6 * band + (1 - bed) * 0.1 + 0.18 * R.fbm(noise, x / 8, y / 8, 2);
    };
    const hz = rects[2].y + rects[2].h * 0.55;
    const ridge = x => hz - 6 - 24 * Math.abs(R.fbm(noise, x / 260 + 11, 0.5, 3)) - Math.min(90, Math.max(0, x - SW * 0.66) * 0.5) * (1 + 0.25 * R.fbm(noise, x / 60, 3, 2));
    const moor = (x, y) => {       // at eye level: blank sky, a far ridge, heather thickening to the foreground
      if (y < ridge(x)) return 0.02;
      if (y < hz) return 0.36 + 0.14 * R.fbm(noise, x / 30, y / 30, 3);
      const t = clamp((y - hz) / 300, 0, 1);
      return 0.3 + 0.3 * t + 0.34 * R.fbm(noise, x / 6, y / 20, 3) + 0.12 * R.fbm(noise, x / 70, y / 50, 2);
    };
    const ink = sheet((ctx) => {
      rects.forEach((r, i) => {
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        ctx.fillStyle = '#fff'; ctx.fillRect(r.x, r.y, r.w, r.h);
        if (o.image) photo(ctx, o.image, r.x, r.y, r.w, r.h, i < 2 ? 0.6 : 0.95);
        else field(ctx, i < 2 ? riverbed : moor, r.x, r.y, r.w, r.h, 2.5);
        ctx.restore();
      });
      if (!o.image) {   // one person on the bank, sitting, facing the ridge
        const r = rects[2], fx = r.x + r.w * (0.3 + rand() * 0.25), fy = hz + 2;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(fx, fy - 17, 8, 14, 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(fx + 1, fy - 37, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(fx + 10, fy - 3, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
      // the old track: an ellipse walked into the ground, running out of its window onto the paper
      const d = rects[3];
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(d.x + d.w * 0.3, d.y + d.h + 30, d.w * 0.55, 46, -0.02, 0, Math.PI * 2); ctx.stroke();
    });
    const red = sheet((ctx) => {
      // guides: hairlines along window edges, run past them to the trim
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      [rects[0].y + G * 2, rects[1].y, rects[2].y + G, rects[3].y + rects[3].h - G].forEach(y => { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(SW - 24, y); ctx.stroke(); });
      [rects[0].x, rects[2].x + rects[2].w - G, rects[1].x + rects[1].w].forEach((x, i) => { ctx.beginPath(); ctx.moveTo(x, i ? 24 : rects[0].y - 40); ctx.lineTo(x, SH - 24); ctx.stroke(); });
      const r = rects[3]; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(r.x - G * 0.4, r.y + r.h * 0.45); ctx.lineTo(r.x + r.w * 0.7, r.y + r.h * 0.45); ctx.stroke();
    });
    const black = sheet((ctx) => {
      ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.font = `400 12px ${MONO}`;
      // column notes in the margins, set sideways like a printer's slug
      for (let k = 0; k < 4; k++) {
        ctx.save(); ctx.translate(SW - 26 - k * 17, 50 + k * 120); ctx.rotate(Math.PI / 2);
        ctx.fillText(k ? T.notes[k % T.notes.length] + '  ·  ' + (rand() * 9000 + 1000 | 0) + '  ·  ' + (rand() * 90 | 0) + '°' : T.tag, 0, 0); ctx.restore();
      }
      ctx.save(); ctx.translate(26, SH - 60); ctx.rotate(-Math.PI / 2); ctx.fillText('K 0  ·  G 100  ·  R 100  ·  holmsey print club', 0, 0); ctx.restore();
      rects.forEach((r, i) => ctx.fillText(T.notes[i % T.notes.length], r.x + 4, r.y - 8));
      ctx.lineWidth = 1; [[20, 20], [SW - 20, 20], [20, SH - 20], [SW - 20, SH - 20]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke(); });
    });
    return R.print(canvas, printOpts(o, [
      { ink: o.ink, draw: ink, screen: 'grain', density: 1 },
      { ink: 'bright-red', draw: red, screen: 'solid', density: 0.9 },
      { ink: 'black', draw: black, screen: 'solid', density: 0.8 },
    ], 'white'));
  }

  // ---- III. chart: pins 4 and 5 ----------------------------------------------------------
  function chart(canvas, opts) {
    const o = Object.assign({ seed: 1 }, opts), rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T = Object.assign({ word: 'HOLM', word2: 'SEY', brand: 'HOLMSEY', places: ['Varkmere', 'Ostby', 'Linthwaite', 'Stavness', 'Ardhope'], code: 'HP ↔ 22 ‡ 8 ∞ 7 # 0333' }, o.text);
    // an island chain along a bent spine, top right to bottom left, with a few outliers
    const sp = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      sp.push([SW * (0.86 - 0.62 * t) + Math.sin(t * 5 + rand()) * 70, SH * (0.03 + 0.95 * t) + Math.sin(t * 3) * 40]);
    }
    const land = grid((x, y) => {
      let d = Infinity;
      for (let i = 1; i < sp.length; i++) d = Math.min(d, segDist(x, y, sp[i - 1][0], sp[i - 1][1], sp[i][0], sp[i][1]));
      const w = 70 + 60 * R.fbm(noise, x / 500 + 4, y / 500, 2);
      return 0.5 + 0.55 * (1 - d / w) * 0.5 + 0.3 * R.fbm(noise, x / 110, y / 110, 5);
    }, SW, SH, 5);
    const isLand = (x, y) => C.heightAt(land, x, y) > 0.5;
    const G = SW / 10;
    // insets snap to the grid, stay off the island and avoid each other
    const insets = [];
    for (let k = 0; k < 200 && insets.length < 4; k++) {
      const w = G * (2 + (rand() * 2 | 0)), h = G * (2 + (rand() * 2 | 0)), x = (rand() * (10 - w / G + 1) | 0) * G, y = (1 + rand() * (SH / G - h / G - 1) | 0) * G;
      if (insets.some(r => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y)) continue;
      let onLand = 0; for (let s = 0; s < 25; s++) onLand += isLand(x + (s % 5 + 0.5) * w / 5, y + ((s / 5 | 0) + 0.5) * h / 5);
      if (onLand > 6) continue;
      insets.push({ x, y, w, h, name: T.places[insets.length % T.places.length] });
    }
    insets.forEach((r, k) => {   // each inset gets its own rock face: a steep local field
      r.rock = (x, y) => 0.44 + R.fbm(noise, x / 210 + 13 * k, y / 150 + 5 * k, 5) + 0.22 * (1 - y / r.h);
      r.t = grid(r.rock, r.w, r.h, 3);
    });
    const inInset = (x, y) => insets.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const gridLines = (ctx, lw) => {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = lw;
      for (let x = G; x < SW; x += G) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
      for (let y = G; y < SH; y += G) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }
    };
    const town = sp[(sp.length * (0.3 + rand() * 0.2)) | 0];
    const knockBrand = ctx => { ctx.fillStyle = '#fff'; ctx.font = `500 76px ${SANS}`; ctx.textAlign = 'right'; ctx.fillText(T.brand, SW - 60, SH - 60); ctx.textAlign = 'left'; };
    const yellow = sheet((ctx) => {
      // the sea as a photograph of water and scree, in yellow
      field(ctx, (x, y) => isLand(x, y) || inInset(x, y) ? 0 : 0.5 + 0.45 * R.fbm(noise, x / 260, y / 260, 4) + 0.2 * R.fbm(noise, x / 30, y / 30, 2), 0, 0, SW, SH, 3);
      gridLines(ctx, 2.2); knockBrand(ctx);
      ctx.fillStyle = '#000';   // one town on the island in solid yellow
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(town[0] + (k - 3) * 10, town[1] + (rand() - 0.5) * 8, 16, 8, 0.3, 0, Math.PI * 2); ctx.fill(); }
    });
    const grey = sheet((ctx) => {
      // under the yellow: rock and weather, heavy in places, gone in others; flat grey in the insets
      field(ctx, (x, y) => {
        if (inInset(x, y)) return 0.46 + 0.18 * R.fbm(noise, x / 40 + 3, y / 40, 3) + 0.08 * R.fbm(noise, x / 8, y / 8, 1);
        if (isLand(x, y)) return 0;
        const r = 1 - Math.abs(R.fbm(noise, x / 140 + 20, y / 110, 5));
        return 0.04 + 0.62 * sstep(0.55, 0.95, r) * sstep(-0.15, 0.25, R.fbm(noise, x / 380, y / 380 + 9, 3)) + 0.1 * R.fbm(noise, x / 12, y / 12, 2);
      }, 0, 0, SW, SH, 3);
      if (o.image) insets.forEach(r => photo(ctx, o.image, r.x, r.y, r.w, r.h, 0.75));
      gridLines(ctx, 1.4); knockBrand(ctx);
      // the word, drawn in outline across the whole sheet
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2;
      [[T.word, SH * 0.25], [T.word2, SH * 0.7]].forEach(([s, y]) => {
        ctx.font = `400 100px ${SANS}`; const fs = Math.min(560, 100 * (SW - 50) / ctx.measureText(s).width);
        ctx.font = `400 ${fs}px ${SANS}`; ctx.strokeText(s, 25, y);
      });
      ctx.fillStyle = '#fff'; ctx.font = `600 21px ${SANS}`;
      insets.forEach(r => { ctx.fillText('◈ ' + r.name, r.x + 12, r.y + 30); });
      ctx.fillStyle = '#000'; ctx.font = `500 17px ${MONO}`; ctx.fillText(T.code, 40, 66);
      ctx.font = `500 11px ${SANS}`;   // three survey marks on the island
      for (let k = 0; k < 3; k++) { const p = sp[4 + k * 6]; ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6); ctx.fillText(T.places[(k + 2) % T.places.length], p[0] + 7, p[1] + 4); }
    });
    const brown = sheet((ctx) => {
      ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineJoin = 'round';
      insets.forEach(r => {
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.translate(r.x, r.y);
        // a rock face drawn from its own contours: the clefts filled, the ledges lined
        field(ctx, (x, y) => {
          const e = r.rock(x, y);
          if (e < 0.54) return 0;
          const crack = Math.abs(R.fbm(noise, x / 50 + 70, y / 75, 4)), shade = R.fbm(noise, x / 34 - 40, y / 22, 3);
          return crack < 0.034 + 0.03 * (e - 0.54) || (e > 0.72 && shade > 0.18) ? 1 : 0;
        }, 0, 0, r.w, r.h, 2);
        ctx.lineWidth = 2.6; ctx.beginPath(); C.isoline(ctx, r.t, 0.54); ctx.stroke();
        ctx.restore();
      });
    });
    return R.print(canvas, printOpts(o, [
      { ink: 'yellow', draw: yellow, screen: 'grain', density: 0.7 },
      { ink: 'light-gray', draw: grey, screen: 'grain', density: 1 },
      { ink: 'brown', draw: brown, screen: 'solid', density: 1 },
    ], 'natural'));
  }

  // ---- IV. rain: pin 1 ---------------------------------------------------------------------
  function rain(canvas, opts) {
    const o = Object.assign({ seed: 1, ink: 'green' }, opts), rand = prep(canvas, o), noise = R.makeNoise(rand);
    const T = Object.assign({ words: 'grain rain · low water · the silt comes up · ', head: [['Holmsey', 'Low Water (from the 1926 survey)', 'Estuary'], ['Sheet IV', 'rain over the flats: a reading in one drum'], ['17th Oct.', '19:00 — 21:00']] }, o.text);
    const cloud = grid((x, y) => 0.5 + R.fbm(noise, x / 320 + 4, y / 150, 5) * 0.9, SW, SH, 5);
    const ink = sheet((ctx) => {
      ctx.fillStyle = '#000';
      // the head: typed small, three columns, as on a cover letter
      ctx.font = `400 13px ${MONO}`;
      T.head.forEach((row, i) => row.forEach((s, j) => ctx.fillText(s, 60 + j * 290, 80 + i * 46 + j * 12)));
      // the mass: lines of type stacked into a hill, set small, then spread the way over-inked type spreads
      const k = 0.25, m = mk(SW * k, SH * k), g = m.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, m.width, m.height); g.fillStyle = '#000';
      const top = 0.21 + rand() * 0.04, bot = 0.64 + rand() * 0.04, lean = (rand() - 0.5) * 0.2;
      g.font = `700 7px ${SANS}`;
      for (let y = top * m.height; y < bot * m.height; y += 7.2 + rand() * 2) {
        const t = (y / m.height - top) / (bot - top);
        const half = m.width * (0.06 + 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.7) * (0.75 + 0.5 * rand()) + 0.05 * Math.sin(t * 19));
        const cx = m.width * (0.5 + lean * (1 - t) + (rand() - 0.5) * 0.04);
        let s = ''; while (g.measureText(s).width < half * 2 + 60) s += T.words;
        g.save(); g.beginPath(); g.rect(cx - half, y - 7, half * 2, 9); g.clip(); g.lineWidth = 0.9; g.strokeStyle = '#000';
        const x0 = cx - half - rand() * 50; g.fillText(s, x0, y); g.strokeText(s, x0, y); g.restore();
      }
      spread(m, 1, 2.2);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true; ctx.drawImage(m, 0, 0, SW, SH); ctx.restore();
      // clouds underneath: a few thin outlines of a slow field, only in the lower third
      ctx.save(); ctx.beginPath(); ctx.rect(20, SH * 0.6, SW - 40, SH * 0.3); ctx.clip();
      ctx.lineWidth = 1.7; ctx.globalAlpha = 0.75;
      [0.6, 0.74, 0.88].forEach(l => { ctx.beginPath(); C.isoline(ctx, cloud, l); ctx.stroke(); });
      ctx.restore();
      ctx.font = `400 13px ${MONO}`; ctx.fillText(T.words.split('·')[0].trim() + ' — ' + T.words.split('·')[1].trim(), SW * 0.4, SH * 0.93);
    });
    return R.print(canvas, printOpts(o, [{ ink: o.ink, draw: ink, screen: 'grain', density: 1 }], 'white'));
  }

  root.Atlas = { estuary, windows, chart, rain, SW, SH };
})(typeof window !== 'undefined' ? window : globalThis);
