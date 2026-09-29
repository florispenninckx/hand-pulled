---
name: chrome-aurora
description: Design pages in the chrome aurora style of liquid light on black. A pool of mercury catches a warm lamp on one side and a cool one on the other, with oil-film bands in its fold. Paint trails are dragged across charcoal with a crisp front and a smeared tail. Glossy fluid swirls carry one hot colour. Strip lights on wet glass split into fringes. Soft aurora light sits out of focus. Each plate is shaded per pixel in WebGL, with a 2D fallback, grained, with tiny mono type in the corners. Use it for club nights, electronic and ambient releases, festivals and light installations, audio hardware, galleries, night events, fragrance or tech launches with a futurist edge. Also use it when the user asks for chrome, liquid metal, mercury, iridescent, holographic, oil-slick, thin-film, dichroic, wet glass, dispersion, chromatic aberration, aurora or lens-flare visuals, or for a hero that should be a lit surface rather than a mesh gradient. A live mode moves it for interfaces.
---

# Chrome aurora: liquid light on black

This is the look of a club night's wall projection or the sleeve of an ambient record. It
is black, and in it something liquid is lit. A pool of chrome pours in from a corner. The
faces turned to one lamp burn red and orange, the faces turned to the other go cobalt and
cyan, and the fold through the middle shows oil in thin stacked bands. Paint is dragged
across charcoal with a sharp violet front and an orange smear behind it. Cyan swirls hold
one red tongue each. Strip lights ripple on wet glass, and every highlight splits into a
warm fringe and a cool one. An amber slab of light, out of focus, falls into blue. Nothing
is a gradient someone picked. Every colour is a lamp caught on a surface, a film on that
surface, or the fringe a lens adds.

The files next to this SKILL.md:

- `assets/mercury.js`: `window.Mercury`, five seeded plates (`film`, `trail`, `ribbon`,
  `glass`, `aurora`) shaded per pixel in WebGL 1. They run on one shared hidden context,
  and a 2D fallback reads the same seeded lattice and pours the same plate. The file has
  no dependencies and uses no `ctx.filter`.
- `reference.html`: "Afterglass", a fictional four-night festival of light and low sound at
  a fictional glassworks. It has a full-bleed hero pour, four night posters, the hero
  taken apart pass by pass, a board of the other looks, lamp tokens and a programme.
  `?gl=0` forces the fallback. **Read it before designing.**

## The five plates

| Plate | Looks | What it shows | `Mercury.<plate>(canvas, opts)` |
|---|---|---|---|
| `film` | `oxide`, `titanium` | A pool of liquid chrome pouring into black from an edge. Faces turned to the warm lamp burn red, orange and yellow, and faces turned away go cobalt and cyan. The rim is a thin line of lamp light. The fold holds oil as parallel orange and blue sheets. `titanium` fills the frame with anodised cobalt, copper on the turned faces. | `layer: 'height' \| 'normal' \| 'light' \| 'film'` shows the passes |
| `trail` | `ember`, `dusk` | One to three strokes of paint dragged across a grainy ground. Each has a crisp coloured front, a core, and a tail smeared out behind it on one side. | |
| `ribbon` | `lagoon`, `coral`, `volt` | Slow glossy swirls of one colour through black, with one hot colour at their centres: cyan with red tongues, navy with coral, black with electric blue going yellow. | |
| `glass` | `pool`, `eye`, `pinch` | Strip lights reflected on a wet surface, every highlight split into a warm and a cool fringe. `pool` is grey water, `eye` is black chrome rippling round a still centre, `pinch` is petals of light meeting at a point. | |
| `aurora` | `ember`, `flare`, `rose`, `iris` | Light out of focus with lateral colour fringes. `ember` is an amber slab falling into blue and then black, `flare` a white flare in a red cloud cut by a hard arc, `rose` pink air, `iris` a periwinkle haze round a dark hole. | |

Every plate takes `width`, `height`, `seed`, `look`, `grain` (0 turns it off), `image`
(an `<img>` or canvas whose light and dark become the height of the liquid), `gl` (`false`
forces the fallback) and `resolution` (the share of the size the GPU renders before the
smooth upscale; the defaults are 1 for film and trail, 0.6 for ribbon and glass, 0.5 for
aurora). `Mercury.last` says which path drew the last plate (`'webgl'` or `'2d'`).
`Mercury.webgl()` says whether WebGL is there, and `Mercury.LOOKS` holds every look's
numbers.

