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
    reveal: null, ring: null, ground: 'night', own: null, resolution: 1, maxField: 1.2e6, evolve: 1, native: true,
  };
  // modes whose paint is computed on the GPU every frame (the field evolves); the rest are captured
  const NATIVE = { swirl: 0, bloom: 0, spin: 0, field: 1, bands: 2, moire: 3, marble: 4, chrome: 5, caustic: 6, bleed: 7 };
  // how fast each evolves, in noise units per second of clock (the warps slide at about half that)
  const RATE = { swirl: 0.045, bloom: 0.05, spin: 0.06, field: 0.05, bands: 0.035, moire: 0.03, marble: 0.04, chrome: 0.04, caustic: 0.05, bleed: 0.03 };
  // still options only the captured path carries: with any of them set, a native mode is captured too
  const nativeOK = o => o.mode in NATIVE && !o.mask && !o.threads && !o.alt && !o.shift && !o.wave && !o.mosh && !o.scatter &&
    (o.octaves || 0) <= 8 && (o.octaves3 || 3) <= 8;

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  // what every paint shader shares: the motion uniforms, the still's hash, and the live terms
  // that move where a pixel reads its paint from (comb, drops, the pour-in front) or sit on top
  // of it (the pour's bead, the reveal edge, film grain, the focus ring's band)
  const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform vec2 uSize;        // view, device px
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
float vn(float x) { float i = floor(x), f = x - i; f = f * f * (3. - 2. * f); return mix(h01(int(i), 7, 91u), h01(int(i) + 1, 7, 91u), f); }

// the swell, the comb, the drops and the pour-in front: offsets in view px
vec2 moveOff(vec2 p, out float front) {
  float S = uFlow.w; vec2 off = vec2(0.);
  if (uFlow.z != 0.) off += uFlow.z * vec2(sin(p.y / S * 5.1 + uClock * .41), cos(p.x / S * 4.3 - uClock * .33));
  // the comb: paint dragged along the pointer's way, in teeth across it
  if (uComb.w > 0.) {
    vec2 d = p - uComb.xy; float r2 = dot(d, d) / (uComb.z * uComb.z);
    if (r2 < 9.) {
      vec2 nr = vec2(-uCombDir.y, uCombDir.x);
      float teeth = .5 + .5 * cos(6.2831853 * dot(d, nr) / uCombDir.z);
      off -= uCombDir.xy * uComb.w * exp(-r2) * teeth;
    }
  }
  // drops: each pushes the paint out in a ring that spreads and settles
  for (int i = 0; i < 4; i++) {
    if (i >= uNPulse) break;
    vec2 d = p - uPulse[i].xy; float r = length(d), w = .05 * S + .25 * uPulse[i].z;
    off -= d / max(r, 1.) * uPulse[i].w * exp(-pow((r - uPulse[i].z) / w, 2.));
  }
  // poured in from the top: the front runs down with a drippy edge, the paint above still sliding
  front = 1e9;
  if (uPour < 1.) {
    float drip = .09 * S;
    front = uPour * (uSize.y + 2. * drip) - drip + drip * vn(p.x / (.045 * S)) + drip * .5 * vn(p.x / (.013 * S) + 40.);
    off.y -= (1. - uPour) * .18 * S * smoothstep(front - .5 * S, front, p.y);
  }
  return off;
}
void finish(vec3 col, vec2 p, float front) {
  float S = uFlow.w;
  if (uPour < 1.) {
    float m = smoothstep(front + 1., front - 1., p.y);
    col = mix(col, col * .72, exp(-pow((front - p.y) / (.012 * S), 2.)) * m);   // the bead at the front
    col = mix(uGround, col, m);
  }
  // controls: the paint poured from the left up to a value, its edge running
  if (uReveal.x >= 0.) {
    float e = uReveal.x * uSize.x + uReveal.y * (vn(p.y / (.18 * uSize.y) + 3.) - .5) * 2.;
    col = mix(uGround, col, smoothstep(e + 1., e - 1., p.x));
  }
  // the still's film grain, on top and unmoved; a share of the specks re-rolled per tick
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
}
`;

  // captured modes: the still's image, moved
  const FS_CAP = HEAD + `
