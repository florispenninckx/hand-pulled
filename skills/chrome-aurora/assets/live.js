/* live.js — Mercury.live(): a chrome plate that moves like liquid metal.
 *
 * Capture-first. The still engine (mercury.js) is the reference and is not forked: each view
 * runs it once on the CPU side of the page, twice — the finished plate (with its grain) and
 * one of its own passes (`layer: 'normal'` on the film plate, `layer: 'height'` on the others,
 * at half size) — and uploads both as textures. Every frame a WebGL2 fragment shader reads
 * them back and lays the motion on top:
 *   · sheen   — a lamp that follows the pointer, reflected in the captured normals, so the
 *               highlight slides over the folds like light over a pool of mercury;
 *   · ripple  — pulse()/click drops a ring into the metal: it bends the normals and the plate
 *               is re-sampled through them, with a hot crest on the ring;
 *   · aurora  — three hues drift slowly across the chrome, screened onto its highlights;
 *   · tilt    — scrolling tilts the reflected room: the plate is re-sampled along its normals.
 * Every term is exactly zero at clock 0 with the default options, so frame 0 is the still;
 * live.parity() measures it.
 *
 *   const ctl = Mercury.live(canvas, { plate: 'film', look: 'oxide', seed: 4,   // still options
 *                                      drift: 1, pointer: 0.9, tilt: 1 });       // motion options
 *   ctl.set({ level: 0.6 }); ctl.pulse(x, y); ctl.point(x, y); ctl.pause(); ctl.destroy();
 *
 * Big canvases get their own context; small ones share one offscreen context and receive
 * frames as ImageBitmaps. No WebGL2: the still plate from mercury.js, which changes state but
 * does not animate. Reduced motion: the still frame, clock 0, set() jumps to its target.
 *
 * Original implementation, MIT.
 */
