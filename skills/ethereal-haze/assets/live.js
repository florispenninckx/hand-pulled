/* live.js — Haze.live(): an ethereal-haze image, breathing.
 *
 * The still engine (haze.js) is the reference. Every image there is made in three stages:
 *   1. the scene, painted small: a field, a ribbon or silk is a function of the pixel, so
 *      it is ported to GLSL line by line (the same integer hash, value noise, constants,
 *      ramps and rand draws, replayed in the same order) and drawn per frame into a small
 *      texture on the still's own grid, margin included: it moves. The bloom, meadow and
 *      poppies are canvas paths and gradients (irregular), so they run ONCE on the CPU
 *      through the `capture` hook and are uploaded at device size;
 *   2. the blur its subject has: the lens disc and the moving shutter are the still's own
 *      offsets, averaged in one pass each on the GPU for the ported scenes;
 *   3. the print: finish() ported to a fragment shader line by line — the same 512² tile
 *      of grain and scatter offsets (uploaded, not re-hashed), the same scatter, saturation,
 *      vignette, veil and midtone-weighted grain, the same clamp points.
 * Frame 0 at clock 0 with the defaults is the still; live.parity() measures that.
 *
 *   const ctl = Haze.live(canvas, { fn: 'field', form: 'fold', seed: 4,   // still options
 *                                   sway: 1, drift: 1, mist: 1, bloom: 0.35 });   // motion options
 *   ctl.set({ focus: 0.6 }); ctl.pulse(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * Motion belongs to the medium: the scene itself sways (a fold's edges and phases, a sun
 * breathing, bands flowing, flames rising, a blot's rim, a ribbon swaying and turning so its
 * crisp side travels, silk folds rippling), fog drifting under the soft image and breathing
 * in and out as mist, a focus pull (soft ↔ sharp) that follows scroll, the pointer or set(),
 * light swelling toward the pointer as through gauze, and pulse() as a soft bloom of light.
 * Grain is re-rolled slowly (12 per second); the stipple of the edges stays where it is. Big
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
    fn: 'field', image: null, look: null, native: true, sway: 1,
    drift: 1, driftScale: 0.35, pace: 1, mist: 0.5, breath: 0.35, breathPeriod: 11,
    focus: 0, focusScroll: 0, focusRadius: 0.012, sharpen: 0.35, enter: false, enterMs: 2200,
    pointer: true, bloom: 0.3, radius: 0.3, lag: 0.25, glow: '#fff1e2', hand: null, clickPulse: false,
    grainRate: 12, reveal: null, revealPaper: '#f3ede1', ease: 0.12, own: null,
  };

  // ---------------------------------------------------------------- GLSL
  const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  // finish() from haze.js, plus the live terms — every one of them exactly zero at clock 0.
  // uNative: the soft image is the GPU stage (sampled with the upscale's bilinear filter),
  // otherwise the CPU capture already upscaled to device size (read texel for texel).
  const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uSrc, uG, uD;
uniform vec2 uSize;
uniform int uNative; uniform vec2 uStage; uniform vec4 uFrame;   // stage size; frame x, y, w/W, h/H
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
// fog: a slow field of sines (cheap at 5 MP, unlike value noise); its value at clock 0 is subtracted
vec2 wv(vec2 q, float t) {
  return vec2(sin(q.x * 1.9 + q.y * 1.1 + t * .11) + .6 * sin(-q.x * 1.3 + q.y * 2.3 + t * .08 + 1.7) + .35 * sin(q.x * 3.7 - q.y * 1.9 - t * .15),
              sin(-q.x * 1.2 + q.y * 1.7 + t * .09 + 2.1) + .6 * sin(q.x * 2.1 + q.y * 1.3 - t * .12) + .35 * sin(-q.x * 2.3 + q.y * 3.9 + t * .14 + 4.)) / 1.95;
}
vec3 at(vec2 p) {
  if (uNative != 0) return texture(uSrc, (uFrame.xy + (p + .5) * uFrame.zw) / uStage).rgb * 255.;
  return texture(uSrc, (p + .5) / uSize).rgb * 255.;
}
void main() {
  ivec2 ip = ivec2(int(gl_FragCoord.x), int(uSize.y - gl_FragCoord.y));
  vec2 xy = vec2(ip);
  int j = ((ip.y & 511) << 9) | (ip.x & 511);
  vec2 s = xy;
  if (uSc >= .5) { vec2 d = texelFetch(uD, ivec2(ip.x & 511, ip.y & 511), 0).rg; s = floor(clamp(xy + d * uSc, vec2(0.), uSize - 1.)); }
  float t = uDrift.y * uDrift.w;
  vec2 q = s / uDrift.z, disp = vec2(0.);
  if (uDrift.x > 0. && t != 0.) disp = (wv(q, t) - wv(q, 0.)) * .5 * uDrift.x;
  vec2 dp = s - uPtr.xy; float pw = uPtr.w > 0. ? exp(-dot(dp, dp) / (2. * uPtr.z * uPtr.z)) : 0.;
  float f = uFocus.x - uFocus.z * pw;
  vec3 c = (disp == vec2(0.) && uNative == 0) ? texelFetch(uSrc, ivec2(s), 0).rgb * 255. : at(s + disp);
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
  if (uMist.x > 0.) lift += uMist.x * smoothstep(.56, .95, .5 + .5 * sin(q.x * .9 + q.y * .5 + t * .07) * sin(q.y * .8 - q.x * .35 - t * .05 + 1.3));
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

  // the scenes of haze.js, ported line by line: field (fold, sun, flow, flame, blot), ribbon
  // (a band, an orb) and silk. One texel = one pixel of the still's stage, margin included,
  // row 0 at the top; the value is what the still's paint() writes there. uTau is the scene
  // clock: every motion term below is osc() (0 at uTau 0) or uTau times something.
  const FS_SCENE = `#version 300 es
precision highp float; precision highp int;
uniform int uKind, uS, uNC, uNS; uniform float uM, uTau, uSway, uReach; uniform vec2 uWH;
uniform vec4 uP[3]; uniform vec3 uC[12];
uniform vec4 uSA[90], uSB[90];   // ribbon segments: ax, ay, dx, dy; hw0, hw1, tw0, tw1
uniform vec4 uF[9], uF2[9];      // silk folds: ca, sa, off, amp; wid, bow
out vec4 outc;
float hs(int x, int y, int s) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.;
}
float vn(float x, float y, int s) {
  float xf = floor(x), yf = floor(y), u = x - xf, v = y - yf, a = u * u * (3. - 2. * u), b = v * v * (3. - 2. * v);
  int xi = int(xf), yi = int(yf);
  float p = hs(xi, yi, s), q = hs(xi + 1, yi, s), r = hs(xi, yi + 1, s), t = hs(xi + 1, yi + 1, s);
  return p + (q - p) * a + (r - p) * b + (p - q - r + t) * a * b;
}
float fbm(float x, float y, int s) { return .55 * vn(x, y, s) + .3 * vn(x * 2.03 + 7.1, y * 2.03, s + 1) + .15 * vn(x * 4.1, y * 4.1 + 3.3, s + 2); }
float sm(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
vec3 mx(vec3 a, vec3 b, float t) { return a + (b - a) * t; }
vec3 ramp(float t) {
  float l = clamp(t, 0., 1.) * float(uNC - 1); int k = min(uNC - 2, int(l)); float u = l - float(k);
  return uC[k] + (uC[k + 1] - uC[k]) * u;
}
float osc(float w, float p) { return uSway * (sin(uTau * w + p) - sin(p)); }
// II. field
vec3 fold(float x, float y) {
  float w = uWH.x, h = uWH.y, L = uP[0].x, lean = uP[0].y, x0 = uP[0].z, y0 = uP[0].w;
  float ph0 = uP[1].x + .45 * osc(.31, 1.), ph1 = uP[1].y + .3 * osc(.23, 2.), ph2 = uP[1].z + .4 * osc(.19, 4.), dw = .3 * osc(.11, .5);
  float wx = x + (fbm(x / L * 3. + dw, y / L * 3., uS) - .5) * L * .12, wy = y + (fbm(x / L * 3. + 9., y / L * 3. - dw, uS + 5) - .5) * L * .12;
  vec3 c = uC[0];
  float low = sm(.55, 1.05, wy / h + .15 * sin(wx / w * 3. + ph2));
  c = mx(c, uC[3], low * .9);
  float gEdge = h * (.22 + .14 * sin(wx / w * 2.6 + ph0)) + lean * (wx - w / 2.) * .25, gd = (gEdge - wy) / L;
  c = mx(c, uC[1], sm(-.07, .05, gd) * .95);
  float fEdge = x0 + w * .14 * sin(wy / h * 3.1 + ph1) + (wy - y0) * .18 * lean, fd = lean * (fEdge - wx) / L;
  float fa = sm(-.003, .008, fd) * exp(-max(0., fd - .03) / .16) * sm(-.1, .3, wy / h);
  c = mx(c, uC[2], fa * .9);
  float e = (fd + .04) / .035;
  return mx(c, uC[4], exp(-e * e) * .5);
}
vec3 sun(float x, float y) {
  float cx = uP[0].x, cy = uP[0].y, R0 = uP[0].z, ey = uP[0].w, R = R0 * (1. + .04 * osc(.37, 0.)), dn = .3 * osc(.13, 1.);
  float dx = (x - cx) / R, dy = (y - cy) / (R * ey), n = fbm(x / R0 * 1.4 + dn, y / R0 * 1.4 - dn * .6, uS) - .5;
  return ramp(sqrt(dx * dx + dy * dy) * (1. + n * .22));
}
vec3 flow(float x, float y) {
  float L = uP[0].x, ca = uP[0].y, sa = uP[0].z, k = uP[0].w, ph = uP[1].x + .7 * osc(.17, 0.);
  float px = x / L, py = y / L, al = px * ca + py * sa, ac = -px * sa + py * ca;
  float warp = .2 * sin(al * 4. + ph) + .08 * (fbm(al * 2.5, ac * 2.5 + .2 * osc(.09, 2.), uS) - .5);
  float fib = (fbm(al * 2.2 + uTau * uSway * .035, (ac + warp) * 40., uS + 7) - .5) * .12;
  float t = (ac + warp) * k + fib + .3; t -= floor(t); t = t < .5 ? t * 2. : 2. - t * 2.;
  return ramp(sm(0., 1., t));
}
float teeth(float x, int k, float ph) {
  float w = uWH.x, n = uP[0].x;
  float u = x / w * n * (1. + .3 * float(k)) + ph + .45 * sin(x / w * 5. + ph), i = floor(u), f = u - i, tri = 1. - abs(f - .5) * 2.;
  return (.35 + .9 * hs(int(i), k, uS)) * (pow(tri, 1.6) - .35);
}
vec3 flame(float x, float y) {
  float w = uWH.x, h = uWH.y, amp = uP[0].y, v = y / h;
  float wob = fbm(x / w * 4., v * 1.4 + uTau * uSway * .045, uS) - .5, k = sm(.15, .6, v);
  return ramp(v + amp * (teeth(x, 0, uP[0].z + .35 * osc(.21, 0.)) * (1. - k) + teeth(x, 1, uP[0].w + .35 * osc(.16, 2.)) * k) + wob * .16);
}
vec3 blot(float x, float y) {
  float S = uP[0].x, cx = uP[0].y, cy = uP[0].z, R = uP[0].w, soft = uP[1].x + .5 * osc(.13, 0.), ph = uP[1].y + .3 * osc(.17, 1.), bx = uP[1].z, by = uP[1].w;
  float paper = (fbm(x / S * 6., y / S * 6., uS) - .5) * 10., br = 1. + .05 * osc(.29, 2.);
  vec3 c = uC[0] + paper;
  float bd = length(vec2((x - bx) / (R * .55 * br), (y - by) / (R * .8 * br)));
  c = mx(c, uC[3], sm(1.25, .2, bd) * .8); c = mx(c, uC[2], sm(.9, .1, bd) * .85);
  float dx = x - cx, dy = (y - cy) / 1.15, th = atan(dy, dx), r = length(vec2(dx, dy));
  float edge = R * (1. + .1 * sin(2. * th + ph) + .05 * sin(3. * th + ph * 2.) + .12 * (fbm(cos(th) * 2., sin(th) * 2., uS + 3) - .5));
  float e = .012 + .42 * pow(.5 + .5 * cos(th - soft), 2.5), d = (edge - r) / R;
  return mx(c, uC[1], sm(-e, e * .4, d));
}
// III. ribbon
vec3 paperAt(float x, float y) { float S = uP[0].x, v = (fbm(x / S * 3., y / S * 3., uS) - .5) * 9.; return uP[1].xyz + vec3(v, v, v * 1.1); }
vec3 band(float x, float y) {
  float best = 0., bt = 0., bs = 0., n = float(uNS);
  for (int i = 0; i < 90; i++) {
    if (i >= uNS) break;
    vec4 A = uSA[i], B = uSB[i];
    float l2 = A.z * A.z + A.w * A.w, il = l2 == 0. ? 1. : 1. / l2;
    float u = clamp(((x - A.x) * A.z + (y - A.y) * A.w) * il, 0., 1.), ex = x - A.x - A.z * u, ey = y - A.y - A.w * u, d2 = ex * ex + ey * ey;
    if (d2 > uReach) continue;
    float t = float(i) / n + u / n, hw = B.x + (B.y - B.x) * u, tw = B.z + (B.w - B.z) * u;
    float a = sqrt(d2) / hw * ((A.z * ey - A.w * ex) < 0. ? -1. : 1.), aa = abs(a), k = .5 + .5 * tw * (a < 0. ? -1. : 1.);
    float fw = .16 + 1.1 * (1. - k), g = (aa - .55) / fw, core = aa < .55 ? 1. : exp(-g * g);
    float al = core * sm(0., .12, t) * sm(1., .86, t);
    if (al > best) { best = al; bt = t; bs = a * tw; }
  }
  vec3 p = paperAt(x, y);
  if (best < .002) return p;
  vec3 c = ramp(bt);
  float deep = sm(-.3, 1., bs) * .5, lift = sm(.2, -1.4, bs) * .22, al = best * .97;
  vec3 q = vec3(c.r * (1. - deep) + 255. * lift, c.g * (1. - deep * 1.15) + 250. * lift, c.b * (1. - deep * .8) + 245. * lift);
  return p + (q - p) * al;
}
vec3 orb(float x, float y) {
  float cx = uP[2].x, cy = uP[2].y, R = uP[2].z * (1. + .03 * osc(.3, 0.)), lt = uP[2].w + .35 * osc(.1, 0.);
  float dx = x - cx, dy = y - cy, r = length(vec2(dx, dy)) / R, lit = .5 + .5 * cos(atan(dy, dx) - lt);
  vec3 p = paperAt(x, y), c = ramp(clamp(r * (.5 + .62 * lit), 0., 1.));
  float al = sm(1.1 + .4 * lit, .88 - .1 * lit, r);
  return p + (c - p) * al;
}
// IV. silk: the height of the cloth, then the light on it
float silkH(float x, float y) {
  float w = uWH.x, h = uWH.y, L = uP[0].x, px = uP[0].y, py = uP[0].z, dw = .25 * osc(.09, 0.);
  float wx = x + (fbm(x / L * 2.2 + dw, y / L * 2.2, uS) - .5) * L * .16, wy = y + (fbm(x / L * 2.2 + 5., y / L * 2.2 - dw * .7, uS + 3) - .5) * L * .16;
  float pinch = .55 + .45 * min(1., length(vec2(wx - px, wy - py)) / L), v = 0.;
  for (int i = 0; i < 9; i++) {
    vec4 F = uF[i]; float wid = uF2[i].x, bow = uF2[i].y, off = F.z + L * .012 * osc(.19 + .035 * float(i), float(i) * 1.7);
    float al = (wx - w / 2.) * F.x + (wy - h / 2.) * F.y, ac = -(wx - w / 2.) * F.y + (wy - h / 2.) * F.x;
    float d = (ac - off * pinch - bow * al * al) / wid;
    v += F.w * wid * exp(-d * d);
  }
  return v;
}
vec3 silk(float x, float y) {
  float X = clamp(x + 2., 1., uWH.x + 2.) - 2., Y = clamp(y + 2., 1., uWH.y + 2.) - 2.;
  float gx = (silkH(X + 1., Y) - silkH(X - 1., Y)) * .5, gy = (silkH(X, Y + 1.) - silkH(X, Y - 1.)) * .5;
  vec3 nn = vec3(-gx, -gy, 1.) / length(vec3(gx, gy, 1.)), l = vec3(-.45, -.62, .64), hh = normalize(vec3(-.45, -.62, 1.64));
  float dif = max(0., dot(nn, l)), nh = max(0., dot(nn, hh));
  return ramp(.06 + .55 * dif * dif + .38 * pow(nh, 36.) + .22 * pow(nh, 6.) - .12 * sm(.2, 1., 1. - nn.z));
}
void main() {
  float x = floor(gl_FragCoord.x) - uM, y = floor(gl_FragCoord.y) - uM;
  vec3 c = uKind == 0 ? fold(x, y) : uKind == 1 ? sun(x, y) : uKind == 2 ? flow(x, y) : uKind == 3 ? flame(x, y) : uKind == 4 ? blot(x, y)
         : uKind == 10 ? band(x, y) : uKind == 11 ? orb(x, y) : silk(x, y);
  outc = vec4(clamp(c / 255., 0., 1.), 1.);
}`;

  // the still's spread(): the image averaged over a set of offsets (a lens disc, a shutter line), one pass
  const FS_SPREAD = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uA; uniform vec2 uSz; uniform vec3 uO[57]; uniform int uN;
out vec4 outc;
void main() {
  vec3 s = vec3(0.);
  for (int k = 0; k < 57; k++) { if (k >= uN) break; s += texture(uA, (gl_FragCoord.xy - uO[k].xy) / uSz).rgb * uO[k].z; }
  outc = vec4(s, 1.);
}`;

  // ---------------------------------------------------------------- renderers
  function compile(gl, fs) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (!gl.isContextLost()) console.warn('live.js shader:', gl.getShaderInfoLog(s)); return null; } return s; };
    const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { if (!gl.isContextLost()) console.warn('live.js link:', gl.getProgramInfoLog(p)); return null; }
    return { p, u: {} };
  }
  function makeRenderer(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { gl, canvas, lost: false, tiles: new Map(), views: new Set() };
    // the scene and spread programs are optional: without them every mode is captured
    const setup = () => { R.P = compile(gl, FS); R.scene = compile(gl, FS_SCENE); R.spread = compile(gl, FS_SPREAD); R.fb = gl.createFramebuffer(); R.tiles.clear(); gl.bindVertexArray(gl.createVertexArray()); return !!R.P; };
    if (!setup()) return null;
    const lost = e => { e.preventDefault(); R.lost = true; };
    const back = () => { R.lost = false; setup(); for (const v of R.views) { v.tex = null; v.nat = null; v.ready = false; queueBuild(v); } };
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

  // ---------------------------------------------------------------- native scenes: the still's own parameters, replayed
  // Each builder mirrors its haze.js function: the same defaults, stage size and margin, the
  // same rand() draws in the same order, the same blur as a list of spreads. The per-pixel
  // work is in FS_SCENE; what the still computes once per image is computed here.
  const TAU = Math.PI * 2, GA = Math.PI * (3 - Math.sqrt(5));
  const NATIVE = { field: 1, ribbon: 1, silk: 1 }, KIND = { fold: 0, sun: 1, flow: 2, flame: 3, blot: 4 };
  const rgbOf = c => typeof c === 'string' ? hex(c) : c;
  function dims(p, scale) {   // setup(): the stage size
    const s = (p.resolution || scale) * (p.cssWidth ? p.cssWidth / p.width : 1);
    return [Math.max(16, Math.round(p.width * s)), Math.max(16, Math.round(p.height * s))];
  }
  function disc(r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) { const rr = r * Math.sqrt((i + 0.5) / n), a = i * GA; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    return pts;
  }
  // defocus() and motion() as lists of spreads: the image is averaged over each offset list in turn
  const lens = r => r < 0.6 ? [] : r > 2.5 ? [disc(r, Math.min(48, 14 + Math.round(r))), disc(r * 0.3, 10)] : [disc(r, Math.min(48, 14 + Math.round(r)))];
  function shutter(len, ang) {
    if (len < 1) return [];
    const passes = len > 60 ? 3 : 1, l = len / Math.sqrt(passes), out = [];
    for (let p = 0; p < passes; p++) {
      const n = Math.min(56, Math.max(8, Math.round(l / 1.2))), pts = [];
      for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * l; pts.push([Math.cos(ang) * t, Math.sin(ang) * t]); }
      out.push(pts);
    }
    return out;
  }
  function weights(pts) {   // spread(): the first copy and every offset copy, equally weighted
    const a = new Float32Array(57 * 3), N = pts.length + 1;
    a[2] = 1 / N;
    pts.forEach(([x, y], i) => a.set([x, y, 1 / N], (i + 1) * 3));
    return { a, n: N };
  }
  function scene(o, W, Hh, cssW) {
    const so = stillOpts(o, W, Hh, cssW), P = new Float32Array(12), mb = seed => H.mulberry32(seed >>> 0);
    let p, w, h, m, kind, C, spreads, S0, extra = null;
    if (o.fn === 'field') {
      const form = H.FIELD[so.form] ? so.form : 'fold', F = H.FIELD[form];
      p = Object.assign({ seed: 1, grain: 0.09, chroma: 0.3, sat: 1 }, { scatter: F.scatter }, so);
      [w, h] = dims(p, 0.3);
      const rand = mb(p.seed), soft = Math.hypot(w, h) * F.soft, L = Math.hypot(w, h), S = Math.min(w, h);
      m = Math.ceil(soft * 1.6 + h * (F.drag || 0)); kind = KIND[form]; C = (p.colors || F.colors).map(rgbOf); S0 = (p.seed | 0) + 11;
      if (form === 'fold') {
        const ph = [rand() * TAU, rand() * TAU, rand() * TAU], lean = rand() < 0.5 ? -1 : 1, x0 = w * (0.42 + rand() * 0.12), y0 = h * (0.3 + rand() * 0.1);
        P.set([L, lean, x0, y0, ph[0], ph[1], ph[2], 0]);
      } else if (form === 'sun') {
        const cx = w * (0.46 + rand() * 0.08), cy = h * (0.44 + rand() * 0.08), R = Math.max(S * 0.8, Math.max(w, h) * 0.56) * (0.95 + rand() * 0.1);
        P.set([cx, cy, R, h > w ? 1.12 : 0.9]);
      } else if (form === 'flow') {
        const a = -1.05 + rand() * 0.3, k = 1.3 + rand() * 0.5, ph = rand() * TAU;
        P.set([L, Math.cos(a), Math.sin(a), k, ph]);
      } else if (form === 'flame') {
        const n = Math.max(3, Math.round(w / Math.min(w, h) * 3)), amp = 0.22 + rand() * 0.06, ph = [rand() * 9, rand() * 9, rand() * 9];
        P.set([n, amp, ph[0], ph[1]]);
      } else {
        const cx = w * (0.56 + rand() * 0.12), cy = h * (0.4 + rand() * 0.1), R = S * (0.36 + rand() * 0.06), soft2 = rand() * TAU, ph = rand() * TAU;
        P.set([S, cx, cy, R, soft2, ph, cx + R * 0.45, cy + R * 0.85]);
      }
      spreads = F.drag ? lens(soft).concat(shutter(h * F.drag, Math.PI / 2)) : lens(soft);
    } else if (o.fn === 'ribbon') {
      const form = H.RIBBON[so.form] ? so.form : 'shift';
      p = Object.assign({ seed: 1, grain: 0.075, scatter: 4, chroma: 0.25, paper: H.PALETTES.cream }, so);
      [w, h] = dims(p, 0.4);
      const rand = mb(p.seed), S = Math.min(w, h), blur = S * 0.02, P0 = hex(p.paper);
      m = Math.ceil(blur * 1.6); S0 = (p.seed | 0) + 23; C = (p.ramp || H.RIBBON[form].ramp).map(rgbOf); spreads = lens(blur);
      P.set([S, 0, 0, 0, P0[0], P0[1], P0[2], 0]);
      if (form === 'orb') {
        kind = 11;
        const cx = w * (0.5 + (rand() - 0.5) * 0.06), cy = h * (0.36 + (rand() - 0.5) * 0.04), R = S * (0.34 + rand() * 0.04), lt = rand() * TAU;
        P.set([cx, cy, R, lt], 8);
      } else {
        kind = 10;
        let ctrl = null, sw = null, width, turns;
        if (form === 'swirl') { sw = { cx: w * (0.5 + (rand() - 0.5) * 0.06), cy: h * 0.38, r: S * 0.4 }; width = S * 0.12; turns = 2.4; }
        else { const PP = H.PATHS[form]; ctrl = PP.pts.map(q => [(q[0] + (rand() - 0.5) * 0.05) * w, (q[1] + (rand() - 0.5) * 0.03) * h]); width = S * PP.width * (0.9 + rand() * 0.2); turns = PP.turns; }
        const ph = rand() * TAU, wph = rand() * TAU;
        const widthAt = t => width * (0.3 + 0.85 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.7)) * (1 + 0.15 * Math.sin(t * 8 + wph));
        extra = { ctrl, sw, widthAt, turns, ph, w, h, A: new Float32Array(360), B: new Float32Array(360), tau: null, sway: null };
      }
    } else if (o.fn === 'silk') {
      p = Object.assign({ seed: 1, palette: 'rouge', grain: 0.075, scatter: 0.8, chroma: 0.2 }, so);
      const pal = H.PALETTES[p.palette] && H.PALETTES[p.palette].ramp ? H.PALETTES[p.palette] : H.PALETTES.rouge;
      [w, h] = dims(p, 0.4);
      const rand = mb(p.seed), L = Math.hypot(w, h);
      m = 2; kind = 20; S0 = (p.seed | 0) + 17; C = pal.ramp.map(rgbOf); spreads = lens(L * 0.004);
      const main = -0.95 + (rand() - 0.5) * 0.5, px = w * (rand() < 0.5 ? -0.1 : 1.1), py = h * (1.1 + rand() * 0.2);
      P.set([L, px, py, 0]);
      const F = new Float32Array(36), F2 = new Float32Array(36);
      for (let i = 0; i < 9; i++) {
        const a = main + (rand() - 0.5) * 0.5, off = (i / 8 - 0.5) * L * 1.1 + (rand() - 0.5) * L * 0.08;
        const amp = (0.5 + rand() * 0.8) * (rand() < 0.3 ? -1 : 1), wid = L * (0.018 + rand() * 0.05), bow = (rand() - 0.5) * 1.6 / L;
        F.set([Math.cos(a), Math.sin(a), off, amp], i * 4); F2.set([wid, bow, 0, 0], i * 4);
      }
      extra = { F, F2 };
    } else return null;
    if (!C || C.length < 2 || C.length > 12) return null;
    const Cf = new Float32Array(36);
    C.forEach((c, i) => Cf.set([c[0], c[1], c[2]], i * 3));
    const k = p.cssWidth ? W / p.cssWidth : 1, key = ((p.seed | 0) * 7 + 1) & 0xffff;
    return {
      kind, w, h, m, SW: w + 2 * m, SH: h + 2 * m, P, C: Cf, nC: C.length, S0, spreads: spreads.map(weights), extra, tau: null,
      cap: { W, H: Hh, tile: H.tile(key), tileKey: key, sc: (p.scatter || 0) * k, amp: (p.grain == null ? 0.08 : p.grain) * 255, chroma: p.chroma || 0,
        sat: p.sat == null ? 1 : p.sat, veil: p.veil || 0, vig: p.vignette || 0, vc: hex(p.veilColor || '#ffffff') },
    };
  }
  // the ribbon's path at scene time tau: control points sway, and the twist travels along the band
  function bandSegs(e, tau, sway) {
    if (e.tau === tau && e.sway === sway) return;
    e.tau = tau; e.sway = sway;
    const osc = (f, p) => sway * (Math.sin(tau * f + p) - Math.sin(p));
    let pts;
    if (e.sw) {
      const { cx, cy, r } = e.sw; pts = [];
      for (let i = 0; i < 90; i++) {
        const t = i / 89, a = -0.4 + t * TAU * 1.3 + 0.1 * osc(0.13, 1), rr = r * (1 - t * 0.78) * (1 + 0.03 * osc(0.21, t * 3));
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
      }
    } else pts = H.spline(tau ? e.ctrl.map((q, i) => [q[0] + e.w * 0.02 * osc(0.17 + 0.03 * i, i * 1.9), q[1] + e.h * 0.012 * osc(0.13 + 0.02 * i, i * 2.7 + 1)]) : e.ctrl, 90);
    const n = pts.length - 1, ph = e.ph + sway * tau * 0.12;
    let reach = 0;
    for (let i = 0; i < n; i++) {
      const ax = pts[i][0], ay = pts[i][1], t0 = i / n, t1 = (i + 1) / n, hw0 = e.widthAt(t0), hw1 = e.widthAt(t1);
      e.A.set([ax, ay, pts[i + 1][0] - ax, pts[i + 1][1] - ay], i * 4);
      e.B.set([hw0, hw1, Math.sin(t0 * Math.PI * e.turns + ph), Math.sin(t1 * Math.PI * e.turns + ph)], i * 4);
      reach = Math.max(reach, hw0, hw1);
    }
    e.n = n; e.reach = (reach * 3.2) * (reach * 3.2);
  }
  const nativeOf = (R, o, W, Hh, cssW) => o.native !== false && !o.image && NATIVE[o.fn] && R.scene && R.spread ? scene(o, W, Hh, cssW) : null;
  function natTextures(gl, n) { n.tex = [0, 1].map(() => texture(gl, n.SW, n.SH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR)); return n; }
  function freeNat(gl, n) { if (n && n.tex) n.tex.forEach(t => gl.deleteTexture(t)); }
  // the scene at the view's scene time, blurred as the still blurs it; returns the texture the print reads
  function drawScene(R, v) {
    const gl = R.gl, n = v.nat, o = v.o;
    const tau = v.still() ? 0 : v.st.clock * o.pace, sway = o.sway;
    if (n.tau === tau && n.sway === sway && n.out) return n.out;
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fb);
    gl.viewport(0, 0, n.SW, n.SH);
    let P = R.scene;
    gl.useProgram(P.p);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, n.tex[0], 0);
    gl.uniform1i(U(gl, P, 'uKind'), n.kind); gl.uniform1i(U(gl, P, 'uS'), n.S0); gl.uniform1i(U(gl, P, 'uNC'), n.nC);
    gl.uniform1f(U(gl, P, 'uM'), n.m); gl.uniform1f(U(gl, P, 'uTau'), tau); gl.uniform1f(U(gl, P, 'uSway'), sway);
    gl.uniform2f(U(gl, P, 'uWH'), n.w, n.h);
    gl.uniform4fv(U(gl, P, 'uP'), n.P); gl.uniform3fv(U(gl, P, 'uC'), n.C);
    if (n.kind === 10) {
      const e = n.extra; bandSegs(e, tau, sway);
      gl.uniform4fv(U(gl, P, 'uSA'), e.A); gl.uniform4fv(U(gl, P, 'uSB'), e.B);
      gl.uniform1i(U(gl, P, 'uNS'), e.n); gl.uniform1f(U(gl, P, 'uReach'), e.reach);
    } else if (n.kind === 20) { gl.uniform4fv(U(gl, P, 'uF'), n.extra.F); gl.uniform4fv(U(gl, P, 'uF2'), n.extra.F2); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    P = R.spread;
    gl.useProgram(P.p);
    gl.uniform1i(U(gl, P, 'uA'), 0); gl.uniform2f(U(gl, P, 'uSz'), n.SW, n.SH);
    gl.activeTexture(gl.TEXTURE0);
    let cur = 0;
    for (const sp of n.spreads) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, n.tex[1 - cur], 0);
      gl.bindTexture(gl.TEXTURE_2D, n.tex[cur]);
      gl.uniform3fv(U(gl, P, 'uO'), sp.a); gl.uniform1i(U(gl, P, 'uN'), sp.n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cur = 1 - cur;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    n.tau = tau; n.sway = sway; n.out = n.tex[cur];
    return n.out;
  }

  // ---------------------------------------------------------------- one frame on the GPU
  function draw(R, v) {
    const gl = R.gl, P = R.P, c = v.cap, st = v.st, o = v.o;
    if (R.lost || (!v.tex && !v.nat)) return false;
    const src = v.nat ? drawScene(R, v) : v.tex;
    if (R.canvas.width !== c.W || R.canvas.height !== c.H) { R.canvas.width = c.W; R.canvas.height = c.H; }
    gl.viewport(0, 0, c.W, c.H);
    gl.useProgram(P.p);
    const tt = tileTex(R, c.tileKey, c.tile);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tt.g);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tt.d);
    gl.uniform1i(U(gl, P, 'uSrc'), 0); gl.uniform1i(U(gl, P, 'uG'), 1); gl.uniform1i(U(gl, P, 'uD'), 2);
    gl.uniform2f(U(gl, P, 'uSize'), c.W, c.H);
    const n = v.nat;
    gl.uniform1i(U(gl, P, 'uNative'), n ? 1 : 0);
    if (n) { gl.uniform2f(U(gl, P, 'uStage'), n.SW, n.SH); gl.uniform4f(U(gl, P, 'uFrame'), n.m, n.m, n.w / c.W, n.h / c.H); }
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
      const gl = v.R.gl, nat = nativeOf(v.R, o, W, Hh, v.cssW);
      if (nat) {   // the scene is drawn on the GPU every frame
        freeNat(gl, v.nat); if (v.tex) gl.deleteTexture(v.tex);
        v.tex = null; v.nat = natTextures(gl, nat); v.cap = nat.cap;
      } else {     // the scene is captured once
        const c = capture(o, W, Hh, v.cssW);
        if (!c) return;
        freeNat(gl, v.nat); v.nat = null;
        if (v.tex) gl.deleteTexture(v.tex);
        v.cap = c;
        v.tex = texture(gl, null, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c.up, gl.LINEAR);
        c.up = null;
      }
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
          else { if (!(key in MOTION) || key === 'fn' || key === 'image' || key === 'look' || key === 'native') rebuild = true; o[key] = p[key]; }
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
        if (v.R) { v.R.views.delete(v); if (v.tex) v.R.gl.deleteTexture(v.tex); freeNat(v.R.gl, v.nat); if (!v.R.offscreen) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } }
        const i = registry.views.indexOf(api); if (i >= 0) registry.views.splice(i, 1);
        return api;
      },
      state() {
        return { mode: v.R ? 'gpu' : 'still', scene: v.nat ? 'gpu' : v.R ? 'captured' : 'cpu', path: v.R ? (v.R.offscreen ? 'shared' : 'own') : 'cpu', frames: v.frames, visible: v.visible,
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
    const v = { o, R, cssW: w, still: () => true }, gl = R.gl, nat = nativeOf(R, o, w, h, w);
    v.st = { clock: 0, focus: 0, reveal: null, ptr: { x: 0, y: 0, amt: 0 }, pulses: [] };
    if (nat) { v.nat = natTextures(gl, nat); v.cap = nat.cap; }
    else { v.cap = capture(o, w, h, w); v.tex = texture(gl, null, null, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, v.cap.up, gl.LINEAR); }
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
      mode: o.fn + (o.form ? ':' + o.form : o.palette ? ':' + o.palette : ''), scene: nat ? 'gpu' : 'captured', seed: o.seed, size: [w, h], cpuMs: Math.round(cpuMs),
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
    live.parity({ fn: 'field', form: 'sun', seed: 4 }),
    live.parity({ fn: 'field', form: 'flow', seed: 4 }),
    live.parity({ fn: 'field', form: 'blot', seed: 4 }),
    live.parity({ fn: 'ribbon', form: 'orb', seed: 4 }),
    live.parity({ fn: 'ribbon', form: 'swirl', seed: 4 }),
    live.parity({ fn: 'silk', palette: 'rouge', seed: 3 }),
    live.parity({ fn: 'silk', palette: 'bleu', seed: 4 }),
    live.parity({ fn: 'poppies', seed: 4 }),
  ].map(r => Object.assign(r, { pass: live.pass(r) })));
  H.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