## What makes it authentic

1. **Every colour is a reflection.** Each plate is a height field. Its slope gives a
   normal, and the normal reflects a studio: a dark ceiling, a warm lamp at one bearing, a
   cool lamp opposite, a thin strip light overhead. The black ground stays black because
   nothing there faces a lamp. That is why the colour bands bend round the folds and
   bunch up at the rim. A mesh gradient picks colour by position and cannot do that.
2. **The rim is a meniscus.** The pool's height rises steeply at its edge (a square root
   of the distance inside), so the edge turns every way at once and picks up a thin line
   of lamp light all round. Without it the pool looks cut out.
3. **Fringes are dispersion, a few per cent.** The normal is bent a little more for blue
   than for red (`disp` 0.07–0.18), so a highlight's edges split warm on one side and cool
   on the other, and flat areas stay clean. Shifting whole RGB channels is a glitch, not
   glass.
4. **The oil film is optics, and it stays in the fold.** Reflectance of a thin layer is
   computed from Airy's formula at sixteen wavelengths and weighted by the CIE colour
   matching functions. The oil only gathers where the surface creases, as stacked parallel
   sheets, so the rainbow is confined and ordered. A hue rotation across everything reads
   as a contour map.
5. **Liquid is big and slow.** The fields are three- to five-octave gradient noise, warped
   by itself once or twice, at low frequency: a few large shapes per frame that flow into
   each other. Fine marbling all over reads as generated.
6. **Trails have a front and a tail.** A trail is one level of a warped field, measured as
   a true distance so its width stays even. The front is crisp and the tail decays
   exponentially on one side only. Few and wide beats many and thin.
7. **Each seed keeps the same balance.** Ribbon ramps are placed from the field's own
   quantiles (sampled on the CPU first), so every seed shows about the same share of
   black, body colour and hot colour.
8. **Aurora is a lens.** The soft form is sampled once per channel at three slightly
   different scales, as a lens with lateral chromatic aberration would, so its edges
   fringe blue on one side and warm on the other. It is then mapped through a ramp that
   starts in black.
9. **Grain goes on last, at full resolution, strongest in the midtones.** Surfaces render
   at 50–100 % of the size and are upscaled smoothly. Grain added after that stays sharp
   and hides banding in the soft plates.

## Tokens

Page: ground `#050505`, type `#ebe7df`, a warm grey `#8b877e` for secondary text,
hairlines `#242220`, and one hot colour, lamp orange `#ff6a00`, for hover and a single
live dot. The page never adds a colour the plates do not already have.

| Look | Ground | Lamps and body | Hot |
|---|---|---|---|
| `film · oxide` | `#000000`, ceiling `#0a1640` | warm `#b0101c` → `#ff6a00`, cool `#0b24c8` → `#2f8cff` | the rim, lamp orange |
| `film · titanium` | cobalt `#0d2fb5`, ceiling `#020a3a` | warm `#6a1606` → `#f08a1e`, cool `#0b37f0` → `#2a7aff` | copper faces |
| `trail · ember` | charcoal `#1b1b1b` | front `#9a4dff`, core `#3b62ff` | tail `#ff5a1c` |
| `trail · dusk` | navy `#070b24` | front `#ff4f8a`, core `#39c6e8` | tail `#ff6a4a` `#ff3a3a` |
| `ribbon · lagoon` | `#020308`, `#0b2a4a` | `#3fa9cf` `#9fe0ee` | `#e2356b` `#ff2a48` |
| `ribbon · coral` | `#070a22`, `#111a4a` | `#26307a` | `#ff7157` `#ff2c52` `#ff7a6a` |
| `ribbon · volt` | `#020203`, `#03070f` | `#0b4fae` `#1c95ff` `#8fd6ff` | `#f4ee6a` |
| `glass · pool` | wall `#1b1f26` → `#8d939b` | strips `#f7e2bd` `#fff0da` `#d6e2ea` | none |
| `glass · eye` | `#030306`, `#14121b` | strips `#fff1dc` `#4aa3ff` | `#ff8a3a` |
| `glass · pinch` | `#050507`, `#0d0d14` | strips `#ffe9d8` `#3a7bd5` | `#f08a3a` |
| `aurora · ember` | `#000000`, `#0a2466` | `#2f96e0` `#f2dfb2` | `#f2a12e` `#d2560e` |
| `aurora · flare` | `#010403`, `#3a0806` | `#c8260e` `#f37a1c` `#fbe3c0` | white core |
| `aurora · rose` | `#b8185e` | `#e8307a` `#f569a0` `#f7a3c2` | `#f57a6c` `#f0503e` |
| `aurora · iris` | `#e2a6d6` | `#b9b9f4` `#9aa6f6` `#6d63ee` | hole `#4a2a7a` → `#1d0d1c` |

