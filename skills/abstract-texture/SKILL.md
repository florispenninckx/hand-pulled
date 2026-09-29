---
name: abstract-texture
description: Design pages, posters and covers where the texture of a surface is the picture. Examples are soft colour behind reeded or fluted glass, grain-gradient swirls folded like satin or marbled paper, aurora curtains and halos in heavy grain, rows of colour dragged and torn like a slipping signal, flowers smeared by a slow shutter, and dithered orbs on grey stock. Small mono or thin serif type sits sharp on top. The engine keeps a soft colour field apart from the surfaces it is seen through (reeds, streak, block shift, halftone, grain, dust), so any palette or dropped photograph can go through any surface. Use it for music nights, record sleeves, gig and festival posters, fashion and beauty, galleries, launches, editorial openers and ambient brand pages. Also use it when the user asks for grain or noise gradients, reeded, fluted or ribbed glass, marbling, liquid swirls, aurora gradients, glitch streaks or pixel drag, motion-blurred flowers, abstract textures, or posters with small mono type.
---

# Abstract texture: Kiln Hours

On these posters the subject hardly matters. What you look at is the surface: colour behind
ribbed glass, a gradient full of grain, silk folds, a row of pixels dragged until it tears.
Every plate here is built the same way. There is one soft **field** of colour, and one or
two **panes** it is seen through. The field is computed small, so it is soft by
construction. The panes act at full resolution, so the reeds, the torn edges and the grain
stay crisp. Small type goes on last and stays sharp. A rough surface under clean type is the
whole look.

This skill sits next to two others. ethereal-haze owns the warm blur of a subject (a
flower, a word in fog), and chrome-aurora owns liquid chrome. Here the surface itself is the
point.

The files next to this SKILL.md:

- `assets/surface.js`: `window.Surface`, the engine, with no dependencies. It has six plates (`reeded`, `satin`, `aurora`, `streak`, `bloom`, `coordinate`), each with its own colourways. `Surface.glass(canvas, panes)` puts any canvas through the panes, and `Surface.words(plate, opts)` returns the words a plate prints, for its `aria-label`.
- `assets/live.js`: `Surface.live(canvas, opts)`, the same plates moving on the GPU (see "Live" below). `assets/live-ui.js`: `Surface.ui`, interface pieces with a live plate behind a native control.
- `reference.html`: "Kiln Hours", six nights of late listening at a fictional glassworks. It has a reeded season poster beside a thin serif title, six night posters staggered, one field proofed through four panes, a pane library with colourway switches, colour strips and a programme. **Read it before designing.**

## The six plates

| Plate | Colourways | Field | Panes | Pin feel |
|---|---|---|---|---|
| `reeded` | `ember`, `cobalt` | a mesh of soft blobs, or bands bent by noise | `reed` (+ `screen`), `grain` | warm stripes behind fluted glass; cobalt with black swells, stepped by wide reeds |
| `satin` | `mint`, `rose`, `crimson`, `neon`, `opal` | stripes bent by a warp of a warp, lit from their slope | `grain` (+ `screen`) | green satin, a pink and white swirl, crimson silk in shadow, neon ribbons on black, lilac marbling with rainbow rims |
| `aurora` | `veil`, `halo`, `north`, `wash`, `dusk` | a curtain, a halo, a plume or a drift of light | `grain`, `streak`, `dust` | a white glow over a V of spectrum, a black arch with a green rim, cyan smoke under thin serif caps, a pastel wash, ice-to-navy bands with one red word |
| `streak` | `coral`, `signal`, `drip`, `shift` | smudges, diagonal strokes, a pool, a blotch | `streak`, `shift`, `grain` | coral dragged to the right, an orange and navy signal with a mono block, colour pulled up into black, a frame with blocks slipped |
| `bloom` | `lilac`, `blush`, `fuchsia`, `night` | flowers drawn with canvas paths, then averaged along a path | `grain` | poppies on lilac, one flower thrown out by a zoom, fuchsia smeared on pink, a pale flower on black split into red and blue |
| `coordinate` | `stock` | dithered orbs and a four-pointed flare on grey stock | `grain` | a design-school poster: split year, coordinates, hairline hatches, crosshairs |

