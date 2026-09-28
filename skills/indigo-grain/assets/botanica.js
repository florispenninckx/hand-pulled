/* botanica.js — subjects for cyanotype.js, drawn the way light would see them.
 *
 * Everything here paints white (opaque) and grey (translucent) on the black
 * exposure mask that Cyanotype.print() hands to `objects(ctx, w, h, rand)`.
 * In a negative print white stays pale; in a positive print it becomes ink.
 *
 * Flowers are modelled in 3-D and projected flat, so a petal seen edge-on is a
 * sliver and one facing the lens is broad — that foreshortening, not a
 * radially symmetric star, is what makes a drawn bloom read as photographed.
 *
 *   Botanica.nerine(ctx, rand, { x, y, tx, ty, size, florets })  a spider-lily stem and umbel (photogram)
 *   Botanica.trumpet(ctx, rand, { x, y, size, angle, tilt })      one trumpet lily, any angle; returns its throat
 *   Botanica.leaf(ctx, rand, { x, y, length, angle, width, bend }) a strap leaf
 *   Botanica.stem(ctx, x0, y0, x1, y1, { bow, w0, w1 })            a tapered, gently bowed stem
 *   Botanica.profile(ctx, rand, { x, y, scale, hair })            a head in profile with hair, neck and shoulder
 *   Botanica.ribbon(ctx, pts, halfWidth(u))                        the primitive every shape is filled with
 *
 * Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // ---- 2-D primitives ------------------------------------------------------
  /** Fill a ribbon along a polyline; `hw(u)` gives the half-width at u ∈ [0,1]. */
  function ribbon(ctx, pts, hw) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const h = hw(i / (n - 1));
      L.push(pts[i].x - dy * h, pts[i].y + dx * h); R.push(pts[i].x + dy * h, pts[i].y - dx * h);
    }
    ctx.beginPath(); ctx.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
    for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
    ctx.closePath(); ctx.fill();
  }
  /** A path that starts at (x,y) heading `ang` and turns by `turn(u)` radians over its length. */
  function walk(x, y, len, ang, turn, n) {
    const pts = [{ x, y }], ds = len / n;
    for (let i = 1; i <= n; i++) { ang += turn(i / n) / n; x += Math.cos(ang) * ds; y += Math.sin(ang) * ds; pts.push({ x, y }); }
    return pts;
  }
  function quad(x0, y0, cx, cy, x1, y1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, s = 1 - t; pts.push({ x: s * s * x0 + 2 * s * t * cx + t * t * x1, y: s * s * y0 + 2 * s * t * cy + t * t * y1 }); }
    return pts;
  }
  function stem(ctx, x0, y0, x1, y1, o) {
    o = o || {};
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, bow = o.bow || 0;
    const pts = quad(x0, y0, mx - dy * bow, my + dx * bow, x1, y1, 40);
    ribbon(ctx, pts, u => (o.w0 || 3) + ((o.w1 || 2) - (o.w0 || 3)) * u);
    return pts;
  }
  function leaf(ctx, rand, o) {
    const pts = walk(o.x, o.y, o.length, o.angle, u => (o.bend || 0.6) * (0.4 + u), 36);
    ribbon(ctx, pts, u => o.width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.95)), 0.7));
    return pts;
  }

  // ---- 3-D bloom -----------------------------------------------------------
  // Picture plane: x right, y down, z toward the viewer; projection is orthographic.
  const V = (x, y, z) => ({ x, y, z });
  const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z), mul = (a, k) => V(a.x * k, a.y * k, a.z * k);
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const unit = a => mul(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));
  /** Axis pointing along `angle` in the plane, turned toward the viewer by `tilt` (−1..1 → ±80°). */
  function frameOf(angle, tilt) {
    const t = tilt * 1.4, a = unit(V(Math.cos(angle) * Math.cos(t), Math.sin(angle) * Math.cos(t), Math.sin(t)));
    const u = unit(cross(a, Math.abs(a.z) < 0.92 ? V(0, 0, 1) : V(1, 0, 0)));
    return { a, u, v: cross(a, u) };
  }
  const grey = (g, a) => `rgba(${g * 255 | 0},${g * 255 | 0},${g * 255 | 0},${a == null ? 1 : a})`;

  /**
   * Draw one bloom: a tube, `n` tepals flaring (and recurving) away from the axis,
   * and stamens. Each tepal is a ribbon in 3-D with its own twist and wavy margin,
   * projected flat; tepals are painted back to front so overlaps show.
   */
  function bloom(ctx, rand, o) {
    const F = frameOf(o.angle, o.tilt), L = o.size;
    const base = V(o.x, o.y, 0), mouth = add(base, mul(F.a, o.tube * L));
    const tepals = [];
    const spin = rand() * TAU;
    for (let k = 0; k < o.n; k++) {
      const phi = spin + k * TAU / o.n + (rand() - 0.5) * o.jitter;
      const e = add(mul(F.u, Math.cos(phi)), mul(F.v, Math.sin(phi)));
      const tv = add(mul(F.u, -Math.sin(phi)), mul(F.v, Math.cos(phi)));
      const len = L * (1 + (rand() - 0.5) * o.lenVar), b0 = o.flare[0] + (rand() - 0.5) * 0.25, b1 = o.flare[1] + (rand() - 0.5) * 0.5;
      const tw0 = (rand() - 0.5) * o.twist, tw1 = (rand() - 0.5) * o.twist * 2, ph = rand() * TAU;
      const wid = o.width * L * (0.85 + rand() * 0.3), steps = 30;
      let p = add(mouth, mul(e, o.mouth * L));
      const Lp = [], Rp = [], C = []; let zSum = 0;
      for (let i = 0; i <= steps; i++) {
        const s = i / steps, beta = b0 + (b1 - b0) * Math.pow(s, o.curl);
        const dir = add(mul(F.a, Math.cos(beta)), mul(e, Math.sin(beta)));
        const nrm = cross(dir, tv), tw = tw0 + tw1 * s;
        const wv = add(mul(tv, Math.cos(tw)), mul(nrm, Math.sin(tw)));
        const hw = wid * o.profile(s) * (1 + o.wave * Math.sin(s * o.waves * Math.PI + ph));
        Lp.push(p.x + wv.x * hw, p.y + wv.y * hw); Rp.push(p.x - wv.x * hw, p.y - wv.y * hw);
        C.push(p); zSum += p.z;
        p = add(p, mul(dir, len / steps));
      }
      tepals.push({ Lp, Rp, C, z: zSum / (steps + 1) });
    }
    tepals.sort((a, b) => a.z - b.z);
    const zs = tepals.map(t => t.z), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const paintTube = () => {
      if (o.tube <= 0) return;
      ctx.fillStyle = grey(o.shade[0] * 0.92, o.alpha);
      for (let i = 0; i <= 16; i++) {
        const s = i / 16, c = add(base, mul(F.a, o.tube * L * s)), r = L * (o.tubeR[0] + (o.tubeR[1] - o.tubeR[0]) * Math.pow(s, 1.6));
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill();
      }
    };
    let tubeDone = false;
    for (const t of tepals) {
      if (!tubeDone && t.z > mouth.z) { paintTube(); tubeDone = true; }
      const g = o.shade[0] + (o.shade[1] - o.shade[0]) * (z1 > z0 ? (t.z - z0) / (z1 - z0) : 1);
      const b = t.C[0], tip = t.C[t.C.length - 1];
      if (o.gradient) {
        const gr = ctx.createLinearGradient(b.x, b.y, tip.x, tip.y);
        gr.addColorStop(0, grey(g * o.gradient, o.alpha)); gr.addColorStop(0.45, grey(g, o.alpha)); gr.addColorStop(1, grey(g, o.alpha));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = grey(g, o.alpha);
      ctx.beginPath(); ctx.moveTo(t.Lp[0], t.Lp[1]);
      for (let i = 2; i < t.Lp.length; i += 2) ctx.lineTo(t.Lp[i], t.Lp[i + 1]);
      for (let i = t.Rp.length - 2; i >= 0; i -= 2) ctx.lineTo(t.Rp[i], t.Rp[i + 1]);
      ctx.closePath(); ctx.fill();
      if (o.midrib) {   // a darker vein along the inner two-thirds
        ctx.strokeStyle = `rgba(0,0,0,${o.midrib})`; ctx.lineWidth = Math.max(0.8, o.width * L * 0.16); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(t.C[0].x, t.C[0].y);
        for (let i = 1; i < t.C.length * 0.68; i++) ctx.lineTo(t.C[i].x, t.C[i].y);
        ctx.stroke();
      }
    }
    if (!tubeDone) paintTube();
    // stamens: thin filaments out of the throat, curving up, an anther at each tip
    for (let k = 0; k < o.stamens; k++) {
      const phi = rand() * TAU, beta = o.stamenSpread * (0.3 + rand() * 0.7);
      const d = add(mul(F.a, Math.cos(beta)), mul(add(mul(F.u, Math.cos(phi)), mul(F.v, Math.sin(phi))), Math.sin(beta)));
      const len2 = Math.hypot(d.x, d.y) * L * o.stamenLen * (0.85 + rand() * 0.3), h0 = Math.atan2(d.y, d.x);
      let dh = -Math.PI / 2 - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const lift = Math.max(-0.9, Math.min(0.9, dh)) * o.stamenLift * (0.6 + rand() * 0.6);
      const pts = walk(mouth.x, mouth.y, len2, h0, u => lift * 1.6 * u, 18);
      ctx.fillStyle = grey(o.stamenShade, 1);
      ribbon(ctx, pts, u => o.stamenW * L * (1 - 0.4 * u));
      const tip = pts[pts.length - 1], a = pts[pts.length - 2], ang = Math.atan2(tip.y - a.y, tip.x - a.x);
      ctx.fillStyle = grey(o.antherShade, 1);
      ctx.beginPath(); ctx.ellipse(tip.x, tip.y, L * o.anther, L * o.anther * 0.38, ang + Math.PI / 2, 0, TAU); ctx.fill();
    }
    return { x: mouth.x, y: mouth.y, r: L * (o.tubeR[1] + 0.25) };
  }

  // Spider lily: narrow, crisped, strongly recurved tepals; long upswept stamens.
  const NERINE = {
    n: 6, tube: 0.05, tubeR: [0.025, 0.05], mouth: 0.03, jitter: 0.9, lenVar: 0.4,
    flare: [0.8, 2.6], curl: 1.4, width: 0.09, twist: 2.6, wave: 0.4, waves: 9,
    profile: s => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + s * 0.97)), 0.55),
    shade: [1, 1], alpha: 0.76, gradient: 0, midrib: 0,
    stamens: 6, stamenLen: 1.0, stamenSpread: 0.6, stamenLift: 1.3, stamenW: 0.008, stamenShade: 1, antherShade: 1, anther: 0.025,
  };
  // Trumpet lily: a real tube, broad lanceolate tepals with a midrib, tips turning out.
  const TRUMPET = {
    n: 6, tube: 0.4, tubeR: [0.035, 0.13], mouth: 0.05, jitter: 0.22, lenVar: 0.16,
    flare: [0.3, 1.2], curl: 2.2, width: 0.27, twist: 0.5, wave: 0.03, waves: 3,
    profile: s => Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + s * 0.95)), 0.7) * (1 - 0.15 * s),
    shade: [0.66, 0.98], alpha: 1, gradient: 0.72, midrib: 0.2,
    stamens: 6, stamenLen: 0.78, stamenSpread: 0.22, stamenLift: 0.25, stamenW: 0.01, stamenShade: 0.62, antherShade: 0.3, anther: 0.045,
  };

  /**
   * One spider-lily stem: from (x,y) — usually below the frame — up to the umbel
   * at (tx,ty); `florets` flowers on pedicels radiating from the umbel, each a
   * 3-D bloom facing outward with a random tilt; papery bracts at the node.
   */
  function nerine(ctx, rand, o) {
    const size = o.size, n = o.florets || 6 + (rand() * 3 | 0), lw = o.lineW || size * 0.07;
    ctx.fillStyle = grey(1, 0.95);
    stem(ctx, o.x, o.y, o.tx, o.ty, { bow: o.bow == null ? (rand() - 0.5) * 0.08 : o.bow, w0: lw * 1.15, w1: lw * 0.85 });
    for (let s = -1; s <= 1; s += 2) {   // two bracts hanging from the node
      ctx.fillStyle = grey(1, 0.72);
      const pts = walk(o.tx, o.ty, size * (0.5 + rand() * 0.2), Math.PI / 2 + s * (0.35 + rand() * 0.2), () => -s * 0.5, 14);
      ribbon(ctx, pts, u => lw * 0.9 * Math.sin(Math.PI * Math.min(1, 0.15 + u)));
    }
    for (let i = 0; i < n; i++) {
      const phi = -Math.PI / 2 + ((n > 1 ? i / (n - 1) : 0.5) - 0.5) * (o.spread || 4.0) + (rand() - 0.5) * 0.3;
      const plen = size * (0.25 + rand() * 0.3);
      const turn = (-Math.PI / 2 - phi) * 0.15;
      const pts = walk(o.tx, o.ty, plen, phi, () => turn, 16);
      ctx.fillStyle = grey(1, 0.95);
      ribbon(ctx, pts, u => lw * (0.34 - 0.1 * u));
      const end = pts[pts.length - 1], prev = pts[pts.length - 2];
      bloom(ctx, rand, Object.assign({}, NERINE, {
        x: end.x, y: end.y, size: size * (1.05 + rand() * 0.35),
        angle: Math.atan2(end.y - prev.y, end.x - prev.x), tilt: (rand() - 0.5) * 1.1,
      }));
    }
  }

  /** One trumpet lily with its tube base at (x,y), pointing along `angle`, turned toward the viewer by `tilt`. */
  function trumpet(ctx, rand, o) {
    return bloom(ctx, rand, Object.assign({}, TRUMPET, o));
  }

  // ---- profile -------------------------------------------------------------
  // Unit: crown of the skull to the chin = 1, crown at (0,0), face looking right.
  // Cubic segments [c1x,c1y, c2x,c2y, x,y], traced from the front hairline down the
  // face, round under the chin, down the throat and off the bottom, back up the
  // shoulder and nape, over the occiput to the crown and back to the hairline.
  const HEAD = [0.28, 0.14,
    0.33, 0.2, 0.365, 0.27, 0.366, 0.345,       // forehead
    0.367, 0.39, 0.377, 0.405, 0.373, 0.428,    // brow
    0.37, 0.445, 0.36, 0.452, 0.364, 0.468,     // nasion
    0.386, 0.52, 0.44, 0.572, 0.46, 0.603,      // bridge to tip
    0.474, 0.626, 0.458, 0.646, 0.432, 0.649,   // round the tip
    0.412, 0.651, 0.396, 0.652, 0.389, 0.662,   // columella, subnasale
    0.393, 0.682, 0.407, 0.699, 0.406, 0.716,   // philtrum, upper lip
    0.405, 0.726, 0.392, 0.731, 0.389, 0.736,   // lips meet
    0.4, 0.747, 0.404, 0.766, 0.393, 0.782,     // lower lip
    0.383, 0.796, 0.366, 0.8, 0.367, 0.822,     // under the lip
    0.369, 0.862, 0.385, 0.9, 0.372, 0.936,     // chin
    0.361, 0.966, 0.33, 0.985, 0.29, 0.99,      // under the chin
    0.23, 0.996, 0.18, 1.0, 0.16, 1.035,        // to the throat
    0.148, 1.11, 0.158, 1.22, 0.18, 1.32,       // front of the neck
    0.23, 1.41, 0.4, 1.47, 0.54, 1.57,          // collarbone, chest
    0.6, 1.8, 0.64, 2.2, 0.66, 2.6,             // off the bottom
    0.2, 2.6, -0.5, 2.6, -1.1, 2.6,
    -1.1, 2.1, -1.1, 1.8, -1.1, 1.58,
    -0.72, 1.46, -0.4, 1.34, -0.3, 1.13,        // shoulder to nape
    -0.26, 1.01, -0.3, 0.9, -0.36, 0.8,
    -0.5, 0.66, -0.55, 0.4, -0.45, 0.2,         // occiput
    -0.35, 0.03, -0.14, -0.02, 0.02, 0.0,       // crown
    0.15, 0.02, 0.24, 0.08, 0.28, 0.14];
  // The hair's outer edge, front of the hairline over the top, down the back, and
  // along the hem to the nape; the strands grow out of this line.
  const HAIR = [0.27, 0.16,
    0.31, 0.06, 0.26, -0.1, 0.12, -0.17,
    -0.04, -0.24, -0.34, -0.22, -0.56, -0.08,
    -0.76, 0.06, -0.84, 0.36, -0.82, 0.62,
    -0.8, 0.84, -0.74, 1.0, -0.62, 1.06,
    -0.48, 1.1, -0.3, 1.02, -0.18, 0.92,
    -0.1, 0.7, 0.1, 0.4, 0.27, 0.16];
  function bezierPts(seq, X, Y, per) {
    const out = [{ x: X(seq[0]), y: Y(seq[1]) }];
    let px = seq[0], py = seq[1];
    for (let i = 2; i < seq.length; i += 6) {
      const [c1x, c1y, c2x, c2y, x, y] = seq.slice(i, i + 6);
      for (let k = 1; k <= per; k++) {
        const t = k / per, s = 1 - t;
        out.push({ x: X(s * s * s * px + 3 * s * s * t * c1x + 3 * s * t * t * c2x + t * t * t * x), y: Y(s * s * s * py + 3 * s * s * t * c1y + 3 * s * t * t * c2y + t * t * t * y) });
      }
      px = x; py = y;
    }
    return out;
  }
  function fillPts(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fill();
  }
  /**
   * A head in profile, bust cropped by the frame. (x,y) is the crown of the skull,
   * `scale` the crown-to-chin height in px; `hair` 0..1 sets how far the strands
   * fly out. Drawn solid white: in a positive print it is the ink.
   */
  function profile(ctx, rand, o) {
    const S = o.scale, sx = o.mirror ? -1 : 1, X = u => o.x + sx * u * S, Y = v => o.y + v * S, hair = o.hair == null ? 1 : o.hair;
    ctx.fillStyle = '#fff';
    fillPts(ctx, bezierPts(HEAD, X, Y, 14));
    const edge = bezierPts(HAIR, X, Y, 18);
    {
      const ccx = X(-0.3), ccy = Y(0.45), p1 = rand() * TAU, p2 = rand() * TAU, vol = (o.volume == null ? 1 : o.volume) * S;
      for (let i = 1; i < edge.length - 1; i++) {
        const p = edge[i], v = (p.y - o.y) / S;
        if ((p.x - o.x) * sx > 0.05 * S && v > 0.1) continue;   // not over the face
        let nx = p.x - ccx, ny = p.y - ccy; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
        const k = vol * (0.05 + 0.05 * Math.sin(i * 0.31 + p1) + 0.035 * Math.sin(i * 0.87 + p2)) * Math.min(1, i / 12);
        p.x += nx * k; p.y += ny * k;
      }
    }
    fillPts(ctx, edge);
    // strands: fine tapered hairs leaving the edge, sparse and long on the hem, short and dense on the crown
    const cx = X(-0.3), cy = Y(0.45);
    for (let i = 1; i < edge.length - 1; i++) {
      const p = edge[i], q = edge[i + 1], tx = q.x - p.x, ty = q.y - p.y, d = Math.hypot(tx, ty) || 1;
      let nx = ty / d, ny = -tx / d;
      if ((p.x - cx) * nx + (p.y - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const v = (p.y - o.y) / S, hem = v > 0.75 && (p.x - o.x) * sx < -0.1 * S;
      if (v > 0.2 && (p.x - o.x) * sx > 0) continue;        // keep the face and temple clean
      const count = hem ? 5 : 3;
      for (let k = 0; k < count; k++) {
        const f = rand(), x0 = p.x + tx * f - nx * S * 0.02, y0 = p.y + ty * f - ny * S * 0.02;
        const len = S * hair * (hem ? 0.05 + 0.16 * rand() * rand() : 0.015 + 0.06 * rand() * rand());
        const out = Math.atan2(ny, nx), ang = (hem ? out + (Math.PI / 2 - out) * 0.45 : out) + (rand() - 0.5) * 0.9;
        const bend = (rand() - 0.5) * 1.6, hw0 = S * (0.0045 + 0.004 * rand());
        const pts = walk(x0, y0, len + S * 0.02, ang, () => bend, 10);
        ctx.fillStyle = grey(1, 0.55 + rand() * 0.45);
        ribbon(ctx, pts, u => hw0 * (1 - u * 0.92));
      }
    }
  }

  root.Botanica = { nerine, trumpet, leaf, stem, profile, ribbon, walk, bloom };
})(typeof window !== 'undefined' ? window : globalThis);
