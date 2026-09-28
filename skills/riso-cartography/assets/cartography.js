/* cartography.js — seeded terrain and map furniture for riso.js.
 *
 * Everything draws in black onto a drum master (see riso.js); which drum a
 * feature lands on is the designer's colour decision, not this file's.
 *
 *   const land = Carto.terrain({ seed: 7, width: 900, height: 1100, sea: 0.42 });
 *   Carto.contours(ctx, land, { interval: 0.035, index: 5, above: land.sea });
 *   Carto.waterLines(ctx, land, { count: 6 });
 *   Carto.hillshade(ctx, land, { strength: 0.9 });
 *   const rivers = Carto.rivers(land, { count: 7 }); Carto.strokeRivers(ctx, rivers);
 *   const towns = Carto.settlements(land, { count: 9 });
 *   const roads = Carto.roadNetwork(towns, land); Carto.strokeRoads(ctx, roads, { dash: [6, 4] });
 *
 * Original implementation (marching squares, D8 steepest descent, Horn hillshade).
 */
(function (root) {
  'use strict';
  const R = root.Riso;

  function terrain(o) {
    o = Object.assign({ seed: 1, step: 4, sea: 0.42, scale: 1, roughness: 1 }, o);
    const rand = R.mulberry32((o.seed * 2654435761) >>> 0), noise = R.makeNoise(rand);
    const gw = Math.ceil(o.width / o.step) + 1, gh = Math.ceil(o.height / o.step) + 1;
    const z = new Float32Array(gw * gh);
    const ox = rand() * 100, oy = rand() * 100, f = 1 / (420 * o.scale);
    // continent: warped fbm, biased up toward a random centre so land forms a coast
    const ccx = 0.3 + rand() * 0.4, ccy = 0.35 + rand() * 0.3;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = i * o.step, y = j * o.step;
      const wx = R.fbm(noise, x * f + ox, y * f + oy, 3), wy = R.fbm(noise, x * f + oy + 5.2, y * f + ox + 1.3, 3);
      let e = R.fbm(noise, x * f * 1.6 + wx * 1.4, y * f * 1.6 + wy * 1.4, 6) * o.roughness;
      const dx = x / o.width - ccx, dy = y / o.height - ccy;
      e += 0.5 - 1.1 * Math.sqrt(dx * dx * 1.2 + dy * dy);
      // ridge term: sharpens mountain crests so contours crowd convincingly
      const r = 1 - Math.abs(R.fbm(noise, x * f * 2.3 + 40, y * f * 2.3 - 40, 4));
      e += 0.28 * r * r * Math.max(0, e);
      z[j * gw + i] = e;
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let k = 0; k < z.length; k++) z[k] = (z[k] - lo) / (hi - lo);
    return { z, gw, gh, step: o.step, width: o.width, height: o.height, sea: o.sea, rand };
  }

  const at = (t, i, j) => t.z[Math.min(t.gh - 1, Math.max(0, j)) * t.gw + Math.min(t.gw - 1, Math.max(0, i))];
  function heightAt(t, x, y) {
    const fx = x / t.step, fy = y / t.step, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
    const a = at(t, i, j) + (at(t, i + 1, j) - at(t, i, j)) * tx, b = at(t, i, j + 1) + (at(t, i + 1, j + 1) - at(t, i, j + 1)) * tx;
    return a + (b - a) * ty;
  }

  // Marching squares for one level; appends segments to the current path.
  function isoline(ctx, t, level) {
    const s = t.step;
    for (let j = 0; j < t.gh - 1; j++) for (let i = 0; i < t.gw - 1; i++) {
      const a = at(t, i, j), b = at(t, i + 1, j), c = at(t, i + 1, j + 1), d = at(t, i, j + 1);
      const idx = (a > level) | ((b > level) << 1) | ((c > level) << 2) | ((d > level) << 3);
      if (idx === 0 || idx === 15) continue;
      const x = i * s, y = j * s, lerp = (p, q) => (level - p) / (q - p);
      const T = [x + s * lerp(a, b), y], Rr = [x + s, y + s * lerp(b, c)], B = [x + s * lerp(d, c), y + s], L = [x, y + s * lerp(a, d)];
      const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
      switch (idx) {
        case 1: case 14: seg(L, T); break;
        case 2: case 13: seg(T, Rr); break;
        case 3: case 12: seg(L, Rr); break;
        case 4: case 11: seg(Rr, B); break;
        case 5: seg(L, T); seg(Rr, B); break;
        case 6: case 9: seg(T, B); break;
        case 7: case 8: seg(L, B); break;
        case 10: seg(T, Rr); seg(L, B); break;
      }
    }
  }

  /** Contours from `above` upward; every `index`-th line is heavier (index contour). */
  function contours(ctx, t, o) {
    o = Object.assign({ interval: 0.04, index: 5, above: t.sea, width: 0.7, indexWidth: 1.5 }, o);
    let n = 0;
    for (let lv = o.above + o.interval; lv < 1; lv += o.interval, n++) {
      ctx.beginPath(); isoline(ctx, t, lv);
      ctx.lineWidth = n % o.index === o.index - 1 ? o.indexWidth : o.width; ctx.stroke();
    }
  }
  function coastline(ctx, t, o) {
    o = Object.assign({ width: 1.6 }, o);
    ctx.beginPath(); isoline(ctx, t, t.sea); ctx.lineWidth = o.width; ctx.stroke();
  }
  /** Water-lining: the engraver's habit of echoing the coast offshore. */
  function waterLines(ctx, t, o) {
    o = Object.assign({ count: 6, gap: 0.012, width: 0.6 }, o);
    for (let k = 1; k <= o.count; k++) {
      ctx.beginPath(); isoline(ctx, t, t.sea - k * o.gap * (1 + k * 0.25));
      ctx.lineWidth = o.width * (1 - k / (o.count + 2)); ctx.stroke();
    }
  }
  /** Flat tint wherever test(elevation) holds. Drawn through an offscreen
   *  canvas so it respects the caller's transform and clip (putImageData would not). */
  function tint(ctx, t, test, density) {
    const c = document.createElement('canvas'); c.width = t.width; c.height = t.height;
    const g = c.getContext('2d'), img = g.createImageData(t.width, t.height), d = img.data, v = 255 * (1 - density);
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
      const k = (y * t.width + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = test(heightAt(t, x, y)) ? v : 255; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(c, 0, 0); ctx.restore();
  }
  /** Fill below sea level with a flat grey (= tint density on the drum). */
  function seaFill(ctx, t, o) {
    o = Object.assign({ density: 0.28 }, o);
    tint(ctx, t, e => e < t.sea, o.density);
  }
  /** Horn-method hillshade, light from the north-west as maps have always had it. */
  function hillshade(ctx, t, o) {
    o = Object.assign({ strength: 0.85, exaggeration: 22, azimuth: 315, altitude: 45, landOnly: true }, o);
    const c = document.createElement('canvas'); c.width = t.gw; c.height = t.gh;
    const g = c.getContext('2d'), img = g.createImageData(t.gw, t.gh);
    const az = ((360 - o.azimuth + 90) * Math.PI) / 180, alt = (o.altitude * Math.PI) / 180;
    for (let j = 0; j < t.gh; j++) for (let i = 0; i < t.gw; i++) {
      const zx = ((at(t, i + 1, j - 1) + 2 * at(t, i + 1, j) + at(t, i + 1, j + 1)) - (at(t, i - 1, j - 1) + 2 * at(t, i - 1, j) + at(t, i - 1, j + 1))) / 8;
      const zy = ((at(t, i - 1, j + 1) + 2 * at(t, i, j + 1) + at(t, i + 1, j + 1)) - (at(t, i - 1, j - 1) + 2 * at(t, i, j - 1) + at(t, i + 1, j - 1))) / 8;
      const slope = Math.atan(o.exaggeration * Math.hypot(zx, zy)), aspect = Math.atan2(zy, -zx);
      let sh = Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect);
      let dens = Math.max(0, Math.min(1, (0.78 - sh) * 1.6)) * o.strength;
      if (o.landOnly && at(t, i, j) < t.sea) dens = 0;
      const v = 255 * (1 - dens), k = (j * t.gw + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, 0, 0, t.gw * t.step, t.gh * t.step); ctx.restore();
  }

  /** D8 steepest-descent rivers from high sources down to the sea. */
  function rivers(t, o) {
    o = Object.assign({ count: 6, minSource: 0.62 }, o);
    const out = [];
    let tries = 0;
    while (out.length < o.count && tries++ < 4000) {
      let i = (t.rand() * t.gw) | 0, j = (t.rand() * t.gh) | 0;
      if (at(t, i, j) < o.minSource) continue;
      const path = [[i, j]], seen = new Set([j * t.gw + i]);
      for (let n = 0; n < 900; n++) {
        let best = null, bz = at(t, i, j);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const zz = at(t, i + di, j + dj) + (di && dj ? 0.0004 : 0);
          if (zz < bz && !seen.has((j + dj) * t.gw + i + di)) { bz = zz; best = [i + di, j + dj]; }
        }
        if (!best) break; // pit: the river ends in a tarn
        [i, j] = best; seen.add(j * t.gw + i); path.push(best);
        if (at(t, i, j) < t.sea) break;
      }
      if (path.length > 20) out.push(path.map(([a, b]) => [a * t.step, b * t.step]));
    }
    return out;
  }
  function strokeRivers(ctx, list, o) {
    o = Object.assign({ from: 0.3, to: 2.4 }, o);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of list) for (let k = 1; k < p.length; k++) {
      ctx.beginPath(); ctx.moveTo(p[k - 1][0], p[k - 1][1]); ctx.lineTo(p[k][0], p[k][1]);
      ctx.lineWidth = o.from + (o.to - o.from) * (k / p.length); ctx.stroke();
    }
    ctx.restore();
  }

  const SYL = {
    a: ['vel', 'ost', 'kar', 'mor', 'hal', 'bren', 'stav', 'lin', 'ard', 'tor', 'wen', 'gris', 'ul', 'fen', 'rok'],
    b: ['mar', 'dal', 'wick', 'holm', 'kerk', 'by', 'thwaite', 'ness', 'stad', 'ford', 'mere', 'lund', 'hope', 'sey'],
  };
  function placeName(rand) {
    const s = SYL.a[(rand() * SYL.a.length) | 0] + (rand() < 0.3 ? SYL.a[(rand() * SYL.a.length) | 0] : '') + SYL.b[(rand() * SYL.b.length) | 0];
    return s[0].toUpperCase() + s.slice(1);
  }
  /** Towns on habitable ground (low, flat, near water), kept apart. */
  function settlements(t, o) {
    o = Object.assign({ count: 8, minGap: 90, margin: 40 }, o);
    const out = []; let tries = 0;
    while (out.length < o.count && tries++ < 6000) {
      const x = o.margin + t.rand() * (t.width - 2 * o.margin), y = o.margin + t.rand() * (t.height - 2 * o.margin);
      const e = heightAt(t, x, y);
      if (e < t.sea + 0.01 || e > t.sea + 0.22) continue;
      if (out.some(p => Math.hypot(p.x - x, p.y - y) < o.minGap)) continue;
      out.push({ x, y, name: placeName(t.rand), rank: out.length < 2 ? 1 : 2 });
    }
    return out;
  }
  /** Road network: gently wandering links from each town to its two nearest.
   *  Returns geometry so several drums can stroke the same roads. */
  function roadNetwork(towns, t) {
    const segs = [], done = new Set();
    for (const a of towns) {
      const near = towns.filter(b => b !== a).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)).slice(0, 2);
      for (const b of near) {
        const key = [a.name, b.name].sort().join();
        if (done.has(key)) continue; done.add(key);
        const s = { a, b, mx: (a.x + b.x) / 2 + (t.rand() - 0.5) * 60, my: (a.y + b.y) / 2 + (t.rand() - 0.5) * 60 };
        // roads do not swim: drop a link if much of its curve lies below sea level
        let wet = 0;
        for (let k = 1; k < 12; k++) {
          const u = k / 12, v = 1 - u;
          const x = v * v * a.x + 2 * u * v * s.mx + u * u * b.x, y = v * v * a.y + 2 * u * v * s.my + u * u * b.y;
          if (heightAt(t, x, y) < t.sea) wet++;
        }
        if (wet <= 1) segs.push(s);
      }
    }
    return segs;
  }
  function strokeRoads(ctx, segs, o) {
    o = Object.assign({ width: 1.1, dash: [] }, o);
    ctx.save(); ctx.lineWidth = o.width; ctx.setLineDash(o.dash); ctx.lineCap = 'round';
    for (const s of segs) { ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.quadraticCurveTo(s.mx, s.my, s.b.x, s.b.y); ctx.stroke(); }
    ctx.restore();
  }
  // ---------- a river that has moved: meander migration --------------------------------------
  const wrapA = a => a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a;
  function resample(P, ds) {
    const out = [P[0]];
    let carry = 0;
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1], [bx, by] = P[i], L = Math.hypot(bx - ax, by - ay);
      let t = ds - carry;
      while (t <= L) { out.push([ax + (bx - ax) * t / L, ay + (by - ay) * t / L]); t += ds; }
      carry = L - (t - ds);
    }
    const last = P[P.length - 1];   // the ends never move: the last point is always the true end
    if (out.length > 1 && Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) < ds * 0.3) out.pop();
    out.push(last.slice());
    return out;
  }
  /**
   * A meandering river grown by migration, not drawn: each bend's outer bank erodes at a rate set by
   * the curvature there and upstream of it (after Howard & Knutson 1984), so bends grow, lean
   * downstream and finally pinch off into oxbow lakes. Returns the course now, earlier courses and the
   * oxbows, all as polylines in the caller's units.
   *   Carto.meander({ seed, from: [x, y], to: [x, y], width: 30, years: 400, keep: 5, valley: 260 })
   * `valley` is the half-width of the floodplain: bends that reach past it are pushed gently back.
   */
  function meander(o) {
    o = Object.assign({ seed: 1, width: 30, years: 400, keep: 5, wander: 1, valley: Infinity, lead: 1.2 }, o);
    const rand = R.mulberry32((o.seed * 2246822519) >>> 0), noise = R.makeNoise(rand);
    const w = o.width, ds = w / 2.6;
    // bends are born upstream and carried down as they grow, so the river starts well above the reach you see
    const L0 = Math.hypot(o.to[0] - o.from[0], o.to[1] - o.from[1]), vx = (o.to[0] - o.from[0]) / L0, vy = (o.to[1] - o.from[1]) / L0;
    const fx = o.from[0] - vx * L0 * o.lead, fy = o.from[1] - vy * L0 * o.lead, tx = o.to[0] + vx * w * 6, ty = o.to[1] + vy * w * 6;
    const L = Math.hypot(tx - fx, ty - fy), ux = (tx - fx) / L, uy = (ty - fy) / L, n = Math.ceil(L / ds);
    // the course as flat coordinates, resampled to an even step every year
    let X = new Float64Array(n + 1), Y = new Float64Array(n + 1), m = n + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, off = w * 2.2 * o.wander * R.fbm(noise, t * L / (w * 9), 0.5, 3) * Math.sin(Math.PI * t);
      X[i] = fx + (tx - fx) * t - uy * off; Y[i] = fy + (ty - fy) * t + ux * off;
    }
    const even = (xs, ys, cnt) => {
      let cap = Math.ceil(cnt * 1.3) + 8, nx = new Float64Array(cap), ny = new Float64Array(cap), c = 1, carry = 0;
      nx[0] = xs[0]; ny[0] = ys[0];
      for (let i = 1; i < cnt; i++) {
        const ax = xs[i - 1], ay = ys[i - 1], Lx = xs[i] - ax, Ly = ys[i] - ay, Ls = Math.hypot(Lx, Ly);
        let t = ds - carry;
        while (t <= Ls) {
          if (c >= cap - 2) { cap *= 2; const gx = new Float64Array(cap), gy = new Float64Array(cap); gx.set(nx); gy.set(ny); nx = gx; ny = gy; }
          nx[c] = ax + Lx * t / Ls; ny[c] = ay + Ly * t / Ls; c++; t += ds;
        }
        carry = Ls - (t - ds);
      }
      if (c > 1 && Math.hypot(xs[cnt - 1] - nx[c - 1], ys[cnt - 1] - ny[c - 1]) < ds * 0.3) c--;   // the ends never move
      nx[c] = xs[cnt - 1]; ny[c] = ys[cnt - 1]; c++;
      X = nx; Y = ny; m = c;
    };
    const snap = (i0, i1) => { const out = []; for (let i = i0; i < i1; i++) out.push([X[i], Y[i]]); return out; };
    const lag = 1.4 * w, J = Math.ceil(3 * lag / ds), G = new Float64Array(J);
    let gs = 0; for (let j = 1; j <= J; j++) { G[j - 1] = Math.exp(-j * ds / lag); gs += G[j - 1]; }
    const history = [], oxbows = [], every = Math.max(1, Math.floor(o.years / o.keep)), pin = 4, gap = Math.ceil(4 * w / ds);
    let k = new Float64Array(m * 2), Rm = new Float64Array(m * 2);
    for (let yr = 0; yr < o.years; yr++) {
      if (k.length < m) { k = new Float64Array(m * 2); Rm = new Float64Array(m * 2); }
      k[0] = k[m - 1] = 0;
      for (let i = 1; i < m - 1; i++) k[i] = wrapA(Math.atan2(Y[i + 1] - Y[i], X[i + 1] - X[i]) - Math.atan2(Y[i] - Y[i - 1], X[i] - X[i - 1])) / ds;
      Rm[0] = Rm[m - 1] = 0;
      for (let i = 1; i < m - 1; i++) {   // the bank here answers to the bend here and, more, to the bends upstream
        let up = 0; for (let j = 1; j <= J; j++) up += k[i - j > 0 ? i - j : 0] * G[j - 1];
        Rm[i] = -1 * k[i] + 2.5 * up / gs + 0.06 * o.wander * R.fbm(noise, i * ds / (7 * w) + 50, yr / 70, 2) / w;   // and to the soil: a slow, uneven push
      }
      for (let pass = 0; pass < 2; pass++) for (let i = 2; i < m - 2; i++) Rm[i] = (Rm[i - 1] + 2 * Rm[i] + Rm[i + 1]) / 4;   // smooth the rate, not the bank
      let px = X[pin - 1], py = Y[pin - 1];   // the neighbour upstream, as it was before this year's move
      for (let i = pin; i < m - pin; i++) {
        const dx = X[i + 1] - px, dy = Y[i + 1] - py, d = Math.hypot(dx, dy) || 1;
        const ease = Math.min(1, (i - pin) / 12, (m - pin - i) / 12);
        const step = Math.max(-0.5, Math.min(0.5, Rm[i] * w)) * ds * 0.45 * ease;
        let x = X[i] + (dy / d) * step, y = Y[i] + (-dx / d) * step;
        const off = (x - fx) * -uy + (y - fy) * ux, over = Math.abs(off) - o.valley;   // the valley sides push back
        if (over > 0) { const b = Math.sign(off) * over * 0.03; x += uy * b; y -= ux * b; }
        px = X[i]; py = Y[i]; X[i] = x; Y[i] = y;
      }
      even(X, Y, m);
      // neck cutoff: where one loop's two ends come within a channel's width, the river breaks through the neck
      if (yr % 3 === 0) {
        const cell = new Map(), key = (a, b) => a * 73856093 ^ b * 19349663;
        for (let i = 0; i < m; i++) { const kk = key(Math.floor(X[i] / w), Math.floor(Y[i] / w)); const l = cell.get(kk); if (l) l.push(i); else cell.set(kk, [i]); }
        let cut = null;
        for (let i = 0; i < m - gap && !cut; i++) {
          const cx = Math.floor(X[i] / w), cy = Math.floor(Y[i] / w);
          let best = Infinity;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cell.get(key(cx + a, cy + b)) || []) {
            if (j >= i + gap && j < best && Math.hypot(X[i] - X[j], Y[i] - Y[j]) < w * 1.05) best = j;
          }
          if (best < Infinity) cut = [i, best];
        }
        if (cut) {
          const [i, j] = cut;
          oxbows.push({ pts: snap(i, j + 1), year: yr });
          const cx = new Float64Array(m - (j - i) + 1), cy = new Float64Array(m - (j - i) + 1);
          cx.set(X.subarray(0, i + 1)); cy.set(Y.subarray(0, i + 1)); cx.set(X.subarray(j, m), i + 1); cy.set(Y.subarray(j, m), i + 1);
          even(cx, cy, cx.length);
        }
      }
      if ((yr + 1) % every === 0 && yr + 1 < o.years) history.push(snap(0, m));
    }
    const P = snap(0, m);
    return { path: P, history, oxbows, width: w };
  }

  // ---------- a town: streets traced through a field of directions ---------------------------
  function segNear(px, py, pts) {   // distance to a polyline and the direction of its nearest segment
    let best = Infinity, ang = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1], vx = pts[i][0] - ax, vy = pts[i][1] - ay, L2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)), d = Math.hypot(px - ax - vx * t, py - ay - vy * t);
      if (d < best) { best = d; ang = Math.atan2(vy, vx); }
    }
    return [best, ang];
  }
  function thin(pts, step, box) {   // a polyline cut to the box and thinned to about one point per `step`
    const out = [];
    let last = null;
    for (const p of pts) {
      if (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3]) { if (last) { out.push(p); last = null; } continue; }
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= step) { out.push(p); last = p; }
    }
    return out;
  }
  /**
   * A street plan grown the way a town's streets settle, not drawn. A field of directions blends a few
   * grids, a radial old centre and the line of the river, bent a little by noise (after Chen et al. 2008,
   * "Interactive procedural street modeling"). Two families of streamlines follow it, one along and one
   * across, kept evenly apart (after Jobard & Lefer 1997), so they cross near right angles and leave
   * blocks between them. The plan is then rasterised once: each block gets a number, an area and a
   * direction, and each point its distance to the nearest street. That is enough to fill every block
   * its own way.
   *
   *   const town = Carto.city({ seed, width: 1000, height: 1414, spacing: 40, widths: [10, 5],
   *     outline: [polygon], water: [{ pts, width }], roads: [{ pts, width }] });
   *   town.streets             [{ pts, width, major, fam }]
   *   town.blockAt(x, y)       0 on streets, water and outside; else an index into town.blocks
   *   town.blocks[i]           { area, x, y, angle, r, edge }   (edge: the block touches the outline)
   *   town.distAt(x, y)        distance to the nearest street, water or outline, in sheet units
   *   town.stroke(ctx, extra)  every street stroked at its width (+ extra)
   */
  function city(o) {
    o = Object.assign({ seed: 1, width: 1000, height: 1414, spacing: 40, ratio: 1.5, arterial: 5, widths: [10, 5], quay: 8,
      centre: null, plaza: null, radial: 0.9, grids: 4, curvy: 0.22, suburb: 0.3, outline: null, water: [], roads: [], align: null, res: 1 }, o);
    const W = o.width, H = o.height, rand = R.mulberry32((o.seed * 3266489917) >>> 0), noise = R.makeNoise(rand);
    const sp0 = o.spacing, q = o.res, RW = Math.ceil(W * q), RH = Math.ceil(H * q);
    const cx = o.centre ? o.centre[0] : W * (0.3 + rand() * 0.4), cy = o.centre ? o.centre[1] : H * (0.3 + rand() * 0.4);
    const plaza = o.plaza == null ? sp0 * 0.9 : o.plaza;
    const mkc = () => { const c = document.createElement('canvas'); c.width = RW; c.height = RH; const g = c.getContext('2d', { willReadFrequently: true }); g.scale(q, q); return [c, g]; };
    const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };

    // land: inside the outline and out of the water. Streets stop at its edge.
    const [, lg] = mkc();   // (cx, cy: the old centre)
    lg.fillStyle = '#000'; lg.fillRect(0, 0, W, H); lg.fillStyle = '#fff';
    if (o.outline) o.outline.forEach(p => { poly(lg, p); lg.closePath(); lg.fill(); }); else lg.fillRect(0, 0, W, H);
    lg.strokeStyle = lg.fillStyle = '#808080'; lg.lineCap = 'round'; lg.lineJoin = 'round';   // water is grey: arterials may bridge it
    for (const wv of o.water) {
      if (wv.poly) { poly(lg, wv.poly); lg.closePath(); lg.fill(); }
      else { lg.lineWidth = wv.width + 2 * o.quay; poly(lg, wv.pts); lg.stroke(); }
    }
    lg.fillStyle = '#000';
    if (plaza) { lg.beginPath(); lg.arc(cx, cy, plaza, 0, 7); lg.fill(); }   // the old square: the radial streets meet round it
    const landPx = lg.getImageData(0, 0, RW, RH).data, land = new Uint8Array(RW * RH);
    for (let i = 0; i < land.length; i++) land[i] = landPx[i * 4] > 190 ? 1 : landPx[i * 4] > 60 ? 2 : 0;
    const kindAt = (x, y) => { const i = (x * q) | 0, j = (y * q) | 0; return i >= 0 && j >= 0 && i < RW && j < RH ? land[j * RW + i] : 0; };
    const onLand = (x, y) => kindAt(x, y) === 1;

    // the field of directions, sampled every 8 units, blended as doubled-angle vectors
    const F = [{ k: 'radial', x: cx, y: cy, r: 230 * sp0 / 40, w: o.radial }];
    for (let i = 0; i < o.grids; i++) F.push({ k: 'grid', x: W * (0.1 + 0.8 * rand()), y: H * (0.1 + 0.8 * rand()), r: (300 + rand() * 260) * sp0 / 40, w: 1, a: rand() * Math.PI });
    F.push({ k: 'grid', x: 0, y: 0, r: Infinity, w: 0.06, a: rand() * Math.PI });
    const alignTo = (o.align || o.water.filter(wv => wv.pts).map(wv => wv.pts)).map(p => thin(p, 18, [-100, -100, W + 100, H + 100])).filter(p => p.length > 1);
    alignTo.forEach(p => F.push({ k: 'line', pts: p, r: 120 * sp0 / 40, w: 2.4 }));
    const suburbAt = (x, y) => o.suburb * Math.max(0, Math.min(1, (R.fbm(noise, x / 650 + 40, y / 650 - 12, 2) + 0.05) * 4)) * Math.min(1, Math.hypot(x - cx, y - cy) / (320 * sp0 / 40));
    const G = 8, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2, TC = new Float32Array(gw * gh), TS = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = i * G, y = j * G;
      let C = 0, S = 0;
      for (const f of F) {
        let d, a;
        if (f.k === 'line') { [d, a] = segNear(x, y, f.pts); }
        else { d = Math.hypot(x - f.x, y - f.y); a = f.k === 'radial' ? Math.atan2(y - f.y, x - f.x) : f.a; }
        const wt = f.r === Infinity ? f.w : f.w * Math.exp(-(d / f.r) * (d / f.r));
        C += wt * Math.cos(2 * a); S += wt * Math.sin(2 * a);
      }
      const th = Math.atan2(S, C) / 2 + o.curvy * R.fbm(noise, x / 380, y / 380, 2) * 1.6 + suburbAt(x, y) * 2.2 * R.fbm(noise, x / 170 + 9, y / 170 + 3, 2);
      TC[j * gw + i] = Math.cos(2 * th); TS[j * gw + i] = Math.sin(2 * th);
    }
    const angleAt = (x, y) => {
      const fx = Math.max(0, Math.min(gw - 1.001, x / G)), fy = Math.max(0, Math.min(gh - 1.001, y / G)), i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
      const C = (TC[k] * (1 - tx) + TC[k + 1] * tx) * (1 - ty) + (TC[k + gw] * (1 - tx) + TC[k + gw + 1] * tx) * ty;
      const S = (TS[k] * (1 - tx) + TS[k + 1] * tx) * (1 - ty) + (TS[k + gw] * (1 - tx) + TS[k + gw + 1] * tx) * ty;
      return Math.atan2(S, C) / 2;
    };
    // street spacing: tight in the old centre, looser outward and in the suburbs
    const spAt = (x, y, fam) => sp0 * (0.72 + 0.55 * (1 - Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (430 * sp0 / 40) ** 2)) + 0.45 * suburbAt(x, y)) * (fam ? o.ratio : 1);

    // evenly spaced streamlines, both families, arterials first
    const CS = Math.max(6, sp0 * 0.3), hw = Math.ceil(W / CS) + 1, hh = Math.ceil(H / CS) + 1;
    const hash = [new Array(hw * hh), new Array(hw * hh)];
    const add = (fam, x, y, id) => { const i = Math.max(0, Math.min(hw - 1, (x / CS) | 0)), j = Math.max(0, Math.min(hh - 1, (y / CS) | 0)), k = j * hw + i; (hash[fam][k] || (hash[fam][k] = [])).push(x, y, id); };
    const near = (fam, x, y, d, self) => {   // nearest point of another line of this family within d
      const r = Math.ceil(d / CS), i0 = (x / CS) | 0, j0 = (y / CS) | 0;
      let best = null, bd = d * d;
      for (let j = Math.max(0, j0 - r); j <= Math.min(hh - 1, j0 + r); j++) for (let i = Math.max(0, i0 - r); i <= Math.min(hw - 1, i0 + r); i++) {
        const c = hash[fam][j * hw + i]; if (!c) continue;
        for (let k = 0; k < c.length; k += 3) {
          if (c[k + 2] === self) continue;
          const dd = (c[k] - x) ** 2 + (c[k + 1] - y) ** 2;
          if (dd < bd) { bd = dd; best = [c[k], c[k + 1]]; }
        }
      }
      return best;
    };
    const streets = [];
    function trace(sx, sy, fam, major) {
      const id = streets.length, h = Math.max(2, sp0 / 14), maxLen = major ? 4000 : 1800;
      const halves = [];
      for (const sgn of [1, -1]) {
        let a = angleAt(sx, sy) + (fam ? Math.PI / 2 : 0), dx = Math.cos(a) * sgn, dy = Math.sin(a) * sgn, x = sx, y = sy, len = 0;
        const pts = []; let wet = 0;
        while (len < maxLen) {
          a = angleAt(x, y) + (fam ? Math.PI / 2 : 0);
          let ax = Math.cos(a), ay = Math.sin(a); if (ax * dx + ay * dy < 0) { ax = -ax; ay = -ay; }
          a = angleAt(x + ax * h / 2, y + ay * h / 2) + (fam ? Math.PI / 2 : 0);
          let bx = Math.cos(a), by = Math.sin(a); if (bx * ax + by * ay < 0) { bx = -bx; by = -by; }
          if (bx * dx + by * dy < 0.7) break;   // the field turns too sharply here: a dead end
          const nx = x + bx * h, ny = y + by * h;
          if (nx < -30 || ny < -30 || nx > W + 30 || ny > H + 30) { pts.push([nx, ny]); break; }
          if (!onLand(nx, ny)) {
            // an arterial bridges water that is narrow enough; everything else stops at the quay
            if (major && kindAt(nx, ny) === 2 && (wet += h) < 190 * sp0 / 40) { x = nx; y = ny; dx = bx; dy = by; len += h; pts.push([x, y]); continue; }
            if (wet) { while (pts.length && !onLand(pts[pts.length - 1][0], pts[pts.length - 1][1])) pts.pop(); }
            break;
          }
          wet = 0;
          const hit = near(fam, nx, ny, 0.5 * spAt(nx, ny, fam) * (major ? 1 : 1), id);
          if (hit) { pts.push(hit); break; }
          // a line that comes back round on itself closes and stops
          if (len > spAt(x, y, fam) * 3 && Math.hypot(nx - sx, ny - sy) < h * 1.5) { pts.push([sx, sy]); len = maxLen; break; }
          x = nx; y = ny; dx = bx; dy = by; len += h; pts.push([x, y]);
        }
        halves.push(pts);
      }
      const pts = halves[1].reverse().concat([[sx, sy]], halves[0]);
      let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (L < (major ? 3 : 0.7) * spAt(sx, sy, fam)) return null;
      for (const p of pts) add(fam, p[0], p[1], id);
      const s = { pts, fam, major, width: o.widths[major ? 0 : 1] * (major ? 1 : 0.85 + 0.3 * rand()) };
      streets.push(s);
      return s;
    }
    function grow(queue, major) {
      for (let qi = 0; qi < queue.length; qi++) {
        const [x, y, fam] = queue[qi];
        if (!onLand(x, y)) continue;
        const sep = spAt(x, y, fam) * (major ? o.arterial : 1);
        if (near(fam, x, y, sep * 0.9, -1)) continue;
        const s = trace(x, y, fam, major); if (!s) continue;
        const every = Math.max(1, Math.round(spAt(x, y, fam) / (sp0 / 14)));
        for (let k = 0; k < s.pts.length; k += every) {
          const p = s.pts[k], a = angleAt(p[0], p[1]) + (fam ? Math.PI / 2 : 0), nx = -Math.sin(a), ny = Math.cos(a), d = spAt(p[0], p[1], fam) * (major ? o.arterial : 1);
          queue.push([p[0] + nx * d, p[1] + ny * d, fam], [p[0] - nx * d, p[1] - ny * d, fam]);
          if (!major || k % (every * o.arterial | 0) === 0) queue.push([p[0], p[1], 1 - fam]);
        }
        if (queue.length > 60000) break;
      }
    }
    for (const r of o.roads) { const id = streets.length; streets.push({ pts: r.pts, fam: -1, major: true, width: r.width, fixed: true }); for (const p of r.pts) { add(0, p[0], p[1], id); add(1, p[0], p[1], id); } }
    const seeds = [[cx + plaza + sp0 * 0.5, cy, 0], [cx, cy + plaza + sp0 * 0.5, 1]];
    for (let k = 0; k < 40; k++) seeds.push([rand() * W, rand() * H, k & 1]);
    grow(seeds, true);
    const q2 = [];
    for (const s of streets) for (let k = 0; k < s.pts.length; k += 4) q2.push([s.pts[k][0], s.pts[k][1], 0], [s.pts[k][0], s.pts[k][1], 1]);
    for (let k = 0; k < 600; k++) q2.push([rand() * W, rand() * H, k & 1]);
    grow(q2, false);

    // rasterise: blocks are what is left of the land once the streets are cut out of it
    const [, sg] = mkc();
    sg.fillStyle = '#000'; sg.fillRect(0, 0, W, H);
    sg.strokeStyle = '#fff'; sg.lineCap = 'round'; sg.lineJoin = 'round';
    for (const s of streets) { sg.lineWidth = s.width; poly(sg, s.pts); sg.stroke(); }
    const sPx = sg.getImageData(0, 0, RW, RH).data, N = RW * RH;
    const label = new Int32Array(N), dist = new Float32Array(N), stack = new Int32Array(N);
    for (let i = 0; i < N; i++) label[i] = land[i] === 1 && sPx[i * 4] < 128 ? -1 : 0;
    const blocks = [null];
    for (let s0 = 0; s0 < N; s0++) {
      if (label[s0] !== -1) continue;
      const id = blocks.length, b = { area: 0, x: 0, y: 0, edge: false, x0: RW, y0: RH, x1: 0, y1: 0 };
      let sp = 0; stack[sp++] = s0; label[s0] = id;
      while (sp) {
        const p = stack[--sp], x = p % RW, y = (p / RW) | 0;
        b.area++; b.x += x; b.y += y;
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
        if (x > 0) { if (label[p - 1] === -1) { label[p - 1] = id; stack[sp++] = p - 1; } } else b.edge = true;
        if (x < RW - 1) { if (label[p + 1] === -1) { label[p + 1] = id; stack[sp++] = p + 1; } } else b.edge = true;
        if (y > 0) { if (label[p - RW] === -1) { label[p - RW] = id; stack[sp++] = p - RW; } } else b.edge = true;
        if (y < RH - 1) { if (label[p + RW] === -1) { label[p + RW] = id; stack[sp++] = p + RW; } } else b.edge = true;
        if ((x > 0 && !land[p - 1]) || (x < RW - 1 && !land[p + 1]) || (y > 0 && !land[p - RW]) || (y < RH - 1 && !land[p + RW])) b.edge = true;   // on the outline
        if ((x > 0 && land[p - 1] === 2) || (x < RW - 1 && land[p + 1] === 2) || (y > 0 && land[p - RW] === 2) || (y < RH - 1 && land[p + RW] === 2)) b.shore = true;
      }
      b.x /= b.area * q; b.y /= b.area * q; b.area /= q * q;
      b.x0 /= q; b.y0 /= q; b.x1 = (b.x1 + 1) / q; b.y1 = (b.y1 + 1) / q;
      b.angle = angleAt(b.x, b.y); b.r = R.hash2(id, 17, o.seed);
      blocks.push(b);
    }
    // chamfer distance from every block pixel to the nearest pixel that is not block
    const D1 = 1 / q, D2 = Math.SQRT2 / q;
    for (let i = 0; i < N; i++) dist[i] = label[i] ? 1e6 : 0;
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const i = y * RW + x; if (!dist[i]) continue;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + D1);
      if (y > 0) { d = Math.min(d, dist[i - RW] + D1); if (x > 0) d = Math.min(d, dist[i - RW - 1] + D2); if (x < RW - 1) d = Math.min(d, dist[i - RW + 1] + D2); }
      dist[i] = d;
    }
    for (let y = RH - 1; y >= 0; y--) for (let x = RW - 1; x >= 0; x--) {
      const i = y * RW + x; if (!dist[i]) continue;
      let d = dist[i];
      if (x < RW - 1) d = Math.min(d, dist[i + 1] + D1);
      if (y < RH - 1) { d = Math.min(d, dist[i + RW] + D1); if (x < RW - 1) d = Math.min(d, dist[i + RW + 1] + D2); if (x > 0) d = Math.min(d, dist[i + RW - 1] + D2); }
      dist[i] = d;
    }
    const idx = (x, y) => { const i = (x * q) | 0, j = (y * q) | 0; return i < 0 || j < 0 || i >= RW || j >= RH ? -1 : j * RW + i; };
    return {
      W, H, q, RW, RH, label, dist, land, streets, blocks, centre: [cx, cy], plaza, angleAt, spacingAt: spAt, suburbAt, kindAt,
      blockAt: (x, y) => { const i = idx(x, y); return i < 0 ? 0 : label[i]; },
      distAt: (x, y) => { const i = idx(x, y); return i < 0 ? 0 : dist[i]; },
      onLand,
      stroke(ctx, extra, filter) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const s of streets) { if (filter && !filter(s)) continue; ctx.lineWidth = s.width + (extra || 0); poly(ctx, s.pts); ctx.stroke(); }
        ctx.restore();
      },
    };
  }

  /** Knock-out: clear this drum under a label so it reads on every ink. */
  function knockout(ctx, draw, width) {
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = width || 6; ctx.lineJoin = 'round';
    draw(ctx); ctx.restore();
  }

  root.Carto = { terrain, heightAt, isoline, contours, coastline, waterLines, tint, seaFill, hillshade, rivers, strokeRivers, settlements, roadNetwork, strokeRoads, knockout, placeName, meander, resample, city, segNear, thin };
})(typeof window !== 'undefined' ? window : globalThis);
