/* live.js — Surface.live(): a plate that moves under your hand.
 *
 * Capture-first. The still engine (surface.js) prints the plate once on the CPU through its
 * `capture` hook, which hands back two canvases: the bare colour FIELD and the finished STILL
 * (field + panes + type). Both are uploaded as textures, and one fragment shader draws every
 * frame from them. Every motion term is exactly zero at time 0 with the defaults, so frame 0
 * is the still, texel for texel; live.parity() measures that.
 *
 *   const ctl = Surface.live(canvas, { mode: 'reeded', palette: 'cobalt', seed: 3, text: false,   // still options
 *                                      drift: 1, rake: 0.35, clickPulse: true, develop: 'in' });   // motion options
 *   ctl.set({ lift: 1 }); ctl.pulse(x, y); ctl.point(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * The motion belongs to the medium:
 *   - a RAKING LIGHT follows the pointer low across the surface, so the relief of the pane
 *     (reed edges, torn rows, grain) catches it on one side and falls into shade on the other;
 *   - CONTOUR ECHOES: thin lines at the field's iso-levels ripple slowly outward from its
 *     highlights, bending what is seen through them by a pixel or two (`drift`);
 *   - GRAIN LIFTS and settles: fresh fine grain re-rolled 24 times a second, eased in by
 *     `lift` (hover) and out again, never heavier than half the still's own grain;
 *   - a click drops an ECHO RING that runs outward through the glass (`pulse`);
 *   - the surface DEVELOPS over the bare field: `develop` 0 shows the soft colour alone,
 *     1 the finished plate; 'in' develops once on entering the view, 'scroll' follows scroll.
 * Big canvases get their own WebGL2 context; small ones share one offscreen context and
 * receive frames as ImageBitmaps. Without WebGL2 a canvas shows the CPU still; with reduced
 * motion it shows its still frame and changes state without animating.
 *
 * Original implementation, MIT.
 */
