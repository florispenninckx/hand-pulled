/* live.js — Cyanotype.live(): the cyanotype pipeline on the GPU, moving.
 *
 * The still engine (cyanotype.js) is the reference. This file runs the same three
 * steps per frame in WebGL2 fragment shaders:
 *   1. the field T: `field`, `halo` and `caustics` are ported to GLSL with the same
 *      Perlin table and the same pixel grid, so they can move (pass 1, on a coarse
 *      grid like the still); every other mode (`print`, `relief`, `marble`, `screen`,
 *      `tone`, `develop`) runs the still engine once with `capture` and uploads T;
 *   2. grain perturbs T before the ramp: compose() ported line by line, same integer
 *      hashes, same three block scales, same blotch, coarse gate, edge band and weave;
 *   3. the ramp: the palette baked into a 1024-texel texture from Cyanotype.ramp().
 * Frame 0 at time 0 with the defaults is the still; live.parity() measures that.
 *
 *   const ctl = Cyanotype.live(canvas, { mode: 'field', palette: 'cobalt', seed: 4,   // still options
 *                                        drift: 1, pointer: 0.2, develop: 'in' });     // motion options
 *   ctl.set({ develop: 0.4 }); ctl.pulse(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * Motion is indigo's own: light drifting like water under glass, an exposure that
 * develops, grain re-rolled like film (24 per second, the coarse clumps stay put), a
 * pool of light that trails the pointer, and pulse() as a flash exposure. Big canvases
 * get their own context; small ones share one offscreen context and receive frames as
 * ImageBitmaps. Without WebGL2 every canvas falls back to the CPU still; with reduced
 * motion every canvas shows its still frame and changes state without animating.
 *
 * Original implementation.
 */
