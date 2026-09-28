/* live.js — Glitch.live(): a broken file that keeps breaking, on the GPU.
 *
 * Capture-first. The still engine (glitch.js + pixelsort.js) renders the plate once on the
 * CPU, exactly as the still page does; the result is uploaded as a texture and every frame
 * is that texture read back through the machines of this medium, in a WebGL2 shader:
 *   - the sort sweep: a slit on each band of rows drags the row out sideways, and only the
 *     pixels inside the sort threshold band are replaced, so streaks grow and retract;
 *   - datamosh: scroll velocity moves macroblocks along stale motion vectors;
 *   - tear: the pointer tears the rows under it sideways, R and B a step apart;
 *   - burst: a click splits a band of rows into sliding slices and flat blocks;
 *   - load: a plate arrives like a slow file, the last row read dragged down the rest.
 * Every term is exactly zero at clock 0 with the defaults, so frame 0 is the still, pixel
 * for pixel; live.parity() measures that. Offsets are whole work pixels: pixels stay square.
 *
 *   const ctl = Glitch.live(canvas, { mode: 'smear', seed: 6, scene: 6,        // still options
 *                                     sweep: 1, mosh: 1, tear: 1, clickPulse: true });   // motion
 *   ctl.set({ sweep: 0.4 }); ctl.pulse(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * Big canvases get their own context; small ones share one offscreen context and receive
 * frames as ImageBitmaps. Without WebGL2 every canvas falls back to the CPU still; with
 * reduced motion every canvas shows its still frame and changes state without animating.
 * Original implementation, MIT.
 */
