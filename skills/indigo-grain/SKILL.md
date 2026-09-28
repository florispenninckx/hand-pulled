---
name: indigo-grain
description: Design pages, prints, covers and small-type posters where grain is the medium and everything stays in one blue family — cobalt dissolving into white, navy sinking into black with a light form glowing out of it, pale photogram flowers on navy, soft blurred butterflies and moths, sun-bleached cyanotype photographs with brushed edges, marbled paper, ink spray, halftone screens, all soft-focus and made of dense stochastic film-like grain. Use when the user asks for cyanotype, sun print, Prussian or indigo blue, a photogram, grain gradients, grain/noise as the actual image rather than a filter, marbling in blue, a blue mood board, or a moody blue-violet editorial, cover or poster. It also runs live on the GPU, for moving backgrounds and interface pieces.
---

# Indigo grain

A cyanotype is a sheet brushed with iron salts, laid in the sun with something on top
of it, then washed: where light reached the paper it turns Prussian blue, where an
object blocked it the paper stays pale. This skill keeps that one physical idea — light
exposure mapped to a blue-family ramp — and widens it to everything else a blue board
collects: grain gradients where a light form rises out of navy-black, butterflies that
moved while the shutter was open, sun-printed photographs of skies and towers, marbled
paper, ink spray, a halftone seen under a loupe, and a poster with a line of small type.

What holds it together is not a subject but four things: one hue family, grain so dense
it is the image rather than a texture on it, soft focus, and sheets that are nearly
all image.

The files next to this SKILL.md:

- `assets/cyanotype.js` — `window.Cyanotype`: one grain-and-palette compositor
  (`compose`) and everything built on it. `field`, `print`, `tone` and `develop` turn a
  density field into grain; `relief`, `halo`, `marble` and `caustics` make the fields the
  board keeps coming back to; `stipple` and `screen` draw spray and halftone.
- `assets/botanica.js` — `window.Botanica`: subjects drawn white-on-black as an exposure
  mask. Flowers (`nerine`, `trumpet`) are modelled in 3-D and projected flat, so petals
  foreshorten the way a photographed flower does. `profile` is a head in profile.
  `butterfly` draws a butterfly or a moth. `sky` and `towers` paint whole photographs
  (heaped clouds with a pine, towers seen from below) for sun prints.
- `reference.html` — the board itself as a page: 21 live sheets dealt into a masonry
  wall, then two posters with small type. Two sheets take a photograph of your own.
  **Read it before designing**; every recipe on it is a starting point you can copy.

## The board, family by family

| On the board | Engine | Sheet on the page |
|---|---|---|
| a grainy cobalt field dissolving into white paper | `field`, palette `cobalt` | cobalt field |
| navy sinking into brown-black, one glow in a corner | `develop`, palette `dusk` | dusk |
| a lit silk surface: cobalt flanks, peach where the light lands, olive-black sky | `relief`, palette `ridge` | ridge, swell |
| a cream light pressing in from one edge, a thin fringe, a black band | `halo`, palette `eclipse` | eclipse |
| a violet-pink glow on near-black | `field`, palette `nightglow` | night glow |
| an orb of particles on black, spraying at its edge | `develop` + `stipple`, ink `orb` | orb |
| a pale butterfly on ultramarine, blurred by its own movement | `print` layers with `smear`, `Botanica.butterfly` | wing, moving |
| blue moths printed on pale sky; ghost moths in dark teal | `print` positive / negative | moths, moths night |
| a small butterfly over a sea horizon and its dim double | `print` with a function `bg` | horizon |
| ultramarine ink sprayed on paper | `stipple`, ink and ground `spray` | spray |
| a coarse halftone screen bent over folds | `screen` | screen |
| marbled paper: a navy river through lace; streaked washes | `marble`, `kind: 'river'` / `'wash'` | marbled, river / wash |
| sun-bleached photographs: skies, a pine, towers, burnt-out highlights, brushed edges | `print` with `Botanica.sky` / `towers`, `levels`, `brush`; `tone` for a real photo | sky, towers, brushed |
| cyanotype botanicals: spider lily, trumpet lilies, a printed profile | `print` with `nerine`, `trumpet`, `profile` | lily, lilies, profile |
| posters with small type: stippled islands on cobalt tiles; a band of pool light | `develop` + `stipple`; `caustics` | the two posters |