Type: one light grotesk and one mono. The reference sets Hanken Grotesk 300 for the
display word (9 vw, tracking −0.045em, white) and for body text at 15–17 px, and Martian
Mono 300–400 at 10–11 px for the masthead, captions, controls and poster corners, in caps
with tracking 0.06em for labels. Inter Tight or Space Grotesk can stand in for the
grotesk, and JetBrains Mono or IBM Plex Mono for the mono. Do not add a third face, and
never set type in chrome.

## Type

Specula is the skill's own display face. It is a variable font made by `tools/foundry.py` from an
OFL techno face, under the SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Specula** | A wide techno face with an inline: a channel cut along every stroke that widens and slides toward the light | `'SHEN'`: Glint 0, Regular 300, Polished 1000 (default 300) | The page headline in the black beside the plate, an event or product name, a big date |

```css
.head { font-family: 'Specula'; font-variation-settings: 'SHEN' 300; color: #ebe7df;
        font-size: clamp(44px, 8vw, 120px); line-height: 1; letter-spacing: .02em; }
```

- **The page keeps two faces.** Specula for the headline, Martian Mono for everything small
  (corners, captions, controls). Never set running text, ledes or corner type in Specula.
- **It is not chrome.** Set it flat in the off-white `#ebe7df` (or the one hot orange on hover).
  Never fill it with a gradient, `background-clip: text` or the plate itself; the sheen is the
  inline cut, and the ground shows through it. It never goes on a poster: posters keep their
  10 px mono in the corners.
- **The axis is the sheen.** 0 is a hairline glint, 300 the house look, 1000 a rim around an open
  core that needs 64 px or more to read. Keep one value per role. With live mode, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 300; }`, set
  `font-variation-settings: 'SHEN' var(--v)` and let `--v` follow the plate's light. Animate one
  element at most, and never under `prefers-reduced-motion`.
- **Glow is never text-shadow.** Light belongs to the plate. No halo, blur or glow on Specula.

Size, full Latin (Western European), `woff2`: Specula 55 KB (`font-display: swap`).

## Build it

```html
<figure class="plate"><canvas role="img" aria-label="…"></canvas>
  <span class="corner tl">Afterglass<br>I / IV</span><span class="corner br">Teodor Aske<br>live electronics</span>
</figure>
<script src="mercury.js"></script>
<script>
  const c = document.querySelector('.plate canvas'), r = c.getBoundingClientRect(), k = Math.min(1.5, devicePixelRatio);
  Mercury.trail(c, { width: r.width * k, height: r.height * k, seed: 4, look: 'ember' });
  // a photograph as the height of the liquid: Mercury.film(c, { width, height, seed, look: 'oxide', image: img })
  // the film plate's passes: layer: 'height' | 'normal' | 'light' | 'film'
