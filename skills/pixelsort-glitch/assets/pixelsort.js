/* pixelsort.js — interval pixel sorting and honest glitch tools for <canvas>.
 *
 *   const src = ctx.getImageData(0, 0, w, h);
 *   const out = PixelSort.sort(src, { mode: 'threshold', key: 'lightness', lo: 0.3, hi: 0.85, angle: 90 });
 *   PixelSort.channelShift(out, { r: [4, 0], b: [-4, 0] });
 *   PixelSort.slices(out, { count: 5, maxShift: 60, seed: 3 });
 *   ctx.putImageData(out, 0, 0);
 *   await PixelSort.crush(canvas, { quality: 0.35, generations: 3 }); // real JPEG loss, not a filter
 *
 * The sort model follows the one Pixelort (Akascape) and satyarth/pixelsort use:
 * split each row into intervals, sort only inside them, leave the rest intact.
 * Original implementation; no code taken from either (pixel-sorter is GPL).
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

  // Sort keys, all in [0,1].
  const KEYS = {
    lightness: (r, g, b) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510,
    intensity: (r, g, b) => (r + g + b) / 765,
    minimum: (r, g, b) => Math.min(r, g, b) / 255,
    saturation: (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
      if (mx === mn) return 0;
      const d = (mx - mn) / 255;
      return l > 0.5 ? d / (2 - (mx + mn) / 255) : d / ((mx + mn) / 255);
    },
    hue: (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return 0;
      let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h / 6;
    },
    red: r => r / 255, green: (r, g) => g / 255, blue: (r, g, b) => b / 255,
  };

  // Rotate an ImageData by `deg` onto a canvas big enough to hold it.
  // Nearest-neighbour on purpose: sorted pixels should stay pixels.
  function rotated(img, deg) {
    const a = (deg * Math.PI) / 180, snap = v => Math.round(Math.abs(v) * 1e9) / 1e9, c = snap(Math.cos(a)), s = snap(Math.sin(a));
    const W = Math.ceil(img.width * c + img.height * s), H = Math.ceil(img.width * s + img.height * c);
    const src = document.createElement('canvas'); src.width = img.width; src.height = img.height;
    src.getContext('2d').putImageData(img, 0, 0);
    const dst = document.createElement('canvas'); dst.width = W; dst.height = H;
    const g = dst.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.translate(W / 2, H / 2); g.rotate(-a); g.drawImage(src, -img.width / 2, -img.height / 2);
    return { canvas: dst, data: g.getImageData(0, 0, W, H) };
  }
  function unrotated(data, deg, w, h) {
    const a = (deg * Math.PI) / 180;
    const src = document.createElement('canvas'); src.width = data.width; src.height = data.height;
    src.getContext('2d').putImageData(data, 0, 0);
    const dst = document.createElement('canvas'); dst.width = w; dst.height = h;
    const g = dst.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.translate(w / 2, h / 2); g.rotate(a); g.drawImage(src, -data.width / 2, -data.height / 2);
    return g.getImageData(0, 0, w, h);
  }

  /**
   * sort(imageData, opts) -> new ImageData
   * mode       'threshold' (default) | 'random' | 'edges' | 'waves' | 'border'
   * key        interval key: lightness | intensity | minimum | saturation | hue | red | green | blue
   * sortKey    key the interval is ordered by (default: key)
   * lo, hi     threshold band (threshold mode); lo = edge strength (edges mode)
   * angle      degrees; 0 sorts rows, 90 sorts columns (drips)
   * reverse    sort descending
   * charLength typical interval length for random / waves
   * randomness 0..1 probability an interval is left unsorted
   * mask       ImageData of the same size; sorting only where its luminance > 127
   * seed       integer
   */
  function sort(img, o) {
    o = Object.assign({ mode: 'threshold', key: 'lightness', lo: 0.25, hi: 0.8, angle: 0, reverse: false, charLength: 60, randomness: 0, seed: 1 }, o);
    const keyFn = KEYS[o.key], sortFn = KEYS[o.sortKey || o.key];
    if (!keyFn || !sortFn) throw new Error(`pixelsort: unknown key "${o.sortKey || o.key}". Use one of: ${Object.keys(KEYS).join(', ')}.`);
    const rand = mulberry32(o.seed >>> 0);
    const turn = ((o.angle % 360) + 360) % 360 !== 0;

    let buf, maskBuf = null;
    if (turn) {
      buf = rotated(img, o.angle).data;
      if (o.mask) maskBuf = rotated(o.mask, o.angle).data;
    } else {
      buf = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
      maskBuf = o.mask;
    }
    const W = buf.width, H = buf.height, d = buf.data;

    const keys = new Float32Array(W), sk = new Float32Array(W), valid = new Uint8Array(W);
    const idx = new Uint32Array(W), tmp = new Uint8ClampedArray(W * 4);
    let edgeAbove = null;
    if (o.mode === 'edges') edgeAbove = new Float32Array(W * H);
    if (edgeAbove) {
      const L = new Float32Array(W * H);
      for (let p = 0; p < W * H; p++) L[p] = keyFn(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        edgeAbove[p] = Math.abs(L[p + 1] - L[p - 1]) + Math.abs(L[p + W] - L[p - W]);
      }
    }

    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const k = (row + x) * 4;
        valid[x] = d[k + 3] > 250 && (!maskBuf || maskBuf.data[k] > 127) ? 1 : 0;
        keys[x] = keyFn(d[k], d[k + 1], d[k + 2]);
        sk[x] = sortFn === keyFn ? keys[x] : sortFn(d[k], d[k + 1], d[k + 2]);
      }
      // Build intervals [s, e)
      const cuts = [];
      let s = -1;
      const open = x => { if (s < 0) s = x; }, close = x => { if (s >= 0 && x - s > 1) cuts.push([s, x]); s = -1; };
      if (o.mode === 'threshold') {
        for (let x = 0; x < W; x++) (valid[x] && keys[x] >= o.lo && keys[x] <= o.hi) ? open(x) : close(x);
      } else if (o.mode === 'edges') {
        for (let x = 0; x < W; x++) (valid[x] && edgeAbove[row + x] < o.lo) ? open(x) : close(x);
      } else if (o.mode === 'border') {
        for (let x = 0; x < W; x++) valid[x] ? open(x) : close(x);
      } else {
        // random / waves: fixed-length runs, broken by invalid pixels
        let x = o.mode === 'waves' ? -((rand() * o.charLength) | 0) : 0;
        while (x < W) {
          const len = o.mode === 'waves'
            ? Math.max(2, Math.round(o.charLength * (0.9 + rand() * 0.2)))
            : Math.max(2, (rand() * rand() * o.charLength * 3) | 0);
          let a = Math.max(0, x), b = Math.min(W, x + len);
          for (let i = a; i < b; i++) { if (valid[i]) open(i); else close(i); }
          close(b); x += len;
        }
      }
      close(W);

      for (const [a, b] of cuts) {
        if (o.randomness && rand() < o.randomness) continue;
        const n = b - a;
        for (let i = 0; i < n; i++) idx[i] = a + i;
        const view = idx.subarray(0, n);
        view.sort(o.reverse ? (p, q) => sk[q] - sk[p] : (p, q) => sk[p] - sk[q]);
        for (let i = 0; i < n; i++) {
          const from = (row + view[i]) * 4;
          tmp[i * 4] = d[from]; tmp[i * 4 + 1] = d[from + 1]; tmp[i * 4 + 2] = d[from + 2]; tmp[i * 4 + 3] = d[from + 3];
        }
        d.set(tmp.subarray(0, n * 4), (row + a) * 4);
      }
    }

    if (!turn) return buf;
    const back = unrotated(buf, o.angle, img.width, img.height);
    // pixels the rotation could not map keep their original value
    for (let p = 0; p < back.data.length; p += 4) {
      if (back.data[p + 3] < 250) { back.data[p] = img.data[p]; back.data[p + 1] = img.data[p + 1]; back.data[p + 2] = img.data[p + 2]; back.data[p + 3] = img.data[p + 3]; }
    }
    return back;
  }

  /** Offset colour channels in place: { r: [dx, dy], g: [dx, dy], b: [dx, dy] }. */
  function channelShift(img, o) {
    const { width: w, height: h, data: d } = img, src = new Uint8ClampedArray(d);
    [['r', 0], ['g', 1], ['b', 2]].forEach(([ch, c]) => {
      const off = o[ch]; if (!off) return;
      const [dx, dy] = off;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = Math.min(w - 1, Math.max(0, x - dx)), sy = Math.min(h - 1, Math.max(0, y - dy));
        d[(y * w + x) * 4 + c] = src[(sy * w + sx) * 4 + c];
      }
    });
    return img;
  }

  /** Displace horizontal bands sideways, the way a damaged stream tears. */
  function slices(img, o) {
    o = Object.assign({ count: 5, maxShift: 60, minHeight: 2, maxHeight: 40, seed: 1 }, o);
    const rand = mulberry32((o.seed * 9301) >>> 0), { width: w, height: h, data: d } = img;
    for (let n = 0; n < o.count; n++) {
      const y0 = (rand() * h) | 0, bh = o.minHeight + ((rand() * (o.maxHeight - o.minHeight)) | 0);
      const shift = Math.round((rand() * 2 - 1) * o.maxShift);
      for (let y = y0; y < Math.min(h, y0 + bh); y++) {
        const row = d.slice(y * w * 4, (y + 1) * w * 4);
        for (let x = 0; x < w; x++) {
          const sx = (((x - shift) % w) + w) % w;
          d.set(row.subarray(sx * 4, sx * 4 + 4), (y * w + x) * 4);
        }
      }
    }
    return img;
  }

  /** Generation loss: re-encode the canvas as JPEG `generations` times. */
  async function crush(canvas, o) {
    o = Object.assign({ quality: 0.4, generations: 2 }, o);
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < o.generations; i++) {
      const url = canvas.toDataURL('image/jpeg', o.quality);
      const im = new Image(); im.src = url; await im.decode();
      ctx.drawImage(im, 0, 0);
    }
    return canvas;
  }

  root.PixelSort = { sort, channelShift, slices, crush, KEYS, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