## What makes it authentic

1. **Grain is the medium, not a filter.** It is generated per pixel as a perturbation of
   where a value lands on the colour ramp (`compose` nudges `t` before sampling the
   palette), never as RGB jitter and never as a flat opacity overlay. That keeps every
   speck inside the hue family, and it is dense enough to see at 100% zoom, layered at
   three block scales (1×1, 2×2, 4×4) so it never reads as one repeating dither.
2. **One hue family, with its edges named.** Everything lives between white paper,
   ultramarine, cobalt, cyan and near-black. The family reaches teal at one edge
   (`deepwater`, the night moths) and violet-pink at the other (`nightglow`), and its
   blacks may lean olive (`ridge`) or brown (`dusk`). Cream, peach and a thin
   yellow-green fringe appear **only as light**: the lit side of a relief, the core of an
   eclipse. They are never a ground and never a second accent colour.
3. **Soft focus, not sharp edges.** Every subject is built from a blurred exposure mask
   (`focus` is a small contact blur, `haze` a large one, `soft` mixes them). A moving
   subject is smeared along one axis first (`smear`). Several depths are separate
   `layers`, one sharp and the rest hazy — that is a real depth of field, not a blur
   filter over everything.
4. **Polarity is a physical choice.** An object that blocks light stays pale where it
   sat (`polarity: 'negative'`: the lilies, the ultramarine butterfly) or prints as ink
   on paper (`'positive'`: the profile, the moths on pale sky, with grain gathered in a
   band at the edge). Check which side should stay pale before picking a palette.
5. **Sun prints fail in the highlights.** A sun-printed photograph has no true black and
   its brightest parts burn out to paper; `levels: [0.1, 0.9]` does that. The coat was
   brushed on by hand, so `brush` leaves a ragged, streaky rectangle with paper outside
   it. These two, not a blue tint, are what make a photograph read as a cyanotype.
6. **Nearly all image, and type only where the board has it.** A sheet carries at most a
   one-word name. Posters are the exception the board makes: small uppercase grotesque
   set on the image, a wide-tracked title, a list, a hairline rule, and no box behind
   any of it.

## Tokens

`Cyanotype.PALETTES`, each `{ ground, stops: [[t, hex], ...] }`. Print palettes run
pale → ink as `t` rises, so `polarity` behaves predictably in `print()`; light-form
palettes run dark → light, because there `T` is the light itself.

| Palette | `t = 0` | `t = 1` | Runs | Used for |
|---|---|---|---|---|
| `cobalt` | `#ffffff` | `#1c7fc4` | pale → ink | the grainy cobalt field |
| `paperblue` | `#faf9f4` | `#1d2586` | pale → ink | printed profile, ultramarine on paper |
| `navy` | `#c4cbf2` | `#2c3c8c` | pale → ink | spider-lily photogram on navy |
| `lily` | `#f5f2fb` | `#0a1740` | pale → ink | trumpet lilies, a toned photograph |
| `ultramarine` | `#e8e7df` | `#1c328c` | pale → ink | the moving butterfly |
| `sky` | `#8cc4fd` | `#093f96` | pale → ink | moths printed on pale sky |
| `deepwater` | `#a9c4dc` | `#061a30` | pale → ink | ghost moths in dark teal |
| `horizon` | `#e2f0f4` | `#0d58ba` | pale → ink | a sea horizon |
| `sunprint` | `#f3f5f8` | `#123c8e` | pale → ink | sun-bleached photographs |
| `marble` | `#fbfdfd` | `#172f6c` | pale → ink | marbled paper |
| `spray` | `#eff0f4` | `#1b2699` | pale → ink | ink spray and its paper |
| `screen` | `#dfe8f5` | `#131c44` | pale → ink | the halftone |
| `pool` | `#e3ebea` | `#2b3555` | pale → ink | pool-light poster |
| `island` | `#4aa2e2` | `#0a1120` | pale → ink | islands poster ground |
| `ridge` | `#0d1209` | `#f8e9e3` | dark → light | the lit relief |
| `eclipse` | `#03031a` | `#fffbf2` | dark → light | the halo, with its fringe at 0.8–0.9 |
| `nightglow` | `#06060c` | `#faeef8` | dark → light | violet-pink glow |
| `dusk` | `#0a0a0b` | `#a6d8f0` | dark → light | navy into brown-black |
| `orb` | `#4a4aa6` | `#a4def0` | dark → light | orb particles (a stipple ink) |