</script>
<style>
  .plate { position: relative; aspect-ratio: 2 / 3; background: #000; margin: 0; }
  .plate canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .corner { position: absolute; font: 400 10px/1.45 'Martian Mono', monospace; color: #ebe7df; }
  .tl { left: 12px; top: 10px; } .br { right: 12px; bottom: 10px; text-align: right; }
</style>
```

- A plate is deterministic per seed. WebGL takes about 20–70 ms at 1440×900 (measured on
  headless Chrome's software GL). The fallback takes 100–300 ms at the same size, because
  it evaluates at up to 480 px on the long side and upscales.
- Render one plate per animation frame, top of the page first, as each comes within
  about 600 px of the viewport. Pour again only when a plate's width really changes:
  phones fire `resize` while scrolling. Cap the pixel ratio at 1.5, since the surfaces
  are soft and the grain reads right at that size.
- All plates share one WebGL context, so a page can hold dozens of them without hitting
  the browser's limit of about sixteen contexts. Nothing animates, so draw once when the
  inputs change, never per frame.
- In React, pour in `useEffect` on a canvas ref, keyed on seed, look and size.
- Test the fallback with `gl: false`, or `?gl=0` on the reference page.

## Composition

- The page is black and the plates are the only colour. Rules are hairlines in a warm
  dark grey, type is off-white, and one hot orange does hover and nothing else.
- The hero is one full-bleed pour. It enters from an edge or a corner and leaves the rest
  of the frame black, and the headline and lede sit in that black. Choose a seed whose
  black falls under the words (`another pour` until it does) instead of adding a scrim.
- Posters are the plate itself at 2 : 3, with type at 10 px in mono pushed into the four
  corners, the way a gig poster is set. There is no type in the middle of an image and no
  big title on a poster.
- Show the surfaces as objects: staggered portrait posters, a board of 3 : 2 tiles, one
  plate per idea. A row of the hero's passes (height, normal, studio, dispersion,
  finished) makes a good "how it is made" band.
- The display word is large, light, tight and white. It never uses chrome, gradient
  fills or glows.
- Controls are words in brackets: `[another pour]`, `[+ photograph]`. A photograph
  dropped on a plate becomes the height of its liquid, so a face or a window turns into a
  pour that still reads as the picture.
- Use fictional names and events, or the user's own. Never use a real brand's name, logo
  or campaign images.

## Tells that it was generated — avoid all of them

- Chrome or "liquid metal" lettering, bevelled Y2K type, or gradient-filled text.
- A CSS mesh, conic or radial gradient, or blurred blobs drifting behind a hero, standing
  in for a lit surface.
- A rainbow hue sweep over the whole surface, or contour-map bands of every hue. Oil
  lives only in the fold, and most of the plate is two lamps and black.
- An RGB split of the whole image. Dispersion is a few per cent and shows only where the
  light is.
- Thin, bright, jagged lines with a glow ("neon lightning"). Trails are wide paint with a
  tail.
- Busy high-frequency noise: marbling in every corner, more small shapes than large ones.
- Glassmorphism cards with `backdrop-filter` over the plate, glowing CTA pills, sparkle
  emoji, a centred headline over three cards.
- A navy or grey page ground where the board is black, or blacks lifted by a haze.
- A dark scrim or a heavy shadow to rescue type. A faint halo on 10 px corner type is
  fine, but move the words into the black for anything larger.

## Live

`assets/live.js` makes a plate move, for real interfaces and apps, and `assets/live-ui.js`
builds controls from it. Load them after `mercury.js`: they attach `Mercury.live` and
`Mercury.ui`. Both are classic scripts with no dependencies. They need WebGL2 and fall back
to the still plate without it.

**How it works (shader-native).** The still engine's own GLSL runs live. `mercury.js`
exports its shader parts (`Mercury.gpuParts`): the prelude, one fragment shader per plate,
and `prepare()`, which gives the same parameters, lattice and picture the still uses. It also
has three hooks that do nothing in the still. `live.js` compiles the plate as GLSL 3.00 into
two render targets at the still's internal size: the colour, and the plate's normal (film) or
height (the others). A second pass scales it up as the still's `drawImage` does, adds the
still's grain line by line with the same integer hash, then lays the motion on top.

- **Flow.** Every lattice gradient of the noise turns at its own rate, set by a spin stored
  in the lattice alpha, which the still leaves at 255. So the pour, the trails, the ribbon,
  the glass and the aurora forms all flow. On film the oil also slides along its fold.
- **Frame 0 is the still.** At flow 0 every spin and slide is zero, so frame 0 is the still.
- **Bands.** Big fields (a full-screen film is 5.2 MP) are redrawn in bands of rows, about
  1.3 ms a frame. They are drawn as keyframes: the next one is laid band by band while the
  view crossfades between the last two, so no band meets a band from another moment.
- **Grain.** The fine grain re-rolls 24 times a second, and the coarse clumps stay put.
- **Nothing is captured** on the GPU path. The CPU fallback draws the still.

The motion is liquid metal:

| motion | input | what it does | options |
|---|---|---|---|
| **sheen** | pointer (lagged) | A lamp is held over the pointer and mirrored by the captured normals. The highlight slides over the folds, tinted by the metal under it. | `pointer` (0..1, 0.9), `radius` (share of the short side, 0.55), `lag` (s, 0.12), `hand` (element that takes pointer events; default the canvas's parent) |
| **ripple** | click/tap, `pulse()` | A ring spreads out and slows down in the mercury. It bends the normals, the plate is re-sampled through them, and a crest catches the light. Up to 4 at once. | `clickPulse` (true) |
| **aurora** | time | Three hues drift slowly across the chrome and are screened onto its highlights. They fade in over the first seconds. | `drift` (0..1, 1), `speed` (1), `hues` (three hex, `['#35f0c8', '#7b5cff', '#ff4fa0']`) |
| **flow** | time | The surface itself pours: the noise under the mercury turns slowly, so folds travel, pools swell and the oil slides in its fold. A slow pour, about a fifth of a radian in 4 s. | `flow` (0..1, 1), `speed` (1), `bands` (0 = automatic) |
| **grain** | time | The still's grain, with its fine scale re-rolled per tick and its coarse clumps fixed. | `grainRate` (per s, 24; 0 freezes it) |
| **tilt** | scroll | The reflected room tilts as the canvas moves through the viewport, measured from where it sat on its first frame. | `tilt` (1) |
| level | hover, scroll | The brightness of the whole plate, eased. `rise: true` brings it up out of black the first time the view scrolls in. `scroll: true` ties it to the view's position. | `level` (1), `rise`, `riseMs` (1400), `scroll`, `ease` (s, 0.16) |
| fill | value | The plate is polished between `from` and `to` (0..1 across) and dull and unlit outside. Sliders, switches and progress use it. | `fill: [from, to, soft]` (null) |

Still options are the plate's own: `plate` ('film' | 'trail' | 'ribbon' | 'glass' |
'aurora'), `look`, `seed`, `grain`, `image`. Setting them rebuilds the field. Two options
belong to the field itself. `zoom` (280 device px): a canvas whose short side is smaller,
or that is longer than 2:1, sees a window onto the middle of a bigger plate, so a 36 px
button shows one smooth fold instead of a whole pour shrunk down. `resolution` (1) is the
share of the device size, with DPR capped at 2 and the field capped at 5.3 MP, so a
1440×900 view at DPR 2 runs at full size.

```js
const ctl = Mercury.live(canvas, { plate: 'film', look: 'oxide', seed: 7,   // still options
                                   drift: 1, pointer: 0.9, tilt: 1 });       // motion options
ctl.set({ level: 0.6 });       // motion options ease; still options rebuild the field
ctl.load({ plate: 'glass', look: 'eye' });   // a new plate, motion options kept
ctl.pulse(x, y, 0.8);          // a ripple at CSS px of the canvas
ctl.point(x, y); ctl.point(null);            // hold the lamp yourself, or put it down
ctl.pause(); ctl.resume(); ctl.destroy();
ctl.state();   // { mode: 'gpu'|'still', path: 'own'|'bitmap'|'copy'|'cpu', frames, visible, expose, clock, size, ready, reduced }
ctl.seek(12);  // jump to 12 s of motion, the whole field redrawn (stills of the motion, tests)
ctl.bench(60); // { sync, pipelined, field, bands, size, fieldSize, path } in ms, every term on
Mercury.live.parity({ plate: 'glass', look: 'eye', seed: 3 });   // frame 0 vs the still
```

**UI pieces** (`Mercury.ui`). Each one keeps the native control. The canvas sits behind it
with `aria-hidden`, and every function returns the controller (or `{ ctl, … }`).

| piece | call | behaviour |
|---|---|---|
| live background | `ui.background(section, opts)` | Film · oxide. The lamp follows the pointer, clicks ripple, the aurora drifts and scrolling tilts the room. |
| button | `ui.button(btn, opts)` | Black chrome (glass · eye). Dim at rest (`rest` 0.55). On hover or `:focus-visible` it brightens (`hover` 1) and the lamp follows the pointer. A press, Enter or Space drops a ripple. |
| card | `ui.card(el, opts)` | Rises out of black the first time it scrolls in, then drifts. The lamp follows the pointer. |
| toggle | `ui.toggle(checkbox)` | Wraps the checkbox in a track and adds `role=switch`. The half the thumb sits on is polished. Flipping slides the polish across and ripples. |
| slider | `ui.slider(range)` | Wraps the range. The strip is polished up to the value. |
| progress | `const p = ui.progress(el); p.set(0.4)` | `role=progressbar` with `aria-valuenow`. Polished up to p, and it ripples when it reaches 1. |
| loader | `const l = ui.loader(el); l.stop()` | `role=status`. A chrome bead with a lamp circling over it. It holds still under reduced motion. |
| focus ring | `ui.focusRing()` | One ring for the page: a band of drifting chrome cut out with a CSS mask round whatever has `:focus-visible`. Keep a 1px CSS outline as well, for the fallback and for forced colours. |
| section transition | `ui.transition(strip)` | A strip of aurora light (aurora · ember) that brightens out of black as it scrolls up, with its reflection tilting. |
| icon | `ui.icon(span, 'lightbulb')` | An icon poured in chrome. `Mercury.iconMask(svg)` casts the SVG white on black, and that becomes the height of a film plate, so the icon is a pool of metal in its shape with oil in its folds, screen-blended. The span sets the size. Its button or label raises the lamp. `ui.ICONS` has 15 Phosphor Light icons (MIT, inlined, generated from the package, not typed). Any SVG string with `<path d>` works too. |

A minimal page (copy it, then change the plate, look and the pieces):

```html
<section id="hero" style="position:relative;height:80vh;color:#ebe7df">
  <h1 style="position:absolute;left:24px;bottom:24px;font:300 72px/0.9 sans-serif">Night shift</h1>
</section>
<button id="go" style="background:#000;color:#ebe7df;border:1px solid #444;border-radius:999px;padding:12px 22px">Go</button>
<input type="checkbox" id="on"> <input type="range" id="lvl" value="60">
<script src="assets/mercury.js"></script>
<script src="assets/live.js"></script>
<script src="assets/live-ui.js"></script>
<script>
  const ui = Mercury.ui;
  ui.background(document.getElementById('hero'), { plate: 'film', look: 'oxide', seed: 7 });
  ui.button(document.getElementById('go'));
  ui.toggle(document.getElementById('on'));
  ui.slider(document.getElementById('lvl'));
  ui.focusRing();
</script>
```

Keep label text on chrome controls light, with a dark `text-shadow`. Chrome is bright in
places and dark in others, and the shadow is what keeps a label readable on both.

**Fallbacks.**
- `prefers-reduced-motion`: the still frame, clock 0, no lamp, no ripples, no drift, no tilt.
  `set()` jumps straight to its target, and a view draws only when something changed. The
  engine listens for the setting to change.
- No WebGL2, or the shader fails: the still plate from `mercury.js`, with level and fill
  applied as flat darkening. It changes state but does not animate. A lost context is
  rebuilt on `webglcontextrestored`.
- Offscreen: an IntersectionObserver pauses the view, and `visibilitychange` stops the one
  shared rAF loop. A paused view still draws its first frame.
- Contexts: canvases of 0.9 MP or more get their own WebGL2 context. Smaller ones share one
  OffscreenCanvas context and get their frames through `transferToImageBitmap`. Pass
  `own: true | false` to override.

**Parity** (frame 0 of the live shader against the still, 480×320 and 320×400, Chrome,
28 Sep 2026). Film is drawn at the still's own size and matches exactly. Glass, ribbon and
aurora are drawn at 0.6 or 0.5 scale and scaled up, where the GPU's bilinear filter and the
2D canvas's differ by about half a level. `check.sh` measures it on every run:

| case | dMean | dSdRel | dGrainRel | MAD (levels) | within 2 |
|---|---|---|---|---|---|
| film · oxide · 7 | 0 | 0 | 0 | 0 | 100 % |
| film · titanium · 5 | 0 | 0 | 0 | 0 | 100 % |
| glass · pool · 2 | 0.0003 | 0.0012 | 0.0016 | 0.52 | 88.6 % |
| glass · eye · 3 | 0.0001 | 0.0019 | 0.0050 | 0.53 | 89.4 % |
| ribbon · volt · 5 | 0.0001 | 0.0004 | 0.0001 | 0.16 | 97.2 % |
| trail · ember · 4 | 0 | 0 | 0 | 0.03 | 99.9 % |
| aurora · iris · 2 (320×400) | 0.0001 | 0.0008 | 0.0001 | 0.03 | 100 % |

Tolerance: `Mercury.live.TOLERANCE` = dMean 0.004, dSdRel 0.02, dGrainRel 0.03, MAD 1.5.

**Performance** (`ctl.bench(60)`, Chrome, M1 Pro, 1440×900 CSS = 2880×1800 device px, own
context, every term on, best of 3 runs; the machine was loaded with parallel lanes, load
average 30–50, 28 Sep 2026). Budget ≤ 4 ms per frame:

| plate | pipelined (ms) | sync (ms) | whole field (ms) | bands |
|---|---|---|---|---|
| film · oxide | 2.57 | 3.5 | 21.9 | 17 |
| glass · pool | 2.32 | 3.2 | 5.0 | 4 |
| ribbon · volt | 2.39 | 3.3 | 7.9 | 6 |
| aurora · ember | 2.38 | 6.3 * | 3.4 | 2 |

\* One noisy sync run. The pipelined number is the frame cost.

A frame is one band of the field plus the composite, which costs about 1.3 ms. A new view
pays for one whole field on its first frame. `bands` (0 = automatic) trades how often each
row is redrawn against the frame cost. Headless Chrome renders WebGL in software, so
measure in real Chrome.

**Still vs live.** Everything evolves on the GPU path: the field of all five plates flows,
the film's oil slides, the grain is alive, and the sheen, ripples, aurora drift, scroll tilt,
level and fill sit on top. Nothing is captured. The studio's lamps themselves stay where the
look puts them. Moving them (a `lamp` option on `set()`) is the natural next step.

**Optional extra: custom cursor.** `ui.cursor(area, { mark, hover })`, only when the brief asks for one; the system cursor is the default. A native CSS cursor painted once through the still engine at 32 px (1x and 2x); `hover: true` gives links and controls a second mark.
Mark: `arrow` (default). It returns `{ destroy() }`, which puts the previous cursor back.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each plate,
and put them next to the reference images.

- [ ] Each plate reads as a lit surface (metal, paint, glass or light) and not as a
      gradient.
- [ ] The ground is black. Colour appears only where a lamp is caught.
- [ ] Fringes sit on highlights only, and the oil film only in the fold.
- [ ] Grain is visible at 100 % and there is no banding in the aurora plates.
- [ ] The same seed gives the same plate, `another pour` gives a new one, and a dropped
      photograph becomes the height.
- [ ] `Mercury.last === 'webgl'` in headless Chrome, and `gl: false` (`?gl=0`) pours the
      same plates through the fallback.
- [ ] There is no horizontal scroll on a phone and there are no console errors.
- [ ] Live pages: `tools/check.sh` section 5 passes, which covers moving, parity and the
      reduced-motion hold, and `ctl.bench(60)` in real Chrome stays under 4 ms.

## Credits and prior art

This is an original implementation. The height fields, studio, strip-light room, thin
film, trails, ramps, lens model and grain were written for `mercury.js`, and no shader,
code or image was copied. Reviewed for ideas, with thanks:

- ruucm/shadergradient: a single shaded, grained surface can carry a whole hero. The
  repository has no licence file, so only the idea was taken and no code.
- paper-design/liquid-logo (PolyForm Shield 1.0.0): reflection bands on a liquid surface
  and refracting each colour channel separately. Only the ideas were taken, no code.
- dashersw/liquid-glass-js (MIT): displacing a lookup by a height field's slope to fake
  refraction, which the glass plate uses for its room reflection.
- pmndrs/react-three-fiber (MIT): render on demand, drawing when inputs change instead of
  every frame.
- pmndrs/postprocessing (Zlib): chromatic aberration as a per-channel sample offset, and
  grain added as the very last pass.
- Chris Wyman, Peter-Pike Sloan and Peter Shirley, "Simple Analytic Approximations to the
  CIE XYZ Color Matching Functions" (JCGT, 2013): the weights for the thin film.
- Inigo Quilez's article on domain warping: fractal noise warped by fractal noise.
- Airy's thin-film reflectance and the meniscus are textbook optics and physics.

The visual reference was Floris Penninckx's "Chrome Aurora" Pinterest board of liquid
chrome, oil-slick, wet-glass and aurora images, used as reference only. None of its
images are used or included.
