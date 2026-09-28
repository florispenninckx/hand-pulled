/* goo.js — liquid display type for a maximalist colour page. One alphabet drawn point by point
 * as pen strokes, then stroked fat, blurred and cut back at a threshold so the strokes melt
 * into soft bubble letters that touch, bulge at the ends and drip. Finished four ways: blob,
 * drip, glow (a halo and ghost copies) and echo (outlines stacked behind a solid front).
 * Everything is an SVG filter in the lettering's own units, so it scales with CSS and exports
 * as a self-contained file. Seeded, so a good pour can be kept. No dependencies.
 * Original implementation: the alphabet was drawn point by point for this skill.
 *
 *   const svg = Goo.write('citric', { finish: 'drip', seed: 4 })
 *   Goo.letter(h1, { finish: 'blob', seed: 9 })          // the element's own text, kept for screen readers
 *   Goo.pour(svg, { duration: 1600 })                     // the letters condense out of a puddle
 *   Goo.pour(svg, { hold: true })                         // hold them as a puddle, e.g. until scrolled into view
 *   const c = await Goo.toCanvas(svg, { width: 1200, color: '#1f2fb0' })  // for export or compositing
 *
 * Glyph units: x-height 10, baseline 0, y grows downward; ascenders reach -17, capitals -15,
 * descenders +7. A stroke is a list of points joined by a Catmull-Rom spline; "!" after a
 * point makes it a corner. "*" / "-" before and after a stroke say whether that end is free
 * (can take a drop) or joined. "o" is a closed stroke, "." a single dot.
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
  const rng = seed => mulberry32(typeof seed === 'number' ? Math.floor(seed * 9973) + 17 : hashStr(String(seed)));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ the alphabet */
  const BOWL = '- 6.4,-8.4 4.2,-10 1.4,-9 0,-5.4 0.6,-1.6 2.8,0 5.2,-1 6.5,-4 -';
  const GLYPHS = {
    a: [9.4, BOWL, '* 6.7,-10.2 6.6,-4.4 6.9,-1 8.4,0.2 *'],
    b: [8.8, '* 1,-17 0.9,-9 1,0 -', '- 1,-5.8 2.8,-9.2 5.6,-9.8 7.5,-7 7.2,-2.6 4.6,0 1.8,-0.6 -'],
    c: [7.8, '* 6.8,-8.4 4.6,-10 1.6,-9 0,-5.2 0.8,-1.4 3.4,0.1 6.6,-1.4 *'],
    d: [9.4, BOWL, '* 6.8,-17 6.7,-5 6.9,-1 8.4,0.2 *'],
    e: [8, '- 0.6,-5 6.8,-5.6 6.2,-8.6 3.6,-10 1,-8.6 0,-5 0.9,-1.4 3.6,0.1 6.8,-1.8 *'],
    f: [6.4, '* 6.6,-15.2 4.9,-17 2.9,-16.2 2.3,-13 2.3,0.3 *', '* 0,-9.8 5.4,-10 *'],
    g: [9.2, '- 6.4,-8.4 4.2,-10 1.4,-9 0,-5.6 0.8,-2 3,-0.6 5.4,-1.8 6.5,-4.4 -', '* 6.8,-10.2 6.7,-1 6.2,4.4 3.8,6.9 1,5.6 *'],
    h: [9.4, '* 1,-17 1,0.2 *', '- 1,-6.2 2.8,-9.4 5,-10 6.6,-8.4 6.8,-3 7.2,-0.7 8.6,0.2 *'],
    i: [3.8, '* 1,-10 1,-2.4 1.5,-0.4 3,0.2 *', '. 1.1,-14'],
    j: [5.2, '* 3.6,-10 3.6,3.6 2.4,6.6 -0.6,6.2 *', '. 3.7,-14'],
    k: [8.4, '* 1,-17 1,0.2 *', '* 6.8,-10.2 4.4,-9 1.2,-5.2! 4,-4.8 5.8,-2.4 7.6,0.2 *'],
    l: [4.2, '* 1.2,-17 1,-2.6 1.6,-0.4 3.4,0.2 *'],
    m: [12.8, '* 1,-10 1,0.2 *', '- 1,-7 2.4,-9.6 4.2,-9.9 5.5,-8 5.6,0.2 *', '- 5.6,-7 7,-9.6 8.9,-9.9 10.2,-8 10.3,-2.8 10.7,-0.6 12,0.2 *'],
    n: [9.2, '* 1,-10 1,0.2 *', '- 1,-6.8 2.8,-9.6 5,-10 6.6,-8.2 6.7,-2.8 7.1,-0.6 8.5,0.2 *'],
    o: [8, 'o 3.6,-10 6.3,-8.6 7.2,-5 6.2,-1.4 3.6,0.1 1,-1.4 0,-5 0.9,-8.6'],
    p: [8.8, '* 1,-10.2 1,7 *', '- 1,-6.6 3,-9.7 6,-9.6 7.6,-5.4 6.6,-1.4 3.6,0 1.1,-1.8 -'],
    q: [9.4, BOWL, '* 6.8,-10.2 6.7,5 7.6,6.9 9.2,6.2 *'],
    r: [7.2, '* 1,-10 1,0.2 *', '- 1,-6.4 2.6,-9.4 4.8,-10.1 6.8,-9 *'],
    s: [7.4, '* 6.4,-8.8 4.2,-10.1 1.8,-9.6 0.9,-7.8 2.4,-5.8 5,-4.8 6.4,-2.8 5.6,-0.7 3,0.1 0.4,-1.2 *'],
    t: [5.8, '* 2.4,-14.6 2.3,-2.4 2.9,-0.4 4.8,0.1 *', '* 0,-9.8 5,-10 *'],
    u: [9.4, '* 0.8,-10 0.8,-3.6 2,-0.6 4.2,0.1 6.2,-1.4 6.9,-5 -', '* 6.9,-10.2 6.9,-2.4 7.4,-0.4 8.8,0.2 *'],
    v: [8.2, '* 0,-10 1.8,-5.6 3.7,0.2! 5.6,-5.6 6.6,-9 7.8,-10 *'],
    w: [10, '* 0,-10 1.5,-4.6 3.1,0.2! 4.9,-6.6! 6.6,0.2! 8.3,-4.6 9.5,-10 *'],
    x: [7.6, '* 0.2,-10 3.7,-5 7.2,0.2 *', '* 7.2,-10 3.7,-5 0.2,0.2 *'],
    y: [8.8, '* 0.6,-10 0.8,-3.8 2.4,-0.8 4.4,-0.6 6.2,-2.6 6.8,-6 -', '* 6.9,-10.2 6.8,3.6 5.4,6.6 2.6,6.9 0.8,5.2 *'],
    z: [7.8, '* 0.4,-9.8 7,-10! 0.4,0! 7.2,0.2 *'],

    A: [8.8, '* -0.4,0.2 2,-7.4 4.2,-15! 6.4,-7.4 8.8,0.2 *', '- 1.6,-5.6 7,-5.8 -'],
    B: [9.2, '* 1,-15 1,0.2 -', '- 1,-15 5.4,-14.8 7.6,-12.6 7,-9.4 4.2,-8 1,-8 -', '- 4,-8 7.2,-7.4 8.4,-4.4 7.2,-1.2 4,0.2 1,0 -'],
    C: [10, '* 9,-12.2 7.4,-14.8 4.4,-15.1 1.4,-12.8 0,-7.6 1,-2.6 4,-0.1 7.4,-0.6 9.2,-2.8 *'],
    D: [10.4, '* 1.2,-15 1,0.2 -', '- 1.2,-15 6,-14.2 9.2,-10.4 9.4,-5 7.2,-1.2 3.4,0.2 0.4,0 *'],
    E: [9.4, '* 8,-13.2 6,-15.1 2.8,-14.8 1.2,-12.2 2.4,-9.4 5.4,-8.2! 2.4,-7.4 0.4,-4.6 1,-1.4 3.8,0.2 7,-0.4 8.8,-2.8 *'],
    F: [9.2, '* 0.6,-14.6 9.2,-15.2 *', '- 4.2,-14.9 4,-6 3.4,-1 1.4,0.4 -0.2,-0.6 *', '* 1.4,-7.8 7,-8 *'],
    G: [10.2, '* 9,-12.2 7.4,-14.8 4.4,-15.1 1.4,-12.8 0,-7.6 1,-2.6 4,-0.1 7.4,-0.8 9,-3.4 9.1,-6.8! 6,-6.8 *'],
    H: [9.4, '* 1,-15 1,0.2 *', '* 8.2,-15 8.2,0.2 *', '- 1,-7.6 8.2,-7.8 -'],
    I: [6.4, '* 0.4,-15 5.8,-15 *', '- 3.1,-15 3.1,0 -', '* 0.4,0.1 5.8,0 *'],
    J: [9, '* 1.8,-15 8.6,-15.1 *', '- 6.6,-15 6.5,-3.4 5,-0.4 2.4,-0.2 0.4,-2.6 *'],
    K: [9.2, '* 1,-15 1,0.2 *', '* 8.4,-15 1.2,-6.4! 3.6,-7.4 5.8,-4 8.6,0.2 *'],
    L: [8.8, '* 1.2,-15 1,0! 8.2,0.2 *'],
    M: [11, '* 0,0.2 1.2,-7.4 2.2,-15! 5.3,-4.4! 8.4,-15! 9.5,-7.4 10.6,0.2 *'],
    N: [9.8, '* 1,0.2 1,-15! 8.6,0.2! 8.6,-15 *'],
    O: [10.4, 'o 5,-15.1 8.6,-12.8 10,-7.5 8.6,-2.2 5,0.1 1.4,-2.2 0,-7.5 1.4,-12.8'],
    P: [8.8, '* 1,-15 1,0.2 *', '- 1,-15 5.4,-14.8 7.8,-12.6 7.4,-9 4.4,-7.2 1,-7.2 -'],
    Q: [11, 'o 5,-15.1 8.6,-12.8 10,-7.5 8.6,-2.2 5,0.1 1.4,-2.2 0,-7.5 1.4,-12.8', '* 5.4,-3.4 7.8,-0.4 10.8,1.2 *'],
    R: [9.4, '* 1,-15 1,0.2 *', '- 1,-15 5.4,-14.8 7.8,-12.6 7.4,-9 4.4,-7.4 1.2,-7.2! 4.6,-6.4 6.4,-2.4 8.8,0.2 *'],
    S: [8.8, '* 8,-13.2 6.4,-15.1 3,-15 0.8,-12.8 1.6,-9.6 5,-7.8 7.8,-5.6 8,-2.4 5.4,-0.1 2,-0.2 0,-2.2 *'],
    T: [9, '* 0,-14.8 9,-15.2 *', '- 4.5,-15 4.4,0.2 *'],
    U: [9.8, '* 0.8,-15 0.8,-5 2.4,-0.8 5,0.1 7.6,-1 8.8,-5 8.8,-15 *'],
    V: [9.2, '* 0,-15 4.4,0.2! 8.8,-15 *'],
    W: [11.8, '* 0,-15 2.8,0.2! 5.7,-10.6! 8.6,0.2! 11.4,-15 *'],
    X: [9, '* 0.4,-15 8.4,0.2 *', '* 8.4,-15 0.4,0.2 *'],
    Y: [9, '* 0.2,-15 4.4,-7.4! 8.6,-15 *', '- 4.4,-7.4 4.3,0.2 *'],
    Z: [9.4, '* 0.6,-14.8 8.6,-15! 0.4,0! 8.8,0.2 *'],

    0: [8, 'o 4,-13 6.8,-11 7.6,-6.5 6.8,-2 4,0.1 1.2,-2 0.4,-6.5 1.2,-11'],
    1: [5.6, '* 0.8,-10.6 3.6,-13.2! 3.6,0.2 *'],
    2: [8.2, '* 0.6,-10.4 2.4,-13 5.4,-13 7,-10.6 6,-7 0.4,0! 7.4,0.2 *'],
    3: [8, '* 0.8,-11.4 3,-13.2 6,-12.4 6.4,-9.4 3.4,-7! 6.8,-5.4 7,-2 4.4,0.1 1.4,-0.4 0.2,-2 *'],
    4: [8.4, '* 5.8,0.2 5.8,-13! 0.2,-3.6! 8,-3.8 *'],
    5: [8, '* 7,-13 1.8,-13! 1.2,-7.2! 4.4,-8 7,-6 7.2,-2.4 4.6,0 1.6,0 0.2,-1.8 *'],
    6: [8, '* 6.4,-12.6 4,-13.2 1.4,-11 0.2,-6 1,-1.4 3.8,0.1 6.4,-1.4 7,-4.4 5.4,-7 2.6,-7.2 0.6,-5 -'],
    7: [7.8, '* 0.4,-13 7.4,-13! 3.4,0.2 *'],
    8: [8, 'o 4,-13.2 6.6,-11.6 6,-8.6 4,-7 1.8,-5.2 1.4,-1.8 4,0.1 6.6,-1.8 6.2,-5.2 4,-7 2,-8.6 1.4,-11.6'],
    9: [8, '* 6.6,-8.6 4.4,-6.8 1.6,-7.6 0.6,-10.4 2.6,-13 5.4,-13 6.8,-10.6 6.8,-5 5.8,-1.2 3,0.1 0.6,-1 *'],

    '.': [3, '. 1,-0.8'],
    ',': [3.2, '. 1.2,-0.8', '- 1.6,-0.6 0.6,2.6 *'],
    '!': [3.4, '* 1.2,-15 1,-4.6 *', '. 1.1,-0.8'],
    '?': [7.2, '* 0.4,-12 2.4,-14.8 5.4,-14.6 6.6,-11.6 3.6,-8 3.2,-4.4 *', '. 3.2,-0.8'],
    '&': [9, '* 8,0.2 1.8,-9 1.4,-12.4 3.2,-14.8 5.4,-14 5.6,-11.6 2.6,-8.4 0.4,-4.4 1.6,-0.8 4.4,0 7,-3 8.2,-6 *'],
    '-': [5.6, '* 0.4,-5 5,-5.2 *'],
    '\'': [2.6, '* 1,-15 0.6,-11.4 *'],
    '’': [2.6, '* 1,-15 0.6,-11.4 *'],
    ':': [3, '. 1,-9', '. 1,-0.8'],
    '/': [6.4, '* 0,1 6,-15 *'],
    '·': [3, '. 1.4,-5'],
    '(': [4.2, '* 3.4,-16 1,-12 0.2,-5 1.2,0.8 3.4,3.4 *'],
    ')': [4.2, '* 0.8,-16 3.2,-12 4,-5 3,0.8 0.8,3.4 *'],
    '+': [7.6, '* 0.4,-6 7,-6.2 *', '* 3.7,-9.4 3.7,-2.6 *'],
    ' ': [4.4],
  };

  const parsed = {};
  function glyph(ch) {
    if (parsed[ch]) return parsed[ch];
    let g = GLYPHS[ch];
    if (!g) {
      const base = ch.normalize('NFD')[0];
      g = GLYPHS[base] || GLYPHS[base.toLowerCase()] || GLYPHS[' '];
    }
    const out = { w: g[0], strokes: [] };
    for (const s of g.slice(1)) {
      const tok = s.trim().split(/\s+/);
      const pt = t => { const c = t.endsWith('!'); const [x, y] = t.replace('!', '').split(',').map(Number); return { x, y, c }; };
      if (tok[0] === '.') out.strokes.push({ dot: pt(tok[1]) });
      else if (tok[0] === 'o') out.strokes.push({ closed: true, pts: tok.slice(1).map(pt) });
      else out.strokes.push({ t0: tok[0] === '*', t1: tok[tok.length - 1] === '*', pts: tok.slice(1, -1).map(pt) });
    }
    return (parsed[ch] = out);
  }

  /* ------------------------------------------------------------------ geometry */
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  const len = a => Math.hypot(a.x, a.y);
  const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
  const f2 = n => Math.round(n * 100) / 100;

  // Catmull-Rom through the points, split at corners, as an SVG path "C" chain.
  function splinePath(pts, closed) {
    if (pts.length < 2) return '';
    if (closed) {
      const n = pts.length; let d = `M${f2(pts[0].x)},${f2(pts[0].y)}`;
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        d += seg(p0, p1, p2, p3);
      }
      return d + 'Z';
    }
    let d = `M${f2(pts[0].x)},${f2(pts[0].y)}`;
    let start = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].c || i === pts.length - 1) {
        const run = pts.slice(start, i + 1);
        for (let k = 0; k < run.length - 1; k++) {
          const p0 = run[k - 1] || mirror(run[0], run[1]), p3 = run[k + 2] || mirror(run[run.length - 1], run[run.length - 2]);
          d += seg(p0, run[k], run[k + 1], p3);
        }
        start = i;
      }
    }
    return d;
  }
  const mirror = (a, b) => ({ x: 2 * a.x - b.x, y: 2 * a.y - b.y });
  function seg(p0, p1, p2, p3) {
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6)), c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    return `C${f2(c1.x)},${f2(c1.y)} ${f2(c2.x)},${f2(c2.y)} ${f2(p2.x)},${f2(p2.y)}`;
  }
  function polyLen(pts, closed) {
    let L = 0; for (let i = 1; i < pts.length; i++) L += len(sub(pts[i], pts[i - 1]));
    return closed ? L + len(sub(pts[0], pts[pts.length - 1])) : L;
  }


  /* ------------------------------------------------------------------ finishes */
  // sw: stroke width in x-height tenths; blur and cut decide how far strokes melt together;
  // wob: displacement of the edge; drop: chance a free end swells into a drop.
  const FINISHES = {
    // Botch / Blur: soft bubble letters that touch and melt into each other
    blob: { sw: 2.5, swVar: 0.4, blur: 0.6, cut: 0.42, wob: 0.9, wobF: 0.09, drop: 0.55, dropR: 1.85, track: 1.3, bounce: 1, tilt: 5, wobble: 0.28 },
    // wet paint: the same letters with drips hanging off their lowest points
    drip: { sw: 2.35, swVar: 0.3, blur: 0.6, cut: 0.42, wob: 0.8, wobF: 0.09, drop: 0.4, dropR: 1.75, drips: 0.6, dripL: [2.5, 10], track: 1.5, bounce: 0.8, tilt: 3, wobble: 0.2 },
    // ghost: firm letters in a wide halo, with fading copies stepping away behind them
    glow: { sw: 2.1, swVar: 0.2, blur: 0.5, cut: 0.45, wob: 0.5, wobF: 0.09, drop: 0.3, dropR: 1.6, track: 1.9, bounce: 0.6, tilt: 2, wobble: 0.15, halo: 2.6, ghosts: 4, ghostStep: [2.2, -1.6] },
    // spun: outlines of the same pour stacked behind a solid front, like a slinky
    echo: { sw: 2.6, swVar: 0.25, blur: 0.6, cut: 0.42, wob: 0.7, wobF: 0.09, drop: 0.5, dropR: 1.85, track: 1.3, bounce: 0.8, tilt: 4, wobble: 0.2, echoes: 12, ring: 0.26, echoStep: [0.75, 0.55] },
  };
  const DEFAULTS = { finish: 'blob', size: 80, leading: 25, align: 'center', space: 2.6 };
  let uid = 0;

  /* ------------------------------------------------------------------ write */
  function write(text, opts) {
    const o = Object.assign({}, DEFAULTS, FINISHES[(opts && opts.finish) || DEFAULTS.finish], opts || {});
    const r = rng(o.seed != null ? o.seed : text);
    const lines = String(text).split('\n');
    const paths = [], dots = [];

    const boxes = lines.map((line, li) => {
      let pen = 0; const items = [];
      for (const ch of line) {
        const g = glyph(ch);
        const s = 1 + (r() - 0.5) * 0.18 * o.bounce;
        items.push({ ch, g, x: pen, s, rot: (r() - 0.5) * 2 * o.tilt * Math.PI / 180, dy: (r() - 0.5) * 1.8 * o.bounce });
        pen += g.w * s + o.track + (ch === ' ' ? o.space : 0) + (r() - 0.5) * 0.5;
      }
      return { items, width: pen - o.track, base: li * o.leading };
    });
    const maxW = Math.max(...boxes.map(b => b.width));

    for (const lb of boxes) {
      const shift = o.align === 'center' ? (maxW - lb.width) / 2 : o.align === 'right' ? maxW - lb.width : 0;
      for (const it of lb.items) {
        const { g } = it; if (!g.strokes.length) continue;
        const cos = Math.cos(it.rot), sin = Math.sin(it.rot), cx = g.w / 2;
        const T = p => {
          const x = (p.x - cx) * it.s, y = p.y * it.s;
          return { x: x * cos - y * sin + cx * it.s + it.x + shift + (r() - 0.5) * 2 * o.wobble, y: x * sin + y * cos + lb.base + it.dy + (r() - 0.5) * 2 * o.wobble, c: p.c };
        };
        let low = null;                                                   // the letter's lowest point, for a drip
        for (const st of g.strokes) {
          if (st.dot) { const p = T(st.dot); dots.push({ x: p.x, y: p.y, rad: o.sw * 0.62 * (0.9 + r() * 0.35) }); continue; }
          const pts = st.pts.map(T);
          const sw = o.sw * (1 - o.swVar / 2 + r() * o.swVar);
          paths.push({ pts, closed: !!st.closed, sw });
          if (!st.closed) {
            // a free end swells into a drop; the blur melts the drop into the stroke
            if (st.t0 && r() < o.drop) dots.push({ x: pts[0].x, y: pts[0].y, rad: o.dropR * (0.8 + r() * 0.4) });
            if (st.t1 && r() < o.drop) { const e = pts[pts.length - 1]; dots.push({ x: e.x, y: e.y, rad: o.dropR * (0.8 + r() * 0.4) }); }
          }
          for (const p of pts) if (p.y > lb.base - 2.5 && p.y < lb.base + 1.5 && (!low || p.y > low.y)) low = p;
        }
        // drips hang only from points on the baseline, never from descenders, so the words stay readable
        if (o.drips && low && r() < o.drips) {
          const L = o.dripL[0] + r() * (o.dripL[1] - o.dripL[0]), x = low.x + (r() - 0.5) * 0.6;
          const w = o.sw * (0.5 + r() * 0.12);
          paths.push({ pts: [{ x, y: low.y - 0.5 }, { x: x + (r() - 0.5) * 0.4, y: low.y + L * 0.5 }, { x: x + (r() - 0.5) * 0.3, y: low.y + L }], sw: w, drip: true });
          dots.push({ x: x + (r() - 0.5) * 0.3, y: low.y + L + w * 0.3, rad: w * (0.95 + r() * 0.3), drip: true });
        }
      }
    }
    return build(text, o, paths, dots, r);
  }

  function build(text, o, paths, dots, r) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y, pad) => { x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad); x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad); };
    paths.forEach(p => p.pts.forEach(q => grow(q.x, q.y, p.sw)));
    dots.forEach(d => grow(d.x, d.y, d.rad));
    if (!isFinite(x0)) { x0 = 0; y0 = -10; x1 = 1; y1 = 0; }
    const m = o.blur * 2 + o.wob + 0.6;
    x0 -= m; y0 -= m; x1 += m; y1 += m;
    // the text box before the echoes and ghosts; the view grows to hold them
    const bx0 = x0, by0 = y0, bx1 = x1, by1 = y1;
    let ex = 0, ey = 0;
    if (o.finish === 'echo') { ex = o.echoStep[0] * (o.echoes - 1); ey = o.echoStep[1] * (o.echoes - 1); }
    if (o.finish === 'glow') { ex = o.ghostStep[0] * o.ghosts; ey = o.ghostStep[1] * o.ghosts; const h = o.halo * 2.4; x0 -= h; y0 -= h; x1 += h; y1 += h; }
    x0 += Math.min(0, ex); x1 += Math.max(0, ex); y0 += Math.min(0, ey); y1 += Math.max(0, ey);

    const id = 'goo' + (++uid), k = o.size / 10, W = x1 - x0, H = y1 - y0;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('xmlns', SVGNS);
    svg.setAttribute('viewBox', `${f2(x0)} ${f2(y0)} ${f2(W)} ${f2(H)}`);
    svg.setAttribute('width', Math.round(W * k)); svg.setAttribute('height', Math.round(H * k));
    svg.setAttribute('class', `goo goo-${o.finish}`);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', String(text).replace(/\n/g, ' '));
    svg.style.maxWidth = '100%'; svg.style.height = 'auto'; svg.style.overflow = 'visible';
    svg.dataset.blur = o.blur; svg.dataset.wob = o.wob;
    // the text box as fractions of the view, so a page can line the letters up and not the halo
    svg.dataset.box = [(bx0 - x0) / W, (by0 - y0) / H, (bx1 - bx0) / W, (by1 - by0) / H].map(v => f2(v * 100) / 100).join(' ');

    const region = `filterUnits="userSpaceOnUse" x="${f2(x0 - 2)}" y="${f2(y0 - 2)}" width="${f2(W + 4)}" height="${f2(H + 4)}" color-interpolation-filters="sRGB"`;
    const seed = 1 + Math.floor(r() * 90);
    // goo: wobble the edge, blur, then cut the alpha back hard so the blur becomes a melted outline
    const a = f2(1 / 0.08), b = f2(-o.cut / 0.08);
    const gooCore = `
      <feTurbulence type="fractalNoise" baseFrequency="${o.wobF}" numOctaves="2" seed="${seed}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="${o.wob}" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="${o.blur}" result="b"/>
      <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${a} ${b}" result="g"/>`;
    let filters = `<filter id="${id}-goo" ${region}>${gooCore}</filter>`;
    if (o.finish === 'glow') filters += `<filter id="${id}-halo" ${region}>${gooCore}
      <feGaussianBlur in="g" stdDeviation="${o.halo}" result="h"/>
      <feComponentTransfer in="h"><feFuncA type="linear" slope="1.9"/></feComponentTransfer></filter>`;
    if (o.finish === 'echo') filters += `<filter id="${id}-ring" ${region}>${gooCore}
      <feMorphology in="g" operator="erode" radius="${o.ring}" result="e"/>
      <feComposite in="g" in2="e" operator="out"/></filter>`;

    const shape = paths.map(p => `<path d="${splinePath(p.pts, p.closed)}" stroke-width="${f2(p.sw)}"${p.drip ? ' class="goo-drip"' : ''}/>`).join('') +
      dots.map(d => `<circle cx="${f2(d.x)}" cy="${f2(d.y)}" r="${f2(d.rad)}" fill="currentColor" stroke="none"${d.drip ? ' class="goo-drip"' : ''}/>`).join('');
    const use = (filter, extra) => `<use href="#${id}-s" filter="url(#${id}-${filter})"${extra || ''}/>`;
    let layers = '';
    if (o.finish === 'glow') {
      for (let i = o.ghosts; i >= 1; i--) layers += use('goo', ` class="goo-ghost" transform="translate(${f2(o.ghostStep[0] * i)} ${f2(o.ghostStep[1] * i)})" opacity="${f2(0.5 * (1 - i / (o.ghosts + 1)))}" style="color:var(--goo-glow,currentColor)"`);
      layers += use('halo', ' class="goo-halo" style="color:var(--goo-glow,currentColor)"');
    }
    if (o.finish === 'echo') for (let i = o.echoes - 1; i >= 1; i--) layers += use('ring', ` class="goo-echo" transform="translate(${f2(o.echoStep[0] * i)} ${f2(o.echoStep[1] * i)})" style="color:var(--goo-echo,currentColor)"`);
    layers += use('goo', ' class="goo-front"');

    svg.innerHTML = `<defs>${filters}<g id="${id}-s" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${shape}</g></defs>${layers}`;
    return svg;
  }

  /** Replace an element's text with poured lettering; the text stays for screen readers. */
  function letter(el, opts) {
    const text = (opts && opts.text) || el.dataset.text || el.textContent.trim();
    el.dataset.text = text;
    const svg = write(text, opts);
    svg.setAttribute('aria-hidden', 'true'); svg.removeAttribute('role');
    const sr = document.createElement('span'); sr.className = 'goo-sr'; sr.textContent = text.replace(/\n/g, ' ');
    el.replaceChildren(sr, svg);
    if (!document.getElementById('goo-style')) {
      const st = document.createElement('style'); st.id = 'goo-style';
      st.textContent = '.goo-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
      document.head.append(st);
    }
    return svg;
  }

  /** The letters condense out of a puddle: the blur and the wobble settle to their final values. */
  function pour(svg, opts) {
    const o = Object.assign({ duration: 1600, delay: 0, from: 5 }, opts || {});
    if (!svg || reduced()) return Promise.resolve();
    const blurs = [...svg.querySelectorAll('feGaussianBlur[in="d"]')], disps = [...svg.querySelectorAll('feDisplacementMap')];
    const B = +svg.dataset.blur, D = +svg.dataset.wob;
    const set = u => {
      const e = 1 - Math.pow(1 - u, 3);
      blurs.forEach(el => el.setAttribute('stdDeviation', f2(B * (o.from - (o.from - 1) * e))));
      disps.forEach(el => el.setAttribute('scale', f2(D * (6 - 5 * e))));
    };
    set(0);
    if (o.hold) return Promise.resolve();                          // stay a puddle until pour() is called again
    return new Promise(res => {
      const t0 = performance.now() + o.delay;
      const tick = now => {
        const u = Math.min(1, Math.max(0, (now - t0) / o.duration));
        set(u);
        if (u < 1) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
  }

  /** A standalone copy of the lettering with its colours fixed, for saving as .svg. */
  function standalone(svg, opts) {
    const o = Object.assign({ color: getComputedStyle(svg).color }, opts || {});
    const c = svg.cloneNode(true);
    c.setAttribute('xmlns', SVGNS);
    c.removeAttribute('style'); c.removeAttribute('aria-hidden');
    c.style.color = o.color;
    const cs = getComputedStyle(svg);
    c.style.setProperty('--goo-glow', o.glow || cs.getPropertyValue('--goo-glow').trim() || o.color);
    c.style.setProperty('--goo-echo', o.echo || cs.getPropertyValue('--goo-echo').trim() || o.color);
    // CSS variables do not survive every SVG viewer: bake them into the layers too
    c.querySelectorAll('.goo-ghost,.goo-halo').forEach(el => el.style.color = c.style.getPropertyValue('--goo-glow'));
    c.querySelectorAll('.goo-echo').forEach(el => el.style.color = c.style.getPropertyValue('--goo-echo'));
    return c;
  }

  /** Render the lettering to a canvas (resolves once drawn): for export or for compositing onto a plate. */
  function toCanvas(svg, opts) {
    const o = Object.assign({ width: 1200 }, opts || {});
    const c = standalone(svg, o);
    const vb = svg.viewBox.baseVal, w = Math.round(o.width), h = Math.round(w * vb.height / vb.width);
    c.setAttribute('width', w); c.setAttribute('height', h);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); res(cv); };
      img.onerror = rej; img.src = url;
    });
  }

  root.Goo = { write, letter, pour, standalone, toCanvas, FINISHES, GLYPHS, rng };
})(window);