Any function also takes a palette object of your own, `{ stops: [...] }`.

Type: 'Fraunces' italic for the wordmark and sheet names, 'Space Mono' for the small
controls and one line of intro, 'Archivo' (400/500, uppercase) on posters only. Sheet
names take their ink from the pixels under them: navy on pale, near-white on dark, with
a faint halo of the other.

## Composition

- **One idea per sheet.** Never put a glow, a photogram and a marble on one canvas.
  Many sheets side by side is fine — the board itself is a wall — but each sheet is one
  exposure.
- **The wall**: portrait sheets of mixed height (1:1 to 1:1.5), thin 6px gutters on a
  paper ground, dealt into shortest-column masonry (5 columns at desktop width, 2 on a
  phone), dark and pale sheets alternating so no column is all night.
- Let subjects bleed off the edge: a butterfly cut by the frame, stems running off the
  bottom, a profile cropped. A centred subject with margin all round looks placed.
- Grain density and softness do more work than colour variety. If a sheet looks plain,
  raise `grain`, change `soft`/`haze`, add a second dimmer layer — not a second hue.
- **Posters**: A-series proportions, type in `cqw` so it scales with the sheet. The
  image fills the sheet; the type sits on it in white or pale blue: a small line across
  the top, a title, a two-column list low down, a rule of ticks. Every name is invented.

## Type

Display type uses the skill's own faces in `fonts/`. They are made by `tools/foundry.py` from OFL
fonts, under the SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis | Use it for |
|---|---|---|---|
| **Sunprint** | letters laid on cyanotype paper and exposed; strokes swell and pool as the light creeps under | `'EXPO'` 0–1000, default 300 (Contact 0, Regular 300, Long 1000) | titles, section heads, one big word over a field |
| **Sunprint Halo** | the halation alone: a soft swollen ghost with a grainy edge | static | set it behind Sunprint at the same size and tracking (the advances match), in a paler ink of the ramp |

```css
.title      { position: relative; font-family: 'Sunprint'; font-variation-settings: 'EXPO' 300; }
.title::before { content: attr(data-text); position: absolute; inset: 0; font-family: 'Sunprint Halo';
                 color: var(--pale); opacity: .55; z-index: -1; }
```

- Use it for display type only. Facts, captions and running text stay in the page's sans or mono.
- The axis is the exposure. Keep one value per role. With live mode, tie `EXPO` to the section's
  develop progress (register `@property --expo` and animate it), animate one element at most, and
  never under `prefers-reduced-motion`.
- Never give the glow with a CSS text-shadow: the halo is the Halo face or the engine's own light.

## Build it

Copy both engines into the project. They are dependency-free classic scripts that set
`window.Cyanotype` and `window.Botanica`, and draw with 2D canvas only (no WebGL, no
`ctx.filter`). For moving versions and interface pieces, see "Live" below.

```html
<canvas id="a"></canvas><canvas id="b"></canvas><canvas id="c"></canvas>
<script src="cyanotype.js"></script>
<script src="botanica.js"></script>
<script>
  const C = Cyanotype, B = Botanica, w = 600, h = 900;

  // a photogram: draw the mask in `objects`, white = opaque, grey = translucent
  C.print(document.getElementById('a'), {
    width: w, height: h, seed: 3, palette: 'navy', focus: 0.05, haze: 0.1, soft: 0.16, grain: 0.5,
    objects: (ctx, w, h, rand) =>
      B.nerine(ctx, rand, { x: w * 0.5, y: h * 1.03, tx: w * 0.6, ty: h * 0.26, size: w * 0.2 }),
  });

  // a butterfly that moved: a smeared, hazy layer and a small sharp one
  C.print(document.getElementById('b'), {
    width: w, height: h, seed: 5, palette: 'ultramarine', grain: 0.9, layers: [
      { objects: (x, W, H, r) => B.butterfly(x, r, { x: W * 0.92, y: H * 0.5, size: W * 0.62, angle: -1.3, open: [0.55, 1] }),
        focus: 1.6, haze: 1, soft: 0.35, smear: [0.022, 0.006] },
      { objects: (x, W, H, r) => B.butterfly(x, r, { x: W * 0.18, y: H * 0.9, size: W * 0.13 }),
        focus: 0.3, haze: 0.4, soft: 0.2 },
    ],
  });

  // a sun-bleached photograph with a brushed coat
  C.print(document.getElementById('c'), {
    width: w, height: h, seed: 8, palette: 'sunprint', focus: 0.25, haze: 0.4, soft: 0.12, grain: 1.2,
    objects: (x, W, H, r) => B.sky(x, r, { w: W, h: H, tree: 'right' }),
    levels: [0.12, 0.88], brush: 0.07,
  });
</script>
```

