/* live.js — Riso.live(): a pulled print, still wet, on the GPU.
 *
 * Capture-first. The still engine (riso.js, and atlas.js on top of it) is the reference
 * and runs once on the CPU with `capture`: it hands back the paper (tone, fibre, flecks)
 * and every drum's screened coverage (grain or halftone, mottle, starved specks and its
 * own registration error already in it). Those are uploaded as textures and a fragment
 * shader lays the drums on the paper again every frame, multiplying like soy ink:
 *   out = paper × Π (1 − c + c · ink)
 * which is riso.js's own overprint. The live terms sit on top and are all exactly zero at
 * time 0 with the defaults, so frame 0 is the still; live.parity() measures that.
 *
 *   const ctl = Riso.live(canvas, { sheet: 'blocks', mode: 'solid', seed: 3, ink: 'blue',   // still options
 *                                   drift: 1, feed: 'in', pointer: 1, clickPulse: true });   // motion options
 *   ctl.set({ slip: 1 }); ctl.pulse(x, y); ctl.point(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * Motion is the press's own: drums wander out of register and back (`drift`) or are
 * knocked off on purpose (`slip`, `offsets`); the sheet feeds through the drums one after
 * another (`feed`: on arrival or with scroll); contour lines of the ground under the sheet
 * are traced level by level in a fresh hit of ink (`trace`); the pointer carries a loupe
 * (`pointer`, `radius`, `zoom`); a click stamps a fresh dot of ink (`clickPulse`, pulse()).
 * Big canvases get their own context; small ones share one offscreen context and receive
 * frames as ImageBitmaps. Without WebGL2 the still is printed straight onto the canvas;
 * with reduced motion every canvas shows frame 0 and changes state without animating.
 *
 * Original implementation.
 */