(function (root) {
  'use strict';
  const G = root.Glitch, PS = root.PixelSort;
  if (!G || !PS) throw new Error('live.js: load pixelsort.js and glitch.js first');
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  const PLATES = ['smear', 'wave', 'drip', 'shatter', 'collage', 'scan', 'type', 'fall', 'band', 'mosh', 'weave'];
  // motion options: changing these never re-renders the still
  const MOTION = {
    sweep: 1, speed: 1, lo: 0.25, hi: 0.95, mosh: 1, tear: 0.8, radius: 0.18, lag: 0.12, hand: null, clickPulse: false,
    develop: 1, developMs: 1400, ease: 0.16, scrollRange: [0, 1], alive: true, dim: 0, ground: '#0b0b0e',
    reveal: null, thumb: null, own: null, maxField: 6e6,
  };

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uStill; uniform vec2 uSize; uniform float uPix; uniform int uSeed;
uniform vec4 uSweep;                       // length (0..1 of width), lo, hi, clock s
uniform vec2 uMosh;                        // rows of drag (work px, signed), block (work px)
uniform vec4 uTear; uniform vec2 uTearDir; // x, y, radius (device px), amount; unit direction of travel
uniform vec4 uPulse[4]; uniform int uNPulse; // x, y, reach (device px), amount
uniform float uLoad, uDim;                 // rows loaded (0..1), dim toward the ground
uniform vec4 uReveal; uniform vec3 uGround; // x0, x1 (device px), on, thumb x (device px, <0 none)
out vec4 outc;
float hash2(int x, int y, int s) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.;
}
ivec2 W, Q, PX;                            // work grid size, this pixel's work cell, its device pixel
// read work cell s: this device pixel moved by whole work cells, so with no offset it is the still's own pixel
vec4 at(ivec2 s) { ivec2 t = PX + ivec2(floor(vec2(s - Q) * uPix + .5)); return texelFetch(uStill, clamp(t, ivec2(0), ivec2(uSize) - 1), 0); }
float lit(vec3 c) { return (max(c.r, max(c.g, c.b)) + min(c.r, min(c.g, c.b))) * .5; }
void main() {
  W = ivec2(ceil(uSize / uPix));
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  ivec2 q = ivec2(floor(p / uPix));
  Q = q; PX = ivec2(floor(p));
  ivec2 s = q;
  // load: rows past the loaded edge repeat the last row read, dragged down
  if (uLoad < 1.) { int e = int(floor(uLoad * float(W.y))); if (q.y >= e) s.y = max(0, e - 1); }
  // datamosh: blocks keep moving along stale vectors while the page scrolls
  if (uMosh.x != 0.) {
    int B = int(uMosh.y); ivec2 b = q / B; float h = hash2(b.x, b.y, uSeed + 31);
    if (h > .45) s.y -= int(floor(uMosh.x * (h - .45) * 2.4 + .5));
    if (h > .9 && abs(uMosh.x) > 3.) s = b * B + B / 2;            // a stale block, flat
  }
  // tear: rows under the pointer pulled sideways in bands
  float split = 0.;
  if (uTear.w > 0.) {
    vec2 d = p - uTear.xy; float al = dot(d, uTearDir), pe = dot(d, vec2(-uTearDir.y, uTearDir.x));
    float f = exp(-(al * al * .35 + pe * pe) / (uTear.z * uTear.z)) * uTear.w;
    int band = q.y / (2 + int(hash2(0, q.y / 3, uSeed) * 4.));
    float r = hash2(band, 7, uSeed + 5) - .5;
    s.x -= int(floor(r * f * uTear.z * 1.4 / uPix + .5));
    split = f;
  }
  // burst: a band of rows slides apart and a few blocks go flat
  for (int i = 0; i < 4; i++) {
    if (i >= uNPulse) break;
    vec4 P = uPulse[i]; float dy = abs(p.y - P.y) / P.z;
    if (dy < 1. && P.w > 0.) {
      int band = q.y / 3; float r = hash2(band, i * 17 + 3, uSeed + 9);
      if (r > .35) s.x -= int(floor((r - .67) * P.w * uSize.x * .5 / uPix + .5));
      if (hash2(q.x / 8, q.y / 8, uSeed + i) > .88 - .3 * P.w) s = (s / 8) * 8 + 4;
      split = max(split, P.w * (1. - dy));
    }
  }
  vec4 c = at(s);
  // the sort sweep: each band of rows has a slit; from it, the row is read spread out, and the
  // pixels whose lightness falls in the threshold band take the streak
  if (uSweep.x > 0.) {
    int y0 = q.y, bh = 1 + int(hash2(0, y0 / 5, uSeed + 1) * 9.);
    int band = y0 / bh;
    float hb = hash2(band, 1, uSeed + 2), grow = sin(uSweep.w * (.35 + .9 * hash2(band, 2, uSeed + 3)) + 6.2832 * hash2(band, 3, uSeed + 4));
    if (hb < .55 && grow > 0.) {
      float x0 = floor(hash2(band, 4, uSeed + 6) * float(W.x)), dir = hash2(band, 5, uSeed + 7) < .5 ? -1. : 1.;
      float L = uSweep.x * float(W.x) * grow * (.3 + .7 * hash2(band, 6, uSeed + 8)), t = (float(s.x) - x0) * dir;
      if (t >= 0. && t < L) {
        float k = .02 + .12 * hash2(band, 8, uSeed + 10);
        vec4 sl = at(ivec2(int(x0 + dir * floor(t * k)), s.y));
        float l = lit(sl.rgb);
        if (l >= uSweep.y && l <= uSweep.z) c = sl;
      }
    }
  }
  if (split > .05) {                                                  // R and B a step out of register
    int o = int(floor(split * 3. + .5));
    c.r = at(s + ivec2(o, 0)).r; c.b = at(s - ivec2(o, 0)).b;
  }
  vec3 col = c.rgb;
  if (uDim > 0.) col = mix(col, uGround, uDim);
  if (uReveal.z > 0. && (p.x < uReveal.x || p.x >= uReveal.y)) col = uGround;
  if (uReveal.w >= 0. && abs(p.x - uReveal.w) < uPix * 1.5) col = vec3(1.);   // the thumb: one stuck column
  outc = vec4(col * c.a, c.a);
}`;

  // ---------------------------------------------------------------- renderers
  function compile(gl) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) { console.warn('live.js shader:', gl.getShaderInfoLog(s)); return null; }
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { if (!gl.isContextLost()) console.warn('live.js link:', gl.getProgramInfoLog(p)); return null; }
    return { p, u: {} };
  }
  function makeRenderer(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { gl, canvas, lost: false, gen: 0 };
    const setup = () => { R.prog = compile(gl); R.gen++; return R.prog; };
    if (!setup()) return null;
    const lost = e => { e.preventDefault(); R.lost = true; };
    const back = () => { R.lost = false; setup(); for (const v of views) v.dirty = true; wake(); };
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', back);
    canvas.addEventListener('contextlost', lost); canvas.addEventListener('contextrestored', back);
    return R;
  }
  let shared;
  function sharedRenderer() {
    if (shared !== undefined) return shared;
    shared = null;
    try {
      if (typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function') {
        const r = makeRenderer(new OffscreenCanvas(16, 16));
        if (r) { r.offscreen = true; shared = r; }
      }
    } catch (e) { shared = null; }
    if (!shared) shared = makeRenderer(document.createElement('canvas'));
    return shared;
  }
  const U = (gl, P, n) => (n in P.u) ? P.u[n] : (P.u[n] = gl.getUniformLocation(P.p, n));
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  // ---------------------------------------------------------------- stills
  /**
   * sorted(canvas, opts): a strip of the stand-in picture with its rows sorted inside their
   * mid-tones, pushed vivid, scanlined. What most UI pieces break. opts: width, height,
   * cssWidth, pixel, scene, seed, lo, hi, angle, image.
   */
  function sorted(canvas, opts) {
    const o = Object.assign({ seed: 1, pixel: 2, lo: 0.2, hi: 0.92, angle: 0, randomness: 0.2, crop: null }, opts);
    const W = Math.round(o.width || canvas.width), H = Math.round(o.height || canvas.height);
    canvas.width = W; canvas.height = H;
    const p = o.pixel * (o.cssWidth ? W / o.cssWidth : 1), w = Math.max(8, Math.round(W / p)), h = Math.max(8, Math.round(H / p));
    // a crop of a bigger picture, so a thin strip still holds sky, sun and sea
    const [cx, cy, cs] = o.crop || [0.15 + 0.5 * PS.mulberry32(o.seed * 13 + 1)(), 0.25, 3];
    const bw = Math.round(w * cs), bh = Math.max(h, Math.round(bw * 0.6));
    const big = o.image ? null : G.dusk(bw, bh, o.scene != null ? o.scene : o.seed);
    const work = document.createElement('canvas'); work.width = w; work.height = h;
    const ctx = work.getContext('2d', { willReadFrequently: true });
    if (big) ctx.drawImage(big, Math.round(-cx * (bw - w)), Math.round(-cy * (bh - h)));
    else { const iw = o.image.naturalWidth || o.image.width, ih = o.image.naturalHeight || o.image.height, k = Math.max(w / iw, h / ih); ctx.drawImage(o.image, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k); }
    let img = PS.sort(ctx.getImageData(0, 0, w, h), { mode: 'threshold', key: 'lightness', lo: o.lo, hi: o.hi, angle: o.angle, randomness: o.randomness, seed: o.seed });
    G.vivid(img, 1.3); G.scanlines(img, 0.08);
    ctx.putImageData(img, 0, 0);
    const out = canvas.getContext('2d');
    out.imageSmoothingEnabled = false; out.drawImage(work, 0, 0, W, H);
    if (o.shape) { out.globalCompositeOperation = 'destination-in'; o.shape(out, W, H); out.globalCompositeOperation = 'source-over'; }
    return canvas;
  }
  // `mode` names the plate here, so the plate's own mode (ripple, water, mint, night, ink ...) is `variant`
  function stillOpts(o) { const s = {}; for (const k in o) if (!(k in MOTION) && k !== 'mode' && k !== 'variant') s[k] = o[k]; if (o.variant) s.mode = o.variant; return s; }
  // render the still into `cv` at w×h device px; returns the device px per work px
  function runStill(cv, o, w, h, cssW) {
    const so = Object.assign(stillOpts(o), { width: w, height: h, cssWidth: cssW });
    if (o.mode === 'sorted') { sorted(cv, so); return (so.pixel || 2) * w / cssW; }
    if (typeof o.mode === 'function') { cv.width = w; cv.height = h; o.mode(cv.getContext('2d'), w, h); return so.pixel ? so.pixel * w / cssW : 1; }
    if (!PLATES.includes(o.mode)) throw new Error('live.js: unknown mode "' + o.mode + '". Use one of: sorted, ' + PLATES.join(', ') + ', or a draw function.');
    G[o.mode](cv, so);
    // type is drawn at device resolution; the others on a grid of `pixel` CSS px (drip: 2)
    return o.mode === 'type' ? 1 : (so.pixel || (o.mode === 'drip' ? 2 : 1)) * w / cssW;
  }

  function build(v) {
    const cv = document.createElement('canvas');
    let w = v.w, h = v.h, cssW = v.cssW;
    const k = Math.min(1, Math.sqrt(v.o.maxField / (w * h)));
    if (k < 1) { w = Math.round(w * k); h = Math.round(h * k); }
    const pix = runStill(cv, v.o, w, h, cssW);
    v.src = { canvas: cv, w, h, pix: Math.max(1, pix), k };
    v.g = null; v.dirty = true;
  }

  // ---------------------------------------------------------------- GPU frame
  function upload(v) {
    const gl = v.R.gl, s = v.src;
    if (v.g && v.g.tex) gl.deleteTexture(v.g.tex);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, s.canvas);
    for (const [p, x] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, x);
    v.g = { gen: v.R.gen, src: s, tex: t };
  }
  function drawGPU(v) {
    const R = v.R, gl = R.gl, s = v.src, st = v.st, o = v.o;
    if (R.lost || !s) return false;
    if (!v.g || v.g.gen !== R.gen || v.g.src !== s) upload(v);
    const w = s.w, h = s.h, cv = R.canvas;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const P = R.prog, u = n => U(gl, P, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.g.tex); gl.uniform1i(u('uStill'), 0);
    gl.uniform2f(u('uSize'), w, h); gl.uniform1f(u('uPix'), s.pix); gl.uniform1i(u('uSeed'), (o.seed | 0) * 7 + 1);
    gl.uniform4f(u('uSweep'), st.env * st.sweep * 0.9, st.lo, o.hi, st.clock);
    gl.uniform2f(u('uMosh'), Math.round(st.mosh), 8);
    const tp = st.tear;
    gl.uniform4f(u('uTear'), tp.x * s.k, tp.y * s.k, o.radius * Math.min(w, h) * (1 + tp.stretch * 0.5), tp.amp * o.tear);
    gl.uniform2f(u('uTearDir'), tp.dx, tp.dy);
    const pu = new Float32Array(16); st.pulses.slice(0, 4).forEach((q, i) => pu.set([q.x * s.k, q.y * s.k, q.reach * h, q.amp], i * 4));
    gl.uniform4fv(u('uPulse'), pu); gl.uniform1i(u('uNPulse'), Math.min(4, st.pulses.length));
    gl.uniform1f(u('uLoad'), st.load); gl.uniform1f(u('uDim'), st.dim);
    const gr = hex(o.ground); gl.uniform3f(u('uGround'), gr[0] / 255, gr[1] / 255, gr[2] / 255);
    const rv = st.reveal;
    gl.uniform4f(u('uReveal'), rv ? rv[0] * w : 0, rv ? rv[1] * w : 0, rv ? 1 : 0, st.thumb == null ? -1 : st.thumb * w);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function present(v) {
    const R = v.R;
    if (R.canvas === v.canvas) return;
    if (v.canvas.width !== R.canvas.width || v.canvas.height !== R.canvas.height) { v.canvas.width = R.canvas.width; v.canvas.height = R.canvas.height; }
    if (R.offscreen) v.ctx.transferFromImageBitmap(R.canvas.transferToImageBitmap());
    else { v.ctx.globalCompositeOperation = 'copy'; v.ctx.drawImage(R.canvas, 0, 0); }
  }

  // ---------------------------------------------------------------- CPU fallback: the still, with state but no motion
  function drawCPU(v) {
    const s = v.src, st = v.st, ctx = v.ctx;
    if (!s) return;
    const w = s.w, h = s.h;
    if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
    ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.imageSmoothingEnabled = false; ctx.drawImage(s.canvas, 0, 0); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = v.o.ground;
    if (st.dim > 0) { ctx.globalAlpha = st.dim; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    if (st.reveal) { ctx.fillRect(0, 0, st.reveal[0] * w, h); ctx.fillRect(st.reveal[1] * w, 0, w, h); }
    if (st.thumb != null) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(st.thumb * w - s.pix * 1.5), 0, Math.ceil(s.pix * 3), h); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- views and the one loop
  const views = new Set();
  let raf = 0, last = 0, lastCost = 0;
  function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const t0 = performance.now();
    let more = false;
    for (const v of views) if (v.run(now, dt)) more = true;
    lastCost = performance.now() - t0;
    if (more) wake(); else last = 0;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else wake(); });
  RM.addEventListener && RM.addEventListener('change', () => { for (const v of views) v.dirty = true; wake(); });
  // scroll velocity, page-wide, in CSS px per second: what datamosh feeds on
  let scrollY = root.scrollY || 0, scrollT = performance.now(), scrollV = 0;
  root.addEventListener('scroll', () => {
    const now = performance.now(), y = root.scrollY, dt = Math.max(8, now - scrollT);
    scrollV = (y - scrollY) / dt * 1000; scrollY = y; scrollT = now; wake();
  }, { passive: true });

  const buildQueue = [];
  let building = false;
  function queueBuild(v) {
    if (!buildQueue.includes(v)) buildQueue.push(v);
    if (building) return;
    building = true;
    setTimeout(function next() {
      const v = buildQueue.shift();
      if (v && views.has(v)) { try { v.resize(true); build(v); } catch (e) { console.warn('live.js build:', e); } wake(); }
      if (buildQueue.length) setTimeout(next, 0); else building = false;
    }, 0);
  }

  function live(canvas, opts) {
    const o = Object.assign({ mode: 'smear' }, MOTION, opts);
    const v = { canvas, o, R: null, ctx: null, src: null, g: null, dirty: true, paused: false, visible: false, frames: 0, dpr: 1, w: 0, h: 0, cssW: 1, cssH: 1, ratio: 0 };
    v.st = { clock: 0, env: 0, sweep: 0, lo: o.lo, mosh: 0, dim: o.dim, load: 1, reveal: o.reveal, thumb: o.thumb, inStart: 0, pulses: [],
      tear: { x: 0, y: 0, tx: 0, ty: 0, amp: 0, on: false, seen: false, dx: 1, dy: 0, stretch: 0 } };
    const r0 = canvas.getBoundingClientRect();
    const area = r0.width * r0.height * Math.pow(Math.min(2, root.devicePixelRatio || 1), 2);
    if (live.gpu !== false) {
      const own = o.own == null ? area >= 0.9e6 : o.own;
      if (own) v.R = makeRenderer(canvas);
      else {
        const sh = sharedRenderer();
        if (sh) { v.R = sh; v.ctx = sh.offscreen ? canvas.getContext('bitmaprenderer') : canvas.getContext('2d'); if (!v.ctx) v.R = null; }
      }
    }
    if (!v.R && !v.ctx) v.ctx = canvas.getContext('2d');
    if (!v.R && !v.ctx) return null;
    const still = () => RM.matches || !v.R;

    function loadTarget(now) {
      const d = o.develop;
      if (d === 'in') {
        if (still()) return 1;
        if (!v.st.inStart) return 0;
        return Math.floor(clamp01((now - v.st.inStart) / o.developMs) * 9) / 9;   // arrives in nine steps, like a slow file
      }
      if (d === 'scroll') {
        const r = canvas.getBoundingClientRect(), vh = root.innerHeight || 1, [a, b] = o.scrollRange;
        if (still()) return b;
        return a + (b - a) * clamp01((vh - r.top) / (vh * 0.75));
      }
      return +d;
    }
    const lerp = (a, b, k) => a + (b - a) * k;
    function tick(now, dt) {
      const st = v.st, rm = still();
      let moving = false;
      const k = rm ? 1 : 1 - Math.exp(-dt / Math.max(0.001, o.ease));
      if (!rm && o.alive) { st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 2.5); moving = true; }
      else if (rm) { st.clock = 0; st.env = 0; }
      for (const [key, tgt] of [['sweep', o.sweep], ['lo', o.lo], ['dim', o.dim]]) {
        if (Math.abs(st[key] - tgt) > 1e-3 && !rm) { st[key] = lerp(st[key], tgt, k); moving = true; } else st[key] = tgt;
      }
      if (rm) st.sweep = 0;
      const ld = loadTarget(now);
      if (o.develop === 'in' && st.inStart && !rm && now - st.inStart < o.developMs + 50) moving = true;
      if (o.develop === 'scroll' && !rm) moving = true;
      st.load = ld;
      if (o.reveal) {
        const cur = st.reveal || o.reveal, nr = o.reveal.map((x, i) => rm ? x : lerp(cur[i], x, k));
        if (nr.some((x, i) => Math.abs(x - o.reveal[i]) > 1e-3)) moving = true; else nr.splice(0, 2, o.reveal[0], o.reveal[1]);
        st.reveal = nr;
      } else st.reveal = null;
      if (o.thumb != null) {
        const nt = rm || st.thumb == null ? o.thumb : lerp(st.thumb, o.thumb, k);
        if (Math.abs(nt - o.thumb) > 1e-3) moving = true;
        st.thumb = Math.abs(nt - o.thumb) > 1e-3 ? nt : o.thumb;
      } else st.thumb = null;
      // datamosh: scroll velocity, eased, in work rows; decays to zero when the page stops
      const target = rm || !o.mosh ? 0 : Math.max(-40, Math.min(40, -scrollV * 0.02 * o.mosh));
      scrollV *= Math.exp(-dt / 0.12);
      st.mosh = lerp(st.mosh, target, 1 - Math.exp(-dt / 0.08));
      if (Math.abs(st.mosh) < 0.5 && !target) st.mosh = 0; else moving = true;
      const p = st.tear;
      if (!rm && o.tear) {
        const kl = 1 - Math.exp(-dt / Math.max(0.01, o.lag)), px = p.x, py = p.y;
        p.x = lerp(p.x, p.tx, kl); p.y = lerp(p.y, p.ty, kl);
        const vx = (p.x - px) / Math.max(dt, 1e-3), vy = (p.y - py) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vy), S = Math.min(v.w, v.h) || 1;
        if (sp > 1) { p.dx = vx / sp; p.dy = vy / sp; }
        p.stretch = Math.min(1.5, sp / (S * 1.5));
        p.amp = lerp(p.amp, p.on ? 0.25 + 0.75 * Math.min(1, sp / (S * 0.6)) : 0, 1 - Math.exp(-dt / 0.12));   // a still pointer barely tears
        if (p.amp > 0.004 || p.on) moving = true; else p.amp = 0;
      } else p.amp = 0;
      st.pulses = rm ? [] : st.pulses.filter(q => now - q.t0 < 900);
      for (const q of st.pulses) {
        const a = (now - q.t0) / 1000;
        q.amp = q.s * Math.exp(-a / 0.22) * (a < 0.03 ? a / 0.03 : 1);   // a burst: hits at once, dies fast
        q.reach = 0.04 + 0.4 * (1 - Math.exp(-a / 0.12));
        moving = true;
      }
      return moving;
    }

    v.resize = force => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      v.cssW = r.width; v.cssH = r.height;
      v.dpr = Math.min(2, root.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(r.width * v.dpr)), h = Math.max(2, Math.round(r.height * v.dpr));
      if (w === v.w && h === v.h) return false;
      if (!force && v.src) return true;
      v.w = w; v.h = h;
      return true;
    };
    v.run = (now, dt) => {
      if ((v.paused && v.frames) || !v.visible || !v.src) return false;
      if (o.develop === 'in' && !v.st.inStart && v.ratio >= 0.25) v.st.inStart = now;
      const moving = tick(now, dt);
      if (!(moving || v.dirty)) return false;
      if (v.R) { if (drawGPU(v)) { present(v); v.frames++; v.dirty = false; } }
      else { drawCPU(v); v.frames++; v.dirty = false; }
      return moving && !!v.R;
    };

    const hand = o.hand || canvas.parentElement || canvas;
    const at = e => { const r = canvas.getBoundingClientRect(), k = v.w / (r.width || 1); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    const onMove = e => {
      const [x, y] = at(e), p = v.st.tear;
      if (!p.seen) { p.x = x; p.y = y; p.seen = true; }
      p.tx = x; p.ty = y; p.on = true; wake();
    };
    const onLeave = e => { if (e.pointerType !== 'mouse' || e.type === 'pointerleave') { v.st.tear.on = false; wake(); } };
    const onDown = e => { onMove(e); if (o.clickPulse) { const [x, y] = at(e); api.pulseAt(x, y, 0.6); } };
    hand.addEventListener('pointermove', onMove, { passive: true });
    hand.addEventListener('pointerdown', onDown, { passive: true });
    hand.addEventListener('pointerleave', onLeave, { passive: true });
    hand.addEventListener('pointerup', onLeave, { passive: true });
    hand.addEventListener('pointercancel', onLeave, { passive: true });

    const io = new IntersectionObserver(es => es.forEach(en => { v.visible = en.isIntersecting; v.ratio = en.intersectionRatio; if (v.visible) { v.dirty = true; wake(); } }), { rootMargin: '120px 0px', threshold: [0, 0.25, 0.5] });
    io.observe(canvas);
    let rzT;
    const ro = new ResizeObserver(() => {
      if (!v.started) { first(); return; }
      if (!v.src || !v.resize(false)) return;
      clearTimeout(rzT);
      rzT = setTimeout(() => queueBuild(v), 200);
    });
    ro.observe(canvas);

    const api = {
      canvas,
      /** merge options; motion options apply next frame, still options re-render the plate */
      set(n) {
        const look = Object.keys(n).filter(k => !(k in MOTION) && n[k] !== o[k]);
        Object.assign(o, n);
        if (n.develop === 'in') v.st.inStart = 0;
        if (look.length) queueBuild(v);
        v.dirty = true; wake(); return api;
      },
      /** replace the plate: every still option is dropped and `n` (mode + its options) put in their place */
      load(n) {
        for (const k of Object.keys(o)) if (!(k in MOTION)) delete o[k];
        Object.assign(o, { mode: 'smear' }, n);
        queueBuild(v); v.dirty = true; wake(); return api;
      },
      /** a glitch burst at (x, y) in CSS px of the canvas; strength ~0.3–1 */
      pulse(x, y, s) { const k = v.w / (v.cssW || 1); return api.pulseAt(x * k, y * k, s); },
      pulseAt(x, y, s) {
        if (still() || !v.R) return api;
        v.st.pulses.push({ x, y, s: s == null ? 0.6 : s, t0: performance.now(), amp: 0, reach: 0.04 });
        if (v.st.pulses.length > 4) v.st.pulses.shift();
        wake(); return api;
      },
      /** tear at (x, y) in CSS px yourself, or release it with point(null) */
      point(x, y) {
        const p = v.st.tear, k = v.w / (v.cssW || 1);
        if (x == null) p.on = false; else { p.tx = x * k; p.ty = y * k; if (!p.seen) { p.x = p.tx; p.y = p.ty; p.seen = true; } p.on = true; }
        wake(); return api;
      },
      pause() { v.paused = true; return api; },
      resume() { v.paused = false; v.dirty = true; wake(); return api; },
      destroy() {
        views.delete(v); io.disconnect(); ro.disconnect(); clearTimeout(rzT);
        for (const [t, f] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerleave', onLeave], ['pointerup', onLeave], ['pointercancel', onLeave]]) hand.removeEventListener(t, f);
        if (v.R && v.g) v.R.gl.deleteTexture(v.g.tex);
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
      },
      state() { return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.load.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src, reduced: still() }; },
      /** time n frames with every live term on: `sync` (median, 1-px readback each) and `pipelined` (n frames, one wait) */
      bench(n) {
        if (!v.R || !v.src) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st, keep = JSON.stringify({ clock: st.clock, env: st.env, sweep: st.sweep, mosh: st.mosh, tear: st.tear });
        Object.assign(st, { env: 1, sweep: 1, mosh: 12 }); Object.assign(st.tear, { x: v.w / 2, y: v.h / 2, amp: 1 });
        st.pulses = [{ x: v.w / 2, y: v.h / 2, s: 1, t0: 0, amp: 0.8, reach: 0.3 }];
        const step = () => { st.clock += 1 / 60; drawGPU(v); };
        step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) { const t0 = performance.now(); step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
        const t0 = performance.now();
        for (let i = 0; i < n; i++) step();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n;
        const k = JSON.parse(keep); Object.assign(st, { clock: k.clock, env: k.env, sweep: k.sweep, mosh: k.mosh, pulses: [] }); Object.assign(st.tear, k.tear);
        drawGPU(v); present(v);
        ts.sort((a, b) => a - b);
        return { sync: +ts[ts.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), size: [v.src.w, v.src.h], path: api.state().path };
      },
      _v: v,
    };

    views.add(v);
    registry.views.push(api);
    const first = () => { v.resize(true); if (!v.w) return; v.started = true; queueBuild(v); };
    first();
    return api;
  }
  live.gpu = true;
  // for tests: draw one frame of a view at clock `t` (s) with the sweep fully in
  live._frame = (ctl, t) => { const v = ctl._v; if (t != null) Object.assign(v.st, { clock: t, env: 1 }); if (v.R) { drawGPU(v); present(v); } else drawCPU(v); };
  live.stats = () => ({ views: views.size, jsMsLastFrame: +lastCost.toFixed(2) });
  live.sorted = sorted;

  /**
   * live.parity(opts): render the still with the CPU engine and frame 0 with the GPU at the
   * same size and seed, and compare luminance mean, SD, grain (mean |ΔL| between neighbours),
   * the mean per-channel difference in 8-bit levels and the share of pixels within 2 levels.
   */
  live.parity = function (opts) {
    const o = Object.assign({ mode: 'smear', width: 480, height: 320, seed: 7 }, opts), w = o.width, h = o.height;
    const a = document.createElement('canvas');
    const t0 = performance.now();
    const pix = runStill(a, o, w, h, w);
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { gpu: false };
    const v = { canvas: b, o: Object.assign({}, MOTION, o), R, w, h, cssW: w, dpr: 1 };
    v.st = { clock: 0, env: 0, sweep: 0, lo: o.lo || MOTION.lo, mosh: 0, dim: 0, load: 1, reveal: null, thumb: null, pulses: [], tear: { x: 0, y: 0, amp: 0, dx: 1, dy: 0, stretch: 0 } };
    v.src = { canvas: a, w, h, pix: Math.max(1, pix), k: 1 };
    drawGPU(v);
    const gpu = new Uint8Array(w * h * 4);
    R.gl.readPixels(0, 0, w, h, R.gl.RGBA, R.gl.UNSIGNED_BYTE, gpu);
    const cpu = a.getContext('2d').getImageData(0, 0, w, h).data;
    const lost = R.gl.getExtension('WEBGL_lose_context'); if (lost) lost.loseContext();
    const stats = (px, flip) => {
      const L = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((flip ? h - 1 - y : y) * w + x) * 4;
        L[y * w + x] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      }
      let m = 0; for (const l of L) m += l; m /= L.length;
      let s = 0; for (const l of L) s += (l - m) * (l - m); s = Math.sqrt(s / L.length);
      let g = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) g += Math.abs(L[y * w + x + 1] - L[y * w + x]); g /= h * (w - 1);
      return { mean: m, sd: s, grain: g };
    };
    const A = stats(cpu, false), B = stats(gpu, true);
    let mad = 0, within2 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, j = ((h - 1 - y) * w + x) * 4;
      let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(cpu[i + c] - gpu[j + c]));
      mad += (Math.abs(cpu[i] - gpu[j]) + Math.abs(cpu[i + 1] - gpu[j + 1]) + Math.abs(cpu[i + 2] - gpu[j + 2])) / 3;
      if (d <= 2) within2++;
    }
    const r4 = x => +x.toFixed(4);
    return {
      mode: typeof o.mode === 'string' ? o.mode : 'draw', seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
      mean: [r4(A.mean), r4(B.mean)], sd: [r4(A.sd), r4(B.sd)], grain: [r4(A.grain), r4(B.grain)],
      dMean: r4(Math.abs(A.mean - B.mean)), dSdRel: r4(Math.abs(A.sd - B.sd) / (A.sd || 1)), dGrainRel: r4(Math.abs(A.grain - B.grain) / (A.grain || 1)),
      madLevels: +(mad / (w * h)).toFixed(3), within2: r4(within2 / (w * h)),
    };
  };
  live.TOLERANCE = { dMean: 0.004, dSdRel: 0.02, dGrainRel: 0.03, madLevels: 1.5 };
  live.pass = r => !!r && r.dMean <= live.TOLERANCE.dMean && r.dSdRel <= live.TOLERANCE.dSdRel && r.dGrainRel <= live.TOLERANCE.dGrainRel && r.madLevels <= live.TOLERANCE.madLevels;

  const registry = root.handPulledLive = root.handPulledLive || { views: [], parity: {} };
  registry.parity['pixelsort-glitch'] = () => [
    live.parity({ mode: 'smear', seed: 6, scene: 6 }),
    live.parity({ mode: 'wave', variant: 'ripple', seed: 2, scene: 6 }),
    live.parity({ mode: 'drip', seed: 4, scene: 6 }),
    live.parity({ mode: 'sorted', seed: 3, scene: 6, width: 320, height: 96 }),
    live.parity({ mode: 'fall', variant: 'ink', seed: 4, scene: 6 }),
    live.parity({ mode: 'band', variant: 'tape', seed: 3, scene: 6 }),
    live.parity({ mode: 'mosh', variant: 'melt', seed: 2, scene: 6 }),
    live.parity({ mode: 'weave', variant: 'plaid', seed: 2, scene: 6 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) }));
  G.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