### Cyanotype

- `field(canvas, { width, height, seed, palette, softness, grain, coarse, pools })` sums
  warped gaussian `blob` and line `band` pools into a field and grains it. Pass `pools`
  (canvas px) to place the light yourself; omit it for the defaults per palette.
- `print(canvas, { width, height, seed, palette, polarity, focus, haze, soft, grain, coarse, objects | layers, bg, bgDither, accents, levels, brush })`
  - `objects(ctx, w, h, rand)` paints white/grey on a black mask, which is blurred
    (`focus`, `haze`, `soft`) and mapped to the ramp by `polarity`.
  - `layers: [{ objects, focus, haze, soft, smear, mode }]` draws and blurs each layer on
    its own and screen-blends them; `mode: 'multiply'` darkens instead (stems and leaves
    in shadow). `smear: [sx, sy]` (fractions of the short side) is a directional blur
    first: movement, a long exposure.
  - `bg`: with `positive`, an ink density behind the subject, `{ from, to }` or
    `(u, v) → 0..1`, with `bgDither` for specks instead of a tint. With `negative`, a
    function only: the ground takes its density and the subject stays pale over it (a
    sky over a sea horizon).
  - `coarse` (0..~1) adds hard stochastic grain only where the field changes fast.
  - `accents: [{ x, y, r, a }]` is a faint lilac wash after grain, for a bloom's throat.
- `tone(canvas, image, { ..., focus, haze, soft, grain, gamma, levels, brush })` runs a
  photograph through the same pipeline. With `palette: 'sunprint'`, `levels` and `brush`
  it becomes a sun print of that photograph.
- `develop(canvas, T, { width, height, seed, palette, grain, levels, brush })` grains any
  `Float32Array` field of your own through a ramp. Most new sheets start here.
- `relief(canvas, { seed, palette, horizon, light: [x, depth, up], focus, lines, warm, swells })`:
  a height field scanned column by column from the near edge back, each depth row drawn
  where it rises above everything nearer, so each row leaves a hairline — the fine
  stacked contours on a lit silk surface. Depth of field blurs the near and far rows.
- `halo(canvas, { seed, x, y, r, angle, point, warp })`: a light pressing in from one
  edge, with the `eclipse` ramp's fringe at its rim.
- `stipple(canvas, D, { ink, lo, hi, sizes: [fine, 2×2, dot], gamma, ground, wash })`
  scatters specks by density `D` over whatever is on the canvas already; with `ground`
  it first develops `D` itself as a soft wash (spray on paper).
- `screen(canvas, L, { cell, angle, warp, round, palette, grain })`: one pale rounded
  cell per screen cell, its size from brightness `L`, on a slowly bent lattice.
- `marble(canvas, { seed, kind: 'river' | 'wash', ops, ground, lace, rim, wash, bleed, granulate, res })`:
  marbled paper solved backward. Each tool stroke (drop, comb, wave, swirl, noise
  `shear`) is an exact inverse map, so every pixel is traced back through the strokes to
  the ink it started in. The lace texture is read *before* deformation, so the strokes
  comb it into veins. `ops` replaces the auto recipe for your own sequence.
- `caustics(w, h, seed, { cell, squash, warp, width, second }) → Float32Array`: pool
  light as two warped cellular webs laid over each other. Feed `1 − L` to `develop`.
