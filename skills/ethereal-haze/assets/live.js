/* live.js — Haze.live(): an ethereal-haze image, breathing.
 *
 * The still engine (haze.js) is the reference. Every image there is made in two stages:
 *   1. the scene: painted small, then blurred the way its subject blurs (a lens disc, a
 *      moving shutter, a spray) — irregular canvas work, so it runs ONCE on the CPU through
 *      the `capture` hook and is uploaded as a texture at full device size (the same
 *      high-quality upscale the still makes);
 *   2. the print: finish() ported to a fragment shader line by line — the same 512² tile
 *      of grain and scatter offsets (uploaded, not re-hashed), the same scatter, saturation,
 *      vignette, veil and midtone-weighted grain, the same clamp points.
 * Frame 0 at clock 0 with the defaults is the still; live.parity() measures that.
 *
 *   const ctl = Haze.live(canvas, { fn: 'field', form: 'fold', seed: 4,   // still options
 *                                   drift: 1, mist: 1, bloom: 0.35 });     // motion options
 *   ctl.set({ focus: 0.6 }); ctl.pulse(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * Motion belongs to the medium: fog drifting under the soft image and breathing in and out
 * as mist, a focus pull (soft ↔ sharp) that follows scroll, the pointer or set(), light
 * swelling toward the pointer as through gauze, and pulse() as a soft bloom of light. Grain
 * is re-rolled slowly (12 per second); the stipple of the edges stays where it is. Big
 * canvases get their own WebGL2 context; small ones share one offscreen context and receive
 * frames as ImageBitmaps. Without WebGL2 a canvas is the CPU still; with reduced motion it
 * shows its still frame and changes state without animating.
 *
 * Original implementation.
 */