Call `Surface.<plate>(canvas, opts)`. Every plate takes `seed`, `width`, `height` (9 : 16
by default), `palette`, `image` (a photograph that becomes the field), `panes` (replaces
the plate's own: `[]` shows the bare field, `['reed']` keeps only that pane with the plate's
settings), `grain` (a multiplier) and `text` (the plate's words, `{ layout: 'block' }` to add
type to an untyped plate, or `false`). It returns a Promise of the canvas.

The panes, in sheet units (the sheet is 1000 wide):

| Pane | What it does | Settings |
|---|---|---|
| `reed` | each flute is a cylinder lens that shows a squeezed, mirrored slice of the field, with a lit edge, a shaded side and red and blue bent apart | `width`, `power`, `shear`, `bow`, `fringe`, `light`, `shadow` |
| `streak` | a running average along each row or column, so colour trails behind what it passed. Bands come from slow noise with ragged edges, and `tear` slips whole bands | `dir`, `amount`, `drag`, `band`, `tear`, `jag` |
| `shift` | a frame decoded badly: blocks copied from the side, held on their first column, or knocked to a dither of one ink | `amount`, `reach`, `tall`, `wide`, `ink` |
| `screen` | fine halftone dots, heavier in the darks | `cell`, `angle`, `amount` |
| `grain` | a triangular hash plus clumps, strongest in the midtones, with per-channel `chroma` | `amount`, `chroma` |
| `dust` | specks, hairs and creases, screened on in light only | `specks`, `hairs`, `creases` |

## What makes it authentic

1. **The field and the surface are separate.** Choose the colour first, then the glass. The field is computed at a quarter to a third of the output size and scaled up, so it cannot have hard edges. The panes run on the full-size pixels, so their edges are sharp. Mixing the two jobs is how you get mush.
2. **Grain on everything.** No gradient is left smooth. Grain is heaviest in the midtones and a little coloured, like fast film or a cheap scan, and the 8-bit step is dithered so nothing bands.
3. **Reeds are lenses, not stripes.** Each flute bends what is behind it, so an edge in the field breaks into steps across the reeds. Stripes painted over a gradient are the quickest fake.
4. **Swirls come from a warp of a warp.** Noise pushes the coordinates of a stripe, and more noise pushes that noise. The folds are lit from their slope, so they read as cloth, poured paint or marbled paper, not as a lava lamp.
5. **Streaks are drag, not blur.** Colour is carried along a row and fades slowly behind, so a mark leaves a trail on one side only. Whole bands slip sideways, and quiet rows stay sharp between them.
6. **Motion is a flash and then a drag.** The path average is weighted toward its start, so the flower is still there, faintly sharp, inside its own smear.
7. **Type is small and set last.** Use two columns of mono caps with one larger mono title, thin serif capitals with an italic note, or one heavy word set up the sheet. Never set type on the field before the panes run.

## Tokens

| Role | Value |
|---|---|
| reeded | ember `#fbb04a` `#f45a5a` `#ec8aa2` `#c5a2de` `#f6d9ae`; cobalt `#6474e0` `#3659b6` `#1d1f2b` with mauve `#b27aa6` |
| satin | mint `#177a6c` → `#d9ecc8`; rose `#e8416f` → `#fde2e9`; crimson `#7a1c3c` → `#f1c6cc`; neon `#0d1113` with `#3f8e7a` and `#ff5a9e`; opal `#8f8ad0` → `#eeeff5` with thin-film rims |
| aurora | veil `#1f2762` → spectrum → `#fbfaf5`; halo `#1c1d1e` in a `#28d4b2` rim; north `#05303f` → `#e2fbf6`; wash `#6c978a` → `#fbeef7`; dusk `#e6e9ea` `#3f8aa3` `#16233f` |
| streak | coral `#f08a84` on `#7a8a82`; signal `#03011c` → `#ff6224` with `#8aabb8`; drip `#060a13` over `#2a86c8` `#d33b24` `#f6ecdc` |
| bloom | lilac `#8f7cbf` with `#e3301f` `#f39238`; blush `#f7dbe4` with `#f45a3c`; fuchsia `#fcd0de` with `#b0083e`; night `#0f1113` with `#efe0dc` |
| page | a dark hall `#0c0d0f`, ink `#e8e6e1`, soft `#8a8a86`, hairlines `#2c2d31`, one kiln orange `#ff4a12` for crosshair `+` marks and focus only |