(function (root) {
  'use strict';
  const M = root.Mercury;
  if (!M || !M.gpuParts) throw new Error('live.js: load mercury.js first');
  const G = M.gpuParts;
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  const PLATES = ['film', 'trail', 'ribbon', 'glass', 'aurora'];
  const MAX_AREA = 5.3e6;   // views are capped here (device px, a 1440 × 900 CSS view at DPR 2 fits); the CSS size stays

  // motion options: they never re-run the still engine
  const MOTION = {
    drift: 1, speed: 1, hues: ['#35f0c8', '#7b5cff', '#ff4fa0'],
    pointer: 0.9, radius: 0.55, lag: 0.12, hand: null, clickPulse: true,
    tilt: 1, level: 1, fill: null, rise: false, riseMs: 1400, scroll: false,
    ease: 0.16, resolution: 1, own: null, zoom: 280, flow: 1, grainRate: 24, bands: 0,
  };
  const FLOW = 0.05;           // rad/s the lattice's fastest gradients turn at flow 1
  const FIELD_BUDGET = 3.2e5;  // film-equivalent pass-1 pixels redrawn per frame (~1.3 ms); bigger fields flow in bands
  const hex = c => { const n = parseInt(c.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  // ---------------------------------------------------------------- shaders
  const VS = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }`;

  // pass 1: the plate itself. This is mercury.js's own GLSL (PRELUDE + FRAG[plate]), compiled as
  // GLSL 3.00 with three of its hooks filled in: GRAD turns every lattice gradient by the flow clock
  // times its own spin (so the height field flows in place, and every warp built on it flows with
  // it), SLIDE lets the oil slide in the film's fold, AUX hands back the plate's height or normal
  // pass as a second target. With uFlow = 0 each hook is the identity, so the plate is the still.
  const plateFS = name => `#version 300 es
#define LIVE 1
#define texture2D texture
precision highp float;
layout(location = 0) out vec4 outc;
layout(location = 1) out vec4 outa;
vec4 gAux = vec4(0.);
uniform float uFlow, uSlide;
uniform vec3 uWin;            // pass-1 texel -> plate px: origin xy, step
vec4 lat(vec2 i);
vec2 spin(vec2 i) {
  vec4 l = lat(i); vec2 g = l.xy * 2. - 1.;
  float a = uFlow * (l.w * 2. - 1.), c = cos(a), s = sin(a);
  return vec2(c * g.x - s * g.y, s * g.x + c * g.y);
}
#define GRAD(i) spin(i)
#define AUX(v) gAux = v;
#define SLIDE + uSlide * (sin(uFlow * .8 + a.z * 5.) - sin(a.z * 5.))
${G.PRELUDE}
${G.FRAG[name]}
void main() {
  vec2 fc = uWin.xy + gl_FragCoord.xy * uWin.z;
  outc = vec4(clamp(shade((fc - .5 * uRes) / uMin), 0., 1.), 1.);
  outa = gAux;
}`;

  // pass 2, per device pixel: the plate scaled up as the still's drawImage does, its grain (the
  // still's grain() line by line, same integer hash), then the motion laid on top
  const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uBase, uNrm;
uniform vec2 uRes;
uniform float uKind, uClock, uEnv, uTilt, uLevel;
uniform vec4 uLight;          // x, y (px, top-down), amp, radius (px)
uniform vec4 uPul[4];         // x, y, ring radius (px), amp
uniform int uNP;
uniform vec3 uHue[3];
uniform vec4 uFill;           // from, to (0..1 across), soft, on
uniform vec4 uGrain;          // amount (8-bit levels), seed, coarse cell (px), tick
out vec4 outc;
float hash(int x, int y, int s) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.;
}
vec3 normalAt(vec2 uv, out float cover) {
  if (uKind > .5) {
    vec3 t = texture(uNrm, uv).rgb;
    cover = smoothstep(.004, .03, t.r + t.g + t.b);
    return cover > 0. ? normalize(t * 2. - 1.) : vec3(0., 0., 1.);
  }
  cover = 1.;
  vec2 e = 3. / uRes;
  float hx = texture(uNrm, uv + vec2(e.x, 0.)).r - texture(uNrm, uv - vec2(e.x, 0.)).r;
  float hy = texture(uNrm, uv + vec2(0., e.y)).r - texture(uNrm, uv - vec2(0., e.y)).r;
  return normalize(vec3(-hx * 6., -hy * 6., 1.));
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = px / uRes;
  float S = min(uRes.x, uRes.y), cover;
  vec3 n = normalAt(uv, cover);
  // ripples: rings in the metal bend the normal outward along the ring
  vec3 nr = n; float crest = 0.;
  for (int i = 0; i < 4; i++) {
    if (i >= uNP) break;
    vec2 d = px - uPul[i].xy; float r = length(d), w = S * .022;
    float x = (r - uPul[i].z) / w;
    float wave = uPul[i].w * sin(x * 2.4) * exp(-x * x * .18);
    nr.xy += wave * .55 * d / max(r, 1.);
    crest += uPul[i].w * exp(-x * x * .5) * max(sin(x * 2.4 + 1.2), 0.);
  }
  nr = normalize(nr);
  // the room tilts with the scroll and the ripples bend it: re-sample the plate along the normal
  vec2 off = ((nr.xy - n.xy) * .05 + nr.xy * uTilt * .035) * S / uRes;
  vec3 b = floor(texture(uBase, uv + off).rgb * 255. + .5);
  // grain, as the still lays it: strongest in the midtones, a coarser clump, a little colour
  if (uGrain.x > 0.) {
    int x = int(px.x), y = int(px.y), s = int(uGrain.y), f = s + 4 * int(uGrain.w), gs = int(uGrain.z);
    float l = dot(b, vec3(.299, .587, .114)) / 255.;
    float g = (hash(x, y, f) + hash(x, y, f + 1) - 1. + .6 * (hash(x / gs, y / gs, s + 2) - .5)) * uGrain.x * (.3 + 2.4 * l * (1. - l) + .25 * (1. - l));
    float c = (hash(x, y, f + 3) - .5) * uGrain.x * .25;
    b = clamp(floor(b + vec3(g + c, g, g - c) + .5), 0., 255.);
  }
  vec3 col = b / 255. * uLevel;
  float lum = dot(col, vec3(.3, .5, .2));
  // sheen: a lamp held over the pointer, mirrored by the surface
  if (uLight.z > 0.) {
    vec2 dl = (uLight.xy - px) / S;
    vec3 L = normalize(vec3(dl, .42)), H = normalize(L + vec3(0., 0., 1.));
    float ndh = max(dot(nr, H), 0.);
    float spec = 1.3 * pow(ndh, 110.) + .22 * pow(ndh, 10.);
    float fall = exp(-dot(uLight.xy - px, uLight.xy - px) / (uLight.w * uLight.w));
    vec3 tint = mix(vec3(1., .97, .92), clamp(col * 1.8 + .12, 0., 1.), .35);
    col += uLight.z * cover * fall * spec * tint;
  }
  col += crest * .35 * cover * mix(vec3(1.), uHue[0], .3);
  // aurora: three hues drifting slowly across the highlights of the chrome
  if (uEnv > 0.) {
    float ph = dot(uv, vec2(.9, .5)) * 1.2 - uClock * .045 + .22 * sin(uv.y * 3.1 + uClock * .13);
    float f = fract(ph) * 3.;
    vec3 h = f < 1. ? mix(uHue[0], uHue[1], f) : f < 2. ? mix(uHue[1], uHue[2], f - 1.) : mix(uHue[2], uHue[0], f - 2.);
    float w = uEnv * cover * (.1 + .55 * smoothstep(.12, .75, lum));
    col = 1. - (1. - col) * (1. - w * h * (.2 + .8 * lum));
  }
  // fill: outside [from, to] the chrome goes dull, unlit
  if (uFill.w > 0.) {
    float s = max(uFill.z, 1. / uRes.x);
    float f = smoothstep(uFill.x - s, uFill.x + s, uv.x) * (1. - smoothstep(uFill.y - s, uFill.y + s, uv.x));
    col = mix(col * .16 + vec3(.012), col, f);
  }
  outc = vec4(clamp(col, 0., 1.), 1.);
}`;

  // ---------------------------------------------------------------- renderers
  const PLATE_U = ['uRes', 'uMin', 'uLat', 'uImg', 'uImgOn', 'uK0', 'uK1', 'uK2', 'uK3', 'uCol', 'uPos', 'uW', 'uLayer', 'uFlow', 'uSlide', 'uWin'];
  const COMP_U = ['uBase', 'uNrm', 'uRes', 'uKind', 'uClock', 'uEnv', 'uTilt', 'uLevel', 'uLight', 'uPul', 'uNP', 'uHue', 'uFill', 'uGrain'];
  function compile(gl, fs, names) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) { console.warn('mercury live shader:', gl.getShaderInfoLog(s)); return null; }
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { if (!gl.isContextLost()) console.warn('mercury live link:', gl.getProgramInfoLog(p)); return null; }
    const u = {};
    for (const k of names) u[k] = gl.getUniformLocation(p, k);
    return { p, u };
  }
  function makeRenderer(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { gl, canvas, lost: false, plates: {} };
    const setup = () => {
      R.plates = {};
      R.prog = compile(gl, FS, COMP_U);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return !!R.prog;
    };
    if (!setup()) return null;
    const lost = e => { e.preventDefault(); R.lost = true; };
    const back = () => { R.lost = false; setup(); for (const v of views) if (v.R === R) { v.src = null; queueBuild(v); } };
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', back);
    return R;
  }
  // the plate program for `name` on renderer R, compiled once
  function plateProg(R, name) {
    if (R.plates[name] === undefined) R.plates[name] = compile(R.gl, plateFS(name), PLATE_U);
    return R.plates[name];
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
  function texture(gl, w, h, data, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (data && data.width !== undefined && !(data instanceof Uint8Array)) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // ---------------------------------------------------------------- the plate on the GPU
  function stillOpts(o) { const s = {}; for (const k in o) if (!(k in MOTION) && k !== 'plate') s[k] = o[k]; return s; }
  const plateOf = o => PLATES.includes(o.plate) ? o.plate : 'film';
  // the still, drawn by mercury.js into `cv` at w × h (the CPU fallback and parity's reference)
  function runStill(cv, o, w, h, extra) { return M[plateOf(o)](cv, Object.assign(stillOpts(o), { width: w, height: h }, extra)); }
  // small or long canvases see a window onto a bigger plate (at least `zoom` px on its short side,
  // aspect at most 2:1), so a 36 px button shows one smooth fold rather than a whole pour shrunk
  function frameOf(o, w, h) {
    const z = o.zoom == null ? 280 : o.zoom;
    let cw = Math.max(w, z), ch = Math.max(h, z);
    ch = Math.max(ch, Math.round(cw / 2)); cw = Math.max(cw, Math.round(ch / 2));
    return [cw, ch];
  }
  // the still at w × h for the CPU path: the plate itself, or the middle of a bigger one
  function capture(o, w, h) {
    const [cw, ch] = frameOf(o, w, h);
    if (cw === w && ch === h) return runStill(document.createElement('canvas'), o, w, h);
    const big = runStill(document.createElement('canvas'), o, cw, ch);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(big, (cw - w) / 2, (ch - h) / 2, w, h, 0, 0, w, h);
    return out;
  }
  // a plate costs this much per pass-1 pixel, relative to film (noise lookups, the thin film)
  // pass-1 cost per pixel against the film's, measured at 2880x1800 (film 4.2, ribbon 4, trail 3.3, glass 2.7, aurora 1.9 ms/MP)
  const COST = { film: 1, trail: 0.8, ribbon: 0.95, glass: 0.65, aurora: 0.45 };
  function build(v) {
    if (!v.w || !v.h) return;
    const o = v.o, name = plateOf(o);
    v.cpuStill = null;
    if (!v.R) { v.src = { cpu: true }; v.dirty = true; return; }
    const gl = v.R.gl, prog = plateProg(v.R, name);
    if (!prog) { v.R = null; v.ctx = v.canvas.getContext('2d'); v.src = { cpu: true }; v.dirty = true; return; }
    const [cw, ch] = frameOf(o, v.w, v.h), win = cw !== v.w || ch !== v.h;
    const { seed, P, lat, pic } = G.prepare(name, stillOpts(o), cw, ch);
    const S = G.SCALE[name];
    const bw = Math.max(8, Math.round(cw * S)), bh = Math.max(8, Math.round(ch * S));
    const tw = win ? Math.max(8, Math.round(v.w * S)) : bw, th = win ? Math.max(8, Math.round(v.h * S)) : bh;
    const k = win ? (bw / cw) * (v.w / tw) : 1;
    // the lattice as the still uploads it, plus a spin per node in the alpha the still leaves at 255
    const bytes = lat.bytes.slice(), r = M.mulberry32(seed * 131 + 71);
    for (let i = 3; i < bytes.length; i += 4) bytes[i] = Math.floor(r() * 256);
    freeSrc(v);
    const tex = {
      lat: texture(gl, G.N, G.N, bytes, gl.NEAREST),
      img: pic ? texture(gl, 0, 0, pic.canvas, gl.LINEAR) : texture(gl, 1, 1, new Uint8Array([128, 128, 128, 255]), gl.LINEAR),
      base: texture(gl, tw, th, null, gl.LINEAR), nrm: texture(gl, tw, th, null, gl.LINEAR),
    };
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.base, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex.nrm, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const okFb = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!okFb) { v.src = null; for (const t of Object.values(tex)) gl.deleteTexture(t); gl.deleteFramebuffer(fb); v.R = null; v.ctx = v.canvas.getContext('2d'); v.src = { cpu: true }; v.dirty = true; return; }
    const bands = o.bands || Math.max(1, Math.min(24, Math.ceil(tw * th * COST[name] / FIELD_BUDGET)));
    v.src = {
      base: tex.base, nrm: tex.nrm, tex, fb, prog, name, P, w: v.w, h: v.h, tw, th, kind: name === 'film' ? 1 : 0,
      res: [bw, bh], win: win ? [(bw - v.w * (bw / cw)) / 2, (bh - v.h * (bh / ch)) / 2, k] : [0, 0, 1],
      imgOn: pic ? P.imgMix : 0, grain: (P.grain || 0) * 255, seed: seed * 7 + 3, gs: Math.max(1, Math.round(Math.min(cw, ch) / 800)),
      slide: name === 'film' ? 0.22 : 0, bands, band: 0, field: -1,
    };
    v.dirty = true;
  }
  function freeSrc(v) {
    const s = v.src;
    if (!s || !s.tex || !v.R) return;
    const gl = v.R.gl;
    for (const t of Object.values(s.tex)) gl.deleteTexture(t);
    gl.deleteFramebuffer(s.fb);
  }

  // ---------------------------------------------------------------- drawing
  // pass 1: the plate at flow time t into its framebuffer, all of it or one band of rows
  function drawField(v, t, band) {
    const R = v.R, s = v.src, gl = R.gl, u = s.prog.u, P = s.P;
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
    gl.viewport(0, 0, s.tw, s.th);
    if (band != null && s.bands > 1) {
      const y0 = Math.floor(s.th * band / s.bands), y1 = Math.floor(s.th * (band + 1) / s.bands);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, s.tw, y1 - y0);
    }
    gl.useProgram(s.prog.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex.lat);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.tex.img);
    gl.uniform1i(u.uLat, 0); gl.uniform1i(u.uImg, 1);
    gl.uniform2f(u.uRes, s.res[0], s.res[1]); gl.uniform1f(u.uMin, Math.min(s.res[0], s.res[1]));
    gl.uniform1f(u.uImgOn, s.imgOn); gl.uniform1f(u.uLayer, 0);
    gl.uniform4fv(u.uK0, P.k[0]); gl.uniform4fv(u.uK1, P.k[1]); gl.uniform4fv(u.uK2, P.k[2]); gl.uniform4fv(u.uK3, P.k[3]);
    gl.uniform3fv(u.uCol, P.col.flat()); gl.uniform1fv(u.uPos, P.pos);
    gl.uniform3fv(u.uW, G.WEIGHTS.flat());
    gl.uniform1f(u.uFlow, t); gl.uniform1f(u.uSlide, s.slide);
    gl.uniform3f(u.uWin, s.win[0], s.win[1], s.win[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function drawGPU(v) {
    const R = v.R, s = v.src;
    if (!R || R.lost || !s || !s.base) return false;
    const gl = R.gl, u = R.prog.u, st = v.st, o = v.o;
    // the field: whole when it is new or has to go back to the still, one band a frame while it flows
    const t = st.flow;
    if (s.field < 0 || (t === 0 && s.field !== 0)) { drawField(v, t); s.field = t; }
    else if (t !== s.field) { drawField(v, t, s.band); s.band = (s.band + 1) % s.bands; s.field = t; }
    if (R.canvas.width !== s.w || R.canvas.height !== s.h) { R.canvas.width = s.w; R.canvas.height = s.h; }
    gl.viewport(0, 0, s.w, s.h);
    gl.useProgram(R.prog.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.base);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.nrm);
    gl.uniform1i(u.uBase, 0); gl.uniform1i(u.uNrm, 1);
    gl.uniform2f(u.uRes, s.w, s.h);
    gl.uniform1f(u.uKind, s.kind);
    gl.uniform1f(u.uClock, st.clock);
    gl.uniform1f(u.uEnv, st.env * o.drift);
    gl.uniform1f(u.uTilt, st.tilt * o.tilt);
    gl.uniform1f(u.uLevel, st.level);
    const S = Math.min(s.w, s.h), L = st.light;
    gl.uniform4f(u.uLight, L.x, L.y, L.amp * o.pointer, Math.max(1, o.radius * S * 2));
    const pu = new Float32Array(16);
    st.pulses.forEach((q, i) => pu.set([q.x, q.y, q.ring, q.amp], i * 4));
    gl.uniform4fv(u.uPul, pu); gl.uniform1i(u.uNP, st.pulses.length);
    gl.uniform3fv(u.uHue, (o.hues || MOTION.hues).slice(0, 3).map(hex).flat());
    const f = st.fill;
    gl.uniform4f(u.uFill, f ? f[0] : 0, f ? f[1] : 1, f ? (f[2] == null ? 0.01 : f[2]) : 0, f ? 1 : 0);
    gl.uniform4f(u.uGrain, s.grain, s.seed, s.gs, st.gk);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function present(v) {
    const R = v.R;
    if (R.canvas === v.canvas) return;
    if (v.canvas.width !== v.src.w || v.canvas.height !== v.src.h) { v.canvas.width = v.src.w; v.canvas.height = v.src.h; }
    if (R.offscreen) v.ctx.transferFromImageBitmap(R.canvas.transferToImageBitmap());
    else { v.ctx.globalCompositeOperation = 'copy'; v.ctx.drawImage(R.canvas, 0, 0); }
  }
  // no WebGL2: the still plate; level and fill applied as flat darkening
  function drawCPU(v) {
    const c = v.canvas, st = v.st;
    if (!v.cpuStill) v.cpuStill = capture(v.o, v.w, v.h);
    const x = v.ctx || c.getContext('2d');
    if (c.width !== v.w || c.height !== v.h) { c.width = v.w; c.height = v.h; }
    x.globalCompositeOperation = 'copy'; x.drawImage(v.cpuStill, 0, 0); x.globalCompositeOperation = 'source-over';
    if (st.level < 1) { x.fillStyle = `rgba(0,0,0,${1 - st.level})`; x.fillRect(0, 0, v.w, v.h); }
    const f = st.fill;
    if (f) { x.fillStyle = 'rgba(3,3,4,.84)'; x.fillRect(0, 0, f[0] * v.w, v.h); x.fillRect(f[1] * v.w, 0, v.w - f[1] * v.w, v.h); }
  }

  // ---------------------------------------------------------------- views and the one loop
  const views = new Set(), T0 = performance.now();
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
      if (v && views.has(v)) { try { v.resize(true); build(v); } catch (e) { console.warn('mercury live build:', e); } wake(); }
      if (buildQueue.length) setTimeout(next, 0); else building = false;
    }, 0);
  }

  function live(canvas, opts) {
    const o = Object.assign({ plate: 'film' }, MOTION, opts);
    const v = { canvas, o, R: null, ctx: null, src: null, dirty: true, paused: false, visible: false, ratio: 0, frames: 0, dpr: 1, w: 0, h: 0, cssW: 1, cssH: 1 };
    v.st = { clock: 0, flow: 0, gk: 0, env: 0, tilt: 0, tilt0: null, level: o.rise ? 0 : o.level, riseStart: 0, fill: o.fill ? o.fill.slice() : null, light: { x: 0, y: 0, tx: 0, ty: 0, amp: 0, on: false, seen: false }, pulses: [] };
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
    const lerp = (a, b, k) => a + (b - a) * k;

    function levelTarget(now) {
      if (o.rise) {
        if (still()) return o.level;
        if (!v.st.riseStart) return 0;
        const t = clamp01((now - v.st.riseStart) / o.riseMs);
        return o.level * (1 - Math.pow(1 - t, 3));
      }
      if (o.scroll) {
        const r = canvas.getBoundingClientRect(), vh = root.innerHeight || 1;
        if (still()) return o.level;
        return o.level * (0.15 + 0.85 * clamp01((vh - r.top) / (vh * 0.8)));
      }
      return o.level;
    }
    // advance state; returns whether anything is moving
    function tick(now, dt) {
      const st = v.st, rm = still();
      let moving = false;
      const k = rm ? 1 : 1 - Math.exp(-dt / Math.max(0.001, o.ease));
      if (!rm && o.drift > 0) { st.clock += dt * o.speed; st.env = 1 - Math.exp(-st.clock / 3); moving = true; }
      else if (rm) { st.clock = 0; st.env = 0; }
      // the metal's own clock: the height field flows while it runs; grain re-rolls 24 times a second
      if (!rm && o.flow > 0) { st.flow += dt * o.flow * o.speed * FLOW; moving = true; } else if (rm) st.flow = 0;
      st.gk = !rm && o.grainRate > 0 && (o.flow > 0 || o.drift > 0) ? Math.floor((performance.now() - T0) / 1000 * o.grainRate) % 997 + 1 : 0;
      const lt = levelTarget(now);
      if (!rm && Math.abs(st.level - lt) > 1e-3) { st.level = o.rise && st.riseStart ? lt : lerp(st.level, lt, k); moving = true; } else st.level = lt;
      if (o.scroll && !rm) moving = true;
      // tilt: where the canvas sits in the viewport, relative to where it sat on the first frame
      if (!rm && o.tilt) {
        const r = canvas.getBoundingClientRect(), vh = root.innerHeight || 1;
        const pos = ((r.top + r.height / 2) - vh / 2) / vh;
        if (st.tilt0 == null) st.tilt0 = pos;
        const tt = Math.max(-1.2, Math.min(1.2, st.tilt0 - pos));
        if (Math.abs(st.tilt - tt) > 1e-4) { st.tilt = lerp(st.tilt, tt, 1 - Math.exp(-dt / 0.25)); moving = true; }
      } else st.tilt = 0;
      // fill eases toward its target
      const tf = o.fill;
      if (!tf) st.fill = null;
      else if (!st.fill || rm) st.fill = tf.slice();
      else {
        const nf = st.fill.map((x, i) => lerp(x, tf[i] == null ? x : tf[i], k));
        if (nf.some((x, i) => Math.abs(x - (tf[i] == null ? x : tf[i])) > 1e-3)) { st.fill = nf; moving = true; } else st.fill = tf.slice();
      }
      const L = st.light;
      if (!rm && o.pointer) {
        const kl = 1 - Math.exp(-dt / Math.max(0.01, o.lag));
        L.x = lerp(L.x, L.tx, kl); L.y = lerp(L.y, L.ty, kl);
        L.amp = lerp(L.amp, L.on ? 1 : 0, 1 - Math.exp(-dt / 0.25));
        if (L.amp > 0.002 || L.on) moving = true; else L.amp = 0;
      } else L.amp = 0;
      st.pulses = rm ? [] : st.pulses.filter(q => now - q.t0 < 2400);
      const S = Math.min(v.w, v.h) || 1;
      for (const q of st.pulses) {
        const a = (now - q.t0) / 1000;
        q.ring = S * (0.02 + 0.75 * (1 - Math.exp(-a / 0.9)));      // a ring that spreads and slows
        q.amp = q.s * (1 - Math.exp(-a / 0.04)) * Math.exp(-a / 0.6);
        moving = true;
      }
      return moving;
    }

    v.resize = force => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      v.cssW = r.width; v.cssH = r.height;
      let dpr = Math.min(2, root.devicePixelRatio || 1) * o.resolution;
      if (r.width * r.height * dpr * dpr > MAX_AREA) dpr = Math.sqrt(MAX_AREA / (r.width * r.height));
      v.dpr = dpr;
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (w === v.w && h === v.h) return false;
      if (!force && v.src) return true;
      v.w = w; v.h = h;
      return true;
    };
    v.run = (now, dt) => {
      if ((v.paused && v.frames) || !v.visible || !v.src) return false;
      if (o.rise && !v.st.riseStart && v.ratio >= 0.25) v.st.riseStart = now;
      const moving = tick(now, dt);
      if (!(moving || v.dirty)) return false;
      if (v.R) { if (drawGPU(v)) { present(v); v.frames++; v.dirty = false; } }
      else { drawCPU(v); v.frames++; v.dirty = false; }
      return moving && !!v.R;
    };

    // pointer: the hand is the canvas's parent by default, since a background canvas sits under content
    const hand = o.hand || canvas.parentElement || canvas;
    const at = e => { const r = canvas.getBoundingClientRect(), k = v.w / (r.width || 1); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    const onMove = e => {
      if (!o.pointer) return;
      const [x, y] = at(e), L = v.st.light;
      if (!L.seen) { L.x = x; L.y = y; L.seen = true; }
      L.tx = x; L.ty = y; L.on = true; wake();
    };
    const onLeave = e => { if (e.pointerType !== 'mouse' || e.type === 'pointerleave') { v.st.light.on = false; wake(); } };
    const onDown = e => { onMove(e); if (o.clickPulse) { const [x, y] = at(e); api.pulseAt(x, y, 0.7); } };
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
      if (!v.src) return;
      if (!v.resize(false)) return;
      clearTimeout(rzT);
      rzT = setTimeout(() => queueBuild(v), 160);
    });
    ro.observe(canvas);

    const api = {
      canvas,
      /** merge options; motion options apply next frame, still options re-run the still engine */
      set(n) {
        const look = Object.keys(n).filter(k => !(k in MOTION) && n[k] !== o[k]);
        Object.assign(o, n);
        if ('rise' in n && n.rise) v.st.riseStart = 0;
        if (look.length || 'zoom' in n) queueBuild(v);
        v.dirty = true; wake(); return api;
      },
      /** replace the plate: every still option is dropped and `n` (plate + its options) put in their place */
      load(n) {
        for (const k of Object.keys(o)) if (!(k in MOTION)) delete o[k];
        Object.assign(o, { plate: 'film' }, n);
        queueBuild(v); v.dirty = true; wake(); return api;
      },
      /** a ripple dropped at (x, y) in CSS px of the canvas; strength ~0.3–1 */
      pulse(x, y, s) { const k = v.w / (v.cssW || 1); return api.pulseAt(x * k, y * k, s); },
      pulseAt(x, y, s) {
        if (still()) return api;
        v.st.pulses.push({ x, y, s: s == null ? 0.7 : s, t0: performance.now(), amp: 0, ring: 0 });
        if (v.st.pulses.length > 4) v.st.pulses.shift();
        wake(); return api;
      },
      /** hold the lamp yourself (CSS px), or put it down with point(null) */
      point(x, y) {
        const L = v.st.light, k = v.w / (v.cssW || 1);
        if (x == null) L.on = false;
        else { L.tx = x * k; L.ty = y * k; if (!L.seen) { L.x = L.tx; L.y = L.ty; L.seen = true; } L.on = true; }
        wake(); return api;
      },
      pause() { v.paused = true; return api; },
      resume() { v.paused = false; v.dirty = true; wake(); return api; },
      destroy() {
        views.delete(v); io.disconnect(); ro.disconnect(); clearTimeout(rzT);
        for (const [t, f] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerleave', onLeave], ['pointerup', onLeave], ['pointercancel', onLeave]]) hand.removeEventListener(t, f);
        freeSrc(v);
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        const i = registry.views.indexOf(api); if (i >= 0) registry.views.splice(i, 1);
      },
      state() { return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.level.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src, reduced: still() }; },
      /** time n frames with every term on (lamp, two ripples, aurora, tilt): `sync` waits for the GPU after
       *  every frame (1-pixel readback) and reports the median; `pipelined` issues n frames and waits once */
      // jump to t seconds of motion (clock and flow), the whole field redrawn: stills of the motion, tests
      seek(t) {
        const st = v.st;
        st.clock = t; st.flow = t * v.o.flow * v.o.speed * FLOW;
        if (v.src && v.src.base) v.src.field = -1;
        v.dirty = true;
        if (v.R && v.src && v.src.base && drawGPU(v)) { present(v); v.frames++; }
        return api;
      },
      bench(n) {
        if (!v.R || !v.src || !v.src.base) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st;
        const keep = { clock: st.clock, flow: st.flow, gk: st.gk, env: st.env, tilt: st.tilt, light: Object.assign({}, st.light), pulses: st.pulses };
        const S = Math.min(v.w, v.h);
        Object.assign(st, { env: 1, tilt: 0.4, pulses: [{ x: v.w * 0.3, y: v.h * 0.5, ring: S * 0.3, amp: 0.6 }, { x: v.w * 0.7, y: v.h * 0.4, ring: S * 0.2, amp: 0.5 }] });
        Object.assign(st.light, { x: v.w / 2, y: v.h / 2, amp: 1 });
        const step = () => { st.clock += 1 / 60; st.flow += FLOW / 60; st.gk = (st.gk + 1) % 997; drawGPU(v); };
        step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) { const t0 = performance.now(); step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
        const t0 = performance.now();
        for (let i = 0; i < n; i++) step();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n;
        // the whole field in one go, as a view pays for it on its first frame
        let field = Infinity;
        for (let i = 0; i < 6; i++) {
          const tf = performance.now();
          drawField(v, st.flow + i * 0.01);
          gl.bindFramebuffer(gl.FRAMEBUFFER, v.src.fb);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          field = Math.min(field, performance.now() - tf);
        }
        Object.assign(st, { clock: keep.clock, flow: keep.flow, gk: keep.gk, env: keep.env, tilt: keep.tilt, pulses: keep.pulses }); Object.assign(st.light, keep.light);
        v.src.field = -1;
        drawGPU(v); present(v);
        ts.sort((a, b) => a - b);
        return { sync: +ts[ts.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), field: +field.toFixed(2), bands: v.src.bands, size: [v.w, v.h], fieldSize: [v.src.tw, v.src.th], path: api.state().path };
      },
      _v: v,
    };

    views.add(v);
    registry.views.push(api);
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
  live.MOTION = MOTION;
  live.stats = () => ({ views: views.size, jsMsLastFrame: +lastCost.toFixed(2) });

  /**
   * live.parity(opts) — the still from mercury.js on a 2D canvas, and frame 0 on the GPU at the
   * same size, plate, look and seed; compared on mean luminance, contrast (luminance SD),
   * grain (mean |ΔL| between neighbours) and the mean per-channel difference in 8-bit levels.
   */
  live.parity = function (opts) {
    const o = Object.assign({ plate: 'film', width: 480, height: 320, seed: 7 }, opts), w = o.width, h = o.height;
    const a = document.createElement('canvas');
    const t0 = performance.now();
    runStill(a, o, w, h);
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { plate: o.plate, gpu: false };
    const v = { canvas: b, o: Object.assign({}, MOTION, o), R, w, h };
    v.st = { clock: 0, flow: 0, gk: 0, env: 0, tilt: 0, level: 1, fill: null, light: { x: 0, y: 0, amp: 0 }, pulses: [] };
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
      mode: o.plate + ':' + (o.look || 'default'), plate: o.plate, look: o.look, seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
      mean: [r4(A.mean), r4(B.mean)], sd: [r4(A.sd), r4(B.sd)], grain: [r4(A.grain), r4(B.grain)],
      dMean: r4(Math.abs(A.mean - B.mean)), dSdRel: r4(Math.abs(A.sd - B.sd) / (A.sd || 1)), dGrainRel: r4(Math.abs(A.grain - B.grain) / (A.grain || 1)),
      madLevels: +(mad / (w * h)).toFixed(3), within2: r4(within2 / (w * h)),
    };
  };
  live.TOLERANCE = { dMean: 0.004, dSdRel: 0.02, dGrainRel: 0.03, madLevels: 1.5 };
  live.pass = r => !!r && r.dMean <= live.TOLERANCE.dMean && r.dSdRel <= live.TOLERANCE.dSdRel && r.dGrainRel <= live.TOLERANCE.dGrainRel && r.madLevels <= live.TOLERANCE.madLevels;

  // the page-level registry tools/check.sh reads: every controller, and this skill's parity cases
  const registry = root.handPulledLive = root.handPulledLive || { views: [], parity: {} };
  registry.parity['chrome-aurora'] = () => [
    live.parity({ plate: 'film', look: 'oxide', seed: 7 }),
    live.parity({ plate: 'film', look: 'titanium', seed: 5 }),
    live.parity({ plate: 'glass', look: 'pool', seed: 2 }),
    live.parity({ plate: 'glass', look: 'eye', seed: 3 }),
    live.parity({ plate: 'ribbon', look: 'volt', seed: 5 }),
    live.parity({ plate: 'trail', look: 'ember', seed: 4 }),
    live.parity({ plate: 'aurora', look: 'iris', seed: 2, width: 320, height: 400 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) }));
  M.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
