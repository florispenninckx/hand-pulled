/* live.js — Pour.live(): a poured sheet that is still wet.
 *
 * The still engine (pour.js) is the reference. Capture-first: the still paints the sheet once
 * on the CPU without its grain (the `capture` hook also hands over the field under the paint),
 * both go to the GPU as textures, and every frame a fragment shader
 *   1. moves where each pixel reads the paint from (the live terms below),
 *   2. adds the still's film grain back with the same integer hash, on top, unmoved.
 * Every live term is multiplied by something that is zero at time 0 with the defaults, so
 * frame 0 is the still; live.parity() measures that.
 *
 *   const ctl = Pour.live(canvas, { mode: 'marble', ramp: 'acidnight', seed: 3,   // still options
 *                                   drift: 1, pointer: 1, clickPulse: true });     // motion options
 *   ctl.set({ wet: 1 }); ctl.pulse(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * Motion is the pour's own: the paint keeps sliding along its level lines and settling
 * across them (drift), the pointer is a comb dragged through it (pointer), a click is a drop
 * that pushes the paint out in a ring (pulse), and a section is poured in from the top when
 * it scrolls into view (develop: 'in' | 'scroll'); controls pour from the left up to a value
 * (reveal). The grain boils like film (grainRate). Big canvases get their own context;
 * small ones share one offscreen context and receive frames as ImageBitmaps. Without WebGL2
 * every canvas falls back to the CPU still; with reduced motion every canvas shows its still
 * frame and changes state without animating.
 *
 * Original implementation. MIT.
 */