(function (root) {
  'use strict';
  const H = root.Haze;
  if (!H) throw new Error('live.js: load haze.js first');
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  const FNS = ['bloom', 'field', 'ribbon', 'silk', 'meadow', 'poppies'];
  // motion options: changing these never recomputes the image
  const MOTION = {
    fn: 'field', image: null, look: null,
    drift: 1, driftScale: 0.35, pace: 1, mist: 0.5, breath: 0.35, breathPeriod: 11,
    focus: 0, focusScroll: 0, focusRadius: 0.012, sharpen: 0.35, enter: false, enterMs: 2200,
    pointer: true, bloom: 0.3, radius: 0.3, lag: 0.25, glow: '#fff1e2', hand: null, clickPulse: false,
    grainRate: 12, reveal: null, revealPaper: '#f3ede1', ease: 0.12, own: null,
  };

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  // finish() from haze.js, plus the live terms — every one of them exactly zero at clock 0
  const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uSrc, uG, uD;
uniform vec2 uSize;
uniform float uSc, uAmp, uChroma, uSat, uVeil, uVig; uniform vec3 uVc;
uniform int uRoll;
uniform vec4 uDrift;                          // amplitude px, clock s, scale px, speed
uniform vec2 uMist;                           // mist lift (gated), breath lift (gated)
uniform vec4 uFocus;                          // global -1 sharp .. 1 soft, tap radius px, pointer sharpen, 0
uniform vec4 uPtr;                            // x, y px (top-down), radius px, amount
uniform vec3 uGlow;                           // 0..255
uniform vec4 uPulse[4]; uniform int uNPulse;  // x, y, radius px, amount
uniform float uReveal; uniform vec3 uPaper;
out vec4 outc;
float G(int i) { return texelFetch(uG, ivec2(i & 511, i >> 9), 0).r; }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fb(vec2 p) { return .6 * vn(p) + .3 * vn(p * 2.1 + 7.3) + .1 * vn(p * 4.3 + 1.7); }
vec3 at(vec2 p) { return texture(uSrc, (p + .5) / uSize).rgb * 255.; }
void main() {
  ivec2 ip = ivec2(int(gl_FragCoord.x), int(uSize.y - gl_FragCoord.y));
  vec2 xy = vec2(ip);
  int j = ((ip.y & 511) << 9) | (ip.x & 511);
  vec2 s = xy;
  if (uSc >= .5) { vec2 d = texelFetch(uD, ivec2(ip.x & 511, ip.y & 511), 0).rg; s = floor(clamp(xy + d * uSc, vec2(0.), uSize - 1.)); }
  // fog: the soft image slides along a slow noise field (the difference from clock 0, so frame 0 is still)
  float t = uDrift.y * uDrift.w;
  vec2 q = s / uDrift.z, disp = vec2(0.);
  if (uDrift.x > 0. && t != 0.) {
    vec2 o2 = vec2(5.2, 1.3);
    disp = (vec2(fb(q + vec2(t * .031, t * .017)), fb(q + o2 - vec2(t * .019, t * .027))) - vec2(fb(q), fb(q + o2)) ) * uDrift.x;
  }
  vec2 dp = s - uPtr.xy; float pw = uPtr.w > 0. ? exp(-dot(dp, dp) / (2. * uPtr.z * uPtr.z)) : 0.;
  float f = uFocus.x - uFocus.z * pw;
  vec3 c = (disp == vec2(0.)) ? texelFetch(uSrc, ivec2(s), 0).rgb * 255. : at(s + disp);
  if (abs(f) > .001) {   // focus pull: a small lens disc around the sample; negative = unsharp, the rim comes back
    vec3 b = c; float r = uFocus.y;
    for (int k = 0; k < 8; k++) { float a = float(k) * 2.39996 + .4, rr = r * sqrt((float(k) + .5) / 8.); b += at(s + disp + rr * vec2(cos(a), sin(a))); }
    b /= 9.;
    c = f > 0. ? mix(c, b, min(f, 1.)) : c + (c - b) * min(-f, 1.) * 1.4;
  }
  if (uSat != 1.) { float l = .299 * c.r + .587 * c.g + .114 * c.b; c = l + (c - l) * uSat; }
  if (uVig != 0.) { vec2 cc = uSize * .5, e = xy - cc; float qq = dot(e, e) / dot(cc, cc); c *= 1. - uVig * qq * qq; }
  if (uVeil != 0.) c += (uVc - c) * uVeil;
  // mist: pale patches drifting through, breathing in and out; the lift is toward the warm glow
  float lift = 0.;
  if (uMist.x > 0.) lift += uMist.x * smoothstep(.42, .78, fb(q * .55 + vec2(t * .022, -t * .014)));
  lift += uMist.y;
  // light through gauze: swelling toward the pointer, and each pulse a soft bloom
  lift += uPtr.w * pw;
  for (int k = 0; k < 4; k++) { if (k >= uNPulse) break; vec2 e = s - uPulse[k].xy; lift += uPulse[k].w * exp(-dot(e, e) / (2. * uPulse[k].z * uPulse[k].z)); }
  if (lift > 0.) c = 255. - (255. - c) * (1. - min(lift, .9) * uGlow / 255.);
  if (uReveal < 1.5) { float m = clamp((s.x / uSize.x - uReveal) / .015 + .5, 0., 1.); c = mix(c, uPaper, m); }
  if (uAmp > 0.) {
    int gj = (j + uRoll) & 262143;
    float l = clamp((c.r + c.g + c.b) / 765., 0., 1.), a = uAmp * (.42 + 2.3 * l * (1. - l)), n = G(gj) * a;
    if (uChroma > 0.) { float cc = a * uChroma; c += n + vec3(G((gj + 7919) & 262143), G((gj + 104729) & 262143), G((gj + 50021) & 262143)) * cc; }
    else c += n;
  }
  outc = vec4(clamp(c / 255., 0., 1.), 1.);
}`;

  // ---------------------------------------------------------------- renderers
  function compile(gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('live.js shader:', gl.getShaderInfoLog(s)); return null; } return s; };
    const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
    if (!v || !f) return null;
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('live.js link:', gl.getProgramInfoLog(p)); return null; }
    return { p, u: {} };
  }
  function makeRenderer(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { gl, canvas, lost: false, tiles: new Map(), views: new Set() };
    const setup = () => { R.P = compile(gl); R.tiles.clear(); gl.bindVertexArray(gl.createVertexArray()); return !!R.P; };
    if (!setup()) return null;
    const lost = e => { e.preventDefault(); R.lost = true; };
    const back = () => { R.lost = false; setup(); for (const v of R.views) { v.tex = null; v.ready = false; queueBuild(v); } };
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', back);
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
    return shared;
  }
  const U = (gl, P, n) => (n in P.u) ? P.u[n] : (P.u[n] = gl.getUniformLocation(P.p, n));
  function texture(gl, w, h, internal, format, type, data, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (w == null) gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, type, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function tileTex(R, key, T) {   // the still's own grain/scatter tile, uploaded once per seed per context
    if (R.tiles.has(key)) return R.tiles.get(key);
    const gl = R.gl, N = 512 * 512, dxy = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { dxy[2 * i] = T.dx[i]; dxy[2 * i + 1] = T.dy[i]; }
    const t = { g: texture(gl, 512, 512, gl.R32F, gl.RED, gl.FLOAT, T.g, gl.NEAREST), d: texture(gl, 512, 512, gl.RG32F, gl.RG, gl.FLOAT, dxy, gl.NEAREST) };
    if (R.tiles.size > 8) { for (const x of R.tiles.values()) { gl.deleteTexture(x.g); gl.deleteTexture(x.d); } R.tiles.clear(); }
    R.tiles.set(key, t);
    return t;
  }

  // ---------------------------------------------------------------- capture: the still, stopped before its print
  function stillOpts(o, W, H, cssW) {
    const s = Object.assign({}, o, { width: W, height: H, cssWidth: cssW });
    for (const k in MOTION) if (k !== 'fn' && k !== 'look') delete s[k];
    return s;
  }
  function runStill(canvas, o, W, Hh, cssW) {
    const s = stillOpts(o, W, Hh, cssW);
    if (o.image) return H_develop(canvas, o.image, Object.assign(s, { look: o.look || o.fn }));
    return H[FNS.includes(o.fn) ? o.fn : 'field'](canvas, s);
  }
  const H_develop = (c, img, s) => H.develop(c, img, s);
  function capture(o, W, H2, cssW) {
    let cap = null;
    const s = stillOpts(o, W, H2, cssW);
    s.capture = c => { cap = c; };
    const scratch = document.createElement('canvas');
    if (o.image) H.develop(scratch, o.image, Object.assign(s, { look: o.look || o.fn }));
    else H[FNS.includes(o.fn) ? o.fn : 'field'](scratch, s);
    if (!cap) return null;
    // the same upscale finish() makes: soft stage → device size, high-quality smoothing
    const up = document.createElement('canvas'); up.width = cap.W; up.height = cap.H;
    const ctx = up.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cap.src, cap.x, cap.y, cap.w, cap.h, 0, 0, cap.W, cap.H);
    const p = cap.o, k = p.cssWidth ? cap.W / p.cssWidth : 1;
    return {
      up, W: cap.W, H: cap.H, tile: cap.tile, tileKey: ((p.seed | 0) * 7 + 1) & 0xffff,
      sc: (p.scatter || 0) * k, amp: (p.grain == null ? 0.08 : p.grain) * 255, chroma: p.chroma || 0,
      sat: p.sat == null ? 1 : p.sat, veil: p.veil || 0, vig: p.vignette || 0, vc: hex(p.veilColor || '#ffffff'),
    };
  }

  // ---------------------------------------------------------------- one frame on the GPU
  function draw(R, v) {
    const gl = R.gl, P = R.P, c = v.cap, st = v.st, o = v.o;
    if (R.lost || !v.tex) return false;
    if (R.canvas.width !== c.W || R.canvas.height !== c.H) { R.canvas.width = c.W; R.canvas.height = c.H; }
    gl.viewport(0, 0, c.W, c.H);
    gl.useProgram(P.p);
    const tt = tileTex(R, c.tileKey, c.tile);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tt.g);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tt.d);
    gl.uniform1i(U(gl, P, 'uSrc'), 0); gl.uniform1i(U(gl, P, 'uG'), 1); gl.uniform1i(U(gl, P, 'uD'), 2);
    gl.uniform2f(U(gl, P, 'uSize'), c.W, c.H);
    gl.uniform1f(U(gl, P, 'uSc'), c.sc); gl.uniform1f(U(gl, P, 'uAmp'), c.amp); gl.uniform1f(U(gl, P, 'uChroma'), c.chroma);
    gl.uniform1f(U(gl, P, 'uSat'), c.sat); gl.uniform1f(U(gl, P, 'uVeil'), c.veil); gl.uniform1f(U(gl, P, 'uVig'), c.vig);
    gl.uniform3f(U(gl, P, 'uVc'), c.vc[0], c.vc[1], c.vc[2]);
    const S = Math.min(c.W, c.H), k = c.W / Math.max(1, v.cssW), live = !v.still();
    const ticks = live && o.grainRate > 0 ? Math.floor(st.clock * o.grainRate) : 0;
    gl.uniform1i(U(gl, P, 'uRoll'), (ticks * 69621) & 262143);
    gl.uniform4f(U(gl, P, 'uDrift'), live ? o.drift * 0.012 * S : 0, st.clock, Math.max(8, o.driftScale * S), o.pace);
    const br = live ? 0.5 - 0.5 * Math.cos(st.clock * 2 * Math.PI / o.breathPeriod) : 0;
    gl.uniform2f(U(gl, P, 'uMist'), live ? o.mist * 0.28 * br : 0, live ? o.breath * 0.07 * br : 0);
    gl.uniform4f(U(gl, P, 'uFocus'), st.focus, Math.max(1, o.focusRadius * S), live ? o.sharpen * st.ptr.amt : 0, 0);
    const pr = o.radius * S;
    gl.uniform4f(U(gl, P, 'uPtr'), st.ptr.x * k, st.ptr.y * k, pr, live ? o.bloom * st.ptr.amt : 0);
    const g = hex(o.glow);
    gl.uniform3f(U(gl, P, 'uGlow'), g[0], g[1], g[2]);
    const pl = live ? st.pulses : [], arr = new Float32Array(16);
    pl.slice(0, 4).forEach((p, i) => {
      const tau = st.clock - p.t0, r = pr * (0.3 + 1.4 * (1 - Math.exp(-tau * 1.3)));
      arr.set([p.x * k, p.y * k, r, p.s * 0.6 * Math.exp(-tau / 1.2) * (1 - Math.exp(-tau * 9))], i * 4);
    });
    gl.uniform4fv(U(gl, P, 'uPulse'), arr); gl.uniform1i(U(gl, P, 'uNPulse'), Math.min(4, pl.length));
    gl.uniform1f(U(gl, P, 'uReveal'), st.reveal == null ? 2 : st.reveal);
    const pp = hex(o.revealPaper); gl.uniform3f(U(gl, P, 'uPaper'), pp[0], pp[1], pp[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function present(R, v) { if (R.offscreen) v.ctx.transferFromImageBitmap(R.canvas.transferToImageBitmap()); }

  // ---------------------------------------------------------------- views and the one loop
  const views = new Set();
  let raf = 0, last = 0;
  function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    let more = false;
    for (const v of views) if (v.run(dt)) more = true;
    if (more) wake(); else last = 0;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else wake(); });
  RM.addEventListener && RM.addEventListener('change', () => { for (const v of views) v.dirty = true; wake(); });

  // captures run one per task, top of the page first, so the page paints while the rest develop
  const buildQueue = [];
  let building = false;
  function queueBuild(v) {
    if (!buildQueue.includes(v)) buildQueue.push(v);
    if (building) return;
    building = true;
    setTimeout(function next() {
      const v = buildQueue.shift();
      if (v && views.has(v)) { try { v.build(); } catch (e) { console.warn('live.js build:', e); } wake(); }
      if (buildQueue.length) setTimeout(next, 0); else building = false;
    }, 0);
  }
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => es.forEach(e => {
    const v = e.target.__hazeLive; if (!v) return;
    v.visible = e.isIntersecting;
    if (v.visible && !v.started) { v.started = true; queueBuild(v); }
    if (v.visible && v.o.enter && !v.st.enterAt) v.st.enterAt = performance.now();
    wake();
  }), { rootMargin: '25% 0px' }) : null;

  function live(canvas, opts) {
    const o = Object.assign({}, MOTION, opts);
    const v = { canvas, o, R: null, ctx: null, tex: null, cap: null, ready: false, started: false, dirty: true, paused: false, visible: !io, frames: 0, cssW: 1, cssH: 1 };
    v.st = { clock: 0, focus: 0, focusT: 0, reveal: o.reveal, revealT: o.reveal, ptr: { x: 0, y: 0, tx: 0, ty: 0, amt: 0, on: false }, pulses: [], enterAt: 0 };
    const dpr = () => Math.min(2, root.devicePixelRatio || 1);
    const r0 = canvas.getBoundingClientRect();
    const area = r0.width * r0.height * dpr() * dpr();
    if (live.gpu !== false) {
      const own = o.own == null ? area >= 0.9e6 : o.own;
      if (own) v.R = makeRenderer(canvas);
      else { const sh = sharedRenderer(); if (sh) { v.R = sh; v.ctx = canvas.getContext('bitmaprenderer'); if (!v.ctx) v.R = null; } }
    }
    if (v.R) v.R.views.add(v);
    // the CPU fallback is a still too: it changes state, it does not animate
    v.still = () => RM.matches || !v.R;

    v.size = () => {
      const r = canvas.getBoundingClientRect();
      v.cssW = Math.max(1, Math.round(r.width)); v.cssH = Math.max(1, Math.round(r.height));
      return [Math.round(v.cssW * dpr()), Math.round(v.cssH * dpr())];
    };
    v.build = () => {
      const [W, Hh] = v.size();
      if (!W || !Hh) return;
      if (!v.R) {   // no WebGL2: the still itself
        runStill(canvas, o, W, Hh, v.cssW);
        v.ready = true; v.frames++; v.built = [W, Hh];
        return;
      }
      const c = capture(o, W, Hh, v.cssW);
      if (!c) return;
      const gl = v.R.gl;
      if (v.tex) gl.deleteTexture(v.tex);
      v.cap = c;
      v.tex = texture(gl, null, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c.up, gl.LINEAR);
      c.up = null;
      if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
      v.built = [W, Hh];
      v.ready = true;
      v.target();
      v.st.focus = v.st.focusT;
      v.render();   // a paused or hidden view still gets its first frame
    };
    v.render = () => {
      if (!v.R || !v.ready) return;
      if (draw(v.R, v)) { present(v.R, v); v.frames++; v.dirty = false; }
    };
    v.target = () => {   // where focus and reveal want to be now
      let f = o.focus;
      if (o.focusScroll && !v.still()) {
        const r = canvas.getBoundingClientRect(), vh = root.innerHeight || 1;
        f += o.focusScroll * clamp01(Math.abs(r.top + r.height / 2 - vh / 2) / (vh * 0.8));
      }
      if (o.enter && !v.still()) f += v.st.enterAt ? 1 - clamp01((performance.now() - v.st.enterAt) / o.enterMs) : 1;
      v.st.focusT = Math.max(-1, Math.min(1.5, f));
    };
    v.run = dt => {
      if (!v.ready || !v.R) return false;
      if (v.still()) {
        v.st.clock = 0; v.st.pulses.length = 0; v.st.ptr.amt = 0;
        v.target(); v.st.focus = v.st.focusT; v.st.reveal = v.st.revealT;
        if (v.dirty) v.render();
        return false;
      }
      if (v.paused || !v.visible) { if (v.dirty && !v.frames) v.render(); return false; }
      const st = v.st, e = 1 - Math.exp(-dt / Math.max(0.01, o.ease * 3));
      st.clock += dt;
      v.target();
      st.focus += (st.focusT - st.focus) * e;
      if (st.revealT != null) st.reveal = st.reveal == null ? st.revealT : st.reveal + (st.revealT - st.reveal) * e;
      const p = st.ptr, lg = 1 - Math.exp(-dt / Math.max(0.01, o.lag));
      p.x += (p.tx - p.x) * lg; p.y += (p.ty - p.y) * lg;
      p.amt += ((p.on ? 1 : 0) - p.amt) * (1 - Math.exp(-dt / 0.6));
      st.pulses = st.pulses.filter(q => st.clock - q.t0 < 5);
      v.render();
      return true;
    };

    // pointer: light swells toward it, lagged, like a lamp moving behind gauze
    const hand = o.hand || canvas.parentElement || canvas;
    const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const onMove = e => {
      if (!o.pointer) return;
      const [x, y] = local(e), p = v.st.ptr;
      if (!p.on) { p.x = x; p.y = y; }
      p.tx = x; p.ty = y; p.on = true; wake();
    };
    const onLeave = () => { v.st.ptr.on = false; wake(); };
    const onDown = e => { if (!o.clickPulse) return; const [x, y] = local(e); api.pulse(x, y); };
    hand.addEventListener('pointermove', onMove); hand.addEventListener('pointerenter', onMove);
    hand.addEventListener('pointerleave', onLeave); hand.addEventListener('pointerdown', onDown);
    const onScroll = () => { if (o.focusScroll) wake(); };
    root.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (!v.built) { if (v.started) queueBuild(v); return; }
      const [W, Hh] = v.size();
      if (Math.abs(W - v.built[0]) > 2 || Math.abs(Hh - v.built[1]) > 2) queueBuild(v);
    }) : null;
    if (ro) ro.observe(canvas);

    const api = {
      set(p) {
        const look = ['focus', 'reveal'];
        let rebuild = false;
        for (const key in p) {
          if (key === 'focus') { o.focus = p.focus; }
          else if (key === 'reveal') { v.st.revealT = p.reveal; if (v.st.reveal == null || v.still()) v.st.reveal = p.reveal; }
          else { if (!(key in MOTION) || key === 'fn' || key === 'image' || key === 'look') rebuild = true; o[key] = p[key]; }
        }
        if (v.still() || !v.frames) { v.target(); v.st.focus = v.st.focusT; if (v.st.revealT != null) v.st.reveal = v.st.revealT; }
        if (rebuild && v.started) queueBuild(v);
        v.dirty = true; wake();
        return api;
      },
      load(p) { Object.assign(o, p); if (!('image' in p)) o.image = null; if (v.started) queueBuild(v); return api; },
      pulse(x, y, s) {
        if (v.still()) return api;
        if (x == null) { x = v.cssW / 2; y = v.cssH / 2; }
        v.st.pulses.push({ x, y, s: s == null ? 1 : s, t0: v.st.clock });
        if (v.st.pulses.length > 4) v.st.pulses.shift();
        wake(); return api;
      },
      point(x, y) {
        const p = v.st.ptr;
        if (x == null) p.on = false; else { if (!p.on) { p.x = x; p.y = y; } p.tx = x; p.ty = y; p.on = true; }
        wake(); return api;
      },
      pause() { v.paused = true; return api; },
      resume() { v.paused = false; wake(); return api; },
      destroy() {
        views.delete(v); if (io) io.unobserve(canvas); if (ro) ro.disconnect();
        hand.removeEventListener('pointermove', onMove); hand.removeEventListener('pointerenter', onMove);
        hand.removeEventListener('pointerleave', onLeave); hand.removeEventListener('pointerdown', onDown);
        root.removeEventListener('scroll', onScroll);
        if (v.R) { v.R.views.delete(v); if (v.tex) v.R.gl.deleteTexture(v.tex); if (!v.R.offscreen) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } }
        const i = registry.views.indexOf(api); if (i >= 0) registry.views.splice(i, 1);
        return api;
      },
      state() {
        return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.offscreen ? 'shared' : 'own') : 'cpu', frames: v.frames, visible: v.visible,
          focus: +v.st.focus.toFixed(3), clock: +v.st.clock.toFixed(3), size: v.cap ? [v.cap.W, v.cap.H] : v.built || [0, 0], ready: v.ready, reduced: v.still() };
      },
      /** bench(n): n frames drawn synchronously at clock 1 s with every live term on; ms per frame, pipelined (one readback) and sync (median per-frame readback) */
      bench(n) {
        n = n || 60;
        if (!v.R || !v.ready) return null;
        const gl = v.R.gl, px = new Uint8Array(4), save = JSON.stringify(v.st), clock = v.st.clock;
        const wasStill = v.still; v.still = () => false;
        Object.assign(v.st.ptr, { x: v.cssW * 0.4, y: v.cssH * 0.5, amt: 1 });
        v.st.pulses = [{ x: v.cssW / 2, y: v.cssH / 2, s: 1, t0: 0.2 }]; v.st.focus = -0.4;
        let t0 = performance.now();
        for (let i = 0; i < n; i++) { v.st.clock = 1 + i / 60; draw(v.R, v); }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n, ms = [];
        for (let i = 0; i < n; i++) { t0 = performance.now(); v.st.clock = 2 + i / 60; draw(v.R, v); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - t0); }
        ms.sort((a, b) => a - b);
        v.still = wasStill; Object.assign(v.st, JSON.parse(save)); v.st.clock = clock;
        v.render();
        return { sync: +ms[ms.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), size: [v.cap.W, v.cap.H], path: v.R.offscreen ? 'shared' : 'own' };
      },
      _v: v,
    };
    canvas.__hazeLive = v;
    views.add(v);
    registry.views.push(api);
    if (io) io.observe(canvas); else { v.started = true; queueBuild(v); }
    return api;
  }
  live.gpu = true;
  live.MOTION = MOTION;

  /**
   * live.parity(opts) — the still drawn by haze.js on a 2D canvas and frame 0 drawn on the
   * GPU at the same size and seed, compared: mean luminance, contrast (luminance SD), grain
   * (mean |ΔL| between neighbours), mean per-channel difference in 8-bit levels, share of
   * pixels within 2 levels.
   */
  live.parity = function (opts) {
    const o = Object.assign({}, MOTION, { fn: 'field', seed: 7 }, opts), w = o.width || 480, h = o.height || 320;
    delete o.width; delete o.height;
    const a = document.createElement('canvas');
    const t0 = performance.now();
    runStill(a, o, w, h, w);
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { fn: o.fn, gpu: false };
    const v = { o, R, cssW: w, still: () => true, cap: capture(o, w, h, w) };
    v.st = { clock: 0, focus: 0, reveal: null, ptr: { x: 0, y: 0, amt: 0 }, pulses: [] };
    const gl = R.gl;
    v.tex = texture(gl, null, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, v.cap.up, gl.LINEAR);
    draw(R, v);
    const gpu = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, gpu);
    const cpu = a.getContext('2d').getImageData(0, 0, w, h).data;
    const lost = gl.getExtension('WEBGL_lose_context'); if (lost) lost.loseContext();
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
      mode: o.fn + (o.form ? ':' + o.form : o.palette ? ':' + o.palette : ''), seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
      mean: [r4(A.mean), r4(B.mean)], sd: [r4(A.sd), r4(B.sd)], grain: [r4(A.grain), r4(B.grain)],
      dMean: r4(Math.abs(A.mean - B.mean)), dSdRel: r4(Math.abs(A.sd - B.sd) / A.sd), dGrainRel: r4(Math.abs(A.grain - B.grain) / A.grain),
      madLevels: +(mad / (w * h)).toFixed(3), within2: r4(within2 / (w * h)),
    };
  };
  live.TOLERANCE = { dMean: 0.004, dSdRel: 0.02, dGrainRel: 0.03, madLevels: 1.5 };
  live.pass = r => !!r && r.dMean <= live.TOLERANCE.dMean && r.dSdRel <= live.TOLERANCE.dSdRel && r.dGrainRel <= live.TOLERANCE.dGrainRel && r.madLevels <= live.TOLERANCE.madLevels;

  // the page-level registry tools/check.sh reads: every controller, and this skill's parity cases (run once, then cached)
  const registry = root.handPulledLive = root.handPulledLive || { views: [], parity: {} };
  let parityCache = null;
  registry.parity['ethereal-haze'] = () => parityCache || (parityCache = [
    live.parity({ fn: 'bloom', palette: 'coral', seed: 6 }),
    live.parity({ fn: 'field', form: 'fold', seed: 4 }),
    live.parity({ fn: 'field', form: 'flame', seed: 5, width: 320, height: 440 }),
    live.parity({ fn: 'ribbon', form: 'shift', seed: 2, width: 320, height: 440 }),
    live.parity({ fn: 'silk', palette: 'rouge', seed: 3 }),
    live.parity({ fn: 'poppies', seed: 4 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) })));
  H.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