(function (root) {
  'use strict';
  const Rz = root.Riso;
  if (!Rz) throw new Error('live.js: load riso.js first');
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  // motion options: changing these never reprints the sheet
  const MOTION = {
    drift: 1, speed: 1, slip: 0, offsets: null, feed: 1, feedMs: 2400, scrollRange: [0, 1],
    trace: 0, traceLevels: 14, traceRate: 1.6, traceInk: null,
    pointer: 0, radius: 0.16, zoom: 1.8, lag: 0.16, hand: null, clickPulse: false, stampInk: null,
    ease: 0.18, own: null, resolution: 1, maxField: 1.6e6,
  };

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uPaper, uCov, uH;
uniform vec2 uSize; uniform int uN; uniform float uS;
uniform vec3 uInk[4]; uniform vec2 uOff[4];
uniform vec4 uFeed;                          // progress, stagger, soft px, on
uniform vec4 uLoupe; uniform float uZoom;    // x, y, radius px, amount
uniform vec4 uPulse[4]; uniform int uNPulse; uniform vec3 uStampInk;   // x, y, r px, amount
uniform vec4 uTrace; uniform vec3 uTraceInk; uniform vec2 uHN; // amount, front (levels), levels, line px
uniform int uSeed;
out vec4 outc;
// riso.js hash2, bit for bit
float hash2(int x, int y, int s) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.;
}
// the press's stochastic grain screen: density d -> coverage
float grain(ivec2 ip, float d, int s) {
  float g = .6 * hash2(ip.x, ip.y, s) + .4 * hash2(ip.x >> 1, ip.y >> 1, s + 1);
  return smoothstep(g - .15, g + .15, d * 1.12);
}
float cov(vec2 q, int l) {
  vec2 uv = q / uSize;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 0.;
  vec4 c = texture(uCov, uv);
  return l == 0 ? c.r : l == 1 ? c.g : l == 2 ? c.b : c.a;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);   // pixel centre, top-down
  ivec2 ip = ivec2(floor(p));
  vec2 q = p;
  float rim = 0.;
  if (uLoupe.w > 0.) {
    float r = length(p - uLoupe.xy), wgt = 1. - smoothstep(uLoupe.z * .82, uLoupe.z, r);
    q = uLoupe.xy + (p - uLoupe.xy) / (1. + (uZoom - 1.) * uLoupe.w * wgt);
    rim = uLoupe.w * exp(-pow((r - uLoupe.z * .97) / (uLoupe.z * .025 + 1.), 2.));
  }
  vec3 c = texture(uPaper, q / uSize).rgb;
  for (int l = 0; l < 4; l++) {
    if (l >= uN) break;
    float k = cov(q - uOff[l], l);
    if (uFeed.w > 0.) {
      float line = (uFeed.x * (1. + uFeed.y * float(uN - 1)) - uFeed.y * float(l)) * (uSize.y + 2. * uFeed.z) - uFeed.z;
      k *= 1. - smoothstep(line - uFeed.z, line, q.y);
    }
    c *= 1. - k + k * uInk[l];
  }
  if (uTrace.x > 0.) {
    float h = texture(uH, (q / uSize * (uHN - 1.) + .5) / uHN).r * uTrace.z, lv = floor(h + .5), dist = abs(h - lv) / max(fwidth(h), 1e-4);
    float ln = 1. - smoothstep(uTrace.w * .5, uTrace.w * .5 + 1., dist);
    float a = uTrace.y - lv, w = a > 0. ? smoothstep(0., .6, a) * exp(-a / 3.) : 0.;
    float k = grain(ip, uTrace.x * w * ln, uSeed + 4401);
    c *= 1. - k + k * uTraceInk;
  }
  for (int i = 0; i < 4; i++) {
    if (i >= uNPulse) break;
    float r = length(p - uPulse[i].xy), e = uPulse[i].z * (1. + .05 * (hash2(int(atan(p.y - uPulse[i].y, p.x - uPulse[i].x) * 9.), i, uSeed + 7) - .5));
    float k = grain(ip, uPulse[i].w * (1. - smoothstep(e * .9, e, r)), uSeed + 5501 + i * 13);
    if (hash2(ip.x, ip.y, uSeed + 5599) < .035 * k) k *= .35;   // a fresh stamp starves too
    c *= 1. - k + k * uStampInk;
  }
  c *= 1. - .22 * rim;
  outc = vec4(c, 1.);
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
    try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { gl, canvas, lost: false, gen: 0 };
    const setup = () => { R.prog = compile(gl); R.gen++; return !!R.prog; };
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
  function texture(gl, w, h, internal, format, type, data) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // ---------------------------------------------------------------- the still, captured
  function stillOpts(o) { const s = {}; for (const k in o) if (!(k in MOTION) && k !== 'sheet') s[k] = o[k]; return s; }
  // run the still engine at w×h on `cv`: an Atlas sheet when `sheet` is set, else Riso.print with `layers`
  function runStill(cv, o, w, h, capture) {
    const so = Object.assign(stillOpts(o), { width: w, height: h });
    if (capture) so.capture = capture;
    if (o.sheet) {
      if (!root.Atlas || !root.Atlas[o.sheet]) throw new Error('live.js: sheet "' + o.sheet + '" needs atlas.js');
      return root.Atlas[o.sheet](cv, so);
    }
    if (!o.layers) throw new Error('live.js: give `sheet` (an Atlas sheet) or `layers` (Riso.print layers)');
    return Rz.print(cv, so);
  }
  const inkOf = n => { const c = Rz.INKS[n] || (typeof n === 'string' && n[0] === '#' ? n : null); if (Array.isArray(n)) return n; const x = parseInt(c.slice(1), 16); return [(x >> 16) & 255, (x >> 8) & 255, x & 255]; };
  // the ground under the sheet, for `trace`: fbm on a 160-wide grid in units of the short side.
  // live-ui.js prints its contours from the same grid, so a trace runs along printed lines.
  function ground(w, h, seed) {
    const n = Rz.makeNoise(Rz.mulberry32((seed * 7 + 11) >>> 0)), S = Math.min(w, h), gw = 160, gh = Math.max(2, Math.round(160 * h / w));
    const g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = 0.5 + 0.5 * Rz.fbm(n, (i / (gw - 1)) * w / (0.55 * S) + 3, (j / (gh - 1)) * h / (0.55 * S) + 1, 4);
    return { g, gw, gh };
  }
  async function build(v) {
    const o = v.o, w = v.w, h = v.h;
    if (!v.R) {
      // no WebGL2: print the still straight onto the canvas
      await runStill(v.canvas, o, w, h);
      v.src = { w, h, cpu: true }; v.frames++; v.dirty = false;
      return;
    }
    let cap = null;
    await runStill(document.createElement('canvas'), o, w, h, c => { cap = c; });
    if (!cap) throw new Error('live.js: the still gave nothing to capture');
    v.src = { w, h, cap, hf: ground(w, h, o.seed | 0), seed: (o.seed | 0) * 131 + 17 };
    v.g = null; v.dirty = true;
  }

  // ---------------------------------------------------------------- GPU frame
  function freeTex(gl, g) { if (g) for (const k of ['paper', 'cov', 'h']) if (g[k]) gl.deleteTexture(g[k]); }
  function upload(v) {
    const gl = v.R.gl, s = v.src, cap = s.cap, n = cap.w * cap.h;
    freeTex(gl, v.g);
    const g = { gen: v.R.gen, src: s };
    const P = new Float32Array(n * 4), K = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { P[i * 4] = cap.paper[i * 3] / 255; P[i * 4 + 1] = cap.paper[i * 3 + 1] / 255; P[i * 4 + 2] = cap.paper[i * 3 + 2] / 255; P[i * 4 + 3] = 1; }
    cap.layers.slice(0, 4).forEach((L, l) => { const c = L.cov; for (let i = 0; i < n; i++) K[i * 4 + l] = c[i]; });
    g.paper = texture(gl, cap.w, cap.h, gl.RGBA16F, gl.RGBA, gl.FLOAT, P);
    g.cov = texture(gl, cap.w, cap.h, gl.RGBA16F, gl.RGBA, gl.FLOAT, K);
    g.h = texture(gl, s.hf.gw, s.hf.gh, gl.R16F, gl.RED, gl.FLOAT, s.hf.g);
    v.g = g;
  }
  function drawGPU(v) {
    const R = v.R, gl = R.gl, s = v.src;
    if (R.lost || !s || !s.cap) return false;
    if (!v.g || v.g.gen !== R.gen || v.g.src !== s) upload(v);
    const g = v.g, cv = R.canvas, w = s.w, h = s.h, st = v.st, o = v.o, cap = s.cap, S = Math.min(w, h), k = w / (v.cssW || w);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const P = R.prog, u = n => U(gl, P, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.paper); gl.uniform1i(u('uPaper'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, g.cov); gl.uniform1i(u('uCov'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, g.h); gl.uniform1i(u('uH'), 2);
    gl.uniform2f(u('uSize'), w, h); gl.uniform1f(u('uS'), S); gl.uniform1i(u('uSeed'), s.seed);
    const nL = Math.min(4, cap.layers.length), ink = new Float32Array(12), off = new Float32Array(8);
    cap.layers.slice(0, 4).forEach((L, l) => {
      ink.set([L.ink[0] / 255, L.ink[1] / 255, L.ink[2] / 255], l * 3);
      // drums wander out of register and back: every term is zero at clock 0
      const ph = 1.3 + 2.1 * l, wv = 0.8 + 0.23 * l, a = st.env * o.drift * S * 0.0038, t = st.clock;
      let dx = a * (Math.sin(t * 0.61 * wv + ph) - Math.sin(ph)), dy = a * 0.8 * (Math.cos(t * 0.47 * wv + ph * 1.7) - Math.cos(ph * 1.7));
      // slip: knocked off register on purpose, each drum its own way
      const sa = 2.4 * l + 0.6; dx += st.slip * S * 0.03 * Math.cos(sa) * (l ? 1 : 0.35); dy += st.slip * S * 0.03 * Math.sin(sa) * (l ? 1 : 0.35);
      if (st.offsets && st.offsets[l]) { dx += st.offsets[l][0] * k; dy += st.offsets[l][1] * k; }
      off.set([dx, dy], l * 2);
    });
    gl.uniform1i(u('uN'), nL); gl.uniform3fv(u('uInk'), ink); gl.uniform2fv(u('uOff'), off);
    gl.uniform4f(u('uFeed'), st.feed, 0.25, S * 0.04, st.feed < 1 ? 1 : 0);
    const pool = st.pool;
    gl.uniform4f(u('uLoupe'), pool.x, pool.y, o.radius * S, pool.amp * o.pointer); gl.uniform1f(u('uZoom'), o.zoom);
    const pu = new Float32Array(16); st.pulses.slice(0, 4).forEach((p, i) => pu.set([p.x, p.y, p.r, p.amp], i * 4));
    gl.uniform4fv(u('uPulse'), pu); gl.uniform1i(u('uNPulse'), Math.min(4, st.pulses.length));
    const si = o.stampInk ? inkOf(o.stampInk) : cap.layers[0] ? cap.layers[0].ink : [0, 0, 0];
    gl.uniform3f(u('uStampInk'), si[0] / 255, si[1] / 255, si[2] / 255);
    const ti = o.traceInk ? inkOf(o.traceInk) : cap.layers[nL - 1] ? cap.layers[nL - 1].ink : [0, 0, 0];
    gl.uniform3f(u('uTraceInk'), ti[0] / 255, ti[1] / 255, ti[2] / 255);
    const lv = o.traceLevels, front = (st.clock * o.traceRate) % (lv + 6) - 2;
    gl.uniform2f(u('uHN'), s.hf.gw, s.hf.gh);
    gl.uniform4f(u('uTrace'), st.env * o.trace, front, lv, Math.max(1.2, S / 420));
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

  // prints run one at a time (they are CPU work), in the order they were asked for
  const jobs = [];
  let working = false;
  function queue(job) {
    jobs.push(job);
    if (working) return;
    working = true;
    setTimeout(async function next() {
      const j = jobs.shift();
      try { await j(); } catch (e) { console.warn('live.js build:', e); }
      if (jobs.length) setTimeout(next, 0); else working = false;
    }, 0);
  }
  function queueBuild(v) {
    if (v.queued) return;
    v.queued = true;
    queue(async () => {
      v.queued = false; if (!views.has(v)) return; v.resize(true); if (!v.w) return;
      await build(v);
      if (v.o.feed === 'in' && v.frames && !RM.matches) { v.st.inStart = 0; v.st.feed = 0; }   // a fresh pull feeds through the press again
      wake();
    });
  }

  function live(canvas, opts) {
    const o = Object.assign({}, MOTION, opts);
    const v = { canvas, o, R: null, ctx: null, src: null, g: null, dirty: true, paused: false, visible: false, ratio: 0, frames: 0, dpr: 1, w: 0, h: 0, cssW: 1, cssH: 1 };
    v.st = { clock: 0, env: 0, feed: 1, slip: 0, offsets: null, inStart: 0, pool: { x: 0, y: 0, amp: 0, on: false, tx: 0, ty: 0, seen: false }, pulses: [] };
    if (!canvas.hasAttribute('role')) canvas.setAttribute('aria-hidden', 'true');   // a sheet with role=img keeps its label
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
    if (!v.R && !canvas.getContext('2d')) return null;
    // the CPU fallback is a still too: it changes state, it does not animate
    const still = () => RM.matches || !v.R;

    function feedTarget(now) {
      const f = o.feed;
      if (still()) return 1;
      if (f === 'in') { if (!v.st.inStart) return 0; const t = clamp01((now - v.st.inStart) / o.feedMs); return 1 - Math.pow(1 - t, 3); }
      if (f === 'scroll') {
        const r = canvas.getBoundingClientRect(), vh = root.innerHeight || 1, [a, b] = o.scrollRange;
        return a + (b - a) * clamp01((vh - r.top) / (vh * 0.75));
      }
      return clamp01(+f);
    }
    const lerp = (a, b, k) => a + (b - a) * k;
    function tick(now, dt) {
      const st = v.st, rm = still();
      let moving = false;
      const k = rm ? 1 : 1 - Math.exp(-dt / Math.max(0.001, o.ease));
      if (!rm && o.drift > 0) { st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 3); moving = true; }
      else if (rm) { st.clock = 0; st.env = 0; }
      else if (o.trace > 0) { st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 3); moving = true; }
      const f = feedTarget(now);
      if (o.feed === 'in' && st.inStart && !rm && now - st.inStart < o.feedMs) { st.feed = f; moving = true; }
      else if (Math.abs(st.feed - f) > 1e-3 && !rm) { st.feed = lerp(st.feed, f, k); moving = true; }
      else st.feed = f;
      if (o.feed === 'scroll' && !rm) moving = true;
      if (Math.abs(st.slip - o.slip) > 1e-3 && !rm) { st.slip = lerp(st.slip, o.slip, k); moving = true; } else st.slip = o.slip;
      const to = o.offsets;
      if (to) {
        const cur = st.offsets || to.map(() => [0, 0]);
        const nx = to.map((q, i) => q ? [lerp((cur[i] || [0, 0])[0], q[0], k), lerp((cur[i] || [0, 0])[1], q[1], k)] : null);
        if (nx.some((q, i) => q && Math.hypot(q[0] - to[i][0], q[1] - to[i][1]) > 0.05)) moving = true; else st.offsets = to.map(q => q && q.slice());
        if (moving) st.offsets = nx;
      } else st.offsets = null;
      const p = st.pool;
      if (!rm && o.pointer) {
        const kl = 1 - Math.exp(-dt / Math.max(0.01, o.lag));
        p.x = lerp(p.x, p.tx, kl); p.y = lerp(p.y, p.ty, kl);
        p.amp = lerp(p.amp, p.on ? 1 : 0, 1 - Math.exp(-dt / 0.2));
        if (p.amp > 0.002 || p.on) moving = true; else p.amp = 0;
      } else p.amp = 0;
      st.pulses = rm ? [] : st.pulses.filter(q => now - q.t0 < 2400);
      for (const q of st.pulses) {
        const a = (now - q.t0) / 1000, S = Math.min(v.w, v.h);
        q.amp = q.s * (1 - Math.exp(-a / 0.04)) * Math.exp(-a / 0.8);   // the stamp lands, then soaks in and fades
        q.r = S * q.size * (0.6 + 0.4 * (1 - Math.exp(-a / 0.12)));
        moving = true;
      }
      return moving;
    }

    v.resize = force => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      v.cssW = r.width; v.cssH = r.height;
      v.dpr = Math.min(2, root.devicePixelRatio || 1) * o.resolution;
      let w = Math.max(2, Math.round(r.width * v.dpr)), h = Math.max(2, Math.round(r.height * v.dpr));
      if (w * h > o.maxField) { const s = Math.sqrt(o.maxField / (w * h)); w = Math.round(w * s); h = Math.round(h * s); }
      if (Math.abs(w - v.w) <= 2 && Math.abs(h - v.h) <= 2) return false;
      if (!force && v.src) return true;           // the caller schedules the reprint
      v.w = w; v.h = h;
      return true;
    };
    v.run = (now, dt) => {
      if ((v.paused && v.frames) || !v.visible || !v.src || v.src.cpu) return false;
      if (o.feed === 'in' && !v.st.inStart && v.ratio >= 0.25 && !still()) v.st.inStart = now;
      const moving = tick(now, dt);
      if (!(moving || v.dirty)) return false;
      if (drawGPU(v)) { present(v); v.frames++; v.dirty = false; }
      return moving;
    };

    // pointer: the hand is the canvas's parent by default, since a background canvas sits under content
    const hand = o.hand || canvas.parentElement || canvas;
    const at = e => { const r = canvas.getBoundingClientRect(), k = v.w / (r.width || 1); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    const onMove = e => {
      if (!o.pointer) return;
      const [x, y] = at(e), p = v.st.pool;
      if (!p.seen || p.amp < 0.01) { p.x = x; p.y = y; p.seen = true; }
      p.tx = x; p.ty = y; p.on = true; wake();
    };
    const onLeave = e => { if (e.pointerType !== 'mouse' || e.type === 'pointerleave') { v.st.pool.on = false; wake(); } };
    const onDown = e => { onMove(e); if (o.clickPulse) { const [x, y] = at(e); api.pulseAt(x, y, 1); } };
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
      rzT = setTimeout(() => queueBuild(v), 200);
    });
    ro.observe(canvas);

    const api = {
      canvas,
      /** merge options; motion options apply next frame, still options reprint the sheet */
      set(n) {
        const look = Object.keys(n).filter(k => !(k in MOTION) && n[k] !== o[k]);
        Object.assign(o, n);
        if (n.feed === 'in') v.st.inStart = 0;
        if (look.length) queueBuild(v);
        v.dirty = true; wake(); return api;
      },
      /** a new sheet: every still option is dropped and `n` put in its place */
      load(n) {
        for (const k of Object.keys(o)) if (!(k in MOTION)) delete o[k];
        Object.assign(o, n);
        queueBuild(v); v.dirty = true; wake(); return api;
      },
      /** stamp a fresh dot of ink at (x, y) in CSS px of the canvas; strength ~0.5–1, size = radius / short side */
      pulse(x, y, s, size) { const k = v.w / (v.cssW || 1); return api.pulseAt(x * k, y * k, s, size); },
      pulseAt(x, y, s, size) {
        if (still()) return api;
        v.st.pulses.push({ x, y, s: s == null ? 1 : s, size: size || 0.06, t0: performance.now(), amp: 0, r: 1 });
        if (v.st.pulses.length > 4) v.st.pulses.shift();
        wake(); return api;
      },
      /** move the loupe yourself (CSS px), or put it down with point(null) */
      point(x, y) {
        const p = v.st.pool, k = v.w / (v.cssW || 1);
        if (x == null) p.on = false; else { p.tx = x * k; p.ty = y * k; if (!p.seen || p.amp < 0.01) { p.x = p.tx; p.y = p.ty; p.seen = true; } p.on = true; }
        wake(); return api;
      },
      pause() { v.paused = true; return api; },
      resume() { v.paused = false; v.dirty = true; wake(); return api; },
      destroy() {
        views.delete(v); io.disconnect(); ro.disconnect(); clearTimeout(rzT);
        for (const [t, f] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerleave', onLeave], ['pointerup', onLeave], ['pointercancel', onLeave]]) hand.removeEventListener(t, f);
        if (v.R) freeTex(v.R.gl, v.g);
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
      },
      /** what the view is doing; `expose` is how far the sheet has fed through the drums */
      state() { return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.feed.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src && parity.done, reduced: still() }; },
      /** time n frames with every live term on: `sync` waits for the GPU after each frame (median), `pipelined` waits once */
      bench(n) {
        if (!v.R || !v.src || !v.src.cap) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st, keep = { clock: st.clock, env: st.env, feed: st.feed, pool: Object.assign({}, st.pool), pulses: st.pulses };
        const tr = o.trace; o.trace = o.trace || 0.8;
        Object.assign(st, { env: 1, feed: 0.8 }); Object.assign(st.pool, { x: v.w / 2, y: v.h / 2, amp: 1 });
        st.pulses = [0, 1, 2, 3].map(i => ({ x: v.w * (0.2 + 0.2 * i), y: v.h / 2, r: Math.min(v.w, v.h) * 0.06, amp: 1 }));
        const step = () => { st.clock += 1 / 60; drawGPU(v); };
        step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) { const t0 = performance.now(); step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
        const t0 = performance.now();
        for (let i = 0; i < n; i++) step();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n;
        o.trace = tr; Object.assign(st, { clock: keep.clock, env: keep.env, feed: keep.feed, pulses: keep.pulses }); Object.assign(st.pool, keep.pool);
        drawGPU(v); present(v);
        ts.sort((a, b) => a - b);
        return { sync: +ts[ts.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), size: [v.w, v.h], path: api.state().path };
      },
      _v: v,
    };

    views.add(v);
    registry.views.push(api);
    const first = () => {
      v.resize(true);
      if (!v.w) return;          // no size yet (display:none): the ResizeObserver starts it later
      v.started = true;
      if (o.feed === 'in' && !still()) v.st.feed = 0;
      queueBuild(v);
      if (!parity.asked) { parity.asked = true; queue(runParity); }
    };
    first();
    return api;
  }
  live.gpu = true;
  live.ground = ground;
  // for tests: draw one frame of a view as it stands, or at clock `t` (s) with full drift
  live._frame = (ctl, t) => { const v = ctl._v; if (t != null) Object.assign(v.st, { clock: t, env: 1 }); if (v.R && v.src && v.src.cap) { drawGPU(v); present(v); } };
  live.stats = () => ({ views: views.size, jsMsLastFrame: +lastCost.toFixed(2) });

  /**
   * live.parity(opts) → Promise: print the still with the CPU engine (no capture), then capture
   * the same sheet and draw frame 0 on the GPU at the same size, and compare: mean luminance,
   * contrast (luminance SD), grain (mean |ΔL| between neighbours), mean per-channel difference
   * in 8-bit levels and the share of pixels within 2 levels.
   */
  live.parity = async function (opts) {
    const o = Object.assign({ width: 360, seed: 7 }, opts), w = o.width, h = o.height || Math.round(w * 1.414);
    const a = document.createElement('canvas');
    const t0 = performance.now();
    await runStill(a, o, w, h);
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { sheet: o.sheet || 'print', gpu: false };
    const v = { canvas: b, o: Object.assign({}, MOTION, o), R, w, h, cssW: w, dpr: 1 };
    v.st = { clock: 0, env: 0, feed: 1, slip: 0, offsets: null, pool: { x: 0, y: 0, amp: 0 }, pulses: [] };
    await build(v);
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
      mode: (o.sheet || 'print') + (o.mode ? '/' + o.mode : ''), seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
      mean: [r4(A.mean), r4(B.mean)], sd: [r4(A.sd), r4(B.sd)], grain: [r4(A.grain), r4(B.grain)],
      dMean: r4(Math.abs(A.mean - B.mean)), dSdRel: r4(Math.abs(A.sd - B.sd) / A.sd), dGrainRel: r4(Math.abs(A.grain - B.grain) / A.grain),
      madLevels: +(mad / (w * h)).toFixed(3), within2: r4(within2 / (w * h)),
    };
  };
  live.TOLERANCE = { dMean: 0.004, dSdRel: 0.02, dGrainRel: 0.03, madLevels: 1.5 };
  live.pass = r => !!r && r.dMean <= live.TOLERANCE.dMean && r.dSdRel <= live.TOLERANCE.dSdRel && r.dGrainRel <= live.TOLERANCE.dGrainRel && r.madLevels <= live.TOLERANCE.madLevels;

  // a plain Riso.print sheet for the parity set: a ramp of grain, a halftone disc, a hairline drum
  const PRINT_CASE = {
    paper: 'cream', width: 320, height: 240, seed: 5, layers: [
      { ink: 'blue', screen: 'grain', draw: (c, w, h) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, w, h * 0.6); } },
      { ink: 'fluorescent-pink', screen: 'halftone', cell: 5, draw: (c, w, h) => { c.fillStyle = '#555'; c.beginPath(); c.arc(w * 0.6, h * 0.55, h * 0.35, 0, 7); c.fill(); } },
      { ink: 'black', screen: 'solid', draw: (c, w, h) => { c.lineWidth = 1.5; for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(0, i * h / 8); c.bezierCurveTo(w * 0.3, i * h / 8 - 20, w * 0.7, i * h / 8 + 20, w, i * h / 8); c.stroke(); } } },
    ],
  };
  // the cases the check holds frame 0 to; run once, in the print queue, after the first view
  const parity = { done: false, asked: false, results: null };
  async function runParity() {
    const cases = [
      { sheet: 'blocks', mode: 'solid', seed: 1, ink: 'blue' },
      { sheet: 'zoning', seed: 2 },
      { sheet: 'poster', seed: 3 },
      PRINT_CASE,
    ].filter(c => !c.sheet || root.Atlas);
    const out = [];
    for (const c of cases) {
      let r;
      try { r = await live.parity(c); } catch (e) { r = { mode: c.sheet || 'print', error: String(e) }; }
      out.push(Object.assign(r, { pass: live.pass(r) }));
    }
    parity.results = out; parity.done = true;
    for (const v of views) v.dirty = true;
    wake();
  }
  live.parityResults = () => parity.results;

  // the page-level registry tools/check.sh reads
  const registry = root.handPulledLive = root.handPulledLive || { views: [], parity: {} };
  registry.parity['riso-cartography'] = () => parity.results || [{ mode: 'pending', pass: false }];
  Rz.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