- `blur(src, w, h, rx, ry)`, `brushMask(w, h, seed, margin)`, `PALETTES`, `ramp`,
  `mulberry32`, `noise`, `fbm`, `hash2` are exported for building new sheets.

### Botanica

- `nerine(ctx, rand, { x, y, tx, ty, size, florets })`: a spider-lily stem from `(x, y)`
  (below the frame) to an umbel at `(tx, ty)`, 6–8 florets with crisped recurved tepals.
- `trumpet(ctx, rand, { x, y, size, angle, tilt, shade })`: one trumpet lily; returns its
  throat `{ x, y, r }` for an `accents` wash.
- `profile(ctx, rand, { x, y, scale, hair, volume, mirror })`: a head in profile looking
  right, `(x, y)` at the crown, running off the bottom of the frame.
- `butterfly(ctx, rand, { x, y, size, angle, open: [left, right], moth, scallop, shade })`:
  fore and hind wings as closed Catmull-Rom outlines, `open` foreshortens each side (1 is
  flat to the lens), `moth` gives broader wings and thick antennae. `shade` sets the
  mask grey of `root`, `wing`, `edge`, `body`; `vein` and `spot` darken when positive
  and lighten when negative.
- `sky(ctx, rand, { w, h, tree: 'left' | 'right' | false, clouds })` and
  `towers(ctx, rand, { w, h, count })` paint luminance over the whole mask, a
  photograph rather than a cut-out, so print them with `polarity: 'negative'`.
- `leaf`, `stem`, `ribbon`, `walk`, `bloom` are the primitives underneath.

Most sheets render in 70–200 ms at 600×900; `marble` takes under a second. Render once
per change or per "another" click, never per frame. On a wall, render lazily as sheets
come into view, one at a time, at `devicePixelRatio` capped at 2.

## Live

`assets/live.js` runs the same pipeline on the GPU, moving, for real interfaces: WebGL2
fragment shaders port the field, then compose() line by line (same integer hashes, block
scales, blotch, coarse gate, edge band and weave), then the palette ramp as a texture.
`assets/live-ui.js` builds interface pieces on it. Both are classic scripts with no
dependencies; load them after `cyanotype.js` (and `botanica.js` for photograms).

```html
<script src="cyanotype.js"></script><script src="botanica.js"></script>
<script src="live.js"></script><script src="live-ui.js"></script>
<script>
  const ctl = Cyanotype.live(canvas, {
    mode: 'field', palette: 'cobalt', seed: 7, grain: 1.2, coarse: 0.85,   // still options
    drift: 1, pointer: 0.3, develop: 'in', clickPulse: true,               // motion options
  });
  ctl.set({ develop: 0.4 });   ctl.pulse(x, y);   ctl.pause();   ctl.resume();   ctl.destroy();
</script>
```

**Still options** are the ones of the matching still function (`field`, `halo`, `caustics`,
`print`, `tone`, `relief`, `marble`, `screen`, `develop`), plus `mode`. For caustics the web
line width is `line`, since `width` and `height` are the canvas size. **Motion options**
never recompute the field:

| option | default | what it does |
|---|---|---|
| `drift`, `speed` | 1, 1 | light drifting like water under glass: a slow warp of T and a travelling glint |
| `pointer`, `radius`, `lag` | 0.18, 0.22, 0.35 | a pool of light trailing the pointer, stretched along its motion, like a hand over the print; `hand` is the element that listens (default: the parent) |
| `develop` | 1 | exposure, 0–1 (0 is unexposed paper); `'in'` develops once when first on screen over `developMs` (2600); `'scroll'` follows the section through the viewport over `scrollRange` |
| `ease` | 0.18 | how fast set() targets are reached |
| `alive`, `grainRate` | true, 24 | grain re-rolled like film: fine grain, 2×2 blocks, coarse speckle and jitter re-seed 24 times a second; the 4×4 clumps and blotch stay put, so it never shimmers |
| `clickPulse` | false | pointerdown fires `pulse()`: a flash exposure that blooms and fades |
| `holds` | null | up to 4 `{ x, y, r, soft }` (0–1 units) coins resting on the paper that hold the light back |
| `reveal` | null | `[from, to, soft]` in 0–1 of the width: only this window is exposed |
| `transparent` | 0 | alpha from T, for overlays (focus ring, icons) |
| `resolution`, `own` | 1, auto | resolution scale; `own: true` forces a dedicated WebGL context |