(function (root) {
  'use strict';
  const C = root.Cyanotype;
  if (!C) throw new Error('live.js: load cyanotype.js first');
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  const PROC = { field: 0, halo: 1, caustics: 2 };
  // motion options: changing these never recomputes the field
  const MOTION = {
    drift: 1, speed: 1, pointer: 0.18, radius: 0.22, lag: 0.35, hand: null, clickPulse: false,
    develop: 1, developMs: 2600, ease: 0.18, scrollRange: [0, 1], grainRate: 24, alive: true,
    reveal: null, holds: null, transparent: 0, own: null, resolution: 1, maxField: 1.2e6, fieldStep: 0,
  };
  // look options: a new ramp or grain amount, no new field (for captured modes)
  const LOOK = { palette: 1, grain: 1, coarse: 1, weave: 1, edgeBoost: 1 };
  const STILL = {
    field: { seed: 1, palette: 'cobalt', softness: 1, grain: 1.1, scale: 1 },
    halo: { seed: 1, palette: 'eclipse', grain: 1.1, x: -0.16, y: 0.38, r: 0.42, angle: 0.12, point: 0.55, warp: 1 },
    caustics: { seed: 1, palette: 'pool', grain: 1, cell: 0.09, squash: 0.6, warp: 1, width: 0.16, second: 0.6, map: [0.9, -0.85] },
  };

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  // the still engine's noise and hash, bit for bit: the Perlin table comes from makeNoise(rand)
  const LIB = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform usampler2D uPerm;
int P(int i) { return int(texelFetch(uPerm, ivec2(i, 0), 0).r); }
float gr(int h, float x, float y) { return ((h & 1) != 0 ? -x : x) + ((h & 2) != 0 ? -y : y); }
float noise(float x, float y) {
  float xi = floor(x), yi = floor(y); int X = int(xi) & 255, Y = int(yi) & 255; x -= xi; y -= yi;
  float u = x * x * x * (x * (x * 6. - 15.) + 10.), v = y * y * y * (y * (y * 6. - 15.) + 10.);
  int a = P(X) + Y, b = P(X + 1) + Y;
  float g00 = gr(P(a), x, y), g10 = gr(P(b), x - 1., y), g01 = gr(P(a + 1), x, y - 1.), g11 = gr(P(b + 1), x - 1., y - 1.);
  float n0 = g00 + u * (g10 - g00), n1 = g01 + u * (g11 - g01);
  return n0 + v * (n1 - n0);
}
float fbm(float x, float y, int o) { float s = 0., a = .5, f = 1.; for (int i = 0; i < 4; i++) { if (i >= o) break; s += a * noise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
float hash2(int x, int y, int s) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.;
}
`;

  // pass 1: a procedural field on the still's coarse grid (texel i is pixel x = i * step)
  const FS_FIELD = LIB + `
uniform int uKind; uniform float uStep, uTau, uClampOut; uniform vec2 uSize;
uniform int uN; uniform vec4 uA[6], uB[6], uO[6]; uniform float uWarpS, uSoft;
uniform vec4 uH0, uH1;
uniform vec4 uK0, uK1; uniform vec2 uMap;
out vec4 outc;
float seg2(vec2 p, vec2 a, vec2 b) { vec2 d = b - a; float l2 = dot(d, d); if (l2 == 0.) l2 = 1.; float t = clamp(dot(p - a, d) / l2, 0., 1.); vec2 e = p - (a + t * d); return dot(e, e); }
float fieldT(float x, float y) {
  float v = 0.;
  for (int i = 0; i < 6; i++) {
    if (i >= uN) break;
    float sg = uA[i].y, ox = uO[i].x, oy = uO[i].y;
    vec2 w = vec2(x + noise(x / uWarpS + ox + uTau, y / uWarpS + ox) * sg * .55 * uSoft,
                  y + noise(x / uWarpS + oy, y / uWarpS + oy + uTau) * sg * .55 * uSoft);
    float d2 = uA[i].x > .5 ? seg2(w, uB[i].xy, uB[i].zw) : dot(w - uB[i].xy, w - uB[i].xy);
    v += uA[i].z * exp(-d2 / (2. * sg * sg));
  }
  return v;
}
float haloT(float x, float y) {
  float cx = uH0.x, cy = uH0.y, R = uH0.z, warp = uH0.w, ca = uH1.x, sa = uH1.y, point = uH1.z, s = uH1.w;
  float wx = x + noise(x / (.5 * s) + 3. + uTau, y / (.5 * s)) * .08 * R * warp, wy = y + noise(x / (.5 * s), y / (.5 * s) + 7. + uTau) * .08 * R * warp;
  float dx = (wx - cx) * ca + (wy - cy) * sa, dy = -(wx - cx) * sa + (wy - cy) * ca;
  float k = 1. + point * clamp(dx / R, 0., 1.) * 1.2;
  float u = length(vec2(dx, dy * k)) / R;
  float core = u <= 1. ? 1. - .08 * pow(u, 6.) : .7 * exp(-pow((u - 1.) / .36, 1.5));
  float edge = u <= 1. ? 0. : clamp(1. - (u - 1.) / .1, 0., 1.) * .24;
  float far = smoothstep(1.5, 2.5, u), low = smoothstep(.35, 1., y / uSize.y + .25 * (x / uSize.x - .5));
  float outer = far * (.16 + .58 * low) + .05 * noise(x / (.3 * s) + 20. + uTau * .5, y / (.3 * s));
  return max(core + edge, outer);
}
float web(float u, float v, int sd) {
  float iu = floor(u), iv = floor(v), f1 = 9., f2 = 9.;
  for (int b = -1; b <= 1; b++) for (int a = -1; a <= 1; a++) {
    int gx = int(iu) + a, gy = int(iv) + b;
    float px = float(gx) + .1 + .8 * hash2(gx, gy, sd), py = float(gy) + .1 + .8 * hash2(gx, gy, sd + 3);
    if (uTau != 0.) {   // the points of the web wander: ripples on the surface above
      float ph = 6.2832 * hash2(gx, gy, sd + 5), w = .6 + .8 * hash2(gx, gy, sd + 7);
      px += .09 * (sin(uTau * 9. * w + ph) - sin(ph)); py += .09 * (cos(uTau * 7. * w + ph) - cos(ph));
    }
    float d = length(vec2(px - u, py - v));
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;
}
float causT(float x, float y) {
  float c = uK0.x, squash = uK0.y, warp = uK0.z, width = uK0.w, second = uK1.x, s = uK1.y; int sd = int(uK1.z);
  float ws = .35 * s, ca = cos(.7), sa = sin(.7);
  float wx = x + fbm(x / ws + uTau * .6, y / ws + 4., 2) * c * .9 * warp;
  float wy = y + fbm(x / ws + 9., y / ws + uTau * .6, 2) * c * .9 * warp;
  float lw = width * (.55 + .9 * (.5 + .5 * noise(x / (.3 * s) + 21., y / (.3 * s))));
  float A = exp(-web(wx / c, wy / (c * squash), sd) / lw);
  float rx = (wx * ca - wy * sa) / (c * .62), ry = (wx * sa + wy * ca) / (c * .62 * squash);
  float Bw = exp(-web(rx, ry, sd + 17) / (lw * .8)) * second;
  float gain = .6 + .4 * (.5 + .5 * noise(x / (.45 * s) + 33., y / (.45 * s) + 7.));
  float L = (1. - (1. - A) * (1. - Bw)) * gain;
  return uMap.x + uMap.y * pow(L, .9);
}
void main() {
  vec2 ij = floor(gl_FragCoord.xy); float x = ij.x * uStep, y = ij.y * uStep;
  float v = uKind == 0 ? fieldT(x, y) : uKind == 1 ? haloT(x, y) : causT(x, y);
  if (uClampOut > .5) v = clamp(v, 0., 1.);
  outc = vec4(v, 0., 0., 1.);
}`;

  // pass 2: compose() — grain on T before the ramp — plus the live terms, which are all zero at frame 0
  const FS_DEV = LIB + `
uniform sampler2D uT, uBl, uRamp; uniform vec2 uTSize, uBlSize, uSize; uniform float uTStep;
uniform int uSeed, uGSeed;
uniform float uGrain, uEdgeBoost, uWeave, uCoarse, uExpose, uAlpha, uClampT;
uniform vec4 uDrift;                          // warp px, light, clock s, short side px
uniform vec4 uPool; uniform vec3 uPoolDir;    // x, y, radius px, amount; unit direction, stretch
uniform vec4 uPulse[4]; uniform int uNPulse;  // x, y, sigma px, amount
uniform vec4 uHold[4]; uniform int uNHold;    // x, y, r, soft (px): objects laid on the paper
uniform vec4 uReveal;                         // x0, x1, soft (px), on
uniform vec4 uAcc[4]; uniform int uNAcc;      // print() accents: x, y, r, a
out vec4 outc;
// field() and halo() clamp T after the coarse grid; develop() and the captured modes hand T over as it is
float Tat(vec2 q) { float t = texture(uT, (q / uTStep + .5) / uTSize).r; return uClampT > .5 ? clamp(t, 0., 1.) : t; }
vec2 warp(vec2 p, float t) {
  vec2 q = p / uDrift.w;
  return vec2(sin(q.x * 5.1 + q.y * 2.3 + t * .31) + .6 * sin(-q.x * 3.7 + q.y * 6.9 + t * .23 + 1.7) + .35 * sin(q.x * 11.3 - q.y * 4.1 - t * .47),
              sin(-q.x * 2.9 + q.y * 4.7 + t * .27 + 2.1) + .6 * sin(q.x * 6.3 + q.y * 3.1 - t * .35) + .35 * sin(-q.x * 5.3 + q.y * 12.1 + t * .41 + 4.)) / 1.95;
}
float glint(vec2 p, float t) {
  vec2 q = p / uDrift.w;
  return sin(q.x * 1.7 + q.y * 1.1 + t * .19) * sin(q.y * 2.3 - q.x * .7 - t * .13 + 1.3);
}
void main() {
  int x = int(gl_FragCoord.x), y = int(uSize.y - gl_FragCoord.y);
  vec2 p = vec2(float(x), float(y));
  vec2 q = uDrift.x > 0. ? p + uDrift.x * warp(p, uDrift.z) : p;
  vec4 s = texture(uT, (q / uTStep + .5) / uTSize);
  float t = uClampT > .5 ? clamp(s.r, 0., 1.) : s.r, edge = s.g;
  float gate = 0.;
  if (uCoarse > 0.) {
    float W = uSize.x - 1., H = uSize.y - 1.;
    float gx = Tat(vec2(min(W, q.x + 10.), q.y)) - Tat(vec2(max(0., q.x - 10.), q.y));
    float gy = Tat(vec2(q.x, min(H, q.y + 10.))) - Tat(vec2(q.x, max(0., q.y - 10.)));
    gate = clamp(length(vec2(gx, gy)) * 4.5 * min(1., uExpose), 0., 1.);
  }
  // live terms: exposure, drifting light, the pool under the pointer, flashes; then what blocks the light
  float light = t * uExpose;
  if (uDrift.y != 0.) light += uDrift.y * glint(p, uDrift.z);
  if (uPool.w != 0.) {
    vec2 d = p - uPool.xy; float al = dot(d, uPoolDir.xy); vec2 pe = d - al * uPoolDir.xy;
    light += uPool.w * exp(-(al * al / (uPoolDir.z * uPoolDir.z) + dot(pe, pe)) / (2. * uPool.z * uPool.z));
  }
  for (int i = 0; i < 4; i++) { if (i >= uNPulse) break; vec2 d = p - uPulse[i].xy; light += uPulse[i].w * exp(-dot(d, d) / (2. * uPulse[i].z * uPulse[i].z)); }
  float mask = 1.;
  for (int i = 0; i < 4; i++) { if (i >= uNHold) break; mask *= smoothstep(uHold[i].z - uHold[i].w, uHold[i].z + uHold[i].w, length(p - uHold[i].xy)); }
  if (uReveal.w > 0.) mask *= smoothstep(uReveal.x - uReveal.z, uReveal.x + uReveal.z, p.x) * (1. - smoothstep(uReveal.y - uReveal.z, uReveal.y + uReveal.z, p.x));
  t = light * mask;
  // grain, as compose(): the fine and 2x2 layers re-roll per grain frame, the 4x4 clumps stay (the paper's tooth)
  float fine = hash2(x, y, uGSeed) - .5;
  float blk2 = hash2(x >> 1, y >> 1, uGSeed + 101) - .5;
  float blk4 = hash2(x >> 2, y >> 2, uSeed + 202) - .5;
  float bmod = .6 + .75 * abs(texture(uBl, (p / 6. + .5) / uBlSize).r);
  float amp = (fine * .5 + blk2 * .32 + blk4 * .18) * .3 * uGrain * bmod;
  if (uCoarse > 0.) amp += (hash2(x, y, uGSeed + 555) - .5) * .95 * uCoarse * gate;
  amp *= 1. + edge * uEdgeBoost;
  if (uWeave > 0.) amp += uWeave * (sin(float(x + y) * .9) + sin(float(x - y) * .9)) * .018;
  t = clamp(t + amp, 0., 1.);
  vec3 c = texture(uRamp, vec2((t * 1023. + .5) / 1024., .5)).rgb * 255.;
  c = clamp(c + (hash2(x, y, uGSeed + 777) - .5) * 8., 0., 255.) / 255.;
  for (int i = 0; i < 4; i++) {
    if (i >= uNAcc) break;
    float d = length(p + .5 - uAcc[i].xy) / uAcc[i].z, a = uAcc[i].w;
    if (d < 1.) c = mix(c, vec3(150., 110., 220.) / 255., d < .6 ? mix(a, a * .45, d / .6) : mix(a * .45, 0., (d - .6) / .4));
  }
  float al = uAlpha > 0. ? clamp(t * uAlpha, 0., 1.) : 1.;
  outc = vec4(c * al, al);
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
    const setup = () => {
      R.half = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
      R.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      R.field = compile(gl, FS_FIELD); R.dev = compile(gl, FS_DEV);
      R.gen++;
      return R.field && R.dev;
    };
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
  function texture(gl, w, h, internal, format, type, data, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // ---------------------------------------------------------------- sources
  const palOf = p => (p && typeof p === 'object') ? p : (C.PALETTES[p] || C.PALETTES.cobalt);
  // a Float32Array (copied: finish() works in place) or (u, v) → 0..1, at w×h
  function fieldOf(F, w, h) {
    const out = new Float32Array(w * h);
    if (typeof F === 'function') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = F(x / w, y / h); return out; }
    if (F && F.length === w * h) { out.set(F); return out; }
    return out;
  }
  // the compose() rand, recorded, so the GPU blotch and a CPU fallback both see the same 255 draws
  function recorder(rand) { const vals = Array.from({ length: 255 }, () => rand()); return () => { let i = 0; return () => vals[i++ % 255]; }; }
  // compose()'s blotch: fbm on a 6 px grid, interpolated
  function blotchGrid(w, h, rand) {
    const n = C.noise(rand), gw = Math.ceil(w / 6) + 2, gh = Math.ceil(h / 6) + 2, g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = C.fbm(n, (i * 6) / 230 + 70, (j * 6) / 230 + 70, 3);
    return { g, gw, gh };
  }
  function stillOpts(o) { const s = {}; for (const k in o) if (!(k in MOTION) && k !== 'mode' && k !== 'image' && k !== 'T' && k !== 'L') s[k] = o[k]; return s; }
  // run a still engine at w×h; with `capture` in opts it hands back T instead of painting
  function runStill(cv, o, so, w, h) {
    Object.assign(so, { width: w, height: h });
    if (typeof so.pools === 'function') so.pools = so.pools(w, h);
    switch (o.mode) {
      case 'tone': return C.tone(cv, o.image, so);
      case 'develop': return C.develop(cv, fieldOf(o.T, w, h), so);
      case 'screen': return C.screen(cv, fieldOf(o.L, w, h), so);
      case 'caustics': {
        // `line` is caustics()'s `width` (web line width): here width and height are the canvas
        const d = Object.assign({}, STILL.caustics, so, { width: o.line == null ? STILL.caustics.width : o.line });
        const L = C.caustics(w, h, d.seed, d), T = new Float32Array(w * h);
        for (let i = 0; i < T.length; i++) T[i] = d.map[0] + d.map[1] * Math.pow(L[i], 0.9);
        return C.develop(cv, T, Object.assign(so, { palette: d.palette, grain: d.grain, seed: d.seed }));
      }
      default: return C[o.mode](cv, so);
    }
  }

  function build(v) {
    const o = v.o, w = v.w, h = v.h, src = { w, h, mode: o.mode };
    if (v.R && o.mode in PROC) {
      const d = Object.assign({}, STILL[o.mode], stillOpts(o)), seed = d.seed;
      if (o.mode === 'caustics') d.width = o.line == null ? STILL.caustics.width : o.line;
      src.kind = PROC[o.mode]; src.d = d; src.pal = palOf(d.palette);
      src.co = { seed, grain: d.grain, coarse: d.coarse || 0, weave: 0, edgeBoost: 1.7 };
      const rand = C.mulberry32(seed >>> 0), n = C.noise(rand);
      src.perm = n.perm; src.s = Math.min(w, h);
      if (o.mode === 'field') {
        const pools = typeof d.pools === 'function' ? d.pools(w, h) : d.pools;
        src.pools = (pools || C.autoPools(d.palette, w, h, rand)).map(p => Object.assign({ _ox: rand() * 1000, _oy: rand() * 1000 }, p)).slice(0, 6);
        src.pools.forEach((p, i) => { p._ph = i * 2.4 + 0.7; });
        src.step = 4; src.rec = recorder(C.mulberry32((seed * 17 + 3) >>> 0));
      } else if (o.mode === 'halo') {
        src.step = 3; src.rec = recorder(C.mulberry32((seed * 43 + 1) >>> 0));
      } else {
        src.step = o.fieldStep || Math.max(1, Math.round(v.dpr)); src.rec = recorder(C.mulberry32((seed * 29 + 5) >>> 0));
      }
      src.tw = Math.ceil(w / src.step) + 2; src.th = Math.ceil(h / src.step) + 2;
    } else {
      const k = v.R ? Math.min(1, Math.sqrt(o.maxField / (w * h))) : 1;
      const cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
      let cap = null;
      const so = Object.assign(stillOpts(o), { capture: c => { cap = c; } });
      runStill(document.createElement('canvas'), o, so, cw, ch);
      if (!cap) throw new Error('live.js: mode ' + o.mode + ' has no field to capture');
      src.T = cap.T; src.cw = cw; src.ch = ch; src.step = w / cw; src.tw = cw; src.th = ch;
      src.pal = cap.pal; src.co = Object.assign({}, cap.o, { capture: null }); src.rec = recorder(cap.rand);
      src.accents = (cap.o.accents || []).slice(0, 4).map(a => ({ x: a.x / k, y: a.y / k, r: a.r / k, a: a.a == null ? 0.3 : a.a }));
    }
    src.bl = blotchGrid(w, h, src.rec());
    src.seed = src.co.seed | 0;
    v.src = src; v.g = null; v.dirty = true;
  }

  // ---------------------------------------------------------------- GPU frame
  function upload(v) {
    const gl = v.R.gl, s = v.src, old = v.g;
    if (old) for (const k of ['perm', 'ramp', 'bl', 'T']) if (old[k]) gl.deleteTexture(old[k]);
    if (old && old.fbo) gl.deleteFramebuffer(old.fbo);
    const g = { gen: v.R.gen, src: s };
    const rgba = new Uint8Array(1024 * 4);
    for (let i = 0; i < 1024; i++) { const c = C.ramp(s.pal, i / 1023); rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255; }
    g.ramp = texture(gl, 1024, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, rgba, gl.LINEAR);
    g.bl = texture(gl, s.bl.gw, s.bl.gh, gl.R16F, gl.RED, gl.FLOAT, s.bl.g, gl.LINEAR);
    if (s.kind != null) {
      g.perm = texture(gl, 512, 1, gl.R8UI, gl.RED_INTEGER, gl.UNSIGNED_BYTE, s.perm, gl.NEAREST);
      const half = v.R.half;
      g.T = texture(gl, s.tw, s.th, half ? gl.RGBA16F : gl.RGBA8, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null, gl.LINEAR);
      g.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.T, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      const TE = new Float32Array(s.cw * s.ch * 2), E = s.co.edge;
      for (let i = 0; i < s.cw * s.ch; i++) { TE[i * 2] = s.T[i]; TE[i * 2 + 1] = E ? E[i] : 0; }
      g.T = texture(gl, s.cw, s.ch, gl.RG16F, gl.RG, gl.FLOAT, TE, gl.LINEAR);
    }
    v.g = g;
  }
  function drawGPU(v) {
    const R = v.R, gl = R.gl, s = v.src, w = v.w, h = v.h;
    if (R.lost || !s) return false;
    if (!v.g || v.g.gen !== R.gen || v.g.src !== s) upload(v);
    const g = v.g, cv = R.canvas;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const S = s.s || Math.min(w, h), st = v.st;
    if (s.kind != null) {
      const P = R.field, d = s.d, u = n => U(gl, P, n);
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo); gl.viewport(0, 0, s.tw, s.th); gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.perm); gl.uniform1i(u('uPerm'), 0);
      gl.uniform1i(u('uKind'), s.kind); gl.uniform1f(u('uStep'), s.step); gl.uniform2f(u('uSize'), w, h);
      gl.uniform1f(u('uClampOut'), R.half ? 0 : 1);
      const tau = st.clock * 0.02;
      gl.uniform1f(u('uTau'), tau);
      if (s.kind === 0) {
        const A = new Float32Array(24), B = new Float32Array(24), O = new Float32Array(24);
        s.pools.forEach((p, i) => {
          // pools wander slowly round where they were put; zero at clock 0
          const wob = st.env * p.sigma * 0.12, ph = p._ph, c = st.clock * 0.09;
          const ox = wob * (Math.sin(c + ph) - Math.sin(ph)), oy = wob * (Math.cos(c * 0.8 + ph) - Math.cos(ph));
          A.set([p.type === 'band' ? 1 : 0, p.sigma, p.amp, 0], i * 4);
          B.set(p.type === 'band' ? [p.x1 + ox, p.y1 + oy, p.x2 + ox, p.y2 - oy] : [p.cx + ox, p.cy + oy, 0, 0], i * 4);
          O.set([p._ox, p._oy, 0, 0], i * 4);
        });
        gl.uniform1i(u('uN'), s.pools.length); gl.uniform4fv(u('uA'), A); gl.uniform4fv(u('uB'), B); gl.uniform4fv(u('uO'), O);
        gl.uniform1f(u('uWarpS'), 260 * d.scale); gl.uniform1f(u('uSoft'), d.softness);
      } else if (s.kind === 1) {
        const breathe = 1 + 0.025 * st.env * Math.sin(st.clock * 0.23);
        gl.uniform4f(u('uH0'), d.x * w, d.y * h, d.r * h * breathe, d.warp);
        gl.uniform4f(u('uH1'), Math.cos(d.angle), Math.sin(d.angle), d.point, S);
      } else {
        gl.uniform4f(u('uK0'), d.cell * S, d.squash, d.warp, d.width);
        gl.uniform4f(u('uK1'), d.second, S, d.seed, 0); gl.uniform2f(u('uMap'), d.map[0], d.map[1]);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const P = R.dev, u = n => U(gl, P, n), co = s.co;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.T); gl.uniform1i(u('uT'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, g.bl); gl.uniform1i(u('uBl'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, g.ramp); gl.uniform1i(u('uRamp'), 2);
    gl.uniform2f(u('uTSize'), s.tw, s.th); gl.uniform1f(u('uTStep'), s.step);
    gl.uniform2f(u('uBlSize'), s.bl.gw, s.bl.gh); gl.uniform2f(u('uSize'), w, h);
    gl.uniform1i(u('uSeed'), s.seed); gl.uniform1i(u('uGSeed'), s.seed + st.gk * 7919);
    gl.uniform1f(u('uGrain'), co.grain == null ? 1 : co.grain); gl.uniform1f(u('uEdgeBoost'), co.edgeBoost == null ? 1.7 : co.edgeBoost);
    gl.uniform1f(u('uClampT'), s.kind === 0 || s.kind === 1 ? 1 : 0);
    gl.uniform1f(u('uWeave'), co.weave || 0); gl.uniform1f(u('uCoarse'), co.coarse || 0);
    gl.uniform1f(u('uExpose'), st.expose); gl.uniform1f(u('uAlpha'), +v.o.transparent || 0);
    gl.uniform4f(u('uDrift'), st.env * v.o.drift * 0.006 * S, st.env * v.o.drift * 0.035, st.clock, S);
    const pool = st.pool, pk = v.w / Math.max(1, v.cssW);
    gl.uniform4f(u('uPool'), pool.x, pool.y, v.o.radius * S, pool.amp * v.o.pointer);
    gl.uniform3f(u('uPoolDir'), pool.dx, pool.dy, pool.stretch);
    const pu = new Float32Array(16); st.pulses.slice(0, 4).forEach((p, i) => pu.set([p.x, p.y, p.sigma, p.amp], i * 4));
    gl.uniform4fv(u('uPulse'), pu); gl.uniform1i(u('uNPulse'), Math.min(4, st.pulses.length));
    const ho = new Float32Array(16), holds = st.holds || [];
    holds.slice(0, 4).forEach((q, i) => ho.set([q.x * w, q.y * h, q.r * S, (q.soft == null ? 0.12 : q.soft) * q.r * S + pk], i * 4));
    gl.uniform4fv(u('uHold'), ho); gl.uniform1i(u('uNHold'), Math.min(4, holds.length));
    const rv = st.reveal;
    gl.uniform4f(u('uReveal'), rv ? rv[0] * w : 0, rv ? rv[1] * w : 0, rv ? (rv[2] == null ? 0.02 : rv[2]) * w + pk : 0, rv ? 1 : 0);
    const ac = new Float32Array(16), acc = s.accents || [];
    acc.forEach((a, i) => ac.set([a.x, a.y, a.r, a.a], i * 4));
    gl.uniform4fv(u('uAcc'), ac); gl.uniform1i(u('uNAcc'), acc.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function present(v) {
    const R = v.R;
    if (R.canvas === v.canvas) return;
    if (R.offscreen) v.ctx.transferFromImageBitmap(R.canvas.transferToImageBitmap());
    else { v.ctx.globalCompositeOperation = 'copy'; v.ctx.drawImage(R.canvas, 0, 0); }
  }

  // ---------------------------------------------------------------- CPU fallback
  // the same state applied to T on the CPU (no drift, no pool, no flash), then compose()
  function drawCPU(v) {
    const s = v.src, st = v.st;
    if (!s) return;
    const w = s.cw, h = s.ch;
    const T = new Float32Array(s.T.length), S = Math.min(w, h), holds = st.holds || [], rv = st.reveal;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 1;
      for (const q of holds.slice(0, 4)) { const r = q.r * S, sf = (q.soft == null ? 0.12 : q.soft) * r + 1; m *= smooth(r - sf, r + sf, Math.hypot(x - q.x * w, y - q.y * h)); }
      if (rv) { const sf = (rv[2] == null ? 0.02 : rv[2]) * w + 1; m *= smooth(rv[0] * w - sf, rv[0] * w + sf, x) * (1 - smooth(rv[1] * w - sf, rv[1] * w + sf, x)); }
      const i = y * w + x; T[i] = s.T[i] * st.expose * m;
    }
    if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
    C.compose(v.ctx, w, h, s.pal, T, s.co, s.rec());
    const acc = s.accents || [];
    if (acc.length) {
      v.ctx.save();
      for (const a of acc) {
        const gr = v.ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r);
        gr.addColorStop(0, `rgba(150,110,220,${a.a})`); gr.addColorStop(0.6, `rgba(150,110,220,${a.a * 0.45})`); gr.addColorStop(1, 'rgba(150,110,220,0)');
        v.ctx.fillStyle = gr; v.ctx.beginPath(); v.ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); v.ctx.fill();
      }
      v.ctx.restore();
    }
  }
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

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
    const o = Object.assign({ mode: 'field' }, MOTION, opts);
    const v = { canvas, o, R: null, ctx: null, src: null, g: null, dirty: true, paused: false, visible: false, frames: 0, dpr: 1, w: 0, h: 0, cssW: 1, cssH: 1 };
    v.st = { clock: 0, env: 0, expose: 0, gk: 0, pool: { x: 0, y: 0, amp: 0, on: false, tx: 0, ty: 0, dx: 1, dy: 0, stretch: 1, seen: false }, pulses: [], holds: null, reveal: null, inStart: 0, lastGk: -1 };
    const r0 = canvas.getBoundingClientRect();
    const area = r0.width * r0.height * Math.pow(Math.min(2, root.devicePixelRatio || 1), 2);
    if (live.gpu !== false) {
      const own = o.own == null ? area >= 0.9e6 : o.own;
      if (own) { v.R = makeRenderer(canvas); }
      else {
        const sh = sharedRenderer();
        if (sh) { v.R = sh; v.ctx = sh.offscreen ? canvas.getContext('bitmaprenderer') : canvas.getContext('2d'); if (!v.ctx) v.R = null; }
      }
    }
    if (!v.R && !v.ctx) v.ctx = canvas.getContext('2d');
    if (!v.R && !v.ctx) return null;
    // the CPU fallback is a still too: it changes state, it does not animate
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
    const lerp = (a, b, k) => a + (b - a) * k;
    function easeList(cur, tgt, k) {
      if (!tgt) return null;
      if (!cur || cur.length !== tgt.length) return tgt.map(q => Object.assign({}, q));
      return tgt.map((q, i) => Object.assign({}, q, { x: lerp(cur[i].x, q.x, k), y: lerp(cur[i].y, q.y, k), r: lerp(cur[i].r, q.r, k) }));
    }
    const near = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const round = q => q && q.map(p => typeof p === 'object' ? Object.fromEntries(Object.entries(p).map(([k, x]) => [k, Math.round(x * 2000) / 2000])) : Math.round(p * 2000) / 2000);

    // advance state; returns whether anything is moving
    function tick(now, dt) {
      const st = v.st, rm = still();
      let moving = false;
      const k = rm ? 1 : 1 - Math.exp(-dt / Math.max(0.001, o.ease));
      if (!rm && o.drift > 0) { st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 3); moving = true; }
      else if (rm) { st.clock = 0; st.env = 0; }
      const e = exposeTarget(now);
      if (o.develop === 'in' && st.inStart && !rm && now - st.inStart < o.developMs) { st.expose = e; moving = true; }
      else if (Math.abs(st.expose - e) > 1e-3 && !rm) { st.expose = lerp(st.expose, e, k); moving = true; }
      else st.expose = e;
      if (o.develop === 'scroll' && !rm) moving = true;
      const nh = easeList(st.holds, o.holds, k), nr = o.reveal ? o.reveal.map((x, i) => st.reveal ? lerp(st.reveal[i], x, k) : x) : null;
      if (!near(round(nh), round(o.holds)) || !near(round(nr), round(o.reveal))) moving = true; else { st.holds = o.holds; st.reveal = o.reveal; }
      if (moving) { st.holds = nh; st.reveal = nr; }
      const p = st.pool;
      if (!rm && o.pointer) {
        const kl = 1 - Math.exp(-dt / Math.max(0.01, o.lag)), px = p.x, py = p.y;
        p.x = lerp(p.x, p.tx, kl); p.y = lerp(p.y, p.ty, kl);
        const vx = (p.x - px) / Math.max(dt, 1e-3), vy = (p.y - py) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vy), S = Math.min(v.w, v.h) || 1;
        if (sp > 1) { p.dx = vx / sp; p.dy = vy / sp; }
        p.stretch = 1 + Math.min(1.6, sp / (S * 1.2));             // a moving hand smears its light along the way it moves
        const ta = p.on ? 1 : 0;
        p.amp = lerp(p.amp, ta, 1 - Math.exp(-dt / 0.3));
        if (p.amp > 0.002 || p.on) moving = true; else p.amp = 0;
      } else p.amp = 0;
      st.pulses = rm ? [] : st.pulses.filter(q => now - q.t0 < 2600);
      for (const q of st.pulses) {
        const a = (now - q.t0) / 1000, S = Math.min(v.w, v.h);
        q.amp = q.s * (1 - Math.exp(-a / 0.05)) * Math.exp(-a / 0.55);   // a flash: fast rise, slow fade, spreading
        q.sigma = S * (0.05 + 0.55 * (1 - Math.exp(-a / 0.6)));
        moving = true;
      }
      if (o.alive && !rm) { st.gk = Math.floor(now / 1000 * o.grainRate); } else st.gk = 0;
      return moving;
    }

    v.resize = force => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      v.cssW = r.width; v.cssH = r.height;
      v.dpr = Math.min(2, root.devicePixelRatio || 1) * o.resolution;
      const w = Math.max(2, Math.round(r.width * v.dpr)), h = Math.max(2, Math.round(r.height * v.dpr));
      if (w === v.w && h === v.h) return false;
      if (!force && v.src) return true;           // the caller schedules the rebuild
      v.w = w; v.h = h;
      if (v.R && v.R.canvas === canvas) { canvas.width = w; canvas.height = h; }
      return true;
    };
    v.run = (now, dt) => {
      // paused holds its last frame (and still draws a first one, so a paused view is never blank)
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
      const [x, y] = at(e), p = v.st.pool;
      if (!p.seen) { p.x = x; p.y = y; p.seen = true; }
      p.tx = x; p.ty = y; p.on = true; wake();
    };
    const onLeave = e => { if (e.pointerType !== 'mouse' || e.type === 'pointerleave') { v.st.pool.on = false; wake(); } };
    const onDown = e => { onMove(e); if (o.clickPulse) { const [x, y] = at(e); api.pulseAt(x, y, 0.5); } };
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
      rzT = setTimeout(() => { if (v.src && v.src.kind != null) { v.resize(true); build(v); wake(); } else queueBuild(v); }, 160);
    });
    ro.observe(canvas);

    const api = {
      canvas,
      /** merge options; motion options apply next frame, still options recompute the field */
      set(n) {
        const look = Object.keys(n).filter(k => !(k in MOTION) && n[k] !== o[k]);
        const onlyLook = look.length && look.every(k => k in LOOK) && v.src && v.src.kind == null;
        Object.assign(o, n);
        if (n.develop === 'in') v.st.inStart = 0;
        if (onlyLook) {
          if (n.palette) v.src.pal = palOf(n.palette);
          for (const k of look) if (k !== 'palette') v.src.co[k] = n[k];
          v.g = null;
        } else if (look.length) { if (v.src && v.src.kind != null) build(v); else queueBuild(v); }
        v.dirty = true; wake(); return api;
      },
      /** replace the plate: every still option is dropped and `n` (mode + its options) put in their place */
      load(n) {
        for (const k of Object.keys(o)) if (!(k in MOTION)) delete o[k];
        Object.assign(o, { mode: 'field' }, n);
        if (v.R && o.mode in PROC) build(v); else queueBuild(v);
        v.dirty = true; wake(); return api;
      },
      /** a flash exposure at (x, y) in CSS px of the canvas; strength ~0.3–0.8 */
      pulse(x, y, s) { const k = v.w / (v.cssW || 1); return api.pulseAt(x * k, y * k, s); },
      pulseAt(x, y, s) {
        if (still() || !v.R) return api;
        v.st.pulses.push({ x, y, s: s == null ? 0.5 : s, t0: performance.now(), amp: 0, sigma: 1 });
        if (v.st.pulses.length > 4) v.st.pulses.shift();
        wake(); return api;
      },
      /** move the pool of light yourself (CSS px), or release it with point(null) */
      point(x, y) {
        const p = v.st.pool, k = v.w / (v.cssW || 1);
        if (x == null) { p.on = false; } else { p.tx = x * k; p.ty = y * k; if (!p.seen) { p.x = p.tx; p.y = p.ty; p.seen = true; } p.on = true; }
        wake(); return api;
      },
      pause() { v.paused = true; return api; },
      resume() { v.paused = false; v.dirty = true; wake(); return api; },
      destroy() {
        views.delete(v); io.disconnect(); ro.disconnect(); clearTimeout(rzT);
        for (const [t, f] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerleave', onLeave], ['pointerup', onLeave], ['pointercancel', onLeave]]) hand.removeEventListener(t, f);
        if (v.R && v.g) { const gl = v.R.gl; for (const k of ['perm', 'ramp', 'bl', 'T']) if (v.g[k]) gl.deleteTexture(v.g[k]); if (v.g.fbo) gl.deleteFramebuffer(v.g.fbo); }
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
      },
      /** what the view is doing: 'gpu' or 'still', frames drawn, current exposure */
      state() { return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.expose.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src, reduced: still() }; },
      /** time n frames as they would run live (drift, pool, grain all on): `sync` waits for the GPU after
       *  every frame (1-pixel readback) and reports the median; `pipelined` issues n frames and waits once */
      bench(n) {
        if (!v.R || !v.src) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st, keep = { clock: st.clock, env: st.env, expose: st.expose, pool: Object.assign({}, st.pool) };
        Object.assign(st, { env: 1, expose: 1 }); Object.assign(st.pool, { x: v.w / 2, y: v.h / 2, amp: 1 });
        const step = () => { st.gk++; st.clock += 1 / 60; drawGPU(v); };
        step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) { const t0 = performance.now(); step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
        const t0 = performance.now();
        for (let i = 0; i < n; i++) step();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n;
        Object.assign(st, { clock: keep.clock, env: keep.env, expose: keep.expose }); Object.assign(st.pool, keep.pool);
        drawGPU(v); present(v);
        ts.sort((a, b) => a - b);
        return { sync: +ts[ts.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), size: [v.w, v.h], path: api.state().path };
      },
      /** GPU time of n frames from EXT_disjoint_timer_query_webgl2 when the browser exposes it; resolves ms, median */
      gpuTime(n) {
        const R = v.R, ext = R && R.timer;
        if (!ext || !v.src) return Promise.resolve(null);
        const gl = R.gl, qs = [];
        for (let i = 0; i < (n || 30); i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); v.st.gk++; drawGPU(v); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); }
        present(v);
        return new Promise(res => {
          const poll = () => {
            if (!qs.every(q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))) return setTimeout(poll, 20);
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return res(null);
            const ms = qs.map(q => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((a, b) => a - b);
            qs.forEach(q => gl.deleteQuery(q));
            res(+ms[ms.length >> 1].toFixed(3));
          };
          poll();
        });
      },
      _v: v,
    };

    views.add(v);
    registry.views.push(api);
    // build: procedural fields at once (they are cheap), captured stills one per task
    // (a canvas with no size yet, say display:none, starts when the ResizeObserver sees it get one)
    const first = () => {
      v.resize(true);
      if (!v.w) return;
      v.started = true;
      if (v.R && o.mode in PROC) { build(v); wake(); } else queueBuild(v);
    };
    first();
    return api;
  }
  live.gpu = true;
  // for tests: draw one frame of a view as it stands, or a view at clock `t` (s) with full drift, no rAF needed
  live._frame = (ctl, t) => { const v = ctl._v; if (t != null) Object.assign(v.st, { clock: t, env: 1 }); if (v.R) { drawGPU(v); present(v); } else drawCPU(v); };
  live.stats = () => ({ views: views.size, jsMsLastFrame: +lastCost.toFixed(2) });

  /**
   * live.parity(opts) — draw the still with the CPU engine and frame 0 with the GPU at the
   * same size, palette and seed, and compare: mean luminance, contrast (luminance SD),
   * grain (mean |ΔL| between neighbours) and the mean per-channel difference in 8-bit levels.
   */
  live.parity = function (opts) {
    const o = Object.assign({ mode: 'field', width: 480, height: 320, seed: 7 }, opts), w = o.width, h = o.height;
    const a = document.createElement('canvas'); a.width = w; a.height = h;
    const t0 = performance.now();
    runStill(a, o, stillOpts(o), w, h);
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { gpu: false };
    const v = { canvas: b, o: Object.assign({}, MOTION, o, { develop: 1, drift: 0, alive: false, maxField: Infinity, fieldStep: 1, transparent: 0 }), R, w, h, cssW: w, dpr: 1 };
    v.st = { clock: 0, env: 0, expose: 1, gk: 0, pool: { x: 0, y: 0, amp: 0, dx: 1, dy: 0, stretch: 1 }, pulses: [], holds: null, reveal: null };
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
      mode: o.mode, palette: typeof o.palette === 'string' ? o.palette : undefined, seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
      mean: [r4(A.mean), r4(B.mean)], sd: [r4(A.sd), r4(B.sd)], grain: [r4(A.grain), r4(B.grain)],
      dMean: r4(Math.abs(A.mean - B.mean)), dSdRel: r4(Math.abs(A.sd - B.sd) / A.sd), dGrainRel: r4(Math.abs(A.grain - B.grain) / A.grain),
      madLevels: +(mad / (w * h)).toFixed(3), within2: r4(within2 / (w * h)),
    };
  };
  // the tolerance the check holds parity to
  live.TOLERANCE = { dMean: 0.004, dSdRel: 0.02, dGrainRel: 0.03, madLevels: 1.5 };
  live.pass = r => !!r && r.dMean <= live.TOLERANCE.dMean && r.dSdRel <= live.TOLERANCE.dSdRel && r.dGrainRel <= live.TOLERANCE.dGrainRel && r.madLevels <= live.TOLERANCE.madLevels;

  /**
   * iconMask(svg, { pad, weight }) — an icon's SVG (Phosphor-style: one or more <path d>, any
   * viewBox) as an `objects` function for print(): the paths fill white on the mask, so the
   * icon is exposed like a botanical. `weight` strokes the outline too (viewBox units),
   * which keeps thin and light icons legible once soft focus has worked on them.
   */
  function iconMask(svg, opts) {
    const o = Object.assign({ pad: 0.14, weight: 0, shade: 1 }, opts);
    const vb = ((svg.match(/viewBox="([^"]+)"/) || [0, '0 0 256 256'])[1]).split(/[\s,]+/).map(Number);
    const paths = Array.from(svg.matchAll(/\sd="([^"]+)"/g), m => new Path2D(m[1]));
    return (ctx, w, h) => {
      const s = Math.min(w, h) * (1 - 2 * o.pad) / Math.max(vb[2], vb[3]);
      const g = Math.round(o.shade * 255);
      ctx.save();
      ctx.translate((w - vb[2] * s) / 2 - vb[0] * s, (h - vb[3] * s) / 2 - vb[1] * s); ctx.scale(s, s);
      ctx.fillStyle = ctx.strokeStyle = `rgb(${g},${g},${g})`; ctx.lineWidth = o.weight; ctx.lineJoin = 'round';
      for (const p of paths) { ctx.fill(p); if (o.weight) ctx.stroke(p); }
      ctx.restore();
    };
  }

  // the page-level registry tools/check.sh reads: every controller, and each skill's parity cases
  const registry = root.handPulledLive = root.handPulledLive || { views: [], parity: {} };
  registry.parity['indigo-grain'] = () => [
    live.parity({ mode: 'field', palette: 'cobalt', seed: 7, coarse: 0.85, grain: 1.2 }),
    live.parity({ mode: 'field', palette: 'nightglow', seed: 3 }),
    live.parity({ mode: 'halo', seed: 5 }),
    live.parity({ mode: 'caustics', seed: 9, line: 0.1, warp: 1.4, squash: 0.55 }),
    live.parity({ mode: 'relief', seed: 2, width: 320, height: 400 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) }));
  C.live = live;
  C.iconMask = iconMask;
})(typeof window !== 'undefined' ? window : globalThis);