(function (root) {
  'use strict';
  const S = root.Surface;
  if (!S) throw new Error('live.js: load surface.js first');
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const lerp = (a, b, k) => a + (b - a) * k;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  const PLATES = ['reeded', 'satin', 'aurora', 'streak', 'bloom', 'coordinate'];
  // motion options: changing these never reprints the plate
  const MOTION = {
    drift: 1, speed: 1, echoes: 7, rake: 0.35, radius: 0.35, lag: 0.3, hand: null, clickPulse: false,
    develop: 1, developMs: 2400, scrollRange: [0, 1], ease: 0.2, lift: 0, liftGrain: 0.5, grainRate: 24, alive: true,
    reveal: null, under: 1, ground: '#0c0d0f', ring: null, own: null, scale: 1, maxField: 1.6e6,
  };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uStill, uField;
uniform vec2 uSize, uTex;          // output px, texture px
uniform float uClock, uEnv, uEcho, uEchoN, uExpose, uLift, uUnder;
uniform uint uGk, uSeed;
uniform vec4 uPt;                  // x, y (px, top-down), amp, radius px
uniform vec4 uPulse[4];            // x, y, ring radius px, amp
uniform float uPulseW;
uniform vec3 uReveal, uGround;     // reveal: from, to (fraction of width), soft
uniform vec4 uRing;                // on, pad, band, corner radius (px)
out vec4 outColor;
uint hsh(uvec3 v) {
  uint h = v.x * 0x85ebca6bu ^ v.y * 0xc2b2ae35u ^ v.z * 0x27d4eb2fu;
  h ^= h >> 15; h *= 0x2c1b3c6du; h ^= h >> 12; h *= 0x297a2d39u; h ^= h >> 15;
  return h;
}
float h01(uvec3 v) { return float(hsh(v) >> 8) / 16777216.0; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 uv = p / uSize, px = 1.0 / uTex;
  float k = uTex.x / uSize.x;
  vec2 disp = vec2(0.0);
  vec3 add = vec3(0.0);
  // contour echoes: iso-lines of the soft field, drifting outward from its highlights
  if (uEcho > 0.0) {
    float lf = lum(texture(uField, uv).rgb);
    vec2 g = vec2(lum(texture(uField, uv + vec2(px.x * 3.0, 0.0)).rgb) - lum(texture(uField, uv - vec2(px.x * 3.0, 0.0)).rgb),
                  lum(texture(uField, uv + vec2(0.0, px.y * 3.0)).rgb) - lum(texture(uField, uv - vec2(0.0, px.y * 3.0)).rgb));
    float ph = lf * uEchoN + uClock * 0.05;
    float band = pow(0.5 + 0.5 * cos(6.2831853 * ph), 36.0);
    float gl = length(g);
    vec2 dir = gl > 1e-5 ? g / gl : vec2(0.0);
    disp += dir * band * 1.6 * uEcho * px;
    add += band * 0.035 * uEcho;
  }
  // echo rings from clicks
  for (int i = 0; i < 4; i++) {
    vec4 q = uPulse[i];
    if (q.w <= 0.0) continue;
    vec2 d = p - q.xy; float r = length(d);
    float ring = exp(-pow((r - q.z) / uPulseW, 2.0)) * q.w;
    disp += (r > 0.5 ? d / r : vec2(0.0)) * ring * 3.0 * px * k;
    add += ring * 0.06;
  }
  vec3 still = texture(uStill, uv + disp).rgb;
  vec3 col = still;
  // the surface develops over the bare field
  float m = 1.0;
  if (uExpose < 1.0 || uReveal.x > -0.5 || uReveal.y < 1.5) {
    uvec2 ip = uvec2(p);
    float n = 0.6 * h01(uvec3(ip / 3u, uSeed + 11u)) + 0.4 * h01(uvec3(ip, uSeed + 12u));
    m = clamp((uExpose - 0.85 * n) / 0.15, 0.0, 1.0);
    m *= smoothstep(uReveal.x - uReveal.z, uReveal.x + uReveal.z, uv.x) * (1.0 - smoothstep(uReveal.y - uReveal.z, uReveal.y + uReveal.z, uv.x));
    vec3 under = mix(uGround, texture(uField, uv + disp).rgb, uUnder);
    col = mix(under, still, m);
  }
  // raking light: a low lamp at the pointer; the pane's relief (still minus field) catches it
  if (uPt.z > 0.0) {
    vec2 o = vec2(px.x, 0.0), o2 = vec2(0.0, px.y);
    float rx = (lum(texture(uStill, uv + o).rgb) - lum(texture(uField, uv + o).rgb)) - (lum(texture(uStill, uv - o).rgb) - lum(texture(uField, uv - o).rgb));
    float ry = (lum(texture(uStill, uv + o2).rgb) - lum(texture(uField, uv + o2).rgb)) - (lum(texture(uStill, uv - o2).rgb) - lum(texture(uField, uv - o2).rgb));
    vec3 nrm = normalize(vec3(-rx * 5.0, -ry * 5.0, 1.0));
    vec2 to = uPt.xy - p; float d = length(to);
    vec3 L = normalize(vec3(to, uPt.w * 0.35));
    float fall = exp(-(d * d) / (uPt.w * uPt.w));
    float shade = (dot(nrm, L) - L.z) * 2.2 + 0.18;
    add += shade * fall * uPt.z * m;
  }
  col += add * (1.0 - 0.5 * col);
  // grain lifts: fine grain re-rolled per tick, clumps fixed, heaviest in the midtones
  if (uLift > 0.0) {
    uvec2 ip = uvec2(p);
    float l = lum(col);
    float t = h01(uvec3(ip, uSeed + uGk * 2u)) + h01(uvec3(ip, uSeed + uGk * 2u + 1u)) - 1.0;
    float c = h01(uvec3(ip / 2u, uSeed + 5u)) - 0.5;
    col += (t * 0.8 + c * 0.5) * uLift * (0.3 + 2.8 * l * (1.0 - l));
  }
  float a = 1.0;
  if (uRing.x > 0.5) {
    vec2 hw = uSize * 0.5 - vec2(uRing.y + uRing.z * 1.5);
    float r = min(uRing.w, min(hw.x, hw.y));
    vec2 q = abs(p - uSize * 0.5) - (hw - r);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    a = exp(-pow(sd / uRing.z, 2.0));
  }
  outColor = vec4(clamp(col, 0.0, 1.0) * a, a);
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
    try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { gl, canvas, lost: false };
    const setup = () => { R.prog = compile(gl); return R.prog; };
    if (!setup()) return null;
    const lost = e => { e.preventDefault(); R.lost = true; };
    const back = () => { R.lost = false; setup(); for (const v of views) if (v.R === R) { v.g = null; v.dirty = true; } wake(); };
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
  function texFrom(gl, cv, linear) {
    const t = gl.createTexture(), f = linear ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // ---------------------------------------------------------------- sources
  function stillOpts(o) { const s = {}; for (const k in o) if (!(k in MOTION) && k !== 'mode') s[k] = o[k]; return s; }
  const copy = c => { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; };
  /** Print a plate at w×h on the CPU and hand back { field, still } canvases (synchronous, through `capture`). */
  function printPlate(o, w, h) {
    const mode = PLATES.includes(o.mode) ? o.mode : 'reeded';
    const cv = document.createElement('canvas');
    let field = null, still = null;
    S[mode](cv, Object.assign(stillOpts(o), { width: w, height: h, capture: (stage, c) => { if (stage === 'field') field = copy(c); else still = c; } }));
    if (!field || !still) throw new Error('live.js: plate ' + mode + ' did not capture');
    return { field, still, w, h };
  }
  function build(v) {
    const k = v.R ? Math.min(1, Math.sqrt(v.o.maxField / (v.w * v.h))) : 1;
    v.src = printPlate(v.o, Math.max(24, Math.round(v.w * k)), Math.max(24, Math.round(v.h * k)));
    v.g = null; v.dirty = true;
  }

  // ---------------------------------------------------------------- GPU frame
  function upload(v) {
    const gl = v.R.gl, s = v.src, lin = s.w !== v.w || s.h !== v.h;
    if (v.g) { gl.deleteTexture(v.g.still); gl.deleteTexture(v.g.field); }
    v.g = { still: texFrom(gl, s.still, lin), field: texFrom(gl, s.field, true), src: s };
  }
  function drawGPU(v) {
    const R = v.R;
    if (!R || R.lost || !v.src || !R.prog) return false;
    const gl = R.gl, P = R.prog, st = v.st, o = v.o;
    if (!v.g || v.g.src !== v.src) upload(v);
    if (R.canvas.width !== v.w || R.canvas.height !== v.h) { R.canvas.width = v.w; R.canvas.height = v.h; }
    gl.viewport(0, 0, v.w, v.h);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.g.still); gl.uniform1i(U(gl, P, 'uStill'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, v.g.field); gl.uniform1i(U(gl, P, 'uField'), 1);
    gl.uniform2f(U(gl, P, 'uSize'), v.w, v.h);
    gl.uniform2f(U(gl, P, 'uTex'), v.src.w, v.src.h);
    gl.uniform1f(U(gl, P, 'uClock'), st.clock);
    gl.uniform1f(U(gl, P, 'uEnv'), st.env);
    gl.uniform1f(U(gl, P, 'uEcho'), o.drift * st.env);
    gl.uniform1f(U(gl, P, 'uEchoN'), o.echoes);
    gl.uniform1f(U(gl, P, 'uExpose'), st.expose);
    gl.uniform1f(U(gl, P, 'uLift'), st.lift * o.liftGrain * 0.07 * (o.grain == null ? 1 : o.grain));
    gl.uniform1f(U(gl, P, 'uUnder'), o.under);
    gl.uniform3fv(U(gl, P, 'uGround'), hex(o.ground));
    gl.uniform1ui(U(gl, P, 'uGk'), st.gk >>> 0);
    gl.uniform1ui(U(gl, P, 'uSeed'), ((o.seed || 1) * 7919) >>> 0);
    const p = st.pt, rad = o.radius * Math.min(v.w, v.h);
    gl.uniform4f(U(gl, P, 'uPt'), p.x, p.y, p.amp * o.rake, rad);
    const pu = new Float32Array(16);
    st.pulses.slice(0, 4).forEach((q, i) => pu.set([q.x, q.y, q.r, q.amp], i * 4));
    gl.uniform4fv(U(gl, P, 'uPulse[0]'), pu);
    gl.uniform1f(U(gl, P, 'uPulseW'), Math.max(2, Math.min(v.w, v.h) * 0.035));
    const rv = st.reveal || [-1, 2, 0.001];
    gl.uniform3f(U(gl, P, 'uReveal'), rv[0], rv[1], Math.max(0.001, rv[2] == null ? 0.02 : rv[2]));
    const rg = o.ring;
    gl.uniform4f(U(gl, P, 'uRing'), rg ? 1 : 0, rg ? rg.pad * v.dpr : 0, rg ? rg.band * v.dpr : 1, rg ? rg.radius * v.dpr : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function present(v) {
    const R = v.R;
    if (R.canvas === v.canvas) return;
    if (v.canvas.width !== v.w || v.canvas.height !== v.h) { v.canvas.width = v.w; v.canvas.height = v.h; }
    if (R.offscreen) v.ctx.transferFromImageBitmap(R.canvas.transferToImageBitmap());
    else { v.ctx.globalCompositeOperation = 'copy'; v.ctx.drawImage(R.canvas, 0, 0); }
  }

  // ---------------------------------------------------------------- CPU fallback
  // the same state on a 2D canvas: the field, then the still over it at the exposure, clipped to the reveal
  function drawCPU(v) {
    const s = v.src, st = v.st, x = v.ctx;
    if (!s) return;
    const w = v.w, h = v.h;
    if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
    x.save(); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    if (v.o.ring) { x.clearRect(0, 0, w, h); x.restore(); return; }   // the CSS outline stands in
    const rv = st.reveal || [0, 1];
    if (st.expose < 1 || st.reveal) {
      x.fillStyle = v.o.ground; x.fillRect(0, 0, w, h);
      x.globalAlpha = v.o.under; x.drawImage(s.field, 0, 0, w, h); x.globalAlpha = 1;
    }
    x.beginPath(); x.rect(Math.max(0, rv[0]) * w, 0, (Math.min(1, rv[1]) - Math.max(0, rv[0])) * w, h); x.clip();
    x.globalAlpha = clamp01(st.expose);
    x.drawImage(s.still, 0, 0, w, h);
    x.restore();
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

  // captured plates are printed one per task, so a page of them does not freeze
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
    const o = Object.assign({ mode: 'reeded' }, MOTION, opts);
    const v = { canvas, o, R: null, ctx: null, src: null, g: null, dirty: true, paused: false, visible: false, ratio: 0, frames: 0, dpr: 1, w: 0, h: 0, cssW: 1, cssH: 1 };
    v.st = { clock: 0, env: 0, expose: 1, lift: 0, gk: 0, lastGk: -1, pt: { x: 0, y: 0, tx: 0, ty: 0, amp: 0, on: false, seen: false }, pulses: [], reveal: o.reveal, inStart: 0 };
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
      return +d;
    }
    // advance state; returns whether anything is moving
    function tick(now, dt) {
      const st = v.st, rm = still();
      let moving = false;
      const k = rm ? 1 : 1 - Math.exp(-dt / Math.max(0.001, o.ease));
      if (!rm && o.drift > 0) { st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 4); moving = true; }
      else if (rm) { st.clock = 0; st.env = 0; }
      const e = exposeTarget(now);
      if (o.develop === 'in' && st.inStart && !rm && now - st.inStart < o.developMs) { st.expose = e; moving = true; }
      else if (Math.abs(st.expose - e) > 1e-3 && !rm) { st.expose = lerp(st.expose, e, k); moving = true; }
      else st.expose = e;
      if (o.develop === 'scroll' && !rm) moving = true;
      if (Math.abs(st.lift - o.lift) > 1e-3 && !rm) { st.lift = lerp(st.lift, o.lift, k); moving = true; } else st.lift = o.lift;
      const tr = o.reveal;
      if (tr && st.reveal && !rm && tr.some((x, i) => Math.abs(x - st.reveal[i]) > 1e-4)) { st.reveal = tr.map((x, i) => lerp(st.reveal[i], x, k)); moving = true; }
      else st.reveal = tr;
      const p = st.pt;
      if (!rm && o.rake > 0) {
        const kl = 1 - Math.exp(-dt / Math.max(0.01, o.lag));
        p.x = lerp(p.x, p.tx, kl); p.y = lerp(p.y, p.ty, kl);
        p.amp = lerp(p.amp, p.on ? 1 : 0, 1 - Math.exp(-dt / 0.35));
        if (p.amp > 0.002 || p.on) moving = true; else p.amp = 0;
      } else p.amp = 0;
      st.pulses = rm ? [] : st.pulses.filter(q => now - q.t0 < 2400);
      for (const q of st.pulses) {
        const a = (now - q.t0) / 1000, M = Math.max(v.w, v.h);
        q.r = M * 0.6 * (1 - Math.exp(-a / 0.9));
        q.amp = q.s * (1 - Math.exp(-a / 0.06)) * Math.exp(-a / 0.7);
        moving = true;
      }
      st.gk = o.alive && !rm && st.lift > 0.002 ? Math.floor(now / 1000 * o.grainRate) : 0;
      if (st.gk !== st.lastGk) moving = true;
      return moving;
    }

    v.resize = force => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      v.cssW = r.width; v.cssH = r.height;
      v.dpr = Math.min(2, root.devicePixelRatio || 1) * o.scale;
      const w = Math.max(2, Math.round(r.width * v.dpr)), h = Math.max(2, Math.round(r.height * v.dpr));
      if (w === v.w && h === v.h) return false;
      if (!force && v.src) return true;
      v.w = w; v.h = h;
      if (v.R && v.R.canvas === canvas) { canvas.width = w; canvas.height = h; }
      return true;
    };
    v.run = (now, dt) => {
      // paused holds its last frame (and still draws a first one, so a paused view is never blank)
      if ((v.paused && v.frames) || !v.visible || !v.src) return false;
      if (o.develop === 'in' && !v.st.inStart && v.ratio >= 0.2) v.st.inStart = now;
      const moving = tick(now, dt);
      if (!(moving || v.dirty)) return false;
      if (v.R) { if (drawGPU(v)) { present(v); v.frames++; v.st.lastGk = v.st.gk; v.dirty = false; } }
      else { drawCPU(v); v.frames++; v.st.lastGk = v.st.gk; v.dirty = false; }
      return moving && !still();
    };

    // pointer: the hand is the canvas's parent by default, since a background canvas sits under content
    const hand = o.hand || canvas.parentElement || canvas;
    const at = e => { const r = canvas.getBoundingClientRect(), k = v.w / (r.width || 1); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    const onMove = e => {
      const [x, y] = at(e), p = v.st.pt;
      if (!p.seen) { p.x = x; p.y = y; p.seen = true; }
      p.tx = x; p.ty = y; p.on = true; wake();
    };
    const onLeave = e => { if (e.pointerType !== 'mouse' || e.type === 'pointerleave') { v.st.pt.on = false; wake(); } };
    const onDown = e => { onMove(e); if (o.clickPulse) { const [x, y] = at(e); api.pulseAt(x, y, 0.8); } };
    hand.addEventListener('pointermove', onMove, { passive: true });
    hand.addEventListener('pointerdown', onDown, { passive: true });
    hand.addEventListener('pointerleave', onLeave, { passive: true });
    hand.addEventListener('pointerup', onLeave, { passive: true });
    hand.addEventListener('pointercancel', onLeave, { passive: true });

    const io = new IntersectionObserver(es => es.forEach(en => { v.visible = en.isIntersecting; v.ratio = en.intersectionRatio; if (v.visible) wake(); }), { rootMargin: '120px 0px', threshold: [0, 0.2, 0.5] });
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
      /** merge options; motion options apply next frame, still options reprint the plate */
      set(n) {
        const look = Object.keys(n).filter(k => !(k in MOTION) && n[k] !== o[k]);
        Object.assign(o, n);
        if (n.develop === 'in') v.st.inStart = 0;
        if ('reveal' in n && !v.st.reveal) v.st.reveal = n.reveal;
        if (look.length && v.started) queueBuild(v);
        v.dirty = true; wake(); return api;
      },
      /** replace the plate: every still option is dropped and `n` (mode + its options) put in their place */
      load(n) {
        for (const k of Object.keys(o)) if (!(k in MOTION)) delete o[k];
        Object.assign(o, { mode: 'reeded' }, n);
        if (v.started) queueBuild(v);
        v.dirty = true; wake(); return api;
      },
      /** an echo ring from (x, y) in CSS px of the canvas; strength ~0.3–1 */
      pulse(x, y, s) { const k = v.w / (v.cssW || 1); return api.pulseAt(x * k, y * k, s); },
      pulseAt(x, y, s) {
        if (still()) return api;
        v.st.pulses.push({ x, y, s: s == null ? 0.7 : s, t0: performance.now(), r: 0, amp: 0 });
        if (v.st.pulses.length > 4) v.st.pulses.shift();
        wake(); return api;
      },
      /** move the raking light yourself (CSS px), or put it out with point(null) */
      point(x, y) {
        const p = v.st.pt, k = v.w / (v.cssW || 1);
        if (x == null) p.on = false;
        else { p.tx = x * k; p.ty = y * k; if (!p.seen) { p.x = p.tx; p.y = p.ty; p.seen = true; } p.on = true; }
        wake(); return api;
      },
      pause() { v.paused = true; return api; },
      resume() { v.paused = false; v.dirty = true; wake(); return api; },
      destroy() {
        views.delete(v); io.disconnect(); ro.disconnect(); clearTimeout(rzT);
        for (const [t, f] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerleave', onLeave], ['pointerup', onLeave], ['pointercancel', onLeave]]) hand.removeEventListener(t, f);
        if (v.R && v.g) { v.R.gl.deleteTexture(v.g.still); v.R.gl.deleteTexture(v.g.field); }
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        const i = registry.views.indexOf(api); if (i >= 0) registry.views.splice(i, 1);
      },
      state() { return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.expose.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src, reduced: still() }; },
      /** time n frames with every live term on: `sync` = median with a 1-px readback per frame, `pipelined` = n frames, one readback */
      bench(n) {
        if (!v.R || !v.src) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st;
        const keep = { clock: st.clock, env: st.env, lift: st.lift, pt: Object.assign({}, st.pt), pulses: st.pulses };
        Object.assign(st, { env: 1, lift: 1, pulses: [{ x: v.w / 3, y: v.h / 3, r: v.w / 4, amp: 0.7 }] }); Object.assign(st.pt, { x: v.w / 2, y: v.h / 2, amp: 1 });
        const step = () => { st.gk++; st.clock += 1 / 60; drawGPU(v); };
        step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) { const t0 = performance.now(); step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
        const t0 = performance.now();
        for (let i = 0; i < n; i++) step();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n;
        Object.assign(st, keep); st.pt = keep.pt;
        drawGPU(v); present(v);
        ts.sort((a, b) => a - b);
        return { sync: +ts[ts.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), size: [v.w, v.h], path: api.state().path };
      },
      _v: v,
    };

    views.add(v);
    registry.views.push(api);
    // a canvas with no size yet (display:none) starts when the ResizeObserver sees it get one
    const first = () => {
      v.resize(true);
      if (!v.w) return;
      v.started = true;
      queueBuild(v);
    };
    first();
    return api;
  }
  live.gpu = true;
  // for tests: draw one frame of a view as it stands, or at clock `t` (s) with full drift, no rAF needed
  live._frame = (ctl, t) => { const v = ctl._v; if (t != null) Object.assign(v.st, { clock: t, env: 1 }); if (v.R) { drawGPU(v); present(v); } else drawCPU(v); };
  live.stats = () => ({ views: views.size, jsMsLastFrame: +lastCost.toFixed(2) });

  /**
   * live.parity(opts) — print the still on a 2D canvas and draw frame 0 on the GPU at the same
   * size, plate, palette and seed, and compare luminance mean, contrast (SD), grain (mean |ΔL|
   * between neighbours) and the mean per-channel difference in 8-bit levels.
   */
  live.parity = function (opts) {
    const o = Object.assign({ mode: 'reeded', width: 480, height: 320, seed: 7 }, opts), w = o.width, h = o.height;
    const a = document.createElement('canvas');
    const t0 = performance.now();
    S[o.mode](a, Object.assign(stillOpts(o), { capture: () => {} }));   // capture: print synchronously
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { mode: o.mode, gpu: false };
    const v = { canvas: b, o: Object.assign({}, MOTION, o), R, w, h, cssW: w, dpr: 1 };
    v.st = { clock: 0, env: 0, expose: 1, lift: 0, gk: 0, pt: { x: 0, y: 0, amp: 0 }, pulses: [], reveal: null };
    v.src = printPlate(o, w, h);
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
      mode: o.mode, palette: o.palette, seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
      mean: [r4(A.mean), r4(B.mean)], sd: [r4(A.sd), r4(B.sd)], grain: [r4(A.grain), r4(B.grain)],
      dMean: r4(Math.abs(A.mean - B.mean)), dSdRel: r4(Math.abs(A.sd - B.sd) / A.sd), dGrainRel: r4(Math.abs(A.grain - B.grain) / A.grain),
      madLevels: +(mad / (w * h)).toFixed(3), within2: r4(within2 / (w * h)),
    };
  };
  live.TOLERANCE = { dMean: 0.004, dSdRel: 0.02, dGrainRel: 0.03, madLevels: 1.5 };
  live.pass = r => !!r && r.dMean <= live.TOLERANCE.dMean && r.dSdRel <= live.TOLERANCE.dSdRel && r.dGrainRel <= live.TOLERANCE.dGrainRel && r.madLevels <= live.TOLERANCE.madLevels;

  // the page-level registry tools/check.sh reads: every controller, and this skill's parity cases
  const registry = root.handPulledLive = root.handPulledLive || { views: [], parity: {} };
  let parityCache = null;
  registry.parity['abstract-texture'] = () => parityCache || (parityCache = [
    live.parity({ mode: 'reeded', palette: 'ember', seed: 3, text: false }),
    live.parity({ mode: 'reeded', palette: 'cobalt', seed: 5 }),
    live.parity({ mode: 'satin', palette: 'opal', seed: 2, text: false }),
    live.parity({ mode: 'aurora', palette: 'north', seed: 4 }),
    live.parity({ mode: 'streak', palette: 'signal', seed: 6, width: 320, height: 400 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) })));
  S.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