uniform sampler2D uImg;    // the still without grain, top row first
uniform sampler2D uF;      // the field g on the still's coarse grid (R32F, nearest)
uniform vec3 uFGrid;       // gw, gh, step (image px)
uniform vec2 uImgK;        // image px per view px, S of the image
uniform float uHasF;
float G(int i, int j) { return texelFetch(uF, ivec2(clamp(i, 0, int(uFGrid.x) - 1), clamp(j, 0, int(uFGrid.y) - 1)), 0).r; }
// the field as the still reads it (bilinear on its grid), and its slope over a wide span, so the flow is smooth
float gv(vec2 q) {
  vec2 f = q / uFGrid.z; ivec2 ij = ivec2(floor(f)); vec2 uv = f - vec2(ij);
  return mix(mix(G(ij.x, ij.y), G(ij.x + 1, ij.y), uv.x), mix(G(ij.x, ij.y + 1), G(ij.x + 1, ij.y + 1), uv.x), uv.y);
}
vec2 slope(vec2 q, float d) { return vec2(gv(q + vec2(d, 0.)) - gv(q - vec2(d, 0.)), gv(q + vec2(0., d)) - gv(q - vec2(0., d))) / (2. * d); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);   // pixel centre, top-down, like the still
  float front; vec2 off = moveOff(p, front);
  // the paint still flowing: along its level lines and a little across them
  if (uHasF > .5 && (uFlow.x != 0. || uFlow.y != 0.)) {
    vec2 g = slope(p * uImgK.x, .03 * uImgK.y) * uImgK.y; float gl = length(g);
    vec2 n = g / max(1., gl * .5);
    off += uFlow.x * vec2(-n.y, n.x) + uFlow.y * n;
  }
  finish(texture(uImg, clamp(p + off, vec2(.5), uSize - .5) / uSize).rgb, p, front);
}`;

  // Native modes, pass 1: solve() on the still's coarse grid, texel (i, j) = pixel (i, j) * step.
  // The noise is makeNoise() bit for bit: its four table reads per cell, G[P[X + P[Y]]] and
  // neighbours, are baked into one RGBA32F texel of a 256x256 table. Time is a real input here:
  // the inner warps of the field slide (uTau, in noise units), so the paint itself keeps moving.
  const FS_FLD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uV, uV3;
uniform int uKind, uOct, uOct3;   // 0 warped (and combed), 1 bloom, 2 spin
uniform float uOff[12];
uniform float uStep, uS, uS3, uRR, uK, uK3, uTau, uTwirl, uRidge, uBurst, uWander, uComb, uThird;
uniform vec2 uStretch, uC, uCS;
uniform vec4 uB;                  // bloom: petals, twist, radius; spin: rings, arcs, smear, eye
uniform vec2 uN0, uN2, uN3;       // lo, 1 / (hi - lo) of g, g2, g3: the still's percentiles
out vec4 outc;
float nz(sampler2D T, float x, float y) {
  float xi = floor(x), yi = floor(y), xf = x - xi, yf = y - yi;
  vec4 c = texelFetch(T, ivec2(int(xi) & 255, int(yi) & 255), 0);
  float u = xf * xf * (3. - 2. * xf), v = yf * yf * (3. - 2. * yf);
  return c.x + (c.y - c.x) * u + (c.z - c.x) * v + (c.x - c.y - c.z + c.w) * u * v;
}
float fbm(sampler2D T, float x, float y, int oct) {
  float s = 0., a = .5, f = 1.;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * nz(T, x * f, y * f); f *= 2.03; a *= .5; }
  return s;
}
vec3 warped(sampler2D T, float x, float y, float k, int oct, int o) {
  float t = uTau;
  float qx = fbm(T, x + uOff[o] + .55 * t, y + uOff[o + 1], 4), qy = fbm(T, x + uOff[o + 2], y + uOff[o + 3] - .45 * t, 4);
  float rx = fbm(T, x + k * qx + uOff[o + 4], y + k * qy + uOff[o + 5] + .3 * t, 4), ry = fbm(T, x + k * qx + uOff[o + 6] - .25 * t, y + k * qy + uOff[o + 7], 4);
  return vec3(fbm(T, x + k * rx, y + k * ry, oct), qx, qy);
}
const float PI = 3.141592653589793;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy); float X = float(ij.x) * uStep, Y = float(ij.y) * uStep, t = uTau;
  float v = 0., v2 = 0., v3 = 0.;
  if (uKind == 1) {
    // petals round a centre, their reach varied by noise
    float dx = (X - uC.x) / uRR, dy = (Y - uC.y) / uRR, rho = length(vec2(dx, dy)), th = rho > 0. ? atan(dy, dx) : 0.;
    float w = fbm(uV, dx * 2.2 + uOff[0] + .5 * t, dy * 2.2 + uOff[1], 3) * uK;
    float petals = .5 + .5 * cos(uB.x * th + uB.y * rho * 6. + w * 3.);
    float reach = uB.z * (.55 + .9 * (.5 + fbm(uV, cos(th) * 1.3 + uOff[4] + .3 * t, sin(th) * 1.3 + uOff[5], 2)));
    float fall = exp(-pow(rho / reach, 2.));
    v = pow(petals, .8) * fall * (.55 + .9 * rho / (rho + .12)) + fbm(uV, dx * 3. + uOff[2], dy * 3. + uOff[3] - .4 * t, 2) * .12;
  } else if (uKind == 2) {
    // blobs smeared round a centre, as by a turning camera; the rings run slowly outward
    float dx = (X - uC.x) / uRR, dy = (Y - uC.y) / uRR, rho = length(vec2(dx, dy)), th0 = rho > 0. ? atan(dy, dx) : 0.;
    float rq = rho * uB.x + uK * fbm(uV, dx * 2. + uOff[0] + .4 * t, dy * 2. + uOff[1], 3), ka = uB.y * min(1., rho / .18);
    int ns = uB.z != 0. ? 7 : 1;
    for (int s = 0; s < 7; s++) {
      if (s >= ns) break;
      float th = th0 + (ns > 1 ? (float(s) / float(ns - 1) - .5) * uB.z : 0.);
      if (th > PI) th -= 2. * PI; else if (th < -PI) th += 2. * PI;
      float wt = (th + PI) / (2. * PI);
      float a = fbm(uV, rq + uOff[2] - .6 * t, th * ka + uOff[3], uOct), b = fbm(uV, rq + uOff[2] - .6 * t, (th - 2. * PI) * ka + uOff[3], uOct);
      v += (a * (1. - wt) + b * wt) / float(ns);
    }
    v -= uB.w * exp(-rho * rho / .02);
  } else {
    float X2 = X, Y2 = Y;
    if (uTwirl != 0.) {
      float dx = X - uC.x, dy = Y - uC.y, a = uTwirl * exp(-3. * (dx * dx + dy * dy) / (uRR * uRR)), c = cos(a), s = sin(a);
      X2 = uC.x + dx * c - dy * s; Y2 = uC.y + dx * s + dy * c;
    }
    float x = X2 / uS / uStretch.x, y = Y2 / uS / uStretch.y, k = uK;
    vec3 w = warped(uV, x, y, k, uOct, 0); v = w.x;
    if (uRidge != 0.) v -= uRidge * abs(fbm(uV, x * 2.1 + k * w.y + uOff[8], y * 2.1 + k * w.z + uOff[9], 3));
    if (uBurst != 0.) v += uBurst * length(vec2((X - uC.x) / uRR, (Y - uC.y) / uRR));
    if (uComb > .5) { v2 = v; v = (X2 * uCS.x + Y2 * uCS.y) / uS + uWander * fbm(uV, x + k * w.y + uOff[6], y + k * w.z + uOff[7], 2); }
  }
  if (uThird > .5) v3 = warped(uV3, X / uS3, Y / uS3, uK3, uOct3, 4).x;
  outc = vec4((v - uN0.x) * uN0.y, (v2 - uN2.x) * uN2.y, (v3 - uN3.x) * uN3.y, 1.);
}`;

  // Native modes, pass 2: paint() per pixel, ported line by line (the switch on o.mode), at the
  // still's own pixel scale: q is the view pixel in still px, so widths set in pixels match it.
  const FS_NAT = HEAD + `
uniform sampler2D uFld, uRamp, uLines;   // pass 1; the ramp and moire's line ramp, 1024 texels of the still's rampAt()
uniform int uMode;          // 0 swirl/bloom/spin, 1 field, 2 bands, 3 moire, 4 marble, 5 chrome, 6 caustic, 7 bleed
uniform vec2 uWH;           // the still's W, H
uniform float uKk, uStp, uHasF, uThird, uHasG2, uVig;
uniform vec4 uM0, uM1, uM2, uM3;
uniform vec3 uC0, uC1, uCol0, uScan;
vec3 rampT(sampler2D T, float t) {
  t = clamp(t, 0., 1.) * 1023.; int i = min(1022, int(t));
  return mix(texelFetch(T, ivec2(i, 0), 0).rgb, texelFetch(T, ivec2(i + 1, 0), 0).rgb, t - float(i));
}
vec3 ramp(float t) { return rampT(uRamp, t); }
vec3 paint(vec2 q) {
  float x = q.x, y = q.y, t = 0., gx = 0., gy = 0., gm = 1e-6, t3 = .5, t2 = .5;
  if (uHasF > .5) {
    float fx = x / uStp, fy = y / uStp; int i = int(floor(fx)), j = int(floor(fy)); float u = fx - float(i), v = fy - float(j);
    vec4 A = texelFetch(uFld, ivec2(i, j), 0), B = texelFetch(uFld, ivec2(i + 1, j), 0), C = texelFetch(uFld, ivec2(i, j + 1), 0), E = texelFetch(uFld, ivec2(i + 1, j + 1), 0);
    t = A.r + (B.r - A.r) * u + (C.r - A.r) * v + (A.r - B.r - C.r + E.r) * u * v;
    // slope in field units per pixel, for widths measured in pixels
    gx = ((B.r - A.r) * (1. - v) + (E.r - C.r) * v) / uStp; gy = ((C.r - A.r) * (1. - u) + (E.r - B.r) * u) / uStp;
    gm = length(vec2(gx, gy)) + 1e-6;
    if (uThird > .5) t3 = A.b + (B.b - A.b) * u + (C.b - A.b) * v + (A.b - B.b - C.b + E.b) * u * v;
    t2 = uHasG2 > .5 ? A.g + (B.g - A.g) * u + (C.g - A.g) * v : t3;
  }
  vec3 o;
  if (uMode == 0) o = ramp(.5 + (t - .5) * uM0.x);
  else if (uMode == 1) {
    // flat colour, or one slow gradient, linear or from a point
    float s;
    if (uM0.z > .5) s = length(vec2(x / uWH.x - uM1.x, (y / uWH.y - uM1.y) * uWH.y / uWH.x)) / uM0.w;
    else s = .5 + ((x / uWH.x - .5) * uM0.x + (y / uWH.y - .5) * uM0.y);
    if (uHasF > .5) s += (t - .5) * uM1.z;
    o = ramp(s);
  } else if (uMode == 2) {
    // each band one smooth swing from the first colour to the last and back
    float sb = t * uM0.x, f = sb - floor(sb), w = .5 - .5 * cos(6.283185307179586 * f);
    o = ramp(pow(max(w, 0.), uM0.y));
    if (uM0.z > 0.) { float pm = abs(f - .5) / (uM0.x * gm); o = mix(o, uC0, .9 * (1. - smoothstep(uM0.z * .5, uM0.z * .5 + 1.2, pm))); }
  } else if (uMode == 3) {
    // fine lines on the first colour, taking their colour from the warped field under them
    o = uCol0;
    float s = t * uM0.x, f = s - floor(s), pm = abs(f - .5) / (uM0.x * gm);
    float cov = 1. - smoothstep(uM0.y - .7, uM0.y + .7, pm);
    if (cov > 0.) o = mix(o, rampT(uLines, min(.999, max(0., t2))), cov);
  } else if (uMode == 4) {
    // levels of the field with a vein between them
    float sl = t * uM0.x, bi = floor(sl), f = sl - bi, tri = pow(max(0., 1. - abs(2. * f - 1.)), uM0.y);
    o = ramp(tri);
    float pe = min(f, 1. - f) / (uM0.x * gm);
    if (uM0.z > 0.) o = mix(o, uC0, 1. - smoothstep(uM0.z * .5, uM0.z * .5 + 1.1, pe));
  } else if (uMode == 5) {
    // a height field lit like polished metal
    float nx = -gx * uM0.x, ny = -gy * uM0.x, inv = 1. / sqrt(nx * nx + ny * ny + 1.); nx *= inv; ny *= inv;
    float nzz = inv, uu = nx * uM1.x + ny * uM1.y;
    float e = .5 + .5 * sin(3.141592653589793 * (uM0.y * uu + uM0.z * t));
    e = clamp(.5 + (e - .5) * uM0.w, 0., 1.);
    if (uM1.z != 0.) e = fract(e * .5 + t * uM1.z + uu * .3);
    o = ramp(e * (1. - uM1.w * (1. - nzz)));
    float sp = pow(max(0., nx * uM2.x + ny * uM2.y + nzz * uM2.z), uM2.w);
    o = mix(o, vec3(1.), sp * uM3.x);
  } else if (uMode == 6) {
    // pool water: bright wavering lines on one set of levels and dark ones between them
    o = ramp(uM0.w * (y / uWH.y) + (1. - uM0.w) * t3);
    float s = t * uM0.x, f = s - floor(s), w = uM0.y * (.35 + t3);
    float pb = abs(f - .5) / (uM0.x * gm), pd = min(f, 1. - f) / (uM0.x * gm);
    o = mix(o, uC1, uM0.z * (1. - smoothstep(w * .4, w * .4 + 1., pd)));
    o = mix(o, uC0, 1. - smoothstep(w * .5 - .5, w * .5 + .8, pb));
  } else {
    // watercolour: washes laid one over the other, pigment pooled at the rim inside each
    float sl = t * uM0.x + (t3 - .5) * uM0.y, bi = floor(sl), f = sl - bi, pe = f / (uM0.x * gm);
    vec3 pre = ramp((bi + 1.) / uM0.x);
    o = ramp(bi / uM0.x + f * .15 / uM0.x);
    if (bi > 0.) o = mix(o, pre, uM0.z * exp(-pe / uM0.w));
  }
  if (uVig > 0.) { float r = length(vec2(x / uWH.x - .5, y / uWH.y - .5)) * 1.41; o = mix(o, uCol0, uVig * smoothstep(.35, 1., r)); }
  if (uScan.x > 0. && mod(floor(y), uScan.x) / uScan.x >= uScan.y) o *= uScan.z;
  return o;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  float front; vec2 off = moveOff(p, front);
  finish(paint(clamp((p + off) * uKk - .5, vec2(0.), uWH - 1.)), p, front);
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
      R.prog = compile(gl, FS_CAP); R.gen++;
      R.native = !!gl.getExtension('EXT_color_buffer_float') && !!(R.fld = compile(gl, FS_FLD)) && !!(R.nat = compile(gl, FS_NAT));
      return !!R.prog;
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
  // the noise tables of makeNoise(seed), gathered for the GPU: texel (X, Y) holds the four values
  // one noise cell reads, G[P[X + P[Y]]], G[P[X + 1 + P[Y]]], G[P[X + P[Y + 1]]], G[P[X + 1 + P[Y + 1]]]
  const tables = new Map();
  function noiseTable(seed) {
    const key = typeof seed + ':' + seed;
    if (tables.has(key)) return tables.get(key);
    const n = P.makeNoise(seed), Pm = n.P, Gt = n.G, d = new Float32Array(256 * 256 * 4);
    for (let Y = 0; Y < 256; Y++) for (let X = 0; X < 256; X++) {
      const k = (Y * 256 + X) * 4;
      d[k] = Gt[Pm[X + Pm[Y]]]; d[k + 1] = Gt[Pm[X + 1 + Pm[Y]]]; d[k + 2] = Gt[Pm[X + Pm[Y + 1]]]; d[k + 3] = Gt[Pm[X + 1 + Pm[Y + 1]]];
    }
    if (tables.size > 24) tables.clear();
    tables.set(key, d);
    return d;
  }
  // a ramp as 1024 texels of the still's own rampAt(), in 0..1 floats
  function rampTexels(cs) {
    const d = new Float32Array(1024 * 4);
    for (let i = 0; i < 1024; i++) {
      let c;
      if (cs.length === 1) c = cs[0];
      else { const x = i / 1023 * (cs.length - 1), j = Math.min(cs.length - 2, Math.floor(x)), u = x - j, a = cs[j], b = cs[j + 1]; c = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
      d.set([c[0] / 255, c[1] / 255, c[2] / 255, 1], i * 4);
    }
    return d;
  }
  // everything the two native passes need, from the still's merged options and its solved field
  function nativeSrc(cap) {
    const o = cap.o, F = cap.F, W = cap.W, H = cap.H, mn = Math.min(W, H), rgb = c => P.rgb(c).map(x => x / 255);
    const cols = P.rampRgb(o.ramp), R = P.rng(o.seed + ':off'), off = Array.from({ length: 12 }, () => R() * 100);
    const mode = NATIVE[o.mode], M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    let C0 = [0, 0, 0], C1 = [0, 0, 0];
    const lc = Math.cos((o.light || 0) * Math.PI / 180), ls = Math.sin((o.light || 0) * Math.PI / 180);
    const Lz = 0.8, Ln = Math.hypot(lc * 0.6, ls * 0.6, Lz);
    if (mode === 0) M[0] = [o.contrast, 0, 0, 0];
    else if (mode === 1) { M[0] = [0, 0, o.radial ? 1 : 0, o.radius || 1]; M[1] = [o.center[0], o.center[1], o.wobble || 0, 0]; }
    else if (mode === 2) { M[0] = [o.bands, o.sharp, o.core || 0, 0]; C0 = rgb(o.coreColor || 'night'); }
    else if (mode === 3) M[0] = [o.bands, o.line, 0, 0];
    else if (mode === 4) { M[0] = [o.levels, o.sharp, o.vein || 0, 0]; C0 = rgb(o.veinColor || 'night'); }
    else if (mode === 5) { M[0] = [o.relief * mn, o.rings, o.lift, o.contrast]; M[1] = [lc, ls, o.cycle || 0, o.deep]; M[2] = [lc * 0.6 / Ln, ls * 0.6 / Ln, Lz / Ln, o.shine]; M[3] = [o.spec, 0, 0, 0]; }
    else if (mode === 6) { M[0] = [o.bands, o.line, o.dark, o.fall]; C0 = rgb(o.lineColor || 'citric+70'); C1 = rgb(o.darkColor || 'night'); }
    else M[0] = [o.levels, o.gran, o.rim, o.rimWidth];
    const nm = F ? F.norms : [];
    return {
      mode, name: o.mode, W, H, M, C0, C1, col0: cols[0].map(x => x / 255), angle: o.angle || 0,
      vig: o.vignette || 0, scan: o.scan ? [o.scan, o.scanDuty || 0.45, 1 - (o.scanDark != null ? o.scanDark : 0.75)] : [0, 0, 0],
      ramp: rampTexels(cols), lines: rampTexels(cols.length > 1 ? cols.slice(1) : cols),
      V: F ? noiseTable(o.seed) : null, V3: F && F.g3 ? noiseTable(o.seed + ':3') : null, off,
      kind: o.mode === 'bloom' ? 1 : o.mode === 'spin' ? 2 : 0,
      f: F && {
        step: F.step, gw: F.gw, gh: F.gh, S: mn * o.scale, S3: mn * (o.scale3 || o.scale * 1.3), K: o.warp, K3: o.warp3 != null ? o.warp3 : 1,
        oct: o.octaves, oct3: o.octaves3 || 3, twirl: o.twirl || 0, ridge: o.ridge || 0, burst: o.burst || 0, wander: o.wander || 0,
        comb: F.g2 ? 1 : 0, cs: [Math.cos((o.comb || 0) * Math.PI / 180), Math.sin((o.comb || 0) * Math.PI / 180)], third: F.g3 ? 1 : 0,
        stretch: o.stretch, c: [o.center[0] * W, o.center[1] * H],
        B: o.mode === 'bloom' ? [o.petals, o.twist, o.radius, 0] : o.mode === 'spin' ? [o.rings, o.arcs, o.smear || 0, o.eye || 0] : [0, 0, 0, 0],
        n0: nm[0] || [0, 0], n2: nm[1] || [0, 0], n3: nm[2] || [0, 0],
      },
    };
  }
  // paint the sheet once at iw×ih without grain; keep its field. Native modes stop after the field.
  function build(v) {
    const o = v.o, so = stillOpts(o), w = v.w, h = v.h;
    const k = Math.min(1, Math.sqrt(o.maxField / (w * h))), iw = Math.max(2, Math.round(w * k)), ih = Math.max(2, Math.round(h * k));
    const cv = document.createElement('canvas'); cv.width = iw; cv.height = ih;
    let cap = null;
    const collage = so.mode === 'collage';                        // tiles carry their own grain: it stays baked in
    const nat = !!(v.R && v.R.native) && o.native !== false && !collage;
    P.paint(cv, collage ? so : Object.assign({}, so, { grain: 0, capture: c => { cap = c; if (nat && nativeOK(c.o)) { c.native = true; return false; } } }));
    v.src = {
      iw, ih, F: cap && cap.F, sheet: cv,
      grain: collage ? 0 : grainOf(so), gs: so.grainSize || 1, si: P.seedInt(so.seed == null ? 1 : so.seed),
      ground: P.rgb(o.ground || 'night').map(x => x / 255),
    };
    if (cap && cap.native) v.src.native = nativeSrc(cap);
    else v.src.px = new Uint8Array(cv.getContext('2d').getImageData(0, 0, iw, ih).data.buffer.slice(0));
    v.g = null; v.dirty = true;
  }
  function freeGPU(v) {
    if (!v.g || v.g.gen !== v.R.gen) return;
    const gl = v.R.gl;
    for (const k of ['img', 'F', 'fld', 'V', 'V3', 'ramp', 'lines']) if (v.g[k]) gl.deleteTexture(v.g[k]);
    if (v.g.fbo) gl.deleteFramebuffer(v.g.fbo);
  }
  function upload(v) {
    const gl = v.R.gl, s = v.src, N = s.native;
    freeGPU(v);
    if (!N) {
      const img = texture(gl, s.iw, s.ih, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, s.px, gl.LINEAR);
      const F = s.F ? texture(gl, s.F.gw, s.F.gh, gl.R32F, gl.RED, gl.FLOAT, s.F.g, gl.NEAREST) : texture(gl, 1, 1, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(1), gl.NEAREST);
      v.g = { img, F, gen: v.R.gen, src: s };
      return;
    }
    const g = v.g = { gen: v.R.gen, src: s, tau: null };
    g.ramp = texture(gl, 1024, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, N.ramp, gl.NEAREST);
    g.lines = texture(gl, 1024, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, N.lines, gl.NEAREST);
    if (N.f) {
      g.V = texture(gl, 256, 256, gl.RGBA32F, gl.RGBA, gl.FLOAT, N.V, gl.NEAREST);
      if (N.V3) g.V3 = texture(gl, 256, 256, gl.RGBA32F, gl.RGBA, gl.FLOAT, N.V3, gl.NEAREST);
      g.fld = texture(gl, N.f.gw, N.f.gh, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST);
      g.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.fld, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else g.fld = texture(gl, 1, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, new Float32Array(4), gl.NEAREST);
  }
  // pass 1: the field at time tau (noise units), only when tau moved
  function fieldPass(v, tau) {
    const gl = v.R.gl, g = v.g, N = v.src.native, f = N.f;
    if (!f || g.tau === tau) return;
    g.tau = tau;
    const Pr = v.R.fld, u = n => U(gl, Pr, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo); gl.viewport(0, 0, f.gw, f.gh); gl.useProgram(Pr.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.V); gl.uniform1i(u('uV'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, g.V3 || g.V); gl.uniform1i(u('uV3'), 1);
    gl.uniform1i(u('uKind'), N.kind); gl.uniform1i(u('uOct'), f.oct); gl.uniform1i(u('uOct3'), f.oct3);
    gl.uniform1fv(u('uOff'), N.off);
    gl.uniform1f(u('uStep'), f.step); gl.uniform1f(u('uS'), f.S); gl.uniform1f(u('uS3'), f.S3); gl.uniform1f(u('uRR'), Math.min(N.W, N.H));
    gl.uniform1f(u('uK'), f.K); gl.uniform1f(u('uK3'), f.K3); gl.uniform1f(u('uTau'), tau);
    gl.uniform1f(u('uTwirl'), f.twirl); gl.uniform1f(u('uRidge'), f.ridge); gl.uniform1f(u('uBurst'), f.burst); gl.uniform1f(u('uWander'), f.wander);
    gl.uniform1f(u('uComb'), f.comb); gl.uniform1f(u('uThird'), f.third);
    gl.uniform2f(u('uStretch'), f.stretch[0], f.stretch[1]); gl.uniform2f(u('uC'), f.c[0], f.c[1]); gl.uniform2f(u('uCS'), f.cs[0], f.cs[1]);
    gl.uniform4fv(u('uB'), f.B); gl.uniform2fv(u('uN0'), f.n0); gl.uniform2fv(u('uN2'), f.n2); gl.uniform2fv(u('uN3'), f.n3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function drawGPU(v) {
    const R = v.R, gl = R.gl, s = v.src, w = v.w, h = v.h, st = v.st, o = v.o;
    if (R.lost || !s || !R.prog) return false;
    const N = s.native;
    if (N && !R.nat) return false;
    if (!v.g || v.g.gen !== R.gen || v.g.src !== s) upload(v);
    const cv = R.canvas;
    const S = Math.min(w, h), c = st.clock, tau = N ? st.tau * (RATE[N.name] || 0.04) : 0;
    if (N) fieldPass(v, tau);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const Pr = N ? R.nat : R.prog, u = n => U(gl, Pr, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(Pr.p);
    if (N) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.g.fld); gl.uniform1i(u('uFld'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, v.g.ramp); gl.uniform1i(u('uRamp'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, v.g.lines); gl.uniform1i(u('uLines'), 2);
      gl.uniform1i(u('uMode'), N.mode); gl.uniform2f(u('uWH'), N.W, N.H); gl.uniform1f(u('uKk'), N.W / w);
      gl.uniform1f(u('uStp'), N.f ? N.f.step : 1); gl.uniform1f(u('uHasF'), N.f ? 1 : 0); gl.uniform1f(u('uThird'), N.f ? N.f.third : 0);
      gl.uniform1f(u('uHasG2'), N.f ? N.f.comb : 0); gl.uniform1f(u('uVig'), N.vig);
      let M0 = N.M[0], M1 = N.M[1];
      if (N.mode === 1) {
        // a flat field has no noise to evolve: its gradient turns a little and its centre wanders, both 0 at tau 0
        const a = (N.angle + 16 * Math.sin(tau * 1.3)) * Math.PI / 180;
        M0 = [Math.cos(a), Math.sin(a), M0[2], M0[3]]; M1 = [M1[0] + 0.06 * Math.sin(tau * 1.1), M1[1] + 0.05 * Math.sin(tau * 0.8), M1[2], 0];
      }
      gl.uniform4fv(u('uM0'), M0); gl.uniform4fv(u('uM1'), M1); gl.uniform4fv(u('uM2'), N.M[2]); gl.uniform4fv(u('uM3'), N.M[3]);
      gl.uniform3fv(u('uC0'), N.C0); gl.uniform3fv(u('uC1'), N.C1); gl.uniform3fv(u('uCol0'), N.col0); gl.uniform3fv(u('uScan'), N.scan);
    } else {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.g.img); gl.uniform1i(u('uImg'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, v.g.F); gl.uniform1i(u('uF'), 1);
      const F = s.F;
      gl.uniform3f(u('uFGrid'), F ? F.gw : 1, F ? F.gh : 1, F ? F.step : 1);
      gl.uniform2f(u('uImgK'), s.iw / w, Math.min(s.iw, s.ih));
      gl.uniform1f(u('uHasF'), F ? 1 : 0);
    }
    gl.uniform2f(u('uSize'), w, h);
    // the flow terms carry env (0 at clock 0) and a phase that starts at 0; native paint evolves instead
    const a = N ? 0 : st.env * o.drift * st.wet * S;
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
    v.st = { clock: 0, tau: 0, env: 0, wet: o.wet, expose: typeof o.develop === 'number' ? clamp01(o.develop) : 0, gk: 0, lastGk: -1, reveal: o.reveal, inStart: 0,
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
      if (!rm && o.drift > 0 && (o.wet > 0 || st.wet > 1e-3)) {
        st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 3); moving = true;
        st.tau += dt * o.speed * o.evolve * Math.min(2, st.wet) * st.env;   // the paint's own time: 0 at frame 0
      } else if (rm) { st.clock = 0; st.env = 0; st.tau = 0; }
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
        if (v.R) freeGPU(v);
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        const i = registry.views.indexOf(api); if (i >= 0) registry.views.splice(i, 1);
      },
      state() { return { mode: v.R ? 'gpu' : 'still', path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.expose.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src, reduced: still(), paint: v.src ? (v.src.native ? 'native' : 'captured') : null }; },
      /** time n frames with every live term on: `sync` waits for the GPU after each frame (median), `pipelined` waits once */
      bench(n) {
        if (!v.R || !v.src) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st, keep = { clock: st.clock, tau: st.tau, env: st.env, expose: st.expose, wet: st.wet, gk: st.gk, comb: Object.assign({}, st.comb), pulses: st.pulses };
        Object.assign(st, { env: 1, wet: 1, expose: 0.6 }); Object.assign(st.comb, { x: v.w / 2, y: v.h / 2, amp: 1, speed: 800 });
        st.pulses = [0, 1, 2, 3].map(i => ({ x: v.w * (0.2 + 0.2 * i), y: v.h / 2, rho: v.h * 0.2, amp: 10 }));
        const step = () => { st.gk++; st.clock += 1 / 60; st.tau += 1 / 60; drawGPU(v); };
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
  live._frame = (ctl, t) => { const v = ctl._v; if (t != null) Object.assign(v.st, { clock: t, tau: t, env: 1 }); if (v.R) { drawGPU(v); present(v); } else drawCPU(v); };
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
    v.st = { clock: 0, tau: 0, env: 0, wet: 1, expose: 1, gk: 0, reveal: null, comb: { x: 0, y: 0, dx: 1, dy: 0, speed: 0, amp: 0 }, pulses: [] };
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
      mode: o.mode, paint: v.src.native ? 'native' : 'captured', ramp: typeof o.ramp === 'string' ? o.ramp : undefined, seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
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
    live.parity({ mode: 'bloom', seed: 4 }),
    live.parity({ mode: 'spin', seed: 6 }),
    live.parity({ mode: 'bands', seed: 2 }),
    live.parity({ mode: 'moire', seed: 5 }),
    live.parity({ mode: 'marble', seed: 3 }),
    live.parity({ mode: 'chrome', ramp: 'slick', seed: 8, cycle: 0.7 }),
    live.parity({ mode: 'caustic', seed: 9 }),
    live.parity({ mode: 'bleed', seed: 1 }),
    live.parity({ mode: 'field', ramp: 'claret', radial: true, seed: 1 }),
    live.parity({ mode: 'field', ramp: 'agate', wobble: 0.6, seed: 2 }),
    live.parity({ mode: 'splash', seed: 5 }),
    live.parity({ mode: 'dash', seed: 2, mosh: 0.4, scan: 3 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) }));
  P.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