(function (root) {
  'use strict';
  const P = root.Pour;
  if (!P || !P.seedInt) throw new Error('live.js: load pour.js first');
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  // motion options: changing these never repaints the sheet
  const MOTION = {
    drift: 1, speed: 1, wet: 1, pointer: 0, reach: 0.16, lag: 0.12, tooth: 14, hand: null, clickPulse: false,
    develop: 1, developMs: 1800, ease: 0.18, scrollRange: [0, 1], grainRate: 24, alive: true, boil: 0.3,
    reveal: null, ring: null, ground: 'night', own: null, resolution: 1, maxField: 1.2e6,
  };

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uImg;    // the still without grain, top row first
uniform sampler2D uF;      // the field g on the still's coarse grid (R32F, nearest)
uniform vec2 uSize;        // view, device px
uniform vec3 uFGrid;       // gw, gh, step (image px)
uniform vec2 uImgK;        // image px per view px, S of the image
uniform float uHasF;
uniform vec4 uFlow;        // along level lines (px), across (px), wave (px), S (view px)
uniform float uClock;
uniform vec4 uComb;        // x, y, reach, amp (px)
uniform vec3 uCombDir;     // dx, dy, tooth spacing (px)
uniform vec4 uPulse[4]; uniform int uNPulse;   // x, y, ring radius, amp (px)
uniform float uGrain, uGs, uBoil; uniform uint uGSeed, uGSeed2;
uniform float uPour;       // 0..1: poured in from the top
uniform vec3 uGround;
uniform vec2 uReveal;      // x fraction (<0 off), soft px
uniform vec4 uRing;        // pad, band, radius (px), on
out vec4 outc;

// the still's hash, bit for bit: pour.js hash(i, j, s)
uint hsh(int i, int j, uint s) {
  uint h = uint(i) * 374761393u + uint(j) * 668265263u + s * 1274126177u;
  h = (h ^ (h >> 13)) * 1103515245u; h ^= h >> 16; return h;
}
float h01(int i, int j, uint s) { return float(hsh(i, j, s)) / 4294967296.0; }
float G(int i, int j) { return texelFetch(uF, ivec2(clamp(i, 0, int(uFGrid.x) - 1), clamp(j, 0, int(uFGrid.y) - 1)), 0).r; }
// the field as the still reads it (bilinear on its grid), and its slope over a wide span, so the flow is smooth
float gv(vec2 q) {
  vec2 f = q / uFGrid.z; ivec2 ij = ivec2(floor(f)); vec2 uv = f - vec2(ij);
  return mix(mix(G(ij.x, ij.y), G(ij.x + 1, ij.y), uv.x), mix(G(ij.x, ij.y + 1), G(ij.x + 1, ij.y + 1), uv.x), uv.y);
}
vec2 slope(vec2 q, float d) { return vec2(gv(q + vec2(d, 0.)) - gv(q - vec2(d, 0.)), gv(q + vec2(0., d)) - gv(q - vec2(0., d))) / (2. * d); }
float vn(float x) { float i = floor(x), f = x - i; f = f * f * (3. - 2. * f); return mix(h01(int(i), 7, 91u), h01(int(i) + 1, 7, 91u), f); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);   // pixel centre, top-down, like the still
  float S = uFlow.w;
  vec2 off = vec2(0.);
  // 1. the paint still flowing: along its level lines, a little across them, and a slow swell
  if (uHasF > .5 && (uFlow.x != 0. || uFlow.y != 0.)) {
    vec2 g = slope(p * uImgK.x, .03 * uImgK.y) * uImgK.y; float gl = length(g);
    vec2 n = g / max(1., gl * .5);
    off += uFlow.x * vec2(-n.y, n.x) + uFlow.y * n;
  }
  if (uFlow.z != 0.) off += uFlow.z * vec2(sin(p.y / S * 5.1 + uClock * .41), cos(p.x / S * 4.3 - uClock * .33));
  // 2. the comb: paint dragged along the pointer's way, in teeth across it
  if (uComb.w > 0.) {
    vec2 d = p - uComb.xy; float r2 = dot(d, d) / (uComb.z * uComb.z);
    if (r2 < 9.) {
      vec2 nr = vec2(-uCombDir.y, uCombDir.x);
      float teeth = .5 + .5 * cos(6.2831853 * dot(d, nr) / uCombDir.z);
      off -= uCombDir.xy * uComb.w * exp(-r2) * teeth;
    }
  }
  // 3. drops: each pushes the paint out in a ring that spreads and settles
  for (int i = 0; i < 4; i++) {
    if (i >= uNPulse) break;
    vec2 d = p - uPulse[i].xy; float r = length(d), w = .05 * S + .25 * uPulse[i].z;
    off -= d / max(r, 1.) * uPulse[i].w * exp(-pow((r - uPulse[i].z) / w, 2.));
  }
  // 4. poured in from the top: the front runs down with a drippy edge, the paint above still sliding
  float front = 1e9;
  if (uPour < 1.) {
    float drip = .09 * S;
    front = uPour * (uSize.y + 2. * drip) - drip + drip * vn(p.x / (.045 * S)) + drip * .5 * vn(p.x / (.013 * S) + 40.);
    off.y -= (1. - uPour) * .18 * S * smoothstep(front - .5 * S, front, p.y);
  }
  vec3 col = texture(uImg, clamp(p + off, vec2(.5), uSize - .5) / uSize).rgb;
  if (uPour < 1.) {
    float m = smoothstep(front + 1., front - 1., p.y);
    col = mix(col, col * .72, exp(-pow((front - p.y) / (.012 * S), 2.)) * m);   // the bead at the front
    col = mix(uGround, col, m);
  }
  // 5. controls: the paint poured from the left up to a value, its edge running
  if (uReveal.x >= 0.) {
    float e = uReveal.x * uSize.x + uReveal.y * (vn(p.y / (.18 * uSize.y) + 3.) - .5) * 2.;
    col = mix(uGround, col, smoothstep(e + 1., e - 1., p.x));
  }
  // 6. the still's film grain, on top and unmoved; a share of the specks re-rolled per tick
  if (uGrain > 0.) {
    ivec2 b = ivec2(floor(p / uGs));
    float n = h01(b.x, b.y, uGSeed);
    if (uBoil > 0. && h01(b.x, b.y, uGSeed2 + 7u) < uBoil) n = h01(b.x, b.y, uGSeed2);
    col += (n - .5) * uGrain * 46. / 255.;
  }
  col = clamp(col, 0., 1.);
  float a = 1.;
  if (uRing.w > 0.) {
    vec2 hs = uSize * .5 - uRing.x; float r = min(uRing.z, min(hs.x, hs.y));
    vec2 q = abs(p - uSize * .5) - (hs - r);
    float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
    a = 1. - smoothstep(uRing.y * .5 - .8, uRing.y * .5 + .8, abs(d));
  }
  outc = vec4(col * a, a);
}`;

  // ---------------------------------------------------------------- renderers
  function compile(gl, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
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
    const setup = () => { R.prog = compile(gl, FS); R.gen++; return !!R.prog; };
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
  const U = (gl, Pr, n) => (n in Pr.u) ? Pr.u[n] : (Pr.u[n] = gl.getUniformLocation(Pr.p, n));
  function texture(gl, w, h, internal, format, type, data, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // ---------------------------------------------------------------- the still, captured
  const DROP = { width: 1, height: 1, capture: 1 };
  function stillOpts(o) { const s = {}; for (const k in o) if (!(k in MOTION) && !(k in DROP) && o[k] !== undefined) s[k] = o[k]; return s; }
  const grainOf = so => so.grain != null ? +so.grain : ((P.MODES[so.mode || 'swirl'] || {}).grain || 0);
  // paint the sheet once at iw×ih without grain; keep its field
  function build(v) {
    const o = v.o, so = stillOpts(o), w = v.w, h = v.h;
    const k = Math.min(1, Math.sqrt(o.maxField / (w * h))), iw = Math.max(2, Math.round(w * k)), ih = Math.max(2, Math.round(h * k));
    const cv = document.createElement('canvas'); cv.width = iw; cv.height = ih;
    let cap = null;
    const collage = so.mode === 'collage';                        // tiles carry their own grain: it stays baked in
    P.paint(cv, collage ? so : Object.assign({}, so, { grain: 0, capture: c => { cap = c; } }));
    const px = cv.getContext('2d').getImageData(0, 0, iw, ih).data;
    v.src = {
      px: new Uint8Array(px.buffer.slice(0)), iw, ih, F: cap && cap.F, sheet: cv,
      grain: collage ? 0 : grainOf(so), gs: so.grainSize || 1, si: P.seedInt(so.seed == null ? 1 : so.seed),
      ground: P.rgb(o.ground || 'night').map(x => x / 255),
    };
    v.g = null; v.dirty = true;
  }
  function upload(v) {
    const gl = v.R.gl, s = v.src;
    if (v.g && v.g.gen === v.R.gen) { gl.deleteTexture(v.g.img); gl.deleteTexture(v.g.F); }
    const img = texture(gl, s.iw, s.ih, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, s.px, gl.LINEAR);
    const F = s.F ? texture(gl, s.F.gw, s.F.gh, gl.R32F, gl.RED, gl.FLOAT, s.F.g, gl.NEAREST) : texture(gl, 1, 1, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(1), gl.NEAREST);
    v.g = { img, F, gen: v.R.gen, src: s };
  }

  function drawGPU(v) {
    const R = v.R, gl = R.gl, s = v.src, w = v.w, h = v.h, st = v.st, o = v.o;
    if (R.lost || !s || !R.prog) return false;
    if (!v.g || v.g.gen !== R.gen || v.g.src !== s) upload(v);
    const cv = R.canvas;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const Pr = R.prog, u = n => U(gl, Pr, n), S = Math.min(w, h), c = st.clock;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(Pr.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.g.img); gl.uniform1i(u('uImg'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, v.g.F); gl.uniform1i(u('uF'), 1);
    gl.uniform2f(u('uSize'), w, h);
    const F = s.F;
    gl.uniform3f(u('uFGrid'), F ? F.gw : 1, F ? F.gh : 1, F ? F.step : 1);
    gl.uniform2f(u('uImgK'), s.iw / w, Math.min(s.iw, s.ih));
    gl.uniform1f(u('uHasF'), F ? 1 : 0);
    // all three flow terms carry env (0 at clock 0) and a phase that starts at 0
    const a = st.env * o.drift * st.wet * S;
    gl.uniform4f(u('uFlow'), a * 0.011 * Math.sin(c * 0.37), a * 0.006 * (1 - Math.cos(c * 0.23)), a * 0.004 * Math.sin(c * 0.19), S);
    gl.uniform1f(u('uClock'), c);
    const cb = st.comb;
    gl.uniform4f(u('uComb'), cb.x, cb.y, o.reach * S, cb.amp * o.pointer * Math.min(0.07 * S, cb.speed * 0.06));
    gl.uniform3f(u('uCombDir'), cb.dx, cb.dy, o.tooth * v.dpr);
    const pu = new Float32Array(16); st.pulses.slice(0, 4).forEach((q, i) => pu.set([q.x, q.y, q.rho, q.amp], i * 4));
    gl.uniform4fv(u('uPulse'), pu); gl.uniform1i(u('uNPulse'), Math.min(4, st.pulses.length));
    gl.uniform1f(u('uGrain'), s.grain); gl.uniform1f(u('uGs'), s.gs);
    gl.uniform1ui(u('uGSeed'), (s.si + 31) >>> 0); gl.uniform1ui(u('uGSeed2'), (s.si + 31 + st.gk * 7919) >>> 0);
    gl.uniform1f(u('uBoil'), st.gk ? o.boil : 0);
    gl.uniform1f(u('uPour'), st.expose);
    gl.uniform3f(u('uGround'), s.ground[0], s.ground[1], s.ground[2]);
    gl.uniform2f(u('uReveal'), st.reveal == null ? -1 : st.reveal, 0.05 * h);
    const rg = o.ring;
    gl.uniform4f(u('uRing'), rg ? (rg.pad || 0) * v.dpr : 0, rg ? (rg.band || 3) * v.dpr : 0, rg ? (rg.radius || 0) * v.dpr : 0, rg ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function present(v) {
    const R = v.R;
    if (R.canvas === v.canvas) return;
    if (R.offscreen) v.ctx.transferFromImageBitmap(R.canvas.transferToImageBitmap());
    else { v.ctx.globalCompositeOperation = 'copy'; v.ctx.drawImage(R.canvas, 0, 0); }
  }

  // ---------------------------------------------------------------- CPU fallback: the still, with state but no motion
  function drawCPU(v) {
    const s = v.src, st = v.st, ctx = v.ctx, w = v.w, h = v.h;
    if (!s) return;
    if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
    if (!s.full) {                                                  // the still with its grain, once
      const c = document.createElement('canvas'); c.width = s.iw; c.height = s.ih;
      P.paint(c, stillOpts(v.o)); s.full = c;
    }
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(s.full, 0, 0, w, h); ctx.globalCompositeOperation = 'source-over';
    const gcol = 'rgb(' + s.ground.map(x => Math.round(x * 255)).join(',') + ')';
    if (st.reveal != null) { ctx.fillStyle = gcol; ctx.fillRect(Math.round(st.reveal * w), 0, w, h); }
    if (v.o.ring) {
      const rg = v.o.ring, d = v.dpr, pad = (rg.pad || 0) * d, band = (rg.band || 3) * d;
      ctx.globalCompositeOperation = 'destination-in'; ctx.lineWidth = band; ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(pad, pad, w - 2 * pad, h - 2 * pad, (rg.radius || 0) * d) : ctx.rect(pad, pad, w - 2 * pad, h - 2 * pad); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
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
    const o = Object.assign({ mode: 'swirl' }, MOTION, opts);
    const v = { canvas, o, R: null, ctx: null, src: null, g: null, dirty: true, paused: false, visible: false, frames: 0, dpr: 1, w: 0, h: 0, cssW: 1, cssH: 1, ratio: 0 };
    v.st = { clock: 0, env: 0, wet: o.wet, expose: typeof o.develop === 'number' ? clamp01(o.develop) : 0, gk: 0, lastGk: -1, reveal: o.reveal, inStart: 0,
      comb: { x: 0, y: 0, tx: 0, ty: 0, dx: 1, dy: 0, speed: 0, amp: 0, on: false, seen: false }, pulses: [] };
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

    function exposeTarget(now) {
      const d = o.develop;
      if (d === 'in') {
        if (still()) return 1;
        if (!v.st.inStart) return 0;
        const t = clamp01((now - v.st.inStart) / o.developMs);
        return 1 - Math.pow(1 - t, 3);
      }
      if (d === 'scroll') {
        const r = canvas.getBoundingClientRect(), vh = root.innerHeight || 1, [a, b] = o.scrollRange;
        if (still()) return b;
        return a + (b - a) * clamp01((vh - r.top) / (vh * 0.75));
      }
      return clamp01(+d);
    }
    const lerp = (a, b, k) => a + (b - a) * k;

    function tick(now, dt) {
      const st = v.st, rm = still();
      let moving = false;
      const k = rm ? 1 : 1 - Math.exp(-dt / Math.max(0.001, o.ease));
      if (!rm && o.drift > 0 && (o.wet > 0 || st.wet > 1e-3)) { st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 3); moving = true; }
      else if (rm) { st.clock = 0; st.env = 0; }
      if (Math.abs(st.wet - o.wet) > 1e-3) { st.wet = lerp(st.wet, o.wet, k); moving = moving || (o.drift > 0 && !rm); } else st.wet = o.wet;
      const e = exposeTarget(now);
      if (o.develop === 'in' && st.inStart && !rm && now - st.inStart < o.developMs) { st.expose = e; moving = true; }
      else if (Math.abs(st.expose - e) > 1e-3 && !rm) { st.expose = lerp(st.expose, e, k); moving = true; }
      else st.expose = e;
      if (o.develop === 'scroll' && !rm) moving = true;
      if (o.reveal == null) st.reveal = null;
      else if (st.reveal == null || rm || Math.abs(st.reveal - o.reveal) < 1e-3) { if (st.reveal !== o.reveal) v.dirty = true; st.reveal = o.reveal; }
      else { st.reveal = lerp(st.reveal, o.reveal, k); moving = true; }
      const cb = st.comb;
      if (!rm && o.pointer) {
        const kl = 1 - Math.exp(-dt / Math.max(0.01, o.lag)), px = cb.x, py = cb.y;
        cb.x = lerp(cb.x, cb.tx, kl); cb.y = lerp(cb.y, cb.ty, kl);
        const vx = (cb.x - px) / Math.max(dt, 1e-3), vy = (cb.y - py) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vy);
        if (sp > 2) { cb.dx = vx / sp; cb.dy = vy / sp; }
        cb.speed = lerp(cb.speed, sp, 1 - Math.exp(-dt / 0.12));
        cb.amp = lerp(cb.amp, cb.on ? 1 : 0, 1 - Math.exp(-dt / 0.25));
        if (cb.amp > 0.002 || cb.on || cb.speed > 1) moving = true; else cb.amp = 0;
      } else cb.amp = 0;
      st.pulses = rm ? [] : st.pulses.filter(q => now - q.t0 < 2400);
      for (const q of st.pulses) {
        const a = (now - q.t0) / 1000, S = Math.min(v.w, v.h);
        q.rho = S * (0.02 + 0.42 * (1 - Math.exp(-a / 0.55)));           // a drop spreading on the surface
        q.amp = q.s * S * 0.06 * (1 - Math.exp(-a / 0.04)) * Math.exp(-a / 0.7);
        moving = true;
      }
      st.gk = o.alive && !rm && o.grainRate > 0 ? Math.floor(now / 1000 * o.grainRate) : 0;
      return moving;
    }

    v.resize = force => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      v.cssW = r.width; v.cssH = r.height;
      v.dpr = Math.min(2, root.devicePixelRatio || 1) * o.resolution;
      const w = Math.max(2, Math.round(r.width * v.dpr)), h = Math.max(2, Math.round(r.height * v.dpr));
      if (w === v.w && h === v.h) return false;
      if (!force && v.src) return true;
      v.w = w; v.h = h;
      if (v.R && v.R.canvas === canvas) { canvas.width = w; canvas.height = h; }
      return true;
    };
    v.run = (now, dt) => {
      if ((v.paused && v.frames) || !v.visible || !v.src) return false;
      if (o.develop === 'in' && !v.st.inStart && v.ratio >= 0.25) v.st.inStart = now;
      const moving = tick(now, dt);
      const grainTick = o.alive && !still() && v.st.gk !== v.st.lastGk;
      if (!(moving || grainTick || v.dirty)) return o.alive && !still();
      if (v.R) { if (drawGPU(v)) { present(v); v.frames++; v.st.lastGk = v.st.gk; v.dirty = false; } }
      else { drawCPU(v); v.frames++; v.dirty = false; }
      return (moving || (o.alive && !still())) && !!v.R;
    };

    // pointer: the hand is the canvas's parent by default, since a background canvas sits under content
    const hand = o.hand || canvas.parentElement || canvas;
    const at = e => { const r = canvas.getBoundingClientRect(), k = v.w / (r.width || 1); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    const onMove = e => {
      if (!o.pointer) return;
      const [x, y] = at(e), cb = v.st.comb;
      if (!cb.seen) { cb.x = x; cb.y = y; cb.seen = true; }
      cb.tx = x; cb.ty = y; cb.on = true; wake();
    };
    const onLeave = e => { if (e.pointerType !== 'mouse' || e.type === 'pointerleave') { v.st.comb.on = false; wake(); } };
    const onDown = e => { onMove(e); if (o.clickPulse) { const [x, y] = at(e); api.pulseAt(x, y, 0.8); } };
    hand.addEventListener('pointermove', onMove, { passive: true });
    hand.addEventListener('pointerdown', onDown, { passive: true });
    hand.addEventListener('pointerleave', onLeave, { passive: true });
    hand.addEventListener('pointerup', onLeave, { passive: true });
    hand.addEventListener('pointercancel', onLeave, { passive: true });

    const io = new IntersectionObserver(es => es.forEach(en => { v.visible = en.isIntersecting; v.ratio = en.intersectionRatio; if (v.visible) wake(); }), { rootMargin: '120px 0px', threshold: [0, 0.25, 0.5] });
    io.observe(canvas);
    let rzT;
    const ro = new ResizeObserver(() => {
      if (!v.started) { first(); return; }
      if (!v.src || !v.resize(false)) return;
      clearTimeout(rzT);
      rzT = setTimeout(() => queueBuild(v), 160);
    });
    ro.observe(canvas);

    const api = {
      canvas,
      /** merge options: motion options apply next frame, still options repaint the sheet */
      set(n) {
        const look = Object.keys(n).filter(k => !(k in MOTION) && n[k] !== o[k]);
        Object.assign(o, n);
        if (n.develop === 'in') v.st.inStart = 0;
        if ('ground' in n && v.src) v.src.ground = P.rgb(o.ground).map(x => x / 255);
        if (look.length) queueBuild(v);
        v.dirty = true; wake(); return api;
      },
      /** a new sheet: every still option is dropped and `n` (mode + its options) put in their place */
      load(n) {
        for (const k of Object.keys(o)) if (!(k in MOTION)) delete o[k];
        Object.assign(o, { mode: 'swirl' }, n);
        queueBuild(v); v.dirty = true; wake(); return api;
      },
      /** a drop at (x, y) in CSS px of the canvas; strength ~0.3–1 */
      pulse(x, y, s) { const k = v.w / (v.cssW || 1); return api.pulseAt(x * k, y * k, s); },
      pulseAt(x, y, s) {
        if (still()) return api;
        v.st.pulses.push({ x, y, s: s == null ? 0.6 : s, t0: performance.now(), amp: 0, rho: 0 });
        if (v.st.pulses.length > 4) v.st.pulses.shift();
        wake(); return api;
      },
      /** drag the comb yourself (CSS px), or lift it with point(null) */
      point(x, y) {
        const cb = v.st.comb, k = v.w / (v.cssW || 1);
        if (x == null) cb.on = false; else { cb.tx = x * k; cb.ty = y * k; if (!cb.seen) { cb.x = cb.tx; cb.y = cb.ty; cb.seen = true; } cb.on = true; }
        wake(); return api;
      },
      pause() { v.paused = true; return api; },
      resume() { v.paused = false; v.dirty = true; wake(); return api; },
      destroy() {
        views.delete(v); io.disconnect(); ro.disconnect(); clearTimeout(rzT);
        for (const [t, f] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerleave', onLeave], ['pointerup', onLeave], ['pointercancel', onLeave]]) hand.removeEventListener(t, f);
        if (v.R && v.g) { v.R.gl.deleteTexture(v.g.img); v.R.gl.deleteTexture(v.g.F); }
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        const i = registry.views.indexOf(api); if (i >= 0) registry.views.splice(i, 1);
      },
      state() { return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.expose.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src, reduced: still() }; },
      /** time n frames with every live term on: `sync` waits for the GPU after each frame (median), `pipelined` waits once */
      bench(n) {
        if (!v.R || !v.src) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st, keep = { clock: st.clock, env: st.env, expose: st.expose, wet: st.wet, gk: st.gk, comb: Object.assign({}, st.comb), pulses: st.pulses };
        Object.assign(st, { env: 1, wet: 1, expose: 0.6 }); Object.assign(st.comb, { x: v.w / 2, y: v.h / 2, amp: 1, speed: 800 });
        st.pulses = [0, 1, 2, 3].map(i => ({ x: v.w * (0.2 + 0.2 * i), y: v.h / 2, rho: v.h * 0.2, amp: 10 }));
        const step = () => { st.gk++; st.clock += 1 / 60; drawGPU(v); };
        step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) { const t0 = performance.now(); step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
        const t0 = performance.now();
        for (let i = 0; i < n; i++) step();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n;
        Object.assign(st, keep); st.comb = keep.comb;
        drawGPU(v); present(v);
        ts.sort((a, b) => a - b);
        return { sync: +ts[ts.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), size: [v.w, v.h], path: api.state().path };
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
  // for tests: draw one frame of a view at clock t (s) with full drift, no rAF needed
  live._frame = (ctl, t) => { const v = ctl._v; if (t != null) Object.assign(v.st, { clock: t, env: 1 }); if (v.R) { drawGPU(v); present(v); } else drawCPU(v); };
  live.stats = () => ({ views: views.size, jsMsLastFrame: +lastCost.toFixed(2) });

  /**
   * live.parity(opts): paint the still with the CPU engine and frame 0 on the GPU at the same size,
   * ramp and seed, and compare mean luminance, contrast (SD), grain (mean |ΔL| between neighbours),
   * the mean per-channel difference in 8-bit levels and the share of pixels within 2 levels.
   */
  live.parity = function (opts) {
    const o = Object.assign({ mode: 'swirl', width: 480, height: 320, seed: 7 }, opts), w = o.width, h = o.height;
    const a = document.createElement('canvas'); a.width = w; a.height = h;
    const t0 = performance.now();
    P.paint(a, stillOpts(o));
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { gpu: false };
    const v = { canvas: b, o: Object.assign({}, MOTION, o, { maxField: Infinity }), R, w, h, cssW: w, dpr: 1 };
    v.st = { clock: 0, env: 0, wet: 1, expose: 1, gk: 0, reveal: null, comb: { x: 0, y: 0, dx: 1, dy: 0, speed: 0, amp: 0 }, pulses: [] };
    build(v);
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
      mode: o.mode, ramp: typeof o.ramp === 'string' ? o.ramp : undefined, seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
      mean: [r4(A.mean), r4(B.mean)], sd: [r4(A.sd), r4(B.sd)], grain: [r4(A.grain), r4(B.grain)],
      dMean: r4(Math.abs(A.mean - B.mean)), dSdRel: r4(Math.abs(A.sd - B.sd) / (A.sd || 1)), dGrainRel: r4(Math.abs(A.grain - B.grain) / (A.grain || 1)),
      madLevels: +(mad / (w * h)).toFixed(3), within2: r4(within2 / (w * h)),
    };
  };
  live.TOLERANCE = { dMean: 0.004, dSdRel: 0.02, dGrainRel: 0.03, madLevels: 1.5 };
  live.pass = r => !!r && r.dMean <= live.TOLERANCE.dMean && r.dSdRel <= live.TOLERANCE.dSdRel && r.dGrainRel <= live.TOLERANCE.dGrainRel && r.madLevels <= live.TOLERANCE.madLevels;
  live.MOTION = MOTION;

  // the page-level registry tools/check.sh reads: every controller, and each skill's parity cases
  const registry = root.handPulledLive = root.handPulledLive || { views: [], parity: {} };
  registry.parity['maximalist-boc'] = () => [
    live.parity({ mode: 'swirl', ramp: 'ultra klein-20 ultra cornflower acid citric', seed: 1, scale: 0.62, warp: 0.8, octaves: 2, contrast: 1.6, grain: 0.6 }),
    live.parity({ mode: 'marble', seed: 3 }),
    live.parity({ mode: 'moire', seed: 5 }),
    live.parity({ mode: 'chrome', ramp: 'slick', seed: 8, cycle: 0.7 }),
    live.parity({ mode: 'dash', seed: 2, mosh: 0.4, scan: 3 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) }));
  P.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
