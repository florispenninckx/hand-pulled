/* hand.js — hand-drawn lettering for a whimsical, maximal type page. One monoline alphabet
 * drawn as pen strokes, finished four ways: curled terminals, ink-ball terminals, chunky
 * bubble strokes, or one continuous line. Plus doodles, postage stamps, printed paper and a
 * grainy black-and-white photo. Seeded, so a good drawing can be kept. No dependencies.
 * Original implementation: the alphabet was drawn point by point for this file.
 *
 *   Hand.defs();                                                // SVG filters: #hd-ink, #hd-blob, #hd-worn
 *   const svg = Hand.write('Sweet\nWilliam', { style: 'curl', seed: 4 })
 *   Hand.letter(h1, { style: 'ball', seed: 9 })                 // draws the element's own text
 *   Hand.draw(svg, { duration: 1800 })                          // the pen draws it on
 *   el.append(Hand.doodle('stamp', { motif: 'mushroom', seed: 3 }))
 *   Hand.scatter(el, ['dot'], { count: 9, seed: 2, avoid: [rect] })
 *   Hand.paper(el, { ground: '#8e8c2d', screen: .5, mottle: .6 }) // printed-paper ground
 *   const c = Hand.mono(imgOrCanvas, { w: 900, h: 600, grain: .5 }) // b/w grainy photo
 *
 * Glyph units: x-height 10, baseline 0, y grows downward; ascenders reach -17, capitals -15,
 * descenders +7. A stroke is a list of points joined by a Catmull-Rom spline; "!" after a
 * point makes it a corner. "*" / "-" before and after a stroke say whether that end is free
 * (gets a terminal) or joined. "o" is a closed stroke, "." a single ink dot.
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

  // A curl continuing the pen's direction at `end` and winding in on itself.
  function curl(end, dir, o, r, big) {
    const T = norm(dir);
    let N;
    if (Math.abs(T.y) > Math.abs(T.x) * 0.9) N = { x: (o.cx < end.x ? 1 : -1), y: 0 };     // vertical stroke: curl outward
    else N = { x: 0, y: -1 };                                                            // horizontal stroke: roll upward
    // make N perpendicular to T, on the chosen side
    const perp = { x: -T.y, y: T.x };
    N = (perp.x * N.x + perp.y * N.y) >= 0 ? perp : mul(perp, -1);
    if (r() < o.flip) N = mul(N, -1);
    const R0 = (big ? o.spiralR : o.curlR) * (0.8 + r() * 0.45);
    const turns = big ? (o.spiralTurns || 1.25) + r() * 0.4 : (o.curlTurns || 0.8) + r() * 0.45;
    const C = add(end, mul(N, R0));
    const phi0 = Math.atan2(end.y - C.y, end.x - C.x);
    const tan0 = { x: -Math.sin(phi0), y: Math.cos(phi0) };
    const s = (tan0.x * T.x + tan0.y * T.y) >= 0 ? 1 : -1;
    const steps = Math.ceil(turns * 12), out = [];
    for (let k = 1; k <= steps; k++) {
      const u = k / steps, phi = phi0 + s * u * turns * Math.PI * 2, rad = R0 * (1 - (big ? o.spiralShrink || 0.5 : o.curlShrink || 0.62) * u);
      out.push({ x: C.x + Math.cos(phi) * rad, y: C.y + Math.sin(phi) * rad });
    }
    return out;
  }

  /* ------------------------------------------------------------------ styles */
  const STYLES = {
    // Earth Mother: fine line, every free end curls
    curl:  { sw: 0.62, term: 'curl', curlP: 0.72, curlR: 1.8, bounce: 0.7, tilt: 3, wobble: 0.2, track: 1.7 },
    // violets / bluebelles: line with ink-ball ends, some curled first
    ball:  { sw: 0.72, term: 'mix', curlR: 1.3, ballR: 1.22, bounce: 1, tilt: 4, wobble: 0.24, track: 1.5 },
    // Whimsy and worn: fat wobbly bubble strokes, spiral ends, buttons for o
    chunky: { sw: 2.75, term: 'spiral', spiralR: 3.6, spiralTurns: 0.75, spiralShrink: 0.4, space: 3, curlR: 2.8, curlTurns: 0.5, curlShrink: 0.25, swVar: 0.3, leading: 27, bounce: 1.3, tilt: 7, wobble: 0.3, track: 2.2, button: 0.6, filter: 'hd-blob' },
    // Charm: one continuous line, looping between letters, swashes in and out
    wire:  { sw: 0.5, term: 'curl', curlR: 1.8, bounce: 1.5, tilt: 5, wobble: 0.3, track: 3.4, connect: true, swash: 1.5, loops: 0.14 },
  };
  const DEFAULTS = { style: 'ball', size: 80, leading: 24, align: 'center', flip: 0.18, curlP: 1, ballR: 1.1, spiralR: 2.2, curlR: 1.3, loops: 0.5, button: 0, swash: 0, connect: false, space: 1.4 };

  /* ------------------------------------------------------------------ write */
  function write(text, opts) {
    const o = Object.assign({}, DEFAULTS, STYLES[(opts && opts.style) || DEFAULTS.style], opts || {});
    const r = rng(o.seed != null ? o.seed : text);
    const lines = String(text).split('\n');
    const paths = [], balls = [], buttons = [];
    let order = 0;

    const lineBoxes = [];
    lines.forEach((line, li) => {
      let pen = 0; const items = [];
      for (const ch of line) {
        const g = glyph(ch);
        const s = 1 + (r() - 0.5) * 0.16 * o.bounce;
        const rot = (r() - 0.5) * 2 * o.tilt * Math.PI / 180;
        const dy = (r() - 0.5) * 1.6 * o.bounce;
        items.push({ ch, g, x: pen, s, rot, dy, first: !items.length || items[items.length - 1].ch === ' ' });
        if (items.length > 1 && ch === ' ') items[items.length - 2].last = true;
        pen += g.w * s + o.track + (ch === ' ' ? o.space : 0) + (r() - 0.5) * 0.6;
      }
      if (items.length) items[items.length - 1].last = true;
      lineBoxes.push({ items, width: pen - o.track, base: li * o.leading });
    });
    const maxW = Math.max(...lineBoxes.map(l => l.width));

    for (const lb of lineBoxes) {
      const shift = o.align === 'center' ? (maxW - lb.width) / 2 : o.align === 'right' ? maxW - lb.width : 0;
      let chain = null;                                   // for connected (wire) writing
      for (const it of lb.items) {
        const { g } = it; if (!g.strokes.length) { if (chain) { finishChain(chain, lb, false); chain = null; } continue; }
        const cos = Math.cos(it.rot), sin = Math.sin(it.rot), cx = g.w / 2;
        const T = p => {
          const x = (p.x - cx) * it.s, y = p.y * it.s;
          return { x: x * cos - y * sin + cx * it.s + it.x + shift + (r() - 0.5) * 2 * o.wobble, y: x * sin + y * cos + lb.base + it.dy + (r() - 0.5) * 2 * o.wobble, c: p.c };
        };
        const center = T({ x: cx, y: -6 });
        const ctx = Object.assign({}, o, { cx: center.x });
        if (o.style === 'chunky' && it.ch.toLowerCase() === 'o' && r() < o.button) {
          const c = T({ x: g.w / 2, y: -5 });
          buttons.push({ x: c.x, y: c.y, rad: 4.4 * it.s, order: order++ });
          continue;
        }
        for (const [si, st] of g.strokes.entries()) {
          if (st.dot) { const p = T(st.dot); balls.push({ x: p.x, y: p.y, rad: o.ballR * (o.style === 'chunky' ? 1.45 : 1) * (0.9 + r() * 0.3), order: order++ }); continue; }
          let pts = st.pts.map(T);
          if (st.closed) {
            if (o.connect) { pts = pts.concat([pts[0], pts[1]]); } else { paths.push({ pts, closed: true, order: order++ }); continue; }
          }
          if (o.connect) {
            if (!chain) { chain = { pts: [], ends: [] }; if (o.swash) chain.pts.push(...swashIn(pts, r, o)); }
            else if (r() < o.loops) chain.pts.push(...loopBetween(chain.pts[chain.pts.length - 1], pts[0], r));
            pts.forEach(p => { p.c = false; });
            chain.pts.push(...pts);
            continue;
          }
          const endTerm = (atStart) => {
            let kind = o.term;
            if (kind === 'mix') { const q = r(); kind = q < 0.58 ? 'ball' : q < 0.9 ? 'curlball' : 'none'; }
            // spirals only where there is room: a word's outer ends and below the baseline
            // (inside the x-height band a fat spiral reads as an extra letter: tails spiral, tops curl)
            if (kind === 'spiral') {
              const e = atStart ? pts[0] : pts[pts.length - 1];
              const edge = (atStart && it.first && si === 0) || (!atStart && it.last && si === g.strokes.length - 1);
              kind = e.y > lb.base + 3 && r() > 0.15 ? 'spiral' : e.y < lb.base - 6 && (edge || r() < 0.2) ? 'curl' : 'none';
            }
            if (kind === 'curl' && r() > o.curlP) kind = 'none';
            if (kind === 'none') return;
            const a = atStart ? pts[0] : pts[pts.length - 1], b = atStart ? pts[1] : pts[pts.length - 2];
            if (kind === 'ball') { balls.push({ x: a.x, y: a.y, rad: o.ballR * (0.85 + r() * 0.35), order: order + 0.5 }); return; }
            const c = curl(a, sub(a, b), ctx, r, kind === 'spiral');
            if (atStart) pts = c.reverse().concat(pts); else pts = pts.concat(c);
            if (kind === 'curlball') { const tip = atStart ? pts[0] : pts[pts.length - 1]; balls.push({ x: tip.x, y: tip.y, rad: o.ballR * 0.9, order: order + 0.5 }); }
          };
          if (st.t0) endTerm(true);
          if (st.t1) endTerm(false);
          paths.push({ pts, closed: false, order: order++, sw: o.swVar ? o.sw * (1 - o.swVar / 2 + r() * o.swVar) : 0 });
        }
      }
      if (chain) finishChain(chain, lb, true);
    }

    function finishChain(chain, lb, last) {
      let pts = chain.pts;
      if (o.swash && last) pts = pts.concat(swashOut(pts, r, o));
      const a = pts[pts.length - 1], b = pts[pts.length - 2];
      pts = pts.concat(curl(a, sub(a, b), Object.assign({}, o, { cx: a.x - 5 }), r, false));
      paths.push({ pts, closed: false, order: order++ });
    }

    return build(text, o, paths, balls, buttons);
  }

  // Charm-style swash: a wide loop that swings in from the left and below.
  function swashIn(first, r, o) {
    const p = first[0], k = o.swash * (0.9 + r() * 0.3);
    return [
      { x: p.x - 3 * k, y: p.y + 7 * k }, { x: p.x - 9 * k, y: p.y + 3 * k }, { x: p.x - 10 * k, y: p.y - 5 * k },
      { x: p.x - 6 * k, y: p.y - 9 * k }, { x: p.x - 2.5 * k, y: p.y - 5 * k }, { x: p.x - 4.5 * k, y: p.y + 1 * k },
    ];
  }
  function swashOut(pts, r, o) {
    const p = pts[pts.length - 1], k = o.swash * (0.9 + r() * 0.3);
    return [
      { x: p.x + 3 * k, y: p.y + 3 * k }, { x: p.x + 9 * k, y: p.y + 2 * k }, { x: p.x + 13 * k, y: p.y - 5 * k },
      { x: p.x + 11 * k, y: p.y - 13 * k }, { x: p.x + 6 * k, y: p.y - 12 * k }, { x: p.x + 7 * k, y: p.y - 7 * k },
    ];
  }
  // A small pen loop on the way from one stroke to the next.
  function loopBetween(a, b, r) {
    const m = mul(add(a, b), 0.5), up = r() < 0.5 ? -1 : 1, R = 2.6 + r() * 2;
    const c = { x: m.x, y: m.y + up * (3.5 + r() * 2.5) };
    return [
      { x: c.x - R, y: c.y }, { x: c.x, y: c.y + up * R }, { x: c.x + R, y: c.y }, { x: c.x, y: c.y - up * R }, { x: c.x - R * 0.6, y: c.y + up * R * 0.3 },
    ];
  }

  function build(text, o, paths, balls, buttons) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y, pad) => { x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad); x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad); };
    paths.forEach(p => p.pts.forEach(q => grow(q.x, q.y, o.sw)));
    balls.forEach(b => grow(b.x, b.y, b.rad + 0.2));
    buttons.forEach(b => grow(b.x, b.y, b.rad + o.sw));
    if (!isFinite(x0)) { x0 = 0; y0 = -10; x1 = 1; y1 = 0; }
    const pad = o.style === 'chunky' ? 2.2 : 1;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const k = o.size / 10, W = x1 - x0, H = y1 - y0;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `${f2(x0)} ${f2(y0)} ${f2(W)} ${f2(H)}`);
    svg.setAttribute('width', Math.round(W * k)); svg.setAttribute('height', Math.round(H * k));
    svg.setAttribute('class', `hd hd-${o.style}`);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', String(text).replace(/\n/g, ' '));
    svg.style.maxWidth = '100%'; svg.style.height = 'auto'; svg.style.overflow = 'visible';
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('fill', 'none'); g.setAttribute('stroke', 'currentColor'); g.setAttribute('stroke-width', o.sw);
    g.setAttribute('stroke-linecap', 'round'); g.setAttribute('stroke-linejoin', 'round');
    if (o.filter) svg.style.filter = `url(#${o.filter})`;
    const items = [];
    paths.forEach(p => {
      const el = document.createElementNS(SVGNS, 'path');
      el.setAttribute('d', splinePath(p.pts, p.closed));
      if (p.sw) el.setAttribute('stroke-width', f2(p.sw));
      el.dataset.len = f2(polyLen(p.pts, p.closed));
      items.push([p.order, el]);
    });
    balls.forEach(b => {
      const el = document.createElementNS(SVGNS, 'circle');
      el.setAttribute('cx', f2(b.x)); el.setAttribute('cy', f2(b.y)); el.setAttribute('r', f2(b.rad));
      el.setAttribute('fill', 'currentColor'); el.setAttribute('stroke', 'none');
      items.push([b.order, el]);
    });
    buttons.forEach(b => {
      const el = document.createElementNS(SVGNS, 'g');
      el.innerHTML = `<circle cx="${f2(b.x)}" cy="${f2(b.y)}" r="${f2(b.rad)}" fill="currentColor"/>` +
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => `<circle class="hd-hole" cx="${f2(b.x + dx * b.rad * 0.24)}" cy="${f2(b.y + dy * b.rad * 0.24)}" r="${f2(b.rad * 0.13)}" stroke="none" style="fill:var(--hd-hole,#0b0b0b)"/>`).join('') +
        `<circle class="hd-hole-ring" cx="${f2(b.x)}" cy="${f2(b.y)}" r="${f2(b.rad * 0.66)}" fill="none" stroke-width="${f2(b.rad * 0.08)}" style="stroke:var(--hd-hole,#0b0b0b)"/>`;
      el.dataset.len = '6';
      items.push([b.order, el]);
    });
    items.sort((a, b) => a[0] - b[0]).forEach(([, el]) => g.append(el));
    svg.append(g);
    return svg;
  }

  /** Replace an element's text with its drawn lettering; the text stays for screen readers. */
  function letter(el, opts) {
    const text = (opts && opts.text) || el.dataset.text || el.textContent.trim();
    el.dataset.text = text;
    const svg = write(text, opts);
    svg.setAttribute('aria-hidden', 'true'); svg.removeAttribute('role');
    const sr = document.createElement('span'); sr.className = 'hd-sr'; sr.textContent = text.replace(/\n/g, ' ');
    el.replaceChildren(sr, svg);
    return svg;
  }

  /** The pen draws the lettering on, stroke by stroke, at a steady hand speed. */
  function draw(svg, opts) {
    const o = Object.assign({ duration: 1800, delay: 0 }, opts || {});
    if (!svg || reduced() || !svg.animate) return Promise.resolve();
    const els = [...svg.querySelectorAll('g > *')];
    const lens = els.map(el => el.tagName === 'path' ? +el.dataset.len || 1 : 2.2);
    const total = lens.reduce((a, b) => a + b, 0), per = o.duration / total;
    let t = o.delay; const anims = [];
    els.forEach((el, i) => {
      const d = Math.max(60, lens[i] * per);
      if (el.tagName === 'path') {
        el.setAttribute('pathLength', '1'); el.style.strokeDasharray = '1 2';
        anims.push(el.animate([{ strokeDashoffset: 1, opacity: 0 }, { opacity: 1, offset: 0.01 }, { strokeDashoffset: 0, opacity: 1 }],
          { duration: d, delay: t, fill: 'both', easing: 'cubic-bezier(.4,.1,.5,1)' }));
      } else {
        anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: t, fill: 'both' }));
      }
      t += d * 0.92;
    });
    return Promise.all(anims.map(a => a.finished)).catch(() => {});
  }

  /* ------------------------------------------------------------------ doodles */
  const DOODLES = {
    x:     ['* 5,5 15,15 *', '* 15,5 5,15 *'],
    spiral: null, star: null, sparkle: null, dot: null,
    flower: ['o 10,4 12,6.5 10,9 8,6.5', 'o 16,10 13.5,12 11,10 13.5,8', 'o 10,16 8,13.5 10,11 12,13.5', 'o 4,10 6.5,8 9,10 6.5,12', '. 10,10'],
    heart: ['o 10,6 12.6,3.6 16,4.4 16.6,8 13.6,12.4 10,16 6.4,12.4 3.4,8 4,4.4 7.4,3.6'],
    moon:  ['o 12,3 7,4.6 4.6,10 7,15.4 12,17 9.6,14.2 8.6,10 9.6,5.8'],
    mushroom: ['* 3,10 4.6,5 10,2.6 15.4,5 17,10! 3,10 *', '- 8,10 7.6,15.4 10,17 12.4,15.4 12,10 -', '. 7,6.6', '. 12.6,5.8', '. 10,8.4'],
    strawberry: ['o 10,6 14.4,6.4 16,9.6 13.4,14.4 10,17.4 6.6,14.4 4,9.6 5.6,6.4', '* 6.6,5.4 10,3.2 13.4,5.4 *', '* 10,3.2 10,1.4 *', '. 8,9', '. 12,9', '. 10,12', '. 8,14', '. 12.2,13.6'],
    crown: ['* 3,15 3,6! 6.6,10.6! 10,4! 13.4,10.6! 17,6! 17,15! 3,15 *', '. 3,5', '. 10,3', '. 17,5'],
    leaf:  ['o 3,17 5,9 11,4 17,3 15,10 10,15.4', '* 3,17 11,9 14.4,6 *'],
    sun:   ['o 10,6.2 13.8,10 10,13.8 6.2,10', '* 10,1.5 10,3.8 *', '* 10,16.2 10,18.5 *', '* 1.5,10 3.8,10 *', '* 16.2,10 18.5,10 *', '* 4,4 5.6,5.6 *', '* 14.4,14.4 16,16 *', '* 16,4 14.4,5.6 *', '* 4,16 5.6,14.4 *'],
  };
  function starPts(n, inner, r) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n, rad = (i % 2 ? inner : 1) * 8.5 * (0.9 + r() * 0.2);
      pts.push(`${f2(10 + Math.cos(a) * rad)},${f2(10 + Math.sin(a) * rad)}!`);
    }
    return pts.join(' ');
  }

  /** A small drawn object: x, star, sparkle, dot, spiral, flower, heart, moon, mushroom,
   *  strawberry, crown, leaf, sun, button, or stamp (a perforated postage stamp with a motif). */
  function doodle(kind, opts) {
    const o = Object.assign({ size: 28, seed: kind, sw: 1.3, motif: 'flower', label: '' }, opts || {});
    const r = rng(o.seed);
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '-2 -2 24 24'); svg.setAttribute('width', o.size); svg.setAttribute('height', o.size);
    svg.setAttribute('class', `hd-doodle hd-${kind}`); svg.setAttribute('aria-hidden', 'true');
    svg.style.overflow = 'visible';
    const jit = p => ({ x: p.x + (r() - 0.5) * 0.7, y: p.y + (r() - 0.5) * 0.7, c: p.c });
    const strokesToSvg = (list, sw) => list.map(s => {
      const tok = s.trim().split(/\s+/);
      const pt = t => { const c = t.endsWith('!'); const [x, y] = t.replace('!', '').split(',').map(Number); return jit({ x, y, c }); };
      if (tok[0] === '.') { const p = pt(tok[1]); return `<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${f2(sw * 0.95)}" fill="currentColor" stroke="none"/>`; }
      if (tok[0] === 'o') return `<path d="${splinePath(tok.slice(1).map(pt), true)}"/>`;
      return `<path d="${splinePath(tok.slice(1, -1).map(pt), false)}"/>`;
    }).join('');
    let body = '';
    const g = `fill="none" stroke="currentColor" stroke-width="${o.sw}" stroke-linecap="round" stroke-linejoin="round"`;
    if (kind === 'star' || kind === 'sparkle') {
      const d = kind === 'star' ? starPts(5, 0.45, r) : starPts(4, 0.28, r);
      body = `<g ${g} fill="currentColor">${strokesToSvg([`o ${d}`], o.sw)}</g>`;
      body = body.replace('<path ', '<path stroke-linejoin="round" ');
      // closed Catmull-Rom rounds the points; draw stars as polygons instead so the points stay sharp
      const pts = d.split(' ').map(t => t.replace('!', '')).join(' ');
      body = `<polygon points="${pts}" fill="currentColor" stroke="currentColor" stroke-width="${o.sw * 0.6}" stroke-linejoin="round"/>`;
    } else if (kind === 'dot') {
      const pts = []; for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rad = 6 * (0.88 + r() * 0.24); pts.push(`${f2(10 + Math.cos(a) * rad)},${f2(10 + Math.sin(a) * rad)}`); }
      body = `<g fill="currentColor" stroke="none">${strokesToSvg([`o ${pts.join(' ')}`], 0).replace('<path ', '<path ')}</g>`;
    } else if (kind === 'spiral') {
      const pts = []; const turns = 2.2 + r() * 0.6;
      for (let i = 0; i <= 40; i++) { const u = i / 40, a = u * turns * Math.PI * 2, rad = 1 + u * 8; pts.push(`${f2(10 + Math.cos(a) * rad)},${f2(10 + Math.sin(a) * rad)}`); }
      body = `<g ${g}>${strokesToSvg([`* ${pts.join(' ')} *`], o.sw)}</g>`;
    } else if (kind === 'button') {
      body = `<g ${g}><circle cx="10" cy="10" r="8.4"/><circle cx="10" cy="10" r="5.6"/></g><g fill="currentColor">` +
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => `<circle cx="${10 + x * 1.7}" cy="${10 + y * 1.7}" r="1.05"/>`).join('') + '</g>';
    } else if (kind === 'stamp') {
      // perforated edge: a scalloped rectangle, then an inner frame, then the motif and a value
      const bites = [], w = 20, h = 24, n = 6, m = 7;
      let d = 'M0,0';
      for (let i = 0; i < n; i++) { const x = (i + 1) * w / n; d += ` L${f2(x - w / n / 2 - 0.9)},0 A0.9,0.9 0 0 0 ${f2(x - w / n / 2 + 0.9)},0 L${f2(x)},0`; }
      for (let i = 0; i < m; i++) { const y = (i + 1) * h / m; d += ` L${w},${f2(y - h / m / 2 - 0.9)} A0.9,0.9 0 0 0 ${w},${f2(y - h / m / 2 + 0.9)} L${w},${f2(y)}`; }
      for (let i = n - 1; i >= 0; i--) { const x = i * w / n; d += ` L${f2(x + w / n / 2 + 0.9)},${h} A0.9,0.9 0 0 0 ${f2(x + w / n / 2 - 0.9)},${h} L${f2(x)},${h}`; }
      for (let i = m - 1; i >= 0; i--) { const y = i * h / m; d += ` L0,${f2(y + h / m / 2 + 0.9)} A0.9,0.9 0 0 0 0,${f2(y + h / m / 2 - 0.9)} L0,${f2(y)}`; }
      bites.push(d + 'Z');
      svg.setAttribute('viewBox', '-2 -2 24 28'); svg.setAttribute('height', Math.round(o.size * 28 / 24));
      const motif = DOODLES[o.motif] || DOODLES.flower;
      body = `<g ${g}><path d="${bites[0]}" stroke-width="${o.sw * 0.8}"/><rect x="2.6" y="2.6" width="14.8" height="18.8" rx="0.6" stroke-width="${o.sw * 0.7}"/></g>` +
        `<g ${g} stroke-width="${o.sw * 0.9}" transform="translate(4.2 4.6) scale(.58)">${strokesToSvg(motif, o.sw * 1.1)}</g>` +
        (o.label ? `<text x="4" y="20" font-size="3.2" font-family="'Courier Prime', monospace" fill="currentColor">${o.label}</text>` : '');
    } else {
      body = `<g ${g}>${strokesToSvg(DOODLES[kind] || DOODLES.x, o.sw)}</g>`;
    }
    svg.innerHTML = body;
    return svg;
  }

  /** Scatter doodles inside a positioned element, keeping out of `avoid` rectangles
   *  (fractions of the element: {x, y, w, h}) and out of each other's way. */
  function scatter(el, kinds, opts) {
    const o = Object.assign({ count: 8, seed: 1, avoid: [], size: [14, 26], rotate: 25, margin: 0.03, className: '' }, opts || {});
    const r = rng(o.seed), placed = [], out = [];
    const clash = (x, y, s) => o.avoid.some(a => x > a.x - s && x < a.x + a.w + s && y > a.y - s && y < a.y + a.h + s) ||
      placed.some(p => Math.hypot(p.x - x, p.y - y) < 0.09);
    for (let i = 0, tries = 0; i < o.count && tries < o.count * 60; tries++) {
      const x = o.margin + r() * (1 - 2 * o.margin), y = o.margin + r() * (1 - 2 * o.margin);
      if (clash(x, y, 0.02)) continue;
      const kind = kinds[Math.floor(r() * kinds.length)], size = o.size[0] + r() * (o.size[1] - o.size[0]);
      const d = doodle(kind, { size, seed: o.seed * 31 + i, motif: o.motif });
      Object.assign(d.style, { position: 'absolute', left: `${(x * 100).toFixed(2)}%`, top: `${(y * 100).toFixed(2)}%`, transform: `translate(-50%,-50%) rotate(${((r() - 0.5) * 2 * o.rotate).toFixed(1)}deg)` });
      if (o.className) d.classList.add(o.className);
      el.append(d); placed.push({ x, y }); out.push(d); i++;
    }
    return out;
  }

  /* ------------------------------------------------------------------ paper and photo */
  function hexRgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // Periodic value noise, so the texture tiles.
  function vnoise(r, gx, gy) {
    const g = new Float32Array(gx * gy); for (let i = 0; i < g.length; i++) g[i] = r();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const at = (i, j) => g[((j % gy) + gy) % gy * gx + ((i % gx) + gx) % gx];
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }

  /** Printed paper: a flat ink ground with its fine screen, uneven coverage (streaks where the
   *  roller ran light), grain and a few specks. Sets the element's background; returns the URL. */
  function paper(el, opts) {
    const o = Object.assign({ ground: '#8e8c2d', screen: 0.5, mottle: 0.5, grain: 0.5, speck: 0.5, size: 360, seed: 3 }, opts || {});
    const r = rng(o.seed), S = o.size;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), px = img.data;
    const [R, G, B] = hexRgb(o.ground);
    const big = vnoise(r, 4, 2), streak = vnoise(r, 18, 1), fine = vnoise(r, 45, 45);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // screen: two crossed line screens at ±45°, the moiré of a printed tint
      const u = (x + y) * Math.PI * 2 / 3.1, v = (x - y) * Math.PI * 2 / 3.1;
      const scr = (Math.sin(u) * Math.sin(v)) * 7 * o.screen;
      const mot = ((big(x / S * 4, y / S * 2) - 0.5) * 16 + (streak(x / S * 18, 0) - 0.5) * 14) * o.mottle;
      const gr = ((r() + r() + r()) / 3 - 0.5) * 30 * o.grain + (fine(x / 8, y / 8) - 0.5) * 8 * o.grain;
      const l = scr + mot + gr;
      px[i] = R + l; px[i + 1] = G + l; px[i + 2] = B + l * 0.9; px[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // specks of dust and ink
    const n = Math.round(o.speck * 50);
    for (let k = 0; k < n; k++) {
      const dark = r() < 0.7;
      ctx.fillStyle = dark ? `rgba(20,16,4,${0.12 + r() * 0.25})` : `rgba(255,252,230,${0.12 + r() * 0.2})`;
      ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 0.5 + r() * 1.3, 0.4 + r() * 0.9, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    const url = c.toDataURL('image/png');
    if (el) { el.style.backgroundColor = o.ground; el.style.backgroundImage = `url(${url})`; el.style.backgroundSize = `${S}px ${S}px`; }
    return url;
  }

  /** A black-and-white photograph with lifted blacks, soft highlights and film grain. */
  function mono(src, opts) {
    const o = Object.assign({ w: 900, h: 600, contrast: 1.12, lift: 26, grain: 0.5, seed: 5, soften: 0.6 }, opts || {});
    const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
    const ctx = c.getContext('2d');
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const s = Math.max(o.w / sw, o.h / sh);
    if ('filter' in ctx && o.soften) ctx.filter = `blur(${o.soften}px)`;
    ctx.drawImage(src, (o.w - sw * s) / 2, (o.h - sh * s) / 2, sw * s, sh * s);
    ctx.filter = 'none';
    const img = ctx.getImageData(0, 0, o.w, o.h), px = img.data, r = rng(o.seed);
    for (let i = 0; i < px.length; i += 4) {
      let l = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
      l = (l - 128) * o.contrast + 128;
      l = o.lift + l * (1 - o.lift / 255) * (l > 200 ? 0.97 : 1);
      l += ((r() + r() + r() + r()) / 4 - 0.5) * 70 * o.grain;
      px[i] = px[i + 1] = px[i + 2] = l;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** Shared SVG filters and the screen-reader helper class. */
  function defs() {
    if (document.getElementById('hd-defs')) return;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.id = 'hd-defs'; svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, { position: 'absolute', width: 0, height: 0, overflow: 'hidden' });
    svg.innerHTML = `
      <!-- ink on paper: the edge picks up the paper's tooth, a few specks don't print -->
      <filter id="hd-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="9" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 4.2" result="holes"/>
        <feComposite in="d" in2="holes" operator="in"/>
      </filter>
      <!-- bubble strokes: wobble the fat line like a hand-cut edge -->
      <filter id="hd-blob" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <!-- worn: a print that has been handled -->
      <filter id="hd-worn" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="11" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 3.9" result="holes"/>
        <feComposite in="SourceGraphic" in2="holes" operator="in"/>
      </filter>`;
    document.body.prepend(svg);
    if (!document.getElementById('hd-style')) {
      const st = document.createElement('style'); st.id = 'hd-style';
      st.textContent = '.hd-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
      document.head.append(st);
    }
  }

  root.Hand = { write, letter, draw, doodle, scatter, paper, mono, defs, STYLES, GLYPHS, rng };
})(window);
