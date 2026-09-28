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
  /** Knock-out: clear this drum under a label so it reads on every ink. */
  function knockout(ctx, draw, width) {
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = width || 6; ctx.lineJoin = 'round';
    draw(ctx); ctx.restore();
  }

  root.Carto = { terrain, heightAt, isoline, contours, coastline, waterLines, tint, seaFill, hillshade, rivers, strokeRivers, settlements, roadNetwork, strokeRoads, knockout, placeName };
})(typeof window !== 'undefined' ? window : globalThis);