Type, each face with one job:
- **Cormorant Garamond** 300 in capitals for titles, on the page and in the serif poster layout, with italic 400 for a quoted note.
- **Geist** 400–600 for reading and labels, and 800 for the one heavy word on a poster.
- **Geist Mono** 400/500 for the small type on posters, captions, dates and controls.

## Type

Tideline is the skill's own display face, the "one heavy word set up the sheet". It is a variable
font made by `tools/foundry.py` from an OFL grotesk, under the SIL OFL 1.1, and loaded from the
skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Tideline** | A heavy grotesk trailed by six outline copies of itself, like a shape dragged through a slow shutter | `'ECHO'`: Still 0, Echo 500, Reverb 1000 (default 0) | The one heavy word on a poster or sleeve, a night's name, a section opener |

```css
.word { font-family: 'Tideline'; font-variation-settings: 'ECHO' 500; font-size: clamp(64px, 12vw, 180px);
        line-height: 1.1; letter-spacing: .01em; }
```

- **It is the heavy word, not a third voice.** A sheet uses Tideline or the thin serif capitals
  for its title, with Geist Mono for the small type, so no more than two faces. Never set running
  text, captions or dates in it.
- **The axis is the echo.** At 0 it is a plain black grotesk; at 500 the rings stand clear of the
  letter; at 1000 they fan far down and to the right, so give the line extra leading. Keep one value
  per role. It is vector and stays sharp, so it can sit on any surface, set last like all type here.
- **Motion.** To let the echo breathe, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }`, set
  `font-variation-settings: 'ECHO' var(--v)` and animate `--v`. Animate one element at most, and
  never under `prefers-reduced-motion`.
- **No glow.** The echo is outlines, never a CSS text-shadow or a blur.

Size, full Latin (Western European), `woff2`: Tideline 97 KB (`font-display: swap`).

## Build it

```html
<figure class="plate"><div class="glass"><canvas role="img" aria-label="…what the poster shows, and its printed words…"></canvas></div></figure>
<script src="surface.js"></script>
<script>
  const c = document.querySelector('.plate canvas'), w = Math.round(c.getBoundingClientRect().width * Math.min(1.5, devicePixelRatio));
  const opts = { width: w, height: Math.round(w * Surface.RATIO), seed: 3, palette: 'cobalt', text: { layout: 'block', title: 'KILN HOURS' } };
  c.setAttribute('aria-label', 'Cobalt light behind reeded glass. Printed type: ' + Surface.words('reeded', opts).join('; '));
  Surface.reeded(c, opts);
  // the same field through other glass: Surface.reeded(c, { ...opts, panes: [{ pane: 'streak', dir: 'right', amount: .7, drag: 220 }] })
  // your own canvas through the panes: Surface.glass(myCanvas, [{ pane: 'reed', width: 30, power: -3 }, 'grain'], { seed: 3 })
