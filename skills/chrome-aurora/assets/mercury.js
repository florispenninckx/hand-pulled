/* mercury.js — liquid chrome, oil film, wet glass and aurora light, computed per pixel.
 *
 *   Mercury.film(canvas, { width, height, seed, look: 'oxide' });     // a pool of chrome with an oil-film skin    (oxide, titanium)
 *   Mercury.trail(canvas, { width, height, seed, look: 'ember' });    // paint dragged across black: a crisp edge, a smeared tail   (ember, dusk)
 *   Mercury.ribbon(canvas, { width, height, seed, look: 'lagoon' });  // glossy fluid ribbons, one hot colour       (lagoon, coral, volt)
 *   Mercury.glass(canvas, { width, height, seed, look: 'pool' });     // strip lights on wet metal and glass, split into fringes   (pool, eye, pinch)
 *   Mercury.aurora(canvas, { width, height, seed, look: 'ember' });   // a soft light seen through a lens, with fringes   (ember, flare, rose, iris)
 *
 * More options: image (an <img> or canvas whose light and dark become the height),
 * grain (0..), layer ('height' | 'normal' | 'light' | 'film' on the film plate: the
 * passes), gl (false forces the 2D fallback), resolution (the GPU's share of the
 * size). Mercury.last says which path drew the last plate: 'webgl' or '2d'.
 *
 * Every plate is a surface, not a gradient. A height field is built from seeded
 * gradient noise (domain-warped, so it flows); its slope gives a normal; the
 * normal reflects a studio (a dark ceiling, a warm lamp, a cool lamp opposite) or
 * a room with strip lights. Each colour channel bends the normal a little
 * differently, so edges split into fringes. On the film plate the oil in the
 * fold is an Airy thin film summed over sixteen wavelengths. Trails are level
 * sets of a warped field with a crisp front and an exponential tail; ribbons map
 * a warped field through a ramp whose levels are set per seed from its own
 * quantiles. Aurora is a light out of focus, sampled once per channel through a
 * lens that does not bring the colours together.
 *
 * The GPU does it in WebGL 1 on one shared, hidden canvas, then the result is
 * copied into your 2D canvas, and grain goes on last, at full resolution. The
 * noise lattice is a seeded texture, so the 2D fallback (no WebGL, or `gl: false`)
 * reads the same numbers and pours a coarser copy of the same plate.
 *
 * No dependencies, no ctx.filter. Original implementation.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, N = 128;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const hex = c => { const n = parseInt(c.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  // ---- looks ------------------------------------------------------------------
  // col: up to six stops; pos: where each stop sits on the plate's ramp (ribbon, aurora)
  const LOOKS = {
    film: {
      // pin 19: black ground; faces turned one way burn red, orange, yellow; the other way blue and cyan; folds fringe
      oxide:    { col: ['#000000', '#0a1640', '#b0101c', '#ff6a00', '#0b24c8', '#2f8cff'], disp: 0.14, film: 0.15, d: 240, F: 2.5, sheets: 1, nf: 1.45, width: 1.05, ceil: 0.5, top: 0.3, relief: 0.42, grain: 0.07 },
      // pin 20: anodised titanium on cobalt, navy body, copper and gold on the turned faces
      titanium: { col: ['#0d2fb5', '#020a3a', '#6a1606', '#f08a1e', '#0b37f0', '#2a7aff'], disp: 0.1, film: 0.1, d: 300, F: 3, sheets: 0.4, nf: 2.2, width: 0.8, ceil: 1, top: 0.1, relief: 0.7, level: 3, scale: 0.2, grain: 0.12 },
    },
    trail: {
      // pin 11: a violet edge, a blue core, orange dragged out behind, on charcoal with grain
      ember: { col: ['#1b1b1b', '#9a4dff', '#3b62ff', '#ff5a1c', '#ff5a1c', '#050505'], spacing: 0.3, width: 0.06, keep: 0.65, soft: 0.02, tail: 0.5, flow: [0.45, 0.1], grain: 0.07 },
      // pins 7, 11: the same pull on navy: a pink edge, a cyan core, a coral tail
      dusk:  { col: ['#070b24', '#ff4f8a', '#39c6e8', '#ff6a4a', '#ff3a3a', '#0e1640'], spacing: 0.34, width: 0.07, keep: 0.6, soft: 0.02, tail: 0.6, flow: [0.4, 0.15], grain: 0.08 },
    },
    ribbon: {
      // pin 6: cyan liquid on black, red tongues at the centres of the swirls
      lagoon: { col: ['#020308', '#0b2a4a', '#3fa9cf', '#9fe0ee', '#e2356b', '#ff2a48'], pos: [0.3, 0.44, 0.56, 0.68, 0.84, 0.94], gloss: 0, grain: 0.1 },
      // pin 7: navy and one coral red
      coral:  { col: ['#070a22', '#111a4a', '#26307a', '#ff7157', '#ff2c52', '#ff7a6a'], pos: [0.2, 0.4, 0.55, 0.72, 0.86, 1.0], gloss: 0.2, grain: 0.15 },
      // pin 10: black, electric blue and yellow, glossy
      volt:   { col: ['#020203', '#03070f', '#0b4fae', '#1c95ff', '#8fd6ff', '#f4ee6a'], pos: [0.36, 0.5, 0.6, 0.72, 0.84, 0.96], gloss: 0.9, grain: 0.08 },
    },
    glass: {
      // pin 1: grey water under strip lights, each highlight split cyan above and amber below
      pool:  { col: ['#1b1f26', '#8d939b', '#f7e2bd', '#fff0da', '#d6e2ea'], form: 0, stretch: 3.2, slope: 0.16, disp: 0.07, scale: 0.4, width: 0.08, wall: [0.5, -0.6], grain: 0.05 },
      // pin 21: black chrome turning round an eye, cream light split orange and blue
      eye:   { col: ['#030306', '#14121b', '#fff1dc', '#4aa3ff', '#ff8a3a'], form: 1, stretch: 1, slope: 0.9, disp: 0.16, scale: 0.7, width: 0.2, rings: 6, grain: 0.06 },
      // pin 17: soft petals of light meeting at a pinch, cream, blue and orange on black
      pinch: { col: ['#050507', '#0d0d14', '#ffe9d8', '#3a7bd5', '#f08a3a'], form: 2, stretch: 1, slope: 1.4, disp: 0.18, scale: 0.8, width: 0.26, grain: 0.07 },
    },
    aurora: {
      // pin 23: an amber slab of light with a blue halo, on black
      ember: { col: ['#000000', '#0a2466', '#2f96e0', '#f2dfb2', '#f2a12e', '#d2560e'], pos: [0.0, 0.2, 0.36, 0.5, 0.68, 1.0], form: 0, ca: 0.035, grain: 0.08 },
      // pin 24: a white flare with orange and red rings, a hard arc, green below
      flare: { col: ['#010403', '#3a0806', '#c8260e', '#f37a1c', '#fbe3c0', '#ffffff'], pos: [0.0, 0.28, 0.46, 0.62, 0.8, 1.0], form: 1, ca: 0.03, grain: 0.12 },
      // pin 14: pink and coral air
      rose:  { col: ['#b8185e', '#e8307a', '#f569a0', '#f7a3c2', '#f57a6c', '#f0503e'], pos: [0.05, 0.25, 0.45, 0.6, 0.8, 1.0], form: 2, ca: 0.02, grain: 0.10 },
      // pin 15: periwinkle with a dark hole ringed in violet
      iris:  { col: ['#e2a6d6', '#b9b9f4', '#9aa6f6', '#6d63ee', '#4a2a7a', '#1d0d1c'], pos: [0.1, 0.35, 0.55, 0.72, 0.86, 1.0], form: 3, ca: 0.02, grain: 0.10 },
    },
  };

  // ---- the seeded lattice: 128 x 128 gradients, shared by the GPU and the fallback ----
  function lattice(seed) {
    const r = mulberry32((seed | 0) * 7919 + 13), bytes = new Uint8Array(N * N * 4);
    const gx = new Float32Array(N * N), gy = new Float32Array(N * N), v = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const a = r() * TAU, k = i * 4;
      bytes[k] = Math.round((Math.cos(a) * 0.5 + 0.5) * 255);
      bytes[k + 1] = Math.round((Math.sin(a) * 0.5 + 0.5) * 255);
      bytes[k + 2] = Math.floor(r() * 256); bytes[k + 3] = 255;
      gx[i] = bytes[k] / 255 * 2 - 1; gy[i] = bytes[k + 1] / 255 * 2 - 1; v[i] = bytes[k + 2] / 255;
    }
    return { bytes, gx, gy, v };
  }

  // sixteen wavelengths, 405–705 nm, as linear-sRGB weights that sum to white (CIE fit: Wyman, Sloan & Shirley 2013)
  const WEIGHTS = (() => {
    const g = (x, m, s1, s2) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
    const out = [], sum = [0, 0, 0];
    for (let k = 0; k < 16; k++) {
      const l = 405 + 20 * k;
      const X = 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
      const Y = 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
      const Z = 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
      const c = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
      out.push(c); sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
    }
    return out.map(c => [c[0] / sum[0], c[1] / sum[1], c[2] / sum[2]]);
  })();

  // ---- GLSL -------------------------------------------------------------------
  const PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uMin;
uniform sampler2D uLat;
uniform sampler2D uImg;
uniform float uImgOn;
uniform vec4 uK0, uK1, uK2, uK3;
uniform vec3 uCol[6];
uniform float uPos[6];
uniform vec3 uW[16];
uniform float uLayer;
const float LAT = ${N}.;
vec4 lat(vec2 i) { return texture2D(uLat, (mod(i, LAT) + .5) / LAT); }
// live.js hooks: GRAD turns the lattice's gradients as the metal flows, AUX hands back a pass; the still leaves both alone
#ifndef GRAD
#define GRAD(i) (lat(i).xy * 2. - 1.)
#endif
#ifndef AUX
#define AUX(v)
#endif
#ifndef SLIDE
#define SLIDE
#endif
float noise(vec2 p) {
  vec2 i = floor(p), f = p - i, u = f * f * f * (f * (f * 6. - 15.) + 10.);
  float a = dot(GRAD(i), f);
  float b = dot(GRAD(i + vec2(1., 0.)), f - vec2(1., 0.));
  float c = dot(GRAD(i + vec2(0., 1.)), f - vec2(0., 1.));
  float d = dot(GRAD(i + vec2(1., 1.)), f - vec2(1., 1.));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = vec2(1.6 * p.x - 1.2 * p.y, 1.2 * p.x + 1.6 * p.y) + 17.3; a *= .5; }
  return s;
}
float fbm3(vec2 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p = vec2(1.6 * p.x - 1.2 * p.y, 1.2 * p.x + 1.6 * p.y) + 17.3; a *= .5; }
  return s;
}
float pic(vec2 p) { vec4 t = texture2D(uImg, clamp(p * uMin / uRes + .5, 0., 1.)); return t.r + t.g / 255.; }
vec3 ramp(float t) {
  vec3 c = uCol[0];
  for (int i = 1; i < 6; i++) c = mix(c, uCol[i], smoothstep(uPos[i - 1], uPos[i], t));
  return c;
}
// a stack of thin layers (dichroic glass): Airy reflectance, sharp peaks, a pure hue per order
vec3 thinfilm(float opd, float F) {
  vec3 c = vec3(0.);
  for (int k = 0; k < 16; k++) { float s = sin(3.14159265 * opd / (405. + 20. * float(k))); c += uW[k] / (1. + F * s * s); }
  return c * sqrt(1. + F);
}
vec3 shade(vec2 p);
#ifndef LIVE
void main() {
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 c = shade((fc - .5 * uRes) / uMin);
  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}
#endif
`;

  const FRAG = {
    // uK0: offset xy, pour angle, pour level · uK1: dispersion, rim film, film thickness, key azimuth
    // uK2: relief, lobe width, ceiling, top light · uK3: scale, film index, film finesse, sheets in the fold
    // uCol: ground, ceiling, warm deep, warm bright, cool deep, cool bright
    film: `
vec3 hm(vec2 p) {
  vec2 q = p * uK3.x + uK0.xy;
  vec2 w = vec2(fbm3(q), fbm3(q + vec2(5.2, 1.3)));
  float f = fbm3(q + 1.5 * w);
  float fold = fbm3(q * 1.25 + 2.4 * w + 7.);
  float m = f * 1.2 + dot(p, vec2(cos(uK0.z), sin(uK0.z))) * .9 + uK0.w;
  m = mix(m, (pic(p) - .42) * 1.5 + f * .35, uImgOn);
  float cr = fbm3(q * .8 + 2.6 * w + 11.);
  float crease = exp(-cr * cr / .0045);
  float inside = smoothstep(0., .35, m);
  // the fold is a stack of thin sheets: parallel ridges along the crease, each one sweeping the lamps
  float rip = uK3.w * .012 * sin(cr * 110.) * exp(-cr * cr / .03);
  float h = .1 * sqrt(max(m, 0.) + 1e-4) + uK2.x * (f + .12 * fold - .22 * crease) * inside + rip * inside;
  return vec3(h, m, exp(-cr * cr / .009) * inside);
}
vec3 lamp(float x, vec3 deep, vec3 bright) {
  return deep * smoothstep(0., .4, x) + (bright - deep) * smoothstep(.35, .9, x) + vec3(0., .4, .25) * smoothstep(.85, 1.15, x) + vec3(.35) * smoothstep(1.1, 1.4, x);
}
// the studio: a dark ceiling, a warm lamp on one side, a cool lamp opposite, a strip overhead
vec3 studio(vec3 r) {
  float az = atan(r.y, r.x + 1e-5);
  float dw = abs(mod(az - uK1.w + 3.14159265, 6.2831853) - 3.14159265);
  float dc = 3.14159265 - dw;
  float band = smoothstep(.995, .7, r.z) * smoothstep(-.95, -.3, r.z);
  float s2 = 2. * uK2.y * uK2.y;
  vec3 c = uCol[1] * uK2.z;
  c += lamp(band * 1.05 * exp(-dw * dw / s2), uCol[2], uCol[3]);
  c += lamp(band * 1.05 * exp(-dc * dc / s2), uCol[4], uCol[5]);
  float dt = abs(mod(az - uK1.w - 1.5707963 + 3.14159265, 6.2831853) - 3.14159265);
  c += uK2.w * smoothstep(.12, .04, abs(r.z - .8)) * exp(-dt * dt / .5);
  return c;
}
vec3 shade(vec2 p) {
  float e = .0018;
  vec3 a = hm(p), bx = hm(p + vec2(e, 0.)), by = hm(p + vec2(0., e));
  vec2 g = vec2(bx.x - a.x, by.x - a.x) / e;
  vec3 n = normalize(vec3(-g, 1.));
  vec3 col = vec3(0.);
  for (int c = 0; c < 3; c++) {
    vec3 nc = normalize(vec3(-g * (1. + uK1.x * (float(c) - 1.)), 1.));
    vec3 s = studio(vec3(2. * nc.z * nc.xy, 2. * nc.z * nc.z - 1.));
    col[c] = c == 0 ? s.r : (c == 1 ? s.g : s.b);
  }
  // oil gathers in the crease, thickest at its floor, and shows its orders as parallel bands
  float cost = sqrt(1. - (1. - n.z * n.z) / (uK3.y * uK3.y));
  vec3 fl = thinfilm(2. * uK3.y * uK1.z * (1. + 1.8 * a.z + .8 * (1. - n.z) SLIDE) * cost, uK3.z);
  fl = max(mix(vec3(dot(fl, vec3(.3, .5, .2))), fl, 2.2), 0.);
  float oil = uK1.y * smoothstep(.08, .7, a.z);
  vec3 body = mix(col, fl * (.35 + .75 * min(dot(col, vec3(.3, .5, .2)) + .4, 1.)), oil);
  float fw = length(vec2(bx.y - a.y, by.y - a.y)) / e * 1.5 / uMin;
  float cover = smoothstep(0., fw + 1e-4, a.y);
  vec3 col2 = mix(uCol[0], body, cover);
  AUX(vec4(mix(vec3(0.), n * .5 + .5, cover), 1.))
  if (uLayer > .5 && uLayer < 1.5) return vec3(cover * (.15 + 4. * a.x));
  if (uLayer > 1.5 && uLayer < 2.5) return mix(vec3(0.), n * .5 + .5, cover);
  if (uLayer > 2.5 && uLayer < 3.5) return mix(uCol[0], studio(vec3(2. * n.z * n.xy, 2. * n.z * n.z - 1.)), cover);
  if (uLayer > 3.5) return mix(uCol[0], col, cover);
  return col2;
}
`,
    // uK0: offset xy, spacing, width · uK1: flow across, share of trails kept, edge softness, tail length · uK2: flow down
    // uCol: ground, crisp edge, core, warm side, tail, ground glow
    trail: `
float field(vec2 p) {
  vec2 q = p * .45 + uK0.xy;
  vec2 w = vec2(fbm3(q), fbm3(q + vec2(3.1, 7.7)));
  float f = fbm3(q + 2.6 * w) * .9 + p.x * uK1.x + p.y * uK2.x;
  return mix(f, pic(p) * .9 + p.x * .2, uImgOn);
}
// across one trail: s = 0 at the crisp edge, 1 at the far side of the core, then the paint is dragged out
vec3 xsec(float s) {
  vec3 c = mix(uCol[1], uCol[2], smoothstep(0., .3, s));
  c = mix(c, uCol[3], smoothstep(.4, 1., s));
  return mix(c, uCol[4], smoothstep(1., 1. + uK1.w, s));
}
vec3 shade(vec2 p) {
  float e = .0015;
  float f = field(p), fx = field(p + vec2(e, 0.)), fy = field(p + vec2(0., e));
  float gl = max(length(vec2(fx - f, fy - f)) / e, 1e-3);
  float sp = uK0.z, u = f / sp, L0 = floor(u);
  vec3 col = uCol[0] + uCol[5] * smoothstep(1., 0., length(p * vec2(.8, 1.)));
  float W = uK0.w * (.3 + 1.1 * smoothstep(-.35, .35, fbm3(p * .9 + uK0.yx)));
  float aa = max(uK1.z, 1.4 / (uMin * W));
  float mid = floor(field(vec2(0.)) / sp - .5 + .5);
  float band = 0.;
  for (int k = -1; k <= 1; k++) {
    float L = L0 + float(k);
    vec4 id = lat(vec2(L, 3.));
    float side = id.x > .5 ? 1. : -1.;
    float s = (u - L - .5) * sp / gl * side / W;
    float keep = max(step(1. - uK1.y, id.z), 1. - step(.5, abs(L - mid)));
    float a = smoothstep(-aa, aa, s) * exp(-max(s - 1., 0.) / uK1.w) * keep;
    col = mix(col, xsec(s), a);
    band = max(band, a);
  }
  AUX(vec4(band))
  if (uLayer > .5) return vec3(band);
  return col;
}
`,
    // uK0: offset xy, scale, warp · uK1: gloss, light angle, shine · uK2: median, gain, where the median sits on the ramp
    ribbon: `
float field(vec2 p) {
  vec2 q = p * uK0.z + uK0.xy;
  vec2 a = vec2(fbm3(q), fbm3(q + vec2(1.7, 9.2)));
  vec2 b = vec2(fbm3(q + uK0.w * a + vec2(8.3, 2.8)), fbm3(q + uK0.w * a + vec2(4.1, 6.3)));
  float f = fbm3(q + uK0.w * b);
  return mix(f, (pic(p) - .5) * .9 + f * .3, uImgOn);
}
vec3 shade(vec2 p) {
  float e = .002;
  float f = field(p), fx = field(p + vec2(e, 0.)), fy = field(p + vec2(0., e));
  vec2 g = vec2(fx - f, fy - f) / e;
  float t = clamp(uK2.z + (f - uK2.x) * uK2.y, 0., 1.);
  vec3 col = ramp(t);
  vec3 n = normalize(vec3(-g * .05, 1.));
  vec3 l = normalize(vec3(cos(uK1.y), sin(uK1.y), 1.3));
  float spec = pow(max(dot(n, normalize(l + vec3(0., 0., 1.))), 0.), uK1.z);
  col *= .82 + .3 * dot(n, l);
  col += uK1.x * spec * smoothstep(.3, .7, t) * mix(vec3(1.), col, .35);
  AUX(vec4(t))
  if (uLayer > .5) return vec3(t);
  return col;
}
`,
    // uK0: offset xy, form, stretch · uK1: slope, dispersion, scale, strip width
    // uK2: centre xy, strip angle, rings · uK3: wall softness, wall tilt
    // uCol: wall low, wall high, strip 1, strip 2, strip 3
    glass: `
float surf(vec2 p) {
  vec2 q = vec2(p.x, p.y * uK0.w) * uK1.z + uK0.xy;
  vec2 w = vec2(fbm3(q), fbm3(q + vec2(4.7, 1.9)));
  float h = fbm3(q + .8 * w);
  vec2 c = p - uK2.xy;
  float r = length(c * vec2(1., 1.5)), a = atan(c.y, c.x + 1e-5);
  // an eye: a few rings round a still centre · a pinch: petals of metal meeting at a point
  if (uK0.z > .5 && uK0.z < 1.5) h = .32 * sin(r * uK2.w - 4. * h) * (1. - exp(-r * r / .03)) * exp(-r * .8) + .3 * h;
  else if (uK0.z > 1.5) h = .45 * pow(r + .003, .6) * cos(3. * a + 2.5 * h) + .25 * h;
  return mix(h, pic(p) * .5 + h * .3, uImgOn);
}
float strip(float v, float c, float w) { return smoothstep(w, w * .35, abs(v - c)); }
vec3 room(vec3 r, float y) {
  float v = r.y * cos(uK2.z) + r.x * sin(uK2.z), w = uK1.w;
  vec3 c = mix(uCol[0], uCol[1], smoothstep(-uK3.x, uK3.x, r.y - uK3.y * y));
  c += uCol[2] * strip(v, .12, w) + uCol[3] * .85 * strip(v, -.3, w * .7) + uCol[4] * .7 * strip(v, .45, w * 1.3);
  return c;
}
vec3 shade(vec2 p) {
  float e = .004;
  float h = surf(p), hx = surf(p + vec2(e, 0.)), hy = surf(p + vec2(0., e));
  vec2 g = vec2(hx - h, hy - h) / e;
  vec3 col = vec3(0.);
  for (int c = 0; c < 3; c++) {
    vec3 n = normalize(vec3(-g * uK1.x * (1. + uK1.y * (float(c) - 1.)), 1.));
    vec3 L = room(vec3(2. * n.z * n.xy, 2. * n.z * n.z - 1.), p.y);
    col[c] = c == 0 ? L.r : (c == 1 ? L.g : L.b);
  }
  AUX(vec4(.5 + h))
  if (uLayer > .5) return vec3(.5 + h);
  return col;
}
`,
    // uK0: centre xy, size, softness · uK1: form, arc radius, arc strength, fringe
    // uK2: warp, second centre xy, second size · uK3: offset xy
    aurora: `
float form(vec2 p) {
  vec2 w = vec2(fbm3(p * 1.1 + uK3.xy), fbm3(p * 1.1 + uK3.yx + 4.)) * uK2.x;
  vec2 q = p + w - uK0.xy;
  float v;
  if (uK1.x < .5) {
    // a slab of light: deepest at the top, paling as it falls out of the bottom edge
    v = 1. - smoothstep(-uK0.w * 4.5, uK0.w * 1.25, q.y - uK0.z);
    v *= mix(.5, 1., smoothstep(.62, .25, abs(q.x)));
  } else if (uK1.x < 1.5) {
    // a flare: a hot core, a warm cloud beside it, and a hard arc that bands everything below it
    float core = exp(-dot(q, q) / (uK0.z * uK0.z));
    vec2 g = q - vec2(.55, .05);
    float glow = .55 * exp(-dot(g, g * vec2(.7, 1.)) / .45);
    v = max(core, glow);
    float arc = length(p + w * .3 - uK2.yz) - uK2.w;
    v = mix(v, .97 - 2.4 * max(-arc, 0.), smoothstep(.003, -.003, arc) * uK1.z);
  } else if (uK1.x < 2.5) {
    v = .45 + 1.1 * fbm3(q * .8 + uK3.xy) + .35 * (p.x - p.y);
  } else {
    float d = length(q * vec2(1.25, .8)) - uK0.z;
    v = .35 + .7 * fbm3(p * .7 + uK3.yx) + .25 * (p.y - p.x);
    v = mix(v, 1., 1. - smoothstep(-uK0.w, uK0.w * 1.5, d));
  }
  return mix(v, pic(p), uImgOn);
}
vec3 shade(vec2 p) {
  float ca = uK1.w;
  vec3 v = vec3(form(p * (1. - ca)), form(p), form(p * (1. + ca)));
  vec3 col = vec3(ramp(v.r).r, ramp(v.g).g, ramp(v.b).b);
  AUX(vec4(v.g))
  if (uLayer > .5) return vec3(v.g);
  return col;
}
`,
  };

  // ---- the GPU --------------------------------------------------------------
  let GL = null;
  function gpu() {
    if (GL !== null) return GL;
    GL = false;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (!gl) return GL;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
      const lat = tex(); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const img = tex(); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      c.addEventListener('webglcontextlost', e => { e.preventDefault(); GL = null; });
      GL = { c, gl, buf, lat, img, progs: {} };
    } catch (e) { GL = false; }
    return GL;
  }
  function program(G, name) {
    if (G.progs[name] !== undefined) return G.progs[name];
    const gl = G.gl, sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }');
    const fs = sh(gl.FRAGMENT_SHADER, PRELUDE + FRAG[name]);
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      // a driver that cannot compile the plate gets the 2D fallback; say why, quietly
      if (root.console) console.warn('mercury: ' + name + ' falls back to 2D:', gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(pr));
      return (G.progs[name] = false);
    }
    const u = {};
    for (const k of ['uRes', 'uMin', 'uLat', 'uImg', 'uImgOn', 'uK0', 'uK1', 'uK2', 'uK3', 'uCol', 'uPos', 'uW', 'uLayer']) u[k] = gl.getUniformLocation(pr, k);
    return (G.progs[name] = { pr, u, a: gl.getAttribLocation(pr, 'a') });
  }
  function drawGL(G, name, w, h, P, lat, pic) {
    const P_ = program(G, name);
    if (!P_) return false;
    const gl = G.gl, { u } = P_;
    const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    if (w > max || h > max) return false;
    G.c.width = w; G.c.height = h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(P_.pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.buf);
    gl.enableVertexAttribArray(P_.a); gl.vertexAttribPointer(P_.a, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.lat);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, lat.bytes);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.img);
    if (pic) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pic.canvas);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.uniform1i(u.uLat, 0); gl.uniform1i(u.uImg, 1);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uMin, Math.min(w, h));
    gl.uniform1f(u.uImgOn, pic ? P.imgMix : 0); gl.uniform1f(u.uLayer, P.layer);
    gl.uniform4fv(u.uK0, P.k[0]); gl.uniform4fv(u.uK1, P.k[1]); gl.uniform4fv(u.uK2, P.k[2]); gl.uniform4fv(u.uK3, P.k[3]);
    gl.uniform3fv(u.uCol, P.col.flat()); gl.uniform1fv(u.uPos, P.pos);
    gl.uniform3fv(u.uW, WEIGHTS.flat());
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return gl.getError() === gl.NO_ERROR;
  }

  // ---- a dropped picture becomes the height field: small, soft, cover-fitted ----
  function picture(image, w, h) {
    if (!image) return null;
    const long = 256, s = long / Math.max(w, h), cw = Math.max(8, Math.round(w * s)), ch = Math.max(8, Math.round(h * s));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d'), iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const k = Math.max(cw / iw, ch / ih);
    x.fillStyle = '#808080'; x.fillRect(0, 0, cw, ch);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(image, (cw - iw * k) / 2, (ch - ih * k) / 2, iw * k, ih * k);
    const d = x.getImageData(0, 0, cw, ch);
    let lum = new Float32Array(cw * ch), tmp = new Float32Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) lum[i] = (0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2]) / 255;
    // soften: three box passes each way, close to a gaussian of about four pixels, so hard edges pour as slopes
    const R = 3;
    for (let pass = 0; pass < 6; pass++) {
      const hz = pass % 2 === 0, n = hz ? cw : ch, lines = hz ? ch : cw;
      for (let j = 0; j < lines; j++) {
        const at = i => hz ? j * cw + i : i * cw + j;
        let acc = 0;
        for (let i = -R; i <= R; i++) acc += lum[at(Math.min(n - 1, Math.max(0, i)))];
        for (let i = 0; i < n; i++) {
          tmp[at(i)] = acc / (2 * R + 1);
          acc += lum[at(Math.min(n - 1, i + R + 1))] - lum[at(Math.max(0, i - R))];
        }
      }
      [lum, tmp] = [tmp, lum];
    }
    // sixteen bits over two channels (red high, green low): slopes of an 8-bit picture come out as speckle
    for (let i = 0; i < cw * ch; i++) {
      const v = Math.min(1, Math.max(0, lum[i])) * 255, hi = Math.floor(v);
      d.data[i * 4] = d.data[i * 4 + 2] = hi; d.data[i * 4 + 1] = Math.round((v - hi) * 255); d.data[i * 4 + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return { canvas: c, lum, w: cw, h: ch };
  }

  // ---- grain, last, at full resolution, strongest in the midtones ----
  function grain(ctx, W, H, amt, seed) {
    if (!amt) return;
    const img = ctx.getImageData(0, 0, W, H), d = img.data, a = amt * 255, s = (seed | 0) * 7 + 3;
    const gs = Math.max(1, Math.round(Math.min(W, H) / 800));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const n = (hash(x, y, s) + hash(x, y, s + 1) - 1 + 0.6 * (hash(x / gs | 0, y / gs | 0, s + 2) - 0.5)) * a * (0.3 + 2.4 * l * (1 - l) + 0.25 * (1 - l));
      const c = (hash(x, y, s + 3) - 0.5) * a * 0.25;
      d[i] = r + n + c; d[i + 1] = g + n; d[i + 2] = b + n - c;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- plate parameters, all from the seed ----
  function params(name, seed, look) {
    const L = LOOKS[name][look] || LOOKS[name][Object.keys(LOOKS[name])[0]];
    const r = mulberry32((seed | 0) * 2654435761 + name.length * 977);
    const o = () => r() * 40 + 5;
    const col = L.col.map(hex); while (col.length < 6) col.push(col[col.length - 1]);
    const pos = (L.pos || [0, 0.2, 0.4, 0.6, 0.8, 1]).slice();
    let k;
    if (name === 'film') {
      const ang = (r() < 0.5 ? 0.25 : 0.75) * Math.PI + (r() - 0.5) * 0.9;   // the pool comes in from a lower corner
      const key = ang + Math.PI + (r() - 0.5) * 1.2;   // the warm lamp sits roughly behind the pour
      const lv = 0.02 + r() * 0.14;
      k = [[o(), o(), ang, L.level != null ? L.level : lv], [L.disp, L.film, L.d, key], [L.relief, L.width, L.ceil, L.top], [(L.scale || 0.36) * (1 + r() * 0.44), L.nf, L.F, L.sheets]];
    } else if (name === 'trail') {
      k = [[o(), o(), L.spacing * (0.85 + r() * 0.3), L.width], [(r() < 0.5 ? -1 : 1) * L.flow[0] * (0.8 + r() * 0.4), L.keep, L.soft, L.tail], [L.flow[1] * (r() < 0.5 ? -1 : 1), 0, 0, 0], [0, 0, 0, 0]];
    } else if (name === 'ribbon') {
      k = [[o(), o(), 0.3 + r() * 0.08, 2.2 + r() * 0.6], [L.gloss, r() * TAU, 18, 0], [0, 2.3, L.mid || 0.42, L.hi || 0.82], [0, 0, 0, 0]];
    } else if (name === 'glass') {
      const c = [(r() - 0.5) * 0.3, (r() - 0.5) * 0.4];
      k = [[o(), o(), L.form, L.stretch], [L.slope, L.disp, L.scale * (0.9 + r() * 0.2), L.width], [c[0], c[1], L.form === 0 ? 0 : (r() - 0.5) * 1.6, L.rings || 7], (L.wall || [0.6, 0]).concat([0, 0])];
    } else {
      const f = L.form;
      const c = f === 0 ? [(r() - 0.5) * 0.1, 0] : f === 1 ? [-0.46 + r() * 0.1, -0.12 + r() * 0.15] : [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3 + 0.15];
      const size = f === 0 ? 0.4 + r() * 0.1 : f === 1 ? 0.24 + r() * 0.06 : 0.1 + r() * 0.05;
      const arc = [0.1 + r() * 0.3, 1.6 + r() * 0.3];   // a big circle whose top edge crosses the lower third
      k = [[c[0], c[1], size, f === 0 ? 0.26 : 0.22], [f, 0, f === 1 ? 1 : 0, L.ca], [f === 0 ? 0.06 : 0.16, arc[0], arc[1], arc[1] - 0.25 - r() * 0.1], [o(), o(), 0, 0]];
    }
    return { k, col, pos, grain: L.grain, imgMix: 0.85, layer: 0 };
  }

  const LAYERS = { final: 0, height: 1, normal: 2, light: 3, film: 4 };
  // everything a plate needs before it is shaded: live.js calls this too, so the GPU pours the same plate
  function prepare(name, o, W, H) {
    const seed = o.seed == null ? 1 : o.seed | 0;
    const P = params(name, seed, o.look);
    P.layer = LAYERS[o.layer] || 0;
    if (o.grain != null) P.grain = o.grain;
    const lat = lattice(seed), pic = picture(o.image, W, H);
    tune(name, P, lat, pic, W, H);
    return { seed, P, lat, pic };
  }
  const SCALE = { film: 1, trail: 1, ribbon: 0.6, glass: 0.6, aurora: 0.5 };
  let last = null;

  function plate(name, canvas, opts) {
    const o = opts || {};
    const W = Math.max(8, Math.round(o.width || canvas.width)), H = Math.max(8, Math.round(o.height || canvas.height));
    canvas.width = W; canvas.height = H;
    const { seed, P, lat, pic } = prepare(name, o, W, H);
    const ctx = canvas.getContext('2d');
    const G = o.gl === false ? false : gpu();
    const s = Math.min(1, o.resolution || SCALE[name]);
    let w = Math.max(8, Math.round(W * s)), h = Math.max(8, Math.round(H * s));
    let src = null;
    if (G && drawGL(G, name, w, h, P, lat, pic)) { src = G.c; last = 'webgl'; }
    else {
      const k = Math.min(1, 480 / Math.max(W, H));
      w = Math.max(8, Math.round(W * k)); h = Math.max(8, Math.round(H * k));
      src = soft(name, w, h, P, lat, pic); last = '2d';
    }
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h, 0, 0, W, H); ctx.restore();
    if (!P.layer) grain(ctx, W, H, P.grain, seed);
    return canvas;
  }

  // ---- the 2D fallback: the same fields, evaluated in JS at a lower resolution ----
  // Each CPU port is line for line the shader above it; they read the same lattice, so they pour the same plate.
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mod = (x, y) => x - y * Math.floor(x / y);
  function kit(P, lat, pic, w, h) {
    const gx = lat.gx, gy = lat.gy, m = Math.min(w, h);
    const cell = (i, j) => mod(j, N) * N + mod(i, N);
    function noise(x, y) {
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = cell(i, j), b = cell(i + 1, j), c = cell(i, j + 1), d = cell(i + 1, j + 1);
      const na = gx[a] * fx + gy[a] * fy, nb = gx[b] * (fx - 1) + gy[b] * fy;
      const nc = gx[c] * fx + gy[c] * (fy - 1), nd = gx[d] * (fx - 1) + gy[d] * (fy - 1);
      const top = na + (nb - na) * ux, bot = nc + (nd - nc) * ux;
      return top + (bot - top) * uy;
    }
    function fbm3(x, y) {
      let s = 0, a = 0.5;
      for (let k = 0; k < 3; k++) { s += a * noise(x, y); const nx = 1.6 * x - 1.2 * y + 17.3; y = 1.2 * x + 1.6 * y + 17.3; x = nx; a *= 0.5; }
      return s;
    }
    const picAt = !pic ? () => 128 / 255 : (x, y) => {
      const u = Math.min(1, Math.max(0, x * m / w + 0.5)) * pic.w - 0.5, v = Math.min(1, Math.max(0, y * m / h + 0.5)) * pic.h - 0.5;
      const i = Math.max(0, Math.min(pic.w - 1, Math.floor(u))), j = Math.max(0, Math.min(pic.h - 1, Math.floor(v)));
      const i1 = Math.min(pic.w - 1, i + 1), j1 = Math.min(pic.h - 1, j + 1), fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j)), L = pic.lum;
      const t = L[j * pic.w + i] + (L[j * pic.w + i1] - L[j * pic.w + i]) * fu, b = L[j1 * pic.w + i] + (L[j1 * pic.w + i1] - L[j1 * pic.w + i]) * fu;
      return t + (b - t) * fv;
    };
    const C = P.col, pos = P.pos;
    function ramp(t, o) {
      let r = C[0][0], g = C[0][1], b = C[0][2];
      for (let i = 1; i < 6; i++) { const k = ss(pos[i - 1], pos[i], t); r += (C[i][0] - r) * k; g += (C[i][1] - g) * k; b += (C[i][2] - b) * k; }
      o[0] = r; o[1] = g; o[2] = b; return o;
    }
    function thinfilm(opd, F, o) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 16; k++) { const s = Math.sin(Math.PI * opd / (405 + 20 * k)), q = 1 / (1 + F * s * s); r += WEIGHTS[k][0] * q; g += WEIGHTS[k][1] * q; b += WEIGHTS[k][2] * q; }
      const n = Math.sqrt(1 + F); o[0] = r * n; o[1] = g * n; o[2] = b * n; return o;
    }
    return { noise, fbm3, pic: picAt, ramp, thinfilm, lat, m, img: pic ? P.imgMix : 0, C, k: P.k, layer: P.layer };
  }
  const mix3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

  const CPU = {
    film(K) {
      const { fbm3, pic, C, img, m } = K, [k0, k1, k2, k3] = K.k, PI = Math.PI;
      const ca = Math.cos(k0[2]), sa = Math.sin(k0[2]);
      function hm(x, y, o) {
        const qx = x * k3[0] + k0[0], qy = y * k3[0] + k0[1];
        const wx = fbm3(qx, qy), wy = fbm3(qx + 5.2, qy + 1.3);
        const f = fbm3(qx + 1.5 * wx, qy + 1.5 * wy);
        const fold = fbm3(qx * 1.25 + 2.4 * wx + 7, qy * 1.25 + 2.4 * wy + 7);
        let mm = f * 1.2 + (x * ca + y * sa) * 0.9 + k0[3];
        mm += ((pic(x, y) - 0.42) * 1.5 + f * 0.35 - mm) * img;
        const cr = fbm3(qx * 0.8 + 2.6 * wx + 11, qy * 0.8 + 2.6 * wy + 11);
        const crease = Math.exp(-cr * cr / 0.0045), inside = ss(0, 0.35, mm);
        const rip = k3[3] * 0.012 * Math.sin(cr * 110) * Math.exp(-cr * cr / 0.03);
        o[0] = 0.1 * Math.sqrt(Math.max(mm, 0) + 1e-4) + k2[0] * (f + 0.12 * fold - 0.22 * crease) * inside + rip * inside;
        o[1] = mm; o[2] = Math.exp(-cr * cr / 0.009) * inside;
      }
      function lamp(x, deep, bright, o) {
        const a = ss(0, 0.4, x), b = ss(0.35, 0.9, x), c = ss(0.85, 1.15, x), d = 0.35 * ss(1.1, 1.4, x);
        o[0] += deep[0] * a + (bright[0] - deep[0]) * b + d;
        o[1] += deep[1] * a + (bright[1] - deep[1]) * b + 0.4 * c + d;
        o[2] += deep[2] * a + (bright[2] - deep[2]) * b + 0.25 * c + d;
      }
      function studio(rx, ry, rz, o) {
        const az = Math.atan2(ry, rx + 1e-5);
        const dw = Math.abs(mod(az - k1[3] + PI, TAU) - PI), dc = PI - dw;
        const band = ss(0.995, 0.7, rz) * ss(-0.95, -0.3, rz), s2 = 2 * k2[1] * k2[1];
        o[0] = C[1][0] * k2[2]; o[1] = C[1][1] * k2[2]; o[2] = C[1][2] * k2[2];
        lamp(band * 1.05 * Math.exp(-dw * dw / s2), C[2], C[3], o);
        lamp(band * 1.05 * Math.exp(-dc * dc / s2), C[4], C[5], o);
        const dt = Math.abs(mod(az - k1[3] - PI / 2 + PI, TAU) - PI);
        const t = k2[3] * ss(0.12, 0.04, Math.abs(rz - 0.8)) * Math.exp(-dt * dt / 0.5);
        o[0] += t; o[1] += t; o[2] += t;
        return o;
      }
      const a = [0, 0, 0], bx = [0, 0, 0], by = [0, 0, 0], s = [0, 0, 0], col = [0, 0, 0], fl = [0, 0, 0], body = [0, 0, 0], e = 0.0018;
      return (x, y, out) => {
        hm(x, y, a); hm(x + e, y, bx); hm(x, y + e, by);
        const gx = (bx[0] - a[0]) / e, gy = (by[0] - a[0]) / e;
        const nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
        for (let c = 0; c < 3; c++) {
          const k = 1 + k1[0] * (c - 1), l = Math.hypot(gx * k, gy * k, 1), cx = -gx * k / l, cy = -gy * k / l, cz = 1 / l;
          studio(2 * cz * cx, 2 * cz * cy, 2 * cz * cz - 1, s); col[c] = s[c];
        }
        const cost = Math.sqrt(Math.max(0, 1 - (1 - nz * nz) / (k3[1] * k3[1])));
        K.thinfilm(2 * k3[1] * k1[2] * (1 + 1.8 * a[2] + 0.8 * (1 - nz)) * cost, k3[2], fl);
        const fL = fl[0] * 0.3 + fl[1] * 0.5 + fl[2] * 0.2;
        for (let c = 0; c < 3; c++) fl[c] = Math.max(fL + (fl[c] - fL) * 2.2, 0);
        const oil = k1[1] * ss(0.08, 0.7, a[2]), lum = Math.min(col[0] * 0.3 + col[1] * 0.5 + col[2] * 0.2 + 0.4, 1);
        for (let c = 0; c < 3; c++) body[c] = col[c] + (fl[c] * (0.35 + 0.75 * lum) - col[c]) * oil;
        const fw = Math.hypot(bx[1] - a[1], by[1] - a[1]) / e * 1.5 / m, cover = ss(0, fw + 1e-4, a[1]);
        const L = K.layer;
        if (L === 1) { const v = cover * (0.15 + 4 * a[0]); out[0] = out[1] = out[2] = v; return; }
        if (L === 2) { out[0] = (nx * 0.5 + 0.5) * cover; out[1] = (ny * 0.5 + 0.5) * cover; out[2] = (nz * 0.5 + 0.5) * cover; return; }
        if (L === 3) { studio(2 * nz * nx, 2 * nz * ny, 2 * nz * nz - 1, s); mix3(out, C[0], s, cover); return; }
        if (L === 4) { mix3(out, C[0], col, cover); return; }
        mix3(out, C[0], body, cover);
      };
    },
    trail(K) {
      const { fbm3, pic, C, img, m, lat } = K, [k0, k1, k2] = K.k;
      const field = (x, y) => {
        const qx = x * 0.45 + k0[0], qy = y * 0.45 + k0[1];
        const wx = fbm3(qx, qy), wy = fbm3(qx + 3.1, qy + 7.7);
        const f = fbm3(qx + 2.6 * wx, qy + 2.6 * wy) * 0.9 + x * k1[0] + y * k2[0];
        return f + (pic(x, y) * 0.9 + x * 0.2 - f) * img;
      };
      const sp = k0[2], mid = Math.floor(field(0, 0) / sp), e = 0.0015, xs = [0, 0, 0];
      const xsec = (s, o) => {
        mix3(o, C[1], C[2], ss(0, 0.3, s)); mix3(o, o, C[3], ss(0.4, 1, s)); return mix3(o, o, C[4], ss(1, 1 + k1[3], s));
      };
      return (x, y, out) => {
        const f = field(x, y), fx = field(x + e, y), fy = field(x, y + e);
        const g = Math.max(Math.hypot(fx - f, fy - f) / e, 1e-3), u = f / sp, L0 = Math.floor(u);
        const glow = ss(1, 0, Math.hypot(x * 0.8, y));
        out[0] = C[0][0] + C[5][0] * glow; out[1] = C[0][1] + C[5][1] * glow; out[2] = C[0][2] + C[5][2] * glow;
        const W = k0[3] * (0.3 + 1.1 * ss(-0.35, 0.35, fbm3(x * 0.9 + k0[1], y * 0.9 + k0[0])));
        const aa = Math.max(k1[2], 1.4 / (m * W));
        let band = 0;
        for (let k = -1; k <= 1; k++) {
          const L = L0 + k, id = mod(3, N) * N + mod(L, N);
          const side = lat.gx[id] > 0 ? 1 : -1;
          const s = (u - L - 0.5) * sp / g * side / W;
          const keep = Math.max(lat.v[id] >= 1 - k1[1] ? 1 : 0, Math.abs(L - mid) < 0.5 ? 1 : 0);
          const a = ss(-aa, aa, s) * Math.exp(-Math.max(s - 1, 0) / k1[3]) * keep;
          if (a > 0) mix3(out, out, xsec(s, xs), a);
          band = Math.max(band, a);
        }
        if (K.layer) out[0] = out[1] = out[2] = band;
      };
    },
    ribbon(K) {
      const { fbm3, pic, img } = K, [k0, k1, k2] = K.k;
      const field = CPU.ribbonField(K);
      const lx = Math.cos(k1[1]), ly = Math.sin(k1[1]), ll = Math.hypot(lx, ly, 1.3), Lx = lx / ll, Ly = ly / ll, Lz = 1.3 / ll;
      const hl = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / hl, Hy = Ly / hl, Hz = (Lz + 1) / hl, e = 0.002;
      return (x, y, out) => {
        const f = field(x, y), gx = (field(x + e, y) - f) / e, gy = (field(x, y + e) - f) / e;
        const t = Math.min(1, Math.max(0, k2[2] + (f - k2[0]) * k2[1]));
        K.ramp(t, out);
        const nl = Math.hypot(gx * 0.05, gy * 0.05, 1), nx = -gx * 0.05 / nl, ny = -gy * 0.05 / nl, nz = 1 / nl;
        const spec = Math.pow(Math.max(nx * Hx + ny * Hy + nz * Hz, 0), k1[2]), sh = 0.82 + 0.3 * (nx * Lx + ny * Ly + nz * Lz);
        const gl = k1[0] * spec * ss(0.3, 0.7, t);
        for (let c = 0; c < 3; c++) { out[c] *= sh; out[c] += gl * (1 + (out[c] - 1) * 0.35); }
        if (K.layer) out[0] = out[1] = out[2] = t;
      };
    },
    ribbonField(K) {
      const { fbm3, pic, img } = K, k0 = K.k[0];
      return (x, y) => {
        const qx = x * k0[2] + k0[0], qy = y * k0[2] + k0[1], w = k0[3];
        const ax = fbm3(qx, qy), ay = fbm3(qx + 1.7, qy + 9.2);
        const bx = fbm3(qx + w * ax + 8.3, qy + w * ay + 2.8), by = fbm3(qx + w * ax + 4.1, qy + w * ay + 6.3);
        const f = fbm3(qx + w * bx, qy + w * by);
        return f + ((pic(x, y) - 0.5) * 0.9 + f * 0.3 - f) * img;
      };
    },
    glass(K) {
      const { fbm3, pic, C, img } = K, [k0, k1, k2, k3] = K.k;
      const surf = (x, y) => {
        const qx = x * k1[2] + k0[0], qy = y * k0[3] * k1[2] + k0[1];
        const wx = fbm3(qx, qy), wy = fbm3(qx + 4.7, qy + 1.9);
        let h = fbm3(qx + 0.8 * wx, qy + 0.8 * wy);
        const cx = x - k2[0], cy = y - k2[1], r = Math.hypot(cx, cy * 1.5), a = Math.atan2(cy, cx + 1e-5);
        if (k0[2] > 0.5 && k0[2] < 1.5) h = 0.32 * Math.sin(r * k2[3] - 4 * h) * (1 - Math.exp(-r * r / 0.03)) * Math.exp(-r * 0.8) + 0.3 * h;
        else if (k0[2] > 1.5) h = 0.45 * Math.pow(r + 0.003, 0.6) * Math.cos(3 * a + 2.5 * h) + 0.25 * h;
        return h + (pic(x, y) * 0.5 + h * 0.3 - h) * img;
      };
      const strip = (v, c, w) => ss(w, w * 0.35, Math.abs(v - c));
      const cs = Math.cos(k2[2]), sn = Math.sin(k2[2]), w = k1[3], e = 0.004;
      const room = (rx, ry, y, c) => {
        const v = ry * cs + rx * sn;
        return C[0][c] + (C[1][c] - C[0][c]) * ss(-k3[0], k3[0], ry - k3[1] * y)
          + C[2][c] * strip(v, 0.12, w) + C[3][c] * 0.85 * strip(v, -0.3, w * 0.7) + C[4][c] * 0.7 * strip(v, 0.45, w * 1.3);
      };
      return (x, y, out) => {
        const h = surf(x, y), gx = (surf(x + e, y) - h) / e, gy = (surf(x, y + e) - h) / e;
        for (let c = 0; c < 3; c++) {
          const k = k1[0] * (1 + k1[1] * (c - 1)), l = Math.hypot(gx * k, gy * k, 1), nx = -gx * k / l, ny = -gy * k / l, nz = 1 / l;
          out[c] = room(2 * nz * nx, 2 * nz * ny, y, c);
        }
        if (K.layer) out[0] = out[1] = out[2] = 0.5 + h;
      };
    },
    aurora(K) {
      const { fbm3, pic, img } = K, [k0, k1, k2, k3] = K.k;
      const form = (x, y) => {
        const wx = fbm3(x * 1.1 + k3[0], y * 1.1 + k3[1]) * k2[0], wy = fbm3(x * 1.1 + k3[1] + 4, y * 1.1 + k3[0] + 4) * k2[0];
        const qx = x + wx - k0[0], qy = y + wy - k0[1], f = k1[0];
        let v;
        if (f < 0.5) {
          v = 1 - ss(-k0[3] * 4.5, k0[3] * 1.25, qy - k0[2]);
          v *= 0.5 + 0.5 * ss(0.62, 0.25, Math.abs(qx));
        } else if (f < 1.5) {
          const core = Math.exp(-(qx * qx + qy * qy) / (k0[2] * k0[2]));
          const gx = qx - 0.55, gy = qy - 0.05, glow = 0.55 * Math.exp(-(gx * gx * 0.7 + gy * gy) / 0.45);
          v = Math.max(core, glow);
          const arc = Math.hypot(x + wx * 0.3 - k2[1], y + wy * 0.3 - k2[2]) - k2[3];
          v += (0.97 - 2.4 * Math.max(-arc, 0) - v) * ss(0.003, -0.003, arc) * k1[2];
        } else if (f < 2.5) {
          v = 0.45 + 1.1 * fbm3(qx * 0.8 + k3[0], qy * 0.8 + k3[1]) + 0.35 * (x - y);
        } else {
          const d = Math.hypot(qx * 1.25, qy * 0.8) - k0[2];
          v = 0.35 + 0.7 * fbm3(x * 0.7 + k3[1], y * 0.7 + k3[0]) + 0.25 * (y - x);
          v += (1 - v) * (1 - ss(-k0[3], k0[3] * 1.5, d));
        }
        return v + (pic(x, y) - v) * img;
      };
      const t = [0, 0, 0], ca = k1[3];
      return (x, y, out) => {
        const vr = form(x * (1 - ca), y * (1 - ca)), vg = form(x, y), vb = form(x * (1 + ca), y * (1 + ca));
        out[0] = K.ramp(vr, t)[0]; out[1] = K.ramp(vg, t)[1]; out[2] = K.ramp(vb, t)[2];
        if (K.layer) out[0] = out[1] = out[2] = vg;
      };
    },
  };

  // the ribbon's levels come from the plate itself: its median sits at the same place on the ramp for every seed
  function tune(name, P, lat, pic, W, H) {
    if (name !== 'ribbon') return;
    const K = kit(P, lat, pic, W, H), f = CPU.ribbonField(K), m = Math.min(W, H), v = [];
    for (let j = 0; j < 24; j++) for (let i = 0; i < 16; i++) v.push(f(((i + 0.5) / 16 - 0.5) * W / m, ((j + 0.5) / 24 - 0.5) * H / m));
    v.sort((a, b) => a - b);
    const q50 = v[v.length >> 1], q90 = v[Math.floor(v.length * 0.9)];
    P.k[2][0] = q50; P.k[2][1] = (P.k[2][3] - P.k[2][2]) / Math.max(q90 - q50, 1e-3);
  }

  function soft(name, w, h, P, lat, pic) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    const shade = CPU[name](kit(P, lat, pic, w, h)), m = Math.min(w, h), out = [0, 0, 0];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      shade((i + 0.5 - w / 2) / m, (j + 0.5 - h / 2) / m, out);
      const q = (j * w + i) * 4;
      d[q] = out[0] * 255; d[q + 1] = out[1] * 255; d[q + 2] = out[2] * 255; d[q + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  root.Mercury = {
    film: (c, o) => plate('film', c, o),
    trail: (c, o) => plate('trail', c, o),
    ribbon: (c, o) => plate('ribbon', c, o),
    glass: (c, o) => plate('glass', c, o),
    aurora: (c, o) => plate('aurora', c, o),
    webgl: () => !!gpu(),
    get last() { return last; },
    LOOKS, mulberry32,
    // for live.js: the plates' own GLSL and inputs, so the live shader is this shader, not a copy
    gpuParts: { PRELUDE, FRAG, N, WEIGHTS, SCALE, prepare, hash },
  };
})(typeof window !== 'undefined' ? window : globalThis);
