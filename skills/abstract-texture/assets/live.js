/* live.js — Surface.live(): a plate that moves under your hand.
 *
 * Two engines, one controller.
 *
 * NATIVE (reeded ember/cobalt, streak coral/signal): the plate is drawn in the shader, from the
 * same numbers as the still. surface.js keeps a soft colour FIELD apart from the glass it is seen
 * through, and live.js ports both line by line: the field (mesh, bands, strokes, smudge: the same
 * lattice noise, fbm, ramps and blobs) is drawn every frame into a small texture on the still's
 * own coarse grid, 8-bit and dithered as the still is; then the PANES run per pixel at full size:
 * the reeds (a cylinder lens per flute, fringe, light and shade), or the streak (each row a running
 * average, solved on the GPU in chunks of 32 with a carry pass), then the screen, the grain (the
 * same per-pixel hash) and the type. So the colour behind the glass moves (it wanders, boils and
 * slides) and the reeds and streaks refract the moving colour, every frame.
 *
 * CAPTURED (satin, aurora, bloom, coordinate, streak drip/shift, images, custom panes): the still
 * engine prints the plate once on the CPU through its `capture` hook (the bare field and the
 * finished still), and one shader moves it: contour echoes, a raking light, lifting grain.
 *
 * Every motion term is exactly zero at time 0, so frame 0 is the still; live.parity() measures it.
 * Live plates default to grain 0.7 of the still's (a lighter hand); pass `grain` to choose.
 *
 *   const ctl = Surface.live(canvas, { mode: 'reeded', palette: 'cobalt', seed: 3, text: false,   // still options
 *                                      drift: 1, rake: 0.35, clickPulse: true, develop: 'in' });   // motion options
 *   ctl.set({ lift: 1 }); ctl.pulse(x, y); ctl.point(x, y); ctl.pause(); ctl.resume(); ctl.destroy();
 *
 * The motion belongs to the medium:
 *   - DRIFT: native plates move their colour (blobs wander, the noise boils, bands and strokes
 *     slide, torn rows slip); captured plates ripple contour echoes out from their highlights;
 *   - a RAKING LIGHT follows the pointer low across the reeds (native: from the flute's own
 *     curve; captured: from the pane's relief); over a streak the pointer drags the rows harder;
 *   - GRAIN LIFTS and settles: fresh fine grain re-rolled 24 times a second, eased in by `lift`;
 *   - a click drops an ECHO RING through the colour behind the glass (`pulse`);
 *   - the surface DEVELOPS over the bare field: `develop` 0 shows the soft colour alone,
 *     1 the finished plate; 'in' develops once on entering the view, 'scroll' follows scroll;
 *   - `mask(ctx, w, h)` cuts the plate to a shape (the icon piece), `ring` to a focus band.
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
    reveal: null, under: 1, ground: '#0c0d0f', ring: null, mask: null, own: null, scale: 1, maxField: 1.6e6,
  };
  const LIVE_GRAIN = 0.7;   // live plates wear lighter grain than the print
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
uniform sampler2D uMask; uniform float uHasMask;
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
  if (uHasMask > 0.5) a *= texelFetch(uMask, ivec2(p), 0).a;
  outColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}`;

  // ---------------------------------------------------------------- GLSL: the native plates
  // surface.js, line by line: its lattice noise (the same permutation and unit vectors, uploaded),
  // fbm, ramps, blobs and marks; then its panes at full size, rounded to 8-bit after each as the still is.
  const LIB = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
const float TAU = 6.283185307179586;
const int C = 32;                  // streak chunk length
out vec4 outColor;
uint hashU(uint x, uint y, uint s) {
  uint h = ((x ^ 0x632be5abu) * 0x85ebca6bu) ^ (s * 0x27d4eb2fu);
  h = ((h ^ (h >> 13)) * 0xc2b2ae35u) + y * 0x165667b1u;
  h = (h ^ (h >> 16)) * 0x85ebca6bu;
  h = (h ^ (h >> 13)) * 0xc2b2ae35u;
  return h ^ (h >> 16);
}
float sm(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
vec3 q8(vec3 v) { return clamp(floor(v + 0.5), 0.0, 255.0); }
`;
  const FIELD_FS = LIB + `
uniform usampler2D uPerm;          // 512 x 1, the still's permutation
uniform sampler2D uGrad;           // 256 x 1, its unit vectors
uniform int uKind;                 // 0 mesh, 1 bands, 2 strokes, 3 smudge
uniform vec2 uFS, uOut;            // field grid, output px
uniform float uA, uFlow, uPhase;   // aspect; live: noise drift, phase
uniform float uRT[8]; uniform vec3 uRC[8]; uniform int uRN;
uniform vec4 uB[32], uBC[32]; uniform int uBN;
uniform vec4 uP0; uniform vec3 uSky; uniform uint uSeed;
uniform vec4 uPulse[4]; uniform float uPulseW;
int PM(int i) { return int(texelFetch(uPerm, ivec2(i, 0), 0).r); }
float gd(int i, float u, float v) { vec2 g = texelFetch(uGrad, ivec2(i, 0), 0).rg; return g.x * u + g.y * v; }
float noise(float x, float y) {
  float fx = floor(x), fy = floor(y), u = x - fx, v = y - fy;
  int X = int(fx) & 255, Y = int(fy) & 255, a0 = PM(X), a1 = PM(X + 1);
  float a = gd(PM(a0 + Y), u, v), b = gd(PM(a1 + Y), u - 1.0, v), c = gd(PM(a0 + Y + 1), u, v - 1.0), d = gd(PM(a1 + Y + 1), u - 1.0, v - 1.0);
  float su = u * u * u * (u * (u * 6.0 - 15.0) + 10.0), sv = v * v * v * (v * (v * 6.0 - 15.0) + 10.0);
  float ab = a + (b - a) * su, cd = c + (d - c) * su;
  return (ab + (cd - ab) * sv) * 1.41;
}
float fbm(float x, float y, int oct) {
  float s = 0.0, a = 0.5, t;
  for (int i = 0; i < 4; i++) {
    if (i >= oct) break;
    s += a * noise(x, y);
    t = x; x = (0.8 * t - 0.6 * y) * 2.03 + 17.1; y = (0.6 * t + 0.8 * y) * 2.03 + 3.7;
    a *= 0.5;
  }
  return s;
}
vec3 rampAt(float t) {
  if (t <= uRT[0]) return uRC[0];
  if (t >= uRT[uRN - 1]) return uRC[uRN - 1];
  int k = 1;
  for (int i = 1; i < 8; i++) { k = i; if (uRT[i] >= t) break; }
  float u = (t - uRT[k - 1]) / (uRT[k] - uRT[k - 1]); u = u * u * (3.0 - 2.0 * u);
  vec3 a = uRC[k - 1], b = uRC[k];
  return a + (b - a) * u;
}
vec3 over(vec3 d, vec3 c, float a) { return d + (c - d) * a; }
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);                  // texel row j is image row j (top-down)
  float x = (float(ij.x) + 0.5) / uFS.x, y = (float(ij.y) + 0.5) / uFS.y;
  // echo rings from clicks bend the colour behind the glass
  vec2 p = vec2(x, y) * uOut, dd = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 q = uPulse[i];
    if (q.w <= 0.0) continue;
    vec2 d = p - q.xy; float r = length(d), t = (r - q.z) / uPulseW;
    if (r > 0.5) dd += d / r * exp(-t * t) * q.w;
  }
  x -= dd.x * uPulseW * 0.5 / uOut.x; y -= dd.y * uPulseW * 0.5 / uOut.y;
  vec3 d;
  if (uKind == 0) {                  // mesh: a warped ramp and soft blobs
    float wx = x + 0.07 * fbm(x * 2.2 + uFlow, y * 2.2 + uFlow * 0.6, 3), wy = y + 0.04 * fbm(x * 2.2 + 9.0 - uFlow * 0.5, y * 2.2 + 4.0 + uFlow * 0.7, 3);
    d = rampAt(wy);
    for (int i = 0; i < 32; i++) { if (i >= uBN) break; vec4 b = uB[i]; float bx = (wx - b.x) / b.z, by = (wy - b.y) / b.w; d = over(d, uBC[i].rgb, exp(-(bx * bx + by * by)) * uBC[i].a); }
  } else if (uKind == 1) {           // bands: swells through a ramp, blobs over them
    float yy = y * uA, t = sin(TAU * (yy * uP0.x + uP0.y * sin(TAU * x * 0.55 + uP0.w) + uP0.z * x) - uPhase + 0.9 * fbm(x * 1.4 + uFlow, yy * 1.4 - uFlow * 0.4, 3));
    d = rampAt(0.5 + 0.5 * t);
    for (int i = 0; i < 32; i++) { if (i >= uBN) break; vec4 b = uB[i]; float bx = (x - b.x) / b.z, by = (y - b.y) / b.w; d = over(d, uBC[i].rgb, exp(-(bx * bx + by * by)) * uBC[i].a); }
  } else if (uKind == 2) {           // strokes: turned stripes, sky breaking through
    float Y = y * uA, u = x * uP0.x - Y * uP0.y, v = fbm(x * 1.5 + uFlow, Y * 1.5, 3);
    float s = sin(TAU * (u * uP0.z + 0.6 * v) - uPhase) * 0.5 + 0.5 + 0.35 * fbm(u * 3.0 - uFlow * 0.5, x * uP0.y + Y * uP0.x, 3);
    d = rampAt(s);
    float b = fbm(x * 2.4 + 3.0 + uFlow * 0.6, Y * 1.1, 3) + (y < 0.1 ? 0.4 : 0.0) + (y > 0.9 ? 0.35 : 0.0) - (x > 0.5 ? 0.25 : 0.0);
    d = over(d, uSky, sm(0.28, 0.4, b));
  } else {                           // smudge: a ground ramp and torn marks (the tearing noise is the same for every mark)
    d = rampAt(x + 0.12 * fbm(x * 2.0 + uFlow, y * 3.0, 3));
    float tx = 0.5 * fbm(x * 5.0 + uFlow, y * 30.0, 2), ty = 0.5 * fbm(x * 9.0 - uFlow * 0.7, y * 9.0, 2);
    for (int i = 0; i < 32; i++) {
      if (i >= uBN) break;
      vec4 m = uB[i]; float mx = (x - m.x) / m.z + tx, my = (y - m.y) * uA / m.w + ty, e = mx * mx + my * my;
      if (e < 4.0) d = over(d, uBC[i].rgb, sm(1.1, 0.5, e));
    }
  }
  // 8-bit with the still's dither
  float e = float(hashU(uint(ij.y) * uint(uFS.x) + uint(ij.x), 7u, uSeed) >> 8) / 16777216.0 - 0.5;
  outColor = vec4(q8(d * 255.0 + e) / 255.0, 1.0);
}`;
  // the streak rows: the field at 8 bits, shifted by the row's tear; shared by the three streak passes
  const ROWS = `
uniform sampler2D uF;              // the field, sampled at output px
uniform sampler2D uLn;             // per row: s, tear shift, slip amplitude, slip phase
uniform vec2 uSize;
uniform vec4 uStreak;              // drag px, slip on, motion clock, -
uniform vec3 uBoost;               // pointer row (px), strength, radius (px)
vec3 fieldPx(float x, float y) { return q8(texture(uF, vec2(x + 0.5, y + 0.5) / uSize).rgb * 255.0); }
struct Row { float s, sh, a, keep; };
Row row(int li) {
  vec4 L = texelFetch(uLn, ivec2(li, 0), 0);
  float t = (float(li) + 0.5 - uBoost.x) / uBoost.z;
  Row r; r.s = L.x + uBoost.y * exp(-t * t);
  r.sh = L.y + uStreak.y * L.z * (sin(uStreak.z * 0.9 + L.w) - sin(L.w));
  r.a = 1.0 / (1.0 + r.s * uStreak.x); r.keep = sqrt(max(r.s, 0.0));
  return r;
}
vec3 xin(Row r, int li, int q) { return fieldPx(clamp(float(q) - r.sh, 0.0, uSize.x - 1.0), float(li)); }
`;
  // pass 1: each chunk's running average from zero; pass 2: the carry into each chunk
  const S1_FS = LIB + ROWS + `
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy); int li = ij.y;
  Row r = row(li);
  if (r.s < 0.01) { outColor = vec4(0.0); return; }
  int q0 = ij.x * C, q1 = min(int(uSize.x), q0 + C);
  vec3 y = vec3(0.0);
  for (int q = q0; q < q1; q++) { vec3 x = xin(r, li, q); y = q == 0 ? x : y + (x - y) * r.a; }
  outColor = vec4(y, 1.0);
}`;
  const S2_FS = LIB + ROWS + `
uniform highp sampler2D uEnd;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy); int li = ij.y;
  Row r = row(li);
  if (r.s < 0.01) { outColor = vec4(0.0); return; }
  float b = pow(1.0 - r.a, float(C));
  vec3 carry = vec3(0.0);
  for (int k = 0; k < ij.x; k++) carry = carry * b + texelFetch(uEnd, ivec2(k, li), 0).rgb;
  outColor = vec4(carry, 1.0);
}`;
  const NATIVE_FS = LIB + ROWS + `
uniform highp sampler2D uCarry;
uniform sampler2D uType, uMask;
uniform int uKind;                 // 0 reeds, 1 streak
uniform float uHasType, uHasMask;
uniform vec4 uReed0, uReed1;       // flute px, power, shear px, bow px | fringe, light, shadow, phase px
uniform vec4 uScreen;              // on, ca, sa, amount
uniform vec3 uGrain;               // amount (levels), chroma, clump px
uniform uvec3 uGSeed;              // the grain's three hash seeds
uniform uint uGk, uSeed;
uniform float uExpose, uLift, uUnder;
uniform vec3 uReveal, uGround;
uniform vec4 uPt, uRing;
float h01(uvec3 v) { return float(hashU(v.x, v.y, v.z) >> 8) / 16777216.0; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 reedAt(float x, float y) {
  float fw = uReed0.x, q = (x + uReed1.w) / fw, i = floor(q), u = q - i, e = u - 0.5, cx = (i + 0.5) * fw - uReed1.w, bend = e * fw * uReed0.y, W1 = uSize.x - 1.0;
  float xr = clamp(floor(cx + bend * (1.0 + uReed1.x) + 0.5), 0.0, W1), xg = clamp(floor(cx + bend + 0.5), 0.0, W1), xb = clamp(floor(cx + bend * (1.0 - uReed1.x) + 0.5), 0.0, W1);
  float ry = clamp(floor(y + uReed0.z * e + uReed0.w * (e * e - 1.0 / 12.0) + 0.5), 0.0, uSize.y - 1.0);
  float lt = (u - 0.06) / 0.045, sd = max(0.0, (u - 0.4) / 0.6);
  float L = uReed1.y * exp(-lt * lt), S = 1.0 - uReed1.z * sd * sd;
  vec3 s = vec3(fieldPx(xr, ry).r, fieldPx(xg, ry).g, fieldPx(xb, ry).b) * S;
  return q8(s + (255.0 - s) * L);
}
vec3 streakAt(int ix, int iy) {
  Row r = row(iy);
  if (r.s < 0.01) return fieldPx(float(ix), float(iy));
  int c = ix / C;
  vec3 y = texelFetch(uCarry, ivec2(c, iy), 0).rgb, x = vec3(0.0);
  for (int q = c * C; q <= ix; q++) { x = xin(r, iy, q); y = q == 0 ? x : y + (x - y) * r.a; }
  return q8(x + (y - x) * r.keep);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  ivec2 ip = ivec2(p); float x = float(ip.x), y = float(ip.y);
  vec3 d = uKind == 0 ? reedAt(x, y) : streakAt(ip.x, ip.y);
  if (uScreen.x > 0.5) {
    float l = (d.r + d.g + d.b) / 765.0, s = (cos(x * uScreen.y + y * uScreen.z) * cos(y * uScreen.y - x * uScreen.z) + 1.0) * 0.5;
    d = q8(d * (1.0 - uScreen.w * s * (0.35 + 0.65 * (1.0 - l))));
  }
  {                                  // grain: the still's hash, pixel for pixel
    uint u = hashU(uint(ip.x), uint(ip.y), uGSeed.x), v = hashU(uint(ip.x), uint(ip.y), uGSeed.y);
    uint c = hashU(uint(ip.x) / uint(uGrain.z), uint(ip.y) / uint(uGrain.z), uGSeed.z);
    float l = (d.r + d.g + d.b) / 765.0;
    float m = (float(u >> 24) + float(v >> 24) - 255.0) / 255.0 * 0.9 + (float(c >> 24) / 255.0 - 0.5) * 0.9, w = uGrain.x * (0.3 + 2.8 * l * (1.0 - l));
    d = q8(d + (m + uGrain.y * (vec3(float(u & 255u), float((u >> 8) & 255u), float(v & 255u)) / 255.0 - 0.5)) * w);
  }
  if (uHasType > 0.5) { vec4 t = texelFetch(uType, ip, 0); d = q8(t.rgb * 255.0 + d * (1.0 - t.a)); }
  vec3 col = d / 255.0;
  // the surface develops over the bare field
  float m = 1.0;
  if (uExpose < 1.0 || uReveal.x > -0.5 || uReveal.y < 1.5) {
    uvec2 iq = uvec2(ip);
    float n = 0.6 * h01(uvec3(iq / 3u, uSeed + 11u)) + 0.4 * h01(uvec3(iq, uSeed + 12u));
    m = clamp((uExpose - 0.85 * n) / 0.15, 0.0, 1.0);
    float ux = p.x / uSize.x;
    m *= smoothstep(uReveal.x - uReveal.z, uReveal.x + uReveal.z, ux) * (1.0 - smoothstep(uReveal.y - uReveal.z, uReveal.y + uReveal.z, ux));
    col = mix(mix(uGround, fieldPx(x, y) / 255.0, uUnder), col, m);
  }
  // raking light on the reeds: a low lamp at the pointer, caught by each flute's curve
  if (uPt.z > 0.0 && uKind == 0) {
    float e = fract((x + uReed1.w) / uReed0.x) - 0.5;
    vec3 nrm = normalize(vec3(e * 1.8, 0.0, 1.0));
    vec2 to = uPt.xy - p; float dl = length(to);
    vec3 L = normalize(vec3(to, uPt.w * 0.35));
    float fall = exp(-(dl * dl) / (uPt.w * uPt.w));
    col += ((dot(nrm, L) - L.z) * 2.2 + 0.12) * fall * uPt.z * m * (1.0 - 0.5 * col);
  }
  // grain lifts: fine grain re-rolled per tick, clumps fixed, heaviest in the midtones
  if (uLift > 0.0) {
    uvec2 iq = uvec2(ip);
    float l = lum(col);
    float t = h01(uvec3(iq, uSeed + uGk * 2u)) + h01(uvec3(iq, uSeed + uGk * 2u + 1u)) - 1.0;
    float c = h01(uvec3(iq / 2u, uSeed + 5u)) - 0.5;
    col += (t * 0.8 + c * 0.5) * uLift * (0.3 + 2.8 * l * (1.0 - l));
  }
  float a = 1.0;
  if (uRing.x > 0.5) {
    vec2 hw = uSize * 0.5 - vec2(uRing.y + uRing.z * 1.5);
    float r = min(uRing.w, min(hw.x, hw.y));
    vec2 q = abs(p - uSize * 0.5) - (hw - r);
    float sd = (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r) / uRing.z;
    a = exp(-sd * sd);
  }
  if (uHasMask > 0.5) a *= texelFetch(uMask, ip, 0).a;
  outColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}`;

  // ---------------------------------------------------------------- renderers
  function compile(gl, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs || FS]]) {
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
    const setup = () => {
      R.prog = compile(gl); R.nat = undefined;
      R.cbf = !!gl.getExtension('EXT_color_buffer_float');
      R.dummy = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, R.dummy);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      return R.prog;
    };
    if (!setup()) return null;
    const lost = e => { e.preventDefault(); R.lost = true; };
    const back = () => { R.lost = false; setup(); for (const v of views) if (v.R === R) { v.g = null; v.mk = null; v.dirty = true; } wake(); };
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

  // ---------------------------------------------------------------- native plates
  const E = S._engine;
  const TAU = Math.PI * 2, CH = 32;
  function natProgs(R) {
    if (R.nat !== undefined) return R.nat;
    const gl = R.gl, f = compile(gl, FIELD_FS), s1 = compile(gl, S1_FS), s2 = compile(gl, S2_FS), fin = compile(gl, NATIVE_FS);
    R.nat = f && s1 && s2 && fin ? { f, s1, s2, fin } : null;
    return R.nat;
  }
  // glassOver calls every pane as (img, o, k, rng(s), s) and grain takes its seed fourth, so the
  // still's grain hashes with the generator itself as the seed: `seed | 0`, `seed + 1 | 0` and
  // `seed + 2 | 0` all come to 0. Mirror what the still does (ask it, so a fix there carries over).
  function grainSeeds(s) { const f = E.rng(s); return new Uint32Array([f | 0, (f + 1) | 0, (f + 2) | 0].map(x => x >>> 0)); }
  const rampOf = stops => ({ t: stops.map(x => x[0]), c: stops.map(x => E.rgb(x[1])) });
  /**
   * What the still would do for these options, as numbers a shader can take: the field's kind,
   * ramp, blobs and noise lattice (replaying the still's random draws in its order), then its
   * panes. Null when the plate is not one the shader draws (it is captured instead).
   */
  function nativePlan(o, W, H, R) {
    if (!E || !R || o.native === false || o.image || o.panes || o.resolution) return null;
    const table = E.tables[o.mode];
    if (!table) return null;
    const p = table[o.palette] || table[Object.keys(table)[0]];
    let kind;
    if (o.mode === 'reeded') kind = p.field === 'bands' ? 1 : 0;
    else if (o.mode === 'streak' && (p.make === 'strokes' || p.make === 'smudge') && p.panes.length === 2 && p.panes[0].pane === 'streak' && (p.panes[0].dir || 'right') === 'right' && p.panes[1].pane === 'grain' && R.cbf) kind = p.make === 'strokes' ? 2 : 3;
    else return null;
    if (!natProgs(R)) return null;
    const seed = o.seed == null ? 1 : o.seed, rand = E.rng(seed * 7 + 1), noise = E.makeNoise(rand), k = W / E.SW;
    const pl = { kind, W, H, fw: Math.max(24, Math.round(W * 0.3)), fh: Math.max(24, Math.round(H * 0.3)), A: H / W, seed, noise, blobs: [], p0: [0, 0, 0, 0], sky: [0, 0, 0] };
    const blob = (x, y, rx, ry, c, a) => pl.blobs.push({ x, y, rx, ry, c: E.rgb(c), a });
    if (kind === 0) { pl.ramp = rampOf(p.base); p.blobs.forEach(b => blob(b[0] + (rand() - 0.5) * 0.14, b[1] + (rand() - 0.5) * 0.06, b[2], b[3], b[4], b[5])); }
    else if (kind === 1) { pl.ramp = rampOf(p.ramp); pl.p0 = [p.freq, p.amp, p.turn, rand() * TAU]; (p.blobs || []).forEach(b => blob(b[0], b[1], b[2], b[3], b[4], b[5])); }
    else if (kind === 2) { pl.ramp = rampOf(p.ramp); pl.sky = E.rgb(p.sky); pl.p0 = [Math.cos(p.angle), Math.sin(p.angle), p.freq, 0]; }
    else {
      pl.ramp = rampOf(p.ground);
      p.marks.forEach(([col, count, xs, rx, ry]) => {
        for (let m = 0; m < count; m++) blob(xs[0] + rand() * (xs[1] - xs[0]), 0.05 + rand() * 0.9, rx[0] + rand() * (rx[1] - rx[0]), ry[0] + rand() * (ry[1] - ry[0]), col, 1);
      });
    }
    // panes, with the seeds glassOver gives them
    const panes = kind < 2 ? [Object.assign({ pane: 'reed' }, p.reed)].concat(p.screen ? [Object.assign({ pane: 'screen' }, p.screen)] : [], [Object.assign({ pane: 'grain' }, p.grain)]) : p.panes;
    const ps = i => (seed | 0) * 131 + i * 977 + panes[i].pane.length;
    const g = panes[panes.length - 1], gi = panes.length - 1;
    pl.grain = { amt: (g.amount == null ? 0.1 : g.amount) * (o.grain == null ? 1 : o.grain) * 255, chroma: g.chroma == null ? 0.3 : g.chroma, cs: Math.max(1, Math.round(W / 480)), seed: grainSeeds(ps(gi)) };
    if (kind < 2) {
      const r = panes[0], fw = Math.max(3, (r.width || 26) * k);
      pl.reed = [fw, r.power == null ? -2.4 : r.power, (r.shear || 0) * fw, (r.bow || 0) * fw, r.fringe == null ? 0.1 : r.fringe, r.light == null ? 0.3 : r.light, r.shadow == null ? 0.2 : r.shadow, (r.phase || 0.37) * fw];
      const sc = panes.find(q => q.pane === 'screen');
      if (sc) { const cell = (sc.cell || 8) * k, a = (sc.angle == null ? 45 : sc.angle) * Math.PI / 180, f = TAU / cell; pl.screen = [1, Math.cos(a) * f, Math.sin(a) * f, sc.amount == null ? 0.1 : sc.amount]; }
    } else {
      // the streak's rows, as the still computes them: drag from a slow band noise times a jitter, the tear per band
      const st = panes[0], s0 = ps(0), n = E.makeNoise(E.rng(s0));
      const band = (st.band || 40) * k, tear = (st.tear || 0) * k, amount = st.amount == null ? 0.5 : st.amount, jag = st.jag == null ? 0.5 : st.jag;
      const L = new Float32Array(H * 4);
      for (let li = 0; li < H; li++) {
        const slow = 0.5 + 0.8 * E.fbm(n, li / band, 0.37, 3);
        const s = E.smooth(1 - amount, 1.3 - amount, slow) * (1 - jag + jag * E.hash(li, 1, s0)), bi = Math.floor(li / Math.max(1, band * 0.3));
        L[li * 4] = s;
        L[li * 4 + 1] = tear ? Math.round((E.hash(bi, 2, s0) - 0.5) * 2 * tear * s) : 0;
        L[li * 4 + 2] = tear * s;
        L[li * 4 + 3] = E.hash(bi, 3, s0) * TAU;
      }
      pl.rows = L; pl.drag = (st.drag || 160) * k; pl.mc = Math.ceil(W / CH);
    }
    // type, set on its own layer at full size
    if (o.text !== false && (p.type || o.text)) {
      const t = document.createElement('canvas'); t.width = W; t.height = H;
      E.typeset(t, o, p.type, E.SW * H / W);
      pl.type = t;
    }
    // each blob and mark wanders on its own slow orbit (zero at time 0)
    pl.orbit = pl.blobs.map((b, i) => [0.23 * (1 + (i % 5) * 0.17), 0.19 * (1 + (i % 7) * 0.11), i * 2.4, i * 1.3 + 0.7]);
    return pl;
  }
  function tex(gl, fmt, w, h, data, filter) {
    const t = gl.createTexture(), f = filter || gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const [ifmt, form, type] = fmt;
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, form, type, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function target(gl, fmt, w, h, filter) {
    const t = tex(gl, fmt, w, h, null, filter), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, fb, w, h };
  }
  function uploadNative(v) {
    const gl = v.R.gl, pl = v.src.native, g = { src: v.src, texs: [], fbs: [] };
    const keep = x => { g.texs.push(x.t || x); if (x.fb) g.fbs.push(x.fb); return x; };
    const P = new Uint8Array(512); for (let i = 0; i < 512; i++) P[i] = pl.noise.P[i];
    const G = new Float32Array(512); for (let i = 0; i < 256; i++) { G[i * 2] = pl.noise.GX[i]; G[i * 2 + 1] = pl.noise.GY[i]; }
    g.perm = keep(tex(gl, [gl.R8UI, gl.RED_INTEGER, gl.UNSIGNED_BYTE], 512, 1, P));
    g.grad = keep(tex(gl, [gl.RG32F, gl.RG, gl.FLOAT], 256, 1, G));
    g.field = keep(target(gl, [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], pl.fw, pl.fh, gl.LINEAR));   // 8-bit levels, as the still's field
    if (pl.rows) {
      g.rows = keep(tex(gl, [gl.RGBA32F, gl.RGBA, gl.FLOAT], pl.H, 1, pl.rows));
      g.end = keep(target(gl, [gl.RGBA32F, gl.RGBA, gl.FLOAT], pl.mc, pl.H));
      g.carry = keep(target(gl, [gl.RGBA32F, gl.RGBA, gl.FLOAT], pl.mc, pl.H));
    }
    if (pl.type) {
      g.type = keep(tex(gl, [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], 1, 1));
      gl.bindTexture(gl.TEXTURE_2D, g.type);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, pl.type);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    v.g = g;
  }
  function bind(gl, P, name, unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(gl, P, name), unit); }
  function rowsUniforms(gl, P, v, g, pl) {
    const st = v.st, o = v.o;
    bind(gl, P, 'uF', 0, g.field.t); bind(gl, P, 'uLn', 1, g.rows ? g.rows : v.R.dummy);
    gl.uniform2f(U(gl, P, 'uSize'), pl.W, pl.H);
    gl.uniform4f(U(gl, P, 'uStreak'), pl.drag || 1, 0.4, st.m, 0);
    const p = st.pt, rad = o.radius * Math.min(pl.W, pl.H);
    gl.uniform3f(U(gl, P, 'uBoost'), p.y, p.amp * o.rake * 1.2, Math.max(1, rad * 0.4));
  }
  function drawNative(v) {
    const R = v.R, gl = R.gl, pl = v.src.native, st = v.st, o = v.o, N = R.nat;
    if (!v.g || v.g.src !== v.src) { freeG(v); uploadNative(v); }
    const g = v.g;
    gl.disable(gl.BLEND);
    // 1. the colour field, on the still's grid
    let P = N.f;
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.field.fb); gl.viewport(0, 0, pl.fw, pl.fh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.perm); gl.uniform1i(U(gl, P, 'uPerm'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, g.grad); gl.uniform1i(U(gl, P, 'uGrad'), 1);
    gl.uniform1i(U(gl, P, 'uKind'), pl.kind);
    gl.uniform2f(U(gl, P, 'uFS'), pl.fw, pl.fh); gl.uniform2f(U(gl, P, 'uOut'), pl.W, pl.H);
    gl.uniform1f(U(gl, P, 'uA'), pl.A);
    gl.uniform1f(U(gl, P, 'uFlow'), st.m * 0.05); gl.uniform1f(U(gl, P, 'uPhase'), st.m * 0.25);
    const rt = new Float32Array(8), rc = new Float32Array(24);
    pl.ramp.t.forEach((t, i) => { rt[i] = t; rc.set(pl.ramp.c[i], i * 3); });
    gl.uniform1fv(U(gl, P, 'uRT[0]'), rt); gl.uniform3fv(U(gl, P, 'uRC[0]'), rc); gl.uniform1i(U(gl, P, 'uRN'), pl.ramp.t.length);
    const B = new Float32Array(128), BC = new Float32Array(128), m = st.m, mv = pl.kind === 3 ? 0.5 : 1;
    pl.blobs.forEach((b, i) => {
      const [wx, wy, px, py] = pl.orbit[i];
      B.set([b.x + 0.035 * mv * (Math.sin(m * wx + px) - Math.sin(px)), b.y + 0.02 * mv * (Math.sin(m * wy + py) - Math.sin(py)), b.rx, b.ry], i * 4);
      BC.set([b.c[0], b.c[1], b.c[2], b.a], i * 4);
    });
    gl.uniform4fv(U(gl, P, 'uB[0]'), B); gl.uniform4fv(U(gl, P, 'uBC[0]'), BC); gl.uniform1i(U(gl, P, 'uBN'), pl.blobs.length);
    gl.uniform4fv(U(gl, P, 'uP0'), pl.p0); gl.uniform3fv(U(gl, P, 'uSky'), pl.sky);
    gl.uniform1ui(U(gl, P, 'uSeed'), pl.seed >>> 0);
    const pu = new Float32Array(16);
    st.pulses.slice(0, 4).forEach((q, i) => pu.set([q.x, q.y, q.r, q.amp], i * 4));
    gl.uniform4fv(U(gl, P, 'uPulse[0]'), pu);
    gl.uniform1f(U(gl, P, 'uPulseW'), Math.max(2, Math.min(pl.W, pl.H) * 0.035));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. the streak's running averages: chunk ends, then the carry into each chunk
    if (pl.rows) {
      P = N.s1; gl.useProgram(P.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.end.fb); gl.viewport(0, 0, pl.mc, pl.H);
      rowsUniforms(gl, P, v, g, pl);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      P = N.s2; gl.useProgram(P.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.carry.fb);
      rowsUniforms(gl, P, v, g, pl);
      bind(gl, P, 'uEnd', 2, g.end.t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // 3. the panes, the type and the live terms, at full size
    P = N.fin; gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (R.canvas.width !== v.w || R.canvas.height !== v.h) { R.canvas.width = v.w; R.canvas.height = v.h; }
    gl.viewport(0, 0, v.w, v.h);
    rowsUniforms(gl, P, v, g, pl);
    bind(gl, P, 'uCarry', 2, g.carry ? g.carry.t : R.dummy);
    bind(gl, P, 'uType', 3, g.type || R.dummy); gl.uniform1f(U(gl, P, 'uHasType'), g.type ? 1 : 0);
    bindMask(gl, P, v, 4);
    gl.uniform1i(U(gl, P, 'uKind'), pl.reed ? 0 : 1);
    gl.uniform4fv(U(gl, P, 'uReed0'), (pl.reed || [1, 0, 0, 0]).slice(0, 4)); gl.uniform4fv(U(gl, P, 'uReed1'), (pl.reed || [0, 0, 0, 0, 0, 0, 0, 0]).slice(4, 8));
    gl.uniform4fv(U(gl, P, 'uScreen'), pl.screen || [0, 0, 0, 0]);
    gl.uniform3f(U(gl, P, 'uGrain'), pl.grain.amt, pl.grain.chroma, pl.grain.cs);
    gl.uniform3uiv(U(gl, P, 'uGSeed'), pl.grain.seed);
    liveUniforms(gl, P, v);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
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
    const pl = nativePlan(v.o, v.w, v.h, v.R);
    if (pl) v.src = { native: pl, w: v.w, h: v.h };
    else {
      const k = v.R ? Math.min(1, Math.sqrt(v.o.maxField / (v.w * v.h))) : 1;
      v.src = printPlate(v.o, Math.max(24, Math.round(v.w * k)), Math.max(24, Math.round(v.h * k)));
    }
    v.dirty = true;
  }

  // ---------------------------------------------------------------- GPU frame
  function freeG(v) {
    const g = v.g, gl = v.R && v.R.gl;
    v.g = null;
    if (!g || !gl) return;
    if (g.texs) { g.texs.forEach(t => gl.deleteTexture(t)); g.fbs.forEach(f => gl.deleteFramebuffer(f)); }
    else { gl.deleteTexture(g.still); gl.deleteTexture(g.field); }
  }
  function upload(v) {
    const gl = v.R.gl, s = v.src, lin = s.w !== v.w || s.h !== v.h;
    freeG(v);
    v.g = { still: texFrom(gl, s.still, lin), field: texFrom(gl, s.field, true), src: s };
  }
  // a mask cuts the plate to a shape: a function (ctx, w, h) that fills it, or a canvas
  function maskCanvas(v) {
    const f = v.o.mask;
    if (!v.mk || v.mk.f !== f || v.mk.w !== v.w || v.mk.h !== v.h) {
      if (v.mk && v.mk.t && v.mk.R && !v.mk.R.lost) v.mk.R.gl.deleteTexture(v.mk.t);
      const c = document.createElement('canvas'); c.width = v.w; c.height = v.h;
      const x = c.getContext('2d');
      if (typeof f === 'function') f(x, v.w, v.h); else x.drawImage(f, 0, 0, v.w, v.h);
      v.mk = { f, w: v.w, h: v.h, c, t: null, R: null };
    }
    return v.mk;
  }
  function bindMask(gl, P, v, unit) {
    let t = v.R.dummy;
    if (v.o.mask) {
      const mk = maskCanvas(v);
      if (!mk.t || mk.R !== v.R) { mk.t = texFrom(gl, mk.c, false); mk.R = v.R; }
      t = mk.t;
    }
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(gl, P, 'uMask'), unit);
    gl.uniform1f(U(gl, P, 'uHasMask'), v.o.mask ? 1 : 0);
  }
  // the live terms both engines share: develop, reveal, the lamp, lifting grain, the focus ring
  function liveUniforms(gl, P, v) {
    const st = v.st, o = v.o;
    gl.uniform1f(U(gl, P, 'uExpose'), st.expose);
    gl.uniform1f(U(gl, P, 'uLift'), st.lift * o.liftGrain * 0.07 * (o.grain == null ? 1 : o.grain));
    gl.uniform1f(U(gl, P, 'uUnder'), o.under);
    gl.uniform3fv(U(gl, P, 'uGround'), hex(o.ground));
    gl.uniform1ui(U(gl, P, 'uGk'), st.gk >>> 0);
    gl.uniform1ui(U(gl, P, 'uSeed'), ((o.seed || 1) * 7919) >>> 0);
    const p = st.pt, rad = o.radius * Math.min(v.w, v.h);
    gl.uniform4f(U(gl, P, 'uPt'), p.x, p.y, p.amp * o.rake, rad);
    const rv = st.reveal || [-1, 2, 0.001];
    gl.uniform3f(U(gl, P, 'uReveal'), rv[0], rv[1], Math.max(0.001, rv[2] == null ? 0.02 : rv[2]));
    const rg = o.ring;
    gl.uniform4f(U(gl, P, 'uRing'), rg ? 1 : 0, rg ? rg.pad * v.dpr : 0, rg ? rg.band * v.dpr : 1, rg ? rg.radius * v.dpr : 0);
  }
  function drawGPU(v) {
    const R = v.R;
    if (!R || R.lost || !v.src || !R.prog) return false;
    if (v.src.native) return drawNative(v);
    const gl = R.gl, P = R.prog, st = v.st, o = v.o;
    if (!v.g || v.g.src !== v.src) upload(v);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (R.canvas.width !== v.w || R.canvas.height !== v.h) { R.canvas.width = v.w; R.canvas.height = v.h; }
    gl.viewport(0, 0, v.w, v.h);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.g.still); gl.uniform1i(U(gl, P, 'uStill'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, v.g.field); gl.uniform1i(U(gl, P, 'uField'), 1);
    bindMask(gl, P, v, 2);
    gl.uniform2f(U(gl, P, 'uSize'), v.w, v.h);
    gl.uniform2f(U(gl, P, 'uTex'), v.src.w, v.src.h);
    gl.uniform1f(U(gl, P, 'uClock'), st.clock);
    gl.uniform1f(U(gl, P, 'uEnv'), st.env);
    gl.uniform1f(U(gl, P, 'uEcho'), o.drift * st.env);
    gl.uniform1f(U(gl, P, 'uEchoN'), o.echoes);
    liveUniforms(gl, P, v);
    const pu = new Float32Array(16);
    st.pulses.slice(0, 4).forEach((q, i) => pu.set([q.x, q.y, q.r, q.amp], i * 4));
    gl.uniform4fv(U(gl, P, 'uPulse[0]'), pu);
    gl.uniform1f(U(gl, P, 'uPulseW'), Math.max(2, Math.min(v.w, v.h) * 0.035));
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
    if (v.o.mask) { x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(maskCanvas(v).c, 0, 0); }
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
    if (o.grain == null) o.grain = LIVE_GRAIN;
    const v = { canvas, o, R: null, ctx: null, src: null, g: null, dirty: true, paused: false, visible: false, ratio: 0, frames: 0, dpr: 1, w: 0, h: 0, cssW: 1, cssH: 1 };
    v.st = { clock: 0, env: 0, m: 0, expose: 1, lift: 0, gk: 0, lastGk: -1, pt: { x: 0, y: 0, tx: 0, ty: 0, amp: 0, on: false, seen: false }, pulses: [], reveal: o.reveal, inStart: 0 };
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
      if (!rm && o.drift > 0) { st.clock += dt * o.speed; st.env = Math.min(1, st.env + dt / 4); st.m += dt * o.speed * o.drift * st.env; moving = true; }
      else if (rm) { st.clock = 0; st.env = 0; st.m = 0; }
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
        if (o.grain == null) o.grain = LIVE_GRAIN;
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
        if (v.R && !v.R.lost) { freeG(v); if (v.mk && v.mk.t) v.R.gl.deleteTexture(v.mk.t); }
        if (v.R && v.R.canvas === canvas) { const x = v.R.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        const i = registry.views.indexOf(api); if (i >= 0) registry.views.splice(i, 1);
      },
      state() { return { mode: v.R ? 'gpu' : 'still', engine: v.src ? (v.src.native ? 'native' : 'captured') : null, path: v.R ? (v.R.canvas === canvas ? 'own' : v.R.offscreen ? 'bitmap' : 'copy') : 'cpu', frames: v.frames, visible: v.visible, expose: +v.st.expose.toFixed(3), clock: +v.st.clock.toFixed(2), size: [v.w, v.h], ready: !!v.src, reduced: still() }; },
      /** time n frames with every live term on: `sync` = median with a 1-px readback per frame, `pipelined` = n frames, one readback */
      bench(n) {
        if (!v.R || !v.src) return null;
        n = n || 60;
        const gl = v.R.gl, px = new Uint8Array(4), ts = [], st = v.st;
        const keep = { clock: st.clock, env: st.env, m: st.m, lift: st.lift, pt: Object.assign({}, st.pt), pulses: st.pulses };
        Object.assign(st, { env: 1, lift: 1, pulses: [{ x: v.w / 3, y: v.h / 3, r: v.w / 4, amp: 0.7 }] }); Object.assign(st.pt, { x: v.w / 2, y: v.h / 2, amp: 1 });
        const step = () => { st.gk++; st.clock += 1 / 60; st.m += 1 / 60; drawGPU(v); };
        step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) { const t0 = performance.now(); step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
        const t0 = performance.now();
        for (let i = 0; i < n; i++) step();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pipelined = (performance.now() - t0) / n;
        Object.assign(st, keep); st.pt = keep.pt;
        drawGPU(v); present(v);
        ts.sort((a, b) => a - b);
        return { sync: +ts[ts.length >> 1].toFixed(2), pipelined: +pipelined.toFixed(2), size: [v.w, v.h], path: api.state().path, engine: api.state().engine };
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
  live._frame = (ctl, t) => { const v = ctl._v; if (t != null) Object.assign(v.st, { clock: t, env: 1, m: t }); if (v.R) { drawGPU(v); present(v); } else drawCPU(v); };
  live.stats = () => ({ views: views.size, jsMsLastFrame: +lastCost.toFixed(2) });

  /**
   * live.parity(opts) — print the still on a 2D canvas and draw frame 0 on the GPU at the same
   * size, plate, palette and seed, and compare luminance mean, contrast (SD), grain (mean |ΔL|
   * between neighbours) and the mean per-channel difference in 8-bit levels.
   */
  live.parity = function (opts) {
    const o = Object.assign({ mode: 'reeded', width: 480, height: 320, seed: 7, grain: LIVE_GRAIN }, opts), w = o.width, h = o.height;
    const a = document.createElement('canvas');
    const t0 = performance.now();
    S[o.mode](a, Object.assign(stillOpts(o), { capture: () => {} }));   // capture: print synchronously
    const cpuMs = performance.now() - t0;
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const R = makeRenderer(b);
    if (!R) return { mode: o.mode, gpu: false };
    const v = { canvas: b, o: Object.assign({}, MOTION, o), R, w, h, cssW: w, dpr: 1 };
    v.st = { clock: 0, env: 0, m: 0, expose: 1, lift: 0, gk: 0, pt: { x: 0, y: 0, amp: 0 }, pulses: [], reveal: null };
    const pl = nativePlan(v.o, w, h, R);
    v.src = pl ? { native: pl, w, h } : printPlate(o, w, h);
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
      mode: o.mode, palette: o.palette, seed: o.seed, size: [w, h], path: pl ? 'native' : 'captured', cpuMs: Math.round(cpuMs),
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
    live.parity({ mode: 'streak', palette: 'coral', seed: 8 }),
    live.parity({ mode: 'streak', palette: 'drip', seed: 2, text: false }),
  ].map(r => Object.assign(r, { pass: live.pass(r) })));
  S.live = live;
})(typeof window !== 'undefined' ? window : globalThis);