The controller: `set(opts)` (look-only changes on a captured field re-texture without a
rebuild; still-option changes rebuild), `load(opts)` (replace every still option: a new
sheet), `pulse(x, y, strength)` in CSS pixels, `point(x, y)` / `point(null)` to steer the
pool from code, `pause()`, `resume()`, `destroy()`, `state()`, `bench(n)`.

**What is live.** `field`, `halo` and `caustics` are computed in the shader and drift. The
captured modes (`print` and the photogram, `tone`, `relief`, `marble`, `screen`,
`develop`) run the still engine once, upload T and the edge band, and then develop, glint,
follow the hand, flash and re-roll grain on the GPU. The stipple sheets (`orb`, `spray`,
`isles`) and the stacked undertow poster stay still: they are dots and layers, not a
T field.

**Parity.** Frame 0 at time 0 matches the still. `Cyanotype.live.parity(opts)` renders both
and compares luminance: mean, standard deviation (contrast), mean absolute difference of
neighbouring pixels (grain) and mean absolute difference per pixel. Measured in Chrome on
an M1 Pro (ANGLE/Metal), 480×320: mean within 0.0016–0.0020 (the GPU rounds ~0.002 darker),
contrast within 0.15%, grain within 0.4%, mean pixel difference 0.37–0.52 of a level, and
100% of pixels within 2 levels, for field (cobalt and nightglow), halo, caustics and
relief. `live.TOLERANCE` is `{ dMean 0.004, dSdRel 0.02, dGrainRel 0.03, madLevels 1.5 }`.

**Budget.** ≤ 4 ms a frame at 1440×900 CSS on this Mac's GPU. Measured with
`ctl.bench(60)` on a full-window field (2880×1800 device pixels at DPR 2) with drift,
pool, pulse and live grain on: 1.1–1.3 ms a frame pipelined, 1.6–2.1 ms with a 1-pixel
readPixels after every frame (4.9 ms cold). Measure in real Chrome, not headless:
SwiftShader is a software renderer. Timer queries (EXT_disjoint_timer_query) gave numbers
that climbed regardless of content, so do not trust them.

**Rules.**
- `prefers-reduced-motion`: every canvas shows its still frame, no drift, pool or pulse,
  grain frozen; `set()` changes state without animating.
- Offscreen canvases pause (IntersectionObserver); a hidden tab stops the loop. DPR is
  capped at 2; captured fields are capped at 1.2 MP and built one per task.
- No WebGL2 (or a lost context): the CPU still, which changes state and does not animate.
- Pointer events throughout, so touch works; a tap is a press.
- Big canvases (≥ 0.9 MP) get their own context; small ones share one offscreen context
  and receive frames as ImageBitmaps, so a page can carry dozens of live pieces.

### Interface pieces (`Cyanotype.ui`)

| piece | call | behaviour |
|---|---|---|
| live background | `ui.background(section, opts)` | a field behind the section, developing in, the hand's pool and a click flash |
| button | `ui.button(btn)` | at rest barely exposed; hover and focus expose it through the grain; press is a flash |
| card | `ui.card(el, opts)` | any sheet (`mode: 'print'`, `'halo'`, `'marble'`…) that develops in as it scrolls into view |
| toggle | `ui.toggle(checkbox)` | the knob is a coin holding back the light; on exposes the track |
| slider | `ui.slider(range)` | exposed up to the value, a coin at the thumb |
| progress | `ui.progress(el)` → `{ set(p) }` | an exposure creeping along the strip, a flash at 100%; `role=progressbar` |
| loader | `ui.loader(el)` | a small pool of light orbiting under the grain |
| focus ring | `ui.focusRing(opts)` | an exposed band around `:focus-visible` elements, transparent elsewhere |
| section transition | `ui.transition(strip)` | paper darkening into the next section as it scrolls |
| cursor | `ui.cursor(area)` | a soft screen-blended spot trailing the mouse; off for touch and reduced motion |
| icon | `ui.icon(el, name)` | a Phosphor light icon exposed like a botanical; lights on hover |