</script>
<style>
  .glass { position: relative; aspect-ratio: 1000 / 1778; background: #1b2250; }
  .glass canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
```

- A plate takes about 150–500 ms at 460 px wide (`bloom` is the slowest). Print one at a time, top first, when it comes near the viewport, after `document.fonts.load` for the faces the posters set. Re-print only when the width really changes, because phones fire `resize` while scrolling.
- Output is deterministic per seed, and a pane change never moves the field. Offer `[another pull]` for a new seed rather than randomising on load.
- Before a poster has printed, show a dim wash of its own colour, not a grey box.
- In React, print in `useEffect` on a canvas ref, keyed on seed, palette, image and size.
- To make your own plate, copy the pattern in `surface.js`. Fill a field with `paint()` from ramps and warped noise, then hand `run()` the panes and a type layout.

## Live

For a page or app that should move: load `live.js` and `live-ui.js` after `surface.js`. A live
plate is printed **once** by the still engine on the CPU (a `capture` hook hands back the bare
field and the finished still), uploaded as two textures, and drawn every frame by one WebGL2
shader. Every motion term is exactly zero at time 0, so frame 0 **is** the still.

The motion is the medium's, and it is quiet, because it sits under small mono type:

| Motion | What it is | Option (default) |
|---|---|---|
| raking light | a low lamp at the pointer, lagged; the pane's relief (still minus field: flute edges, torn rows, grain) catches it on one side and falls into shade on the other | `rake` (0.35), `radius` (0.35 of the short side), `lag` (0.3 s) |
| contour echoes | thin lines at the field's iso-levels drift slowly outward from its highlights and bend what is seen through them by a pixel or two; they fade in over 4 s | `drift` (1, 0 = off), `speed`, `echoes` (7 levels) |
| grain lift | fresh fine grain, re-rolled 24 times a second, eased in on hover and settled out again; at most half the still's grain, **never heavier** | `lift` (0..1, 0), `liftGrain` (0.5), `grainRate` |
| echo ring | a click sends a ring out through the glass | `clickPulse` (false), `ctl.pulse(x, y, s)` |
| develop | the pane develops over the bare field: 0 = soft colour only, 1 = the finished plate; `'in'` once on entering view, `'scroll'` with scroll | `develop` (1), `developMs`, `scrollRange`, `under` (1 = the field, less mixes in `ground`), `reveal` [from, to, soft] |

```html
<header class="hero"><p>KILN HOURS</p></header>
<button class="go">Start</button>
<script src="assets/surface.js"></script>
<script src="assets/live.js"></script>
<script src="assets/live-ui.js"></script>
<script>
  const ui = Surface.ui;
  const bg = ui.background(document.querySelector('.hero'), { mode: 'reeded', palette: 'cobalt', seed: 3 }); // rake + echoes + click rings
  ui.button(document.querySelector('.go'), { palette: 'ember' });   // half-developed at rest; hover develops, lifts grain; press = ring
  ui.focusRing();                                                     // one ember ring for every :focus-visible
  // or a bare view: Surface.live(canvas, { mode: 'streak', palette: 'signal', text: false, develop: 'in', clickPulse: true })
</script>
<style>.hero { position: relative; min-height: 60svh; background: #1b2250; }  /* the plate's own colour until it prints */</style>
```

- `Surface.live(canvas, opts) → ctl | null`. `opts` = a plate's still options (`mode` is the
  plate name: `reeded` (default), `satin`, `aurora`, `streak`, `bloom`, `coordinate`; then
  `palette`, `seed`, `panes`, `grain`, `image`, `text`) plus the motion options above. Pass
  `text: false` for backgrounds and controls: the page's own HTML type goes on top.
- `ctl.set(opts)` eases motion options and reprints on a still option · `load(opts)` a new
  plate · `pulse(x, y, s)` (CSS px) · `point(x, y)` / `point(null)` move or put out the lamp ·
  `pause()` · `resume()` · `destroy()` · `state()` → `{ mode: 'gpu'|'still', path, frames,
  visible, expose, clock, size, ready, reduced }` · `bench(n)` → `{ sync, pipelined, size, path }` ms.
- `Surface.ui`, each piece keeps the native control and puts an `aria-hidden` canvas behind it:
  `background(el, opts)` · `button(btn, { rest: 0.4, hover: 1 })` · `card(el)` (develops in on
  scroll, hover lifts grain) · `toggle(checkbox)` (off = dim bare field, on = developed, a flat ink
  thumb) · `slider(range)` (developed up to the value, a hairline at the thumb) ·
  `progress(el).set(p)` (`role=progressbar`, a ring when it completes) · `loader(el)` (a lamp
  circling a small plate, a ring each period; `role=status`) · `focusRing()` (a band of the ember
  plate masked to a rounded rectangle; keep a 1px CSS outline for no-WebGL and forced colours) ·
  `transition(el)` (a streak strip that develops as it scrolls past). Never set the text of a
  host with `textContent`: it removes the canvas. Put the label in a `<span>`.
- Labels on a live button sit on changing colour: give warm plates a dark label on hover
  (`.warm:hover { color: #1b1216 }`) and cool ones white.
- Fallbacks: `prefers-reduced-motion` shows the still frame, clock 0, no rake, echo or ring, and
  `set()` jumps to its target; no WebGL2 (or a lost context) draws the CPU still on a 2D canvas;
  an offscreen canvas pauses (IntersectionObserver) and a hidden tab stops the loop; DPR is capped
  at 2 and the captured plate at 1.6 MP. Big canvases (≥ 0.9 MP) get their own context; small
  ones share one offscreen context.
- Cost: the CPU print is paid once per size, and plates are printed one per task. The reeded
  hero printed in 347 ms at 1440 × 575 and in 648 ms at the 1.6 MP cap (1994 × 796, a DPR 2
  hero), and a 364 × 228 card printed in 43 ms (headless Chrome, load average 64). A frame is
  two texture reads plus a few neighbours per pixel. `ctl.bench(60)` in real Chrome is the
  number to quote, and it was **not measured** for v1. Headless gave sync 1.1 ms and pipelined
  0.06 ms at 1440 × 575, but headless numbers do not count (see LIVE_PATTERN §4).
- Parity (`Surface.live.parity(opts)`, frame 0 on the GPU against the CPU still, 480 × 320):
  reeded/ember, reeded/cobalt, satin/opal, aurora/north and streak/signal (320 × 400) all give
  dMean 0, dSdRel 0, dGrainRel 0, 0.00 levels mean difference, 100 % of pixels within 2
  levels. It is exact because frame 0 samples the captured still texel for texel.
  `window.handPulledLive.parity['abstract-texture']()` runs these cases.
- What is live and what is still: every plate is live, as a captured still with motion on top.
  No stage of the engine is ported to the shader yet, so a pane itself (the reeds' refraction,
  the streak's drag) does not re-run per frame. The motion bends and lights the captured surface.

**Optional extra: custom cursor.** `ui.cursor(area, { mark, hover })`, only when the brief asks for one; the system cursor is the default. A native CSS cursor painted once through the still engine at 32 px (1x and 2x); `hover: true` gives links and controls a second mark.
Marks: `ring` (default), `slice`, `fluted`, `comet`. It returns `{ destroy() }`, which puts the previous cursor back.

## Composition

- The poster is the picture. Show posters whole, at 9 : 16, flat on a dark ground, with no shadows, rotation or mock-up frames.
- Open with one poster at full viewport height beside a huge thin serif title in capitals, a plain lede and a `dl` of facts. Put two small posters beside it, offset down.
- After that, stagger posters in threes, each captioned with a roman numeral, a title and date, and its panes in mono.
- Show the process once: the same field bare, then through each pane.
- Keep the page quiet: hairline rules, mono captions, one hot colour for the `+` crosshairs. The posters carry all the colour.
- Repeat a poster's printed words in the canvas `aria-label`. `Surface.words()` gives you them.
- Use fictional venues, series and people, or the user's own. Never use a real brand's name or artwork.

## Tells that it was generated — avoid all of them

- A smooth CSS or canvas gradient with a noise PNG and `mix-blend-mode` on top.
- Reeds drawn as a stripe overlay, not refracted, so the colour behind them does not step.
- Blobby lava-lamp gradients with no folds, no light and no grain.
- A Gaussian blur or `ctx.filter` standing in for motion or drag, which gives no direction, no trail and no tear.
- Everything the same softness. A texture needs one crisp layer: the reed edges, the torn rows or the type.
- Glass-morphism cards, glows, drop shadows, or a centred hero with three feature cards and a gradient button.
- Big type on the poster. The board's type is small, tracked and exact.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each poster, and put them next to the reference pins. Then zoom a 400 px crop to 100 %.

- [ ] Every poster has visible grain at 100 %, and no gradient bands.
- [ ] Reeded plates step the colour at every flute, with a lit edge and a shaded side.
- [ ] Streaked plates trail colour on one side only, with sharp rows between the bands.
- [ ] Type is crisp over the rough surface, and its words are in the `aria-label`.
- [ ] The same seed prints identically, `[another pull]` gives a new poster, a colourway switch keeps the seed, and a dropped photograph becomes the field.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

The engine is original code, and no code was copied. Ideas, with thanks: Inigo Quilez's
articles on domain warping (the warp of a warp behind the satin, the plumes and the
marbling) and on cosine palettes (the thin-film rims). Perlin's gradient noise and fractal
Brownian motion are textbook. The streak pane is an exponential moving average along a row,
the old idea behind pixel drag and slit-scan smears. Halftone screens, stochastic dithering
and the cylinder lens of reeded glass are general print and optics techniques. The fonts are
Cormorant Garamond by Christian Thalmann, and Geist and Geist Mono by Vercel, all under the
SIL Open Font License, via Google Fonts. The visual reference was Floris's "Abstract
texture" Pinterest board, used as reference only; none of its images are used.