Every piece keeps the native element and its semantics; the canvas sits under it with
`aria-hidden`. `Cyanotype.iconMask(svg, { pad, weight })` turns any inline 256-unit SVG
(path `d`s only) into an `objects` mask for `print`, so your own icons go through the same
process. `ui.ICONS` carries eleven Phosphor Light paths (sun, image, drop, sliders, play,
pause, aperture, flower, butterfly, clock, lightning), inlined; nothing is fetched.

## Tells that it was generated — avoid all of them

- Grain as a faint CSS noise overlay on clean colour. The grain here **is** the pixels.
- A second, unrelated hue "to add interest". Warm tones only as light, never as ground.
- Butterflies as crisp clip-art icons: a real one is soft, cropped, moving, or seen at
  an angle, with its veins barely there.
- A blue-tinted photograph passed off as a cyanotype: no burnt highlights, no brushed
  edge, true blacks.
- Marbling as smooth vector swirls or a displacement filter over a gradient: real
  marbling has lace, ringed stones and combed veins that stay continuous.
- A poster where the type sits in a box, fills the sheet, or uses a display face; on the
  board the type is small and the image does the work.
- A wall of sheets that all share one tone: alternate dark and pale.

## Verify before calling it done

Screenshot in a headless browser at 1440×900 and 390×844, put the shots next to the
board or brief, then zoom in on a patch of grain and one subject edge.

- [ ] Grain is stochastic and dense at 100% zoom, not a smooth gradient with texture on it.
- [ ] Every sheet stays in the family; warm tones appear only as light.
- [ ] Photograms read pale-on-navy, printed subjects ink-on-paper; no polarity inverted.
- [ ] Soft focus is visible; moving subjects are smeared along one axis, not blurred evenly.
- [ ] Sun prints burn out in the highlights and have a brushed edge where one is wanted.
- [ ] Sheet names are legible on every sheet, on pale and dark alike; posters use small
      type and invented names only.
- [ ] No console errors; no horizontal scroll at 390px; the same seed reproduces the
      same sheet.
- [ ] Live pieces: frame 0 passes `Cyanotype.live.parity()`; under reduced motion every
      canvas draws once and holds; an offscreen canvas stops drawing; the grain moves like
      film, not like TV static; frame time measured in real Chrome is under 4 ms.

## Credits and prior art

Original implementation: no code was copied from anywhere. The ideas came from:

- **The process**: Anna Atkins, *Photographs of British Algae: Cyanotype Impressions*
  (1843), for the sun print and the photogram; iron-salt chemistry for the polarity and
  the burnt-out highlights; hand-coated paper for the brushed edge.
- **Marbling**: Shufang Lu, Aubrey Jaffer, Xiaogang Jin, Hanli Zhao and Xiaoyang Mao,
  "Mathematical Marbling" (IEEE Computer Graphics and Applications, 2012), for treating
  each tool stroke as an invertible map of the plane and for the ink-drop and tine-comb
  formulas. The noise shear and the pre-deformation lace are this skill's own.
- **Cellular noise**: Steven Worley, "A Cellular Texture Basis Function" (SIGGRAPH 1996);
  the F2 − F1 distance is the marble lace and the pool light.
- **Gradient noise**: Ken Perlin, "Improving Noise" (SIGGRAPH 2002), for the quintic fade
  and permutation table in `noise`.
- **The relief**: the voxel-landscape column renderer of early-1990s flight games
  (NovaLogic's Voxel Space), scanning a height field front to back per screen column.
- **The halftone**: the amplitude-modulated screen of the printing trade, one dot per
  cell of a rotated grid.
- **Butterfly outlines**: Edwin Catmull and Raphael Rom's interpolating splines (1974).
- **Blur**: three box passes approximating a Gaussian, after W. M. Wells, "Efficient
  synthesis of Gaussian filters by cascaded uniform filters" (IEEE PAMI, 1986).
- **Seeded randomness**: Tommy Ettinger's mulberry32 generator.
- **Icons**: Phosphor Icons (phosphoricons.com), light weight, MIT licence, copyright
  (c) 2023 Phosphor Icons; the paths are inlined in `live-ui.js` with the notice.
- **Visual reference**: the indigo column of the mood board credited in the repository
  README. No image from it, or any other third-party image, is in this repository;
  every sheet is generated at runtime, and every name on the posters is invented.
