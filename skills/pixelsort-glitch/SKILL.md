---
name: pixelsort-glitch
description: Design pages and visuals in the pixel-sort and slit-scan glitch style. A picture's rows are sorted and dragged from a slit into saturated teal, pink and orange smears on dark. Waves pull rows into moiré contours, columns drip from macroblocks, a dropped LCD cracks into shards and stuck columns, a picture is cut into a hot-pink collage, a moved scan splits into RGB fringes, and heavy type is sliced and streaked. Mountain valleys are sorted downward into hanging columns, tape frames smear in bands, datamosh melts a picture along block vectors, and codec blocks are woven into twill and grids. Use it for club nights and festivals, electronic and experimental releases, net art, dev tools and hackathons, editorial headers and zines. Also use it for pixel sorting, slit-scan, glitch art, databending, datamosh, macroblocking, melting or dripping pixels, displacement warps, a cracked screen, scanner glitch, VHS or tape smear, glitched typography, or corrupted, broken or lossy images.
---

# Pixel-sort glitch: broken files

This is what a picture looks like after a machine gets hold of it. A camera reads the
scene through a slit, so a single row stretches across the frame. A sort runs along the
rows and the light pixels slide to one end. A codec at the bottom of its bitrate lets
blocks hang in the air while the columns under them drip. A screen hits the floor. A
sheet moves in the scanner while the head is still running. Every plate here is made by
doing one of those things to a picture. None of it is a glitch filter laid over a
finished design.

The files next to this SKILL.md:

- `assets/pixelsort.js`: `window.PixelSort`, the low-level tools. It has `sort` (interval pixel sorting by threshold, random, edges, waves or border, at any angle, with a mask), `channelShift`, `slices`, and `crush`, which is real JPEG generation loss through the browser's encoder.
- `assets/glitch.js`: `window.Glitch`, eleven seeded plates built on it (`smear`, `wave`, `drip`, `shatter`, `collage`, `scan`, `type`, `fall`, `band`, `mosh`, `weave`), the stand-in pictures drawn in code (`dusk`, a coast at dusk; `scape`, a mountain valley in one of the `SCAPES` palettes; `strokes`, pale paint on a dark board), and the helpers `macroblock`, `slitRow`, `slitCol`, `scanlines` and `vivid`. Load `pixelsort.js` first. There are no other dependencies.
- `assets/live.js`: `Glitch.live`, the plates moving on the GPU (WebGL2), for real interfaces. See "Live" below.
- `assets/live-ui.js`: `Glitch.ui`, interface pieces (button, toggle, slider, progress, loader, card, focus ring, section transition, live background, icons) broken the same way, and `Glitch.iconMask`.
- `reference.html`: "Stale Vector", a fictional weekend of broken files. The smear is the hero, and below it are a lede with one phrase marked in pink and a three-column board of six plates captioned like file names, then a second board, "four more machines", with the eleven plates of `fall`, `band`, `mosh` and `weave`. A smear strip divides the page, and the programme is printed as a listing. The hero is live, and at the end "Slitdeck", a small fictional desk, uses every live UI piece. **Read it before designing.**

## The eleven plates

| Plate | What happens to the picture | Board pins it answers | `Glitch.<plate>(canvas, opts)` |
|---|---|---|---|
| `smear` | The picture is read through a slit band by band. Each band draws a narrow strip of the picture out across the whole width, and the strip walks sideways from band to band, so every edge comes out as a staircase. Each row is then sorted inside its mid-tone runs, a few bands land with red and blue out of register, and scanlines and grain go on top | 1, 3, 5, 11: long horizontal smears of teal, pink and orange, over dark | `image` |
| `wave` | `ripple`: an edge meanders down the plate. Left of it, every row is dragged flat from the edge. Right of it, the rows are pushed back and forth by a few pixels, and the picture comes apart in contour lines, like the moiré of a screen shot through a screen. `water`: the columns are sorted into streaks, and then the picture wobbles as if seen through moving water | 2, 4, 11 | `image`, `mode` |
| `drip` | A band of the picture turns into macroblocks, stale blocks drift up as dust, and below the band each run of columns is stretched down and interval-sorted. `dusk` does this over the coast, and `mint` over a pale mint ground | 9, 15, 20, 21 | `image`, `mode` |
| `shatter` | An LCD that hit the floor. The backlight washes the picture pale and cold, cut driver lines leave clustered columns stuck on one colour, the glass breaks into wedges that each show the panel slightly moved and turned, the middle is crushed into splinters, and liquid crystal bleeds along the cracks in spiky black stains | 6, 18 | `image` |
| `collage` | The picture is cut into rectangles on a loose grid. Some pieces stay in place, some move, and some are blown up until their pixels show. Each piece is broken one way: streaked from one row, seen through a mesh, macroblocked, cut to its darks, or tinted pink, grey, blue or rust. Thin runs of colour leak out of the pieces sideways. `night` uses grey, mesh and hot pink on black. `day` uses pale streaks, one blue, rust and black on white | 8, 13, 16, 7 | `image`, `mode` |
| `scan` | A black-and-white photocopy on a flatbed whose sheet moved while the head ran. Where the sheet wobbled, edges snake. Where it stalled, rows repeat into streaks. Where it was jerked, a line blurs flat. The head reads R, G and B a few lines apart, so every moved edge splits into a rainbow fringe | 10, 17 | `image` |
| `type` | `ink`: a one-colour print in blue on cream, with rules, numbers, a dot grid and a ghost of the title. Columns of the sheet are dragged down where the scanner stuck on a line, the words are set large, and small print is knocked out of a solid band. `paper`: heavy lowercase words, loosely spaced, over a band of the picture pulled sideways. The lines are sliced and shifted, one is doubled, and ink is flicked over them | 19, 14 | `image`, `mode`, `text` |
| `fall` | A mountain valley sorted **downward**. From the first edge below a random height, runs of columns are dragged down, a few short and most long, so ridges and tree lines hang into the valley as streaks; then every column is interval-sorted in its light half. `alpine`: pale sky, blue ridges, lit green forest. `ink`: grey-teal and misted, with stale blocks left behind. `violet`: cyan sky over violet forest and rust rock | 33, 34, 41, 46 | `image`, `mode` |
| `band` | A frame off a worn tape. The picture is cut into horizontal bands: some hold, some are read through a slit so their rows smear the full width, some slip sideways with R, G and B read a few pixels apart. Then the rows are sorted and scanlines go on. `tape`: a pale valley, sometimes two frames with a light seam between. `foil`: the dusk coast with prism bands where the tape's coating flaked | 25, 38, 43, 44 | `image`, `mode` |
| `mosh` | Datamosh: a key frame is lost and each macroblock keeps moving along its last vector for 8–16 frames, dragging the picture with it, while a few intra blocks leak the real picture back in. R, G and B move at slightly different speeds, so every smear has a colour edge. `melt`: the coast swirls and sags. `burst`: a violet valley blown out from a point. `patch`: the valley cut to contour stripes in coral, grey and black, then moved in blocks | 23, 24, 27, 28 | `image`, `mode` |
| `weave` | Codec blocks woven like cloth. `plaid`: warp and weft are strips of the picture read along slits, crossed in a 2/2 twill with the weft darker. `blocks`: a quadtree of the ink valley, each leaf kept as its mean, copied stale from a neighbour or run down from its top row, with wide stale slabs drifting over. `grid`: the coast cut into cells, each showing its rows like a blind | 35, 37, 45 | `image`, `mode` |

"Board pins" are the pins on the pixel-glitch reference board that each plate was built
against. They were used as reference only (see Credits). Every plate also takes `seed`,
`width`, `height`, `cssWidth` and `scene`. `scene` picks the stand-in picture and
defaults to the seed. `fall`, `band`, `mosh` and `weave` draw their own stand-in (a `scape`,
`dusk` or `strokes`) unless you pass `image`. `pixel` sets the size of a work pixel in CSS px: 1 by default and
2 for `drip`. `type` is drawn at device resolution, so its letters stay sharp.

## What makes it authentic

1. **The damage is a process, not a texture.** A smear is a row read through a slit. A drip is a column resampled downward and then interval-sorted. A shard shows the panel behind it, moved. A rainbow fringe is the scanner's three colour lines reading the moved sheet at different moments. Because each mark comes from the picture underneath, it lines up with that picture, which is why it reads as broken and not as decorated.
2. **Pixels stay square.** Work is done on a coarse canvas and enlarged nearest-neighbour (`image-rendering: pixelated`). A blurred pixel is the quickest tell of a fake. The exception is type, which is drawn sharp at device resolution and then broken.
3. **Each plate has one machine.** Slits and sorts run along rows, codecs fail in blocks and down columns, cracks start from one impact, and scanners fail along their direction of travel. A plate breaks the picture one machine's way and leaves the rest of the picture intact.
4. **One picture, broken several ways.** The page passes the same `scene` to every plate, so it reads as one file failing in different places, not as a moodboard of effects.
5. **The colour is the picture's, pushed.** The saturated teal, pink, orange and violet come from the dusk sky and sea, pushed further by `vivid`, on dark or photographic grounds. Flat colour appears only where a machine would put it: a stuck LCD column, hot pink on a collage piece, one blue ink. Nothing is a gradient, glow or bloom laid on top.
6. **Drop your own.** Each plate breaks a dropped photograph the same way it breaks the stand-in.

## Tokens

| Role | Value |
|---|---|
| page | near-black `#0b0b0e`, ink `#ecebe6`, dim `#8c8b93`, rules `#26262c`; accents teal `#3fd0c9`, pink `#ff4f8b`, orange `#ff9a5a` |
| stand-in `dusk` | sky `#0a1030` → `#16306a` → `#1f7894` → `#58b7b8` → `#d9d6c0` → `#ffb489` → `#ff7650` → `#ff5a3c`; lit clouds `#5b3a9a` → `#a0409a` → `#ff4f8b` → `#ff7a5a` → `#ffc27a`; sea `#e0648c` → `#8f67b5` → `#2d9fab` → `#0f6b7b` → `#03202b`; headland `#08091a` |
| `shatter` | stuck columns `#27d8ff #ff45d2 #f6ec5d #7b5cff #ffffff #3dffb0 #ff5a5a`, backlight `#dff3fa`, crystal bleed `#04050b` |
| `collage` | night: ground `#050506`, pink `#12000a` → `#ff2e8b` → `#ffd6ea`, blue `#9fd6ff`; day: ground `#f5f4f0`, blue `#78b6e6`, bar `#111214` |
| `scan` | bed `#f4f3ef`, toner `#0c0c0e` |
| `type` | paper `#f7f6f2`, ink `#111114`, grey `#8d9296`; ink mode: cream `#eee7d7`, blue `#1f3c93` |
| `scape` palettes (`Glitch.SCAPES`) | alpine: sky `#9fbcd4` → `#eef3ef`, ridges `#b5cde0` / `#1d3f8a`, forest `#0c2410` → `#9cc636` → `#eef36a`; ink: sky `#c9d6d8` → `#f3f4f1`, near `#16282c`, forest `#081013` → `#8aaeb2`; violet: sky `#4cc3da` → `#f1efe6`, forest `#1c1236` → `#3b31a6` → `#8a7ce6`, rock `#7a4d45`; tape: sky `#88a2aa` → `#efe6d6`, near `#20333b`, seam `#ececec` |
| `mosh` patch | coral `#f0604c`, grey `#b9b6b0`, black `#141416`, green `#2f7a2a`, sky `#8ec9f0`, paper `#f4f0e8`; stripes `#f4f4f4` / `#121212` from the valley's own contour lines |
| `drip` mint | ground `#e9f7f5` → `#cdeeed` → `#b9e2e0`, mass `#27353a #3d5b5c #6c9d9b #8c7652 #a7d8d5 #f6fcfb` |

Type: use one monospace for everything small (IBM Plex Mono 400/500/700, 12–13 px) and
one heavy grotesk for anything large (Archivo 800, lowercase, tracking −0.045em, line
height 0.8; Archivo 700 for a lede). Large type sits flat on the picture, where the
picture is calm, and never on a glow. Do not add a third face.

## Type

Rowdrag is the skill's own display face, and Slipband is its alternate. Both are variable fonts
made by `tools/foundry.py` from OFL grotesks, under the SIL OFL 1.1, and loaded from the skill
itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Standard | Use it for |
|---|---|---|---|---|
| **Rowdrag** (main) | A blocky grotesk quantised to a 60-unit pixel grid, whose pixel rows are sorted and dragged sideways into streaks | `'SORT'`: Clean 0, Sorted 500, Dragged 1000 (default 0) | `'SORT' 600` | One large word or a title on a calm part of the picture, a night's name, a big number |
| **Slipband** | A black expanded grotesk cut into bands at the same heights all along the line; the bands slide sideways, open slits and leave stuttered ghosts, as on a slipping scanner | `'SLIP'`: Still 0, Slipped 500, Torn 1000 (default 500) | `'SLIP' 500` | A wide one-line headline or masthead that reads as one scanned strip: a release title, a zine header, a hackathon or tool name |

```css
.title { font-family: 'Rowdrag'; font-variation-settings: 'SORT' 600; font-size: clamp(56px, 11vw, 160px);
         line-height: .9; letter-spacing: -.01em; }
.mast  { font-family: 'Slipband'; font-variation-settings: 'SLIP' 500; font-size: clamp(40px, 8vw, 128px);
         line-height: .95; }
```

- **At most two faces on a page.** A display face takes the large-type role and replaces
  Archivo 800, so the page keeps Rowdrag *or* Slipband, plus IBM Plex Mono. Never both display
  faces on one page, and never running text, ledes or captions in either.
- **The axis is the glitch.** Start from the standard and choose one value per role. Rowdrag: 0–250
  for a clean pixel word, 400–700 for the house look, 1000 for one wrecked word; it is drawn from
  pixels, so set it at 48 px and larger. Slipband: 0 for a whole word, 500 for the house look, 1000
  for one torn word; the bands line up along the line, so keep a Slipband head to one line, 40 px
  and larger.
- **Type stays calm.** The skill keeps type and text blocks still. If one title must move, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }`, set
  `font-variation-settings: 'SORT' var(--v)` (or `'SLIP'`) and run `--v` once on load or on hover.
  Animate one element at most, and never under `prefers-reduced-motion`.
- **No glow and no RGB split.** Never add a CSS text-shadow in any colour. The drag is in the
  letters themselves.

Size, full Latin (Western European), `woff2`: Rowdrag 10 KB, Slipband 80 KB. Each has one axis (no
weight), so a page loads just the one file it uses (`font-display: swap`). `fonts/specimen.html`
shows both faces live.

## Build it

```html
<div class="plate"><canvas></canvas></div>
<script src="pixelsort.js"></script>
<script src="glitch.js"></script>
<script>
  const el = document.querySelector('.plate'), r = el.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
  Glitch.smear(el.querySelector('canvas'), { width: r.width * dpr, height: r.height * dpr, cssWidth: r.width, seed: 6, scene: 6 });
  // the same scene everywhere: Glitch.wave(c, { ..., seed: 2, scene: 6, mode: 'ripple' })
  // your photograph: pass { image } (an <img> or a canvas) to any plate
  // a lower-level sort: PixelSort.sort(imageData, { mode: 'threshold', lo: .25, hi: .8, angle: 90, mask })
</script>
<style>
  .plate { position: relative; aspect-ratio: 2 / 3; }
  .plate canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
</style>
```

- Plates are deterministic per seed and take 20–300 ms, and a full-screen hero is the slowest. Render one per frame, top first, after `document.fonts.load` for the faces that `type` draws with. Re-render only when the width changes: phones fire `resize` while scrolling.
- A plate can load the way a slow file does: CSS `clip-path` goes from `inset(0 0 100% 0)` to `inset(0)` in `steps(9)` the first time the plate is seen. This is off under `prefers-reduced-motion`.
- In React: render in `useEffect` on a canvas ref, keyed on seed, scene, mode and size.

## Composition

- One hero plate full-bleed at the height of the screen (the smear). Set the name large in the heavy grotesk at the top left, over the calm part of the sky. A single line of details sits in mono along the bottom on the page colour, with the controls at its right.
- Then a board: plates in three columns of mixed shapes (2:3, 4:5, 9:16, 1:1, 3:4), like a pinboard, with one column on a phone. Each plate is captioned like a file (`II — wave.mov`) and has a one-line mono note on what happened to it.
- Text blocks are plain and small, like a README: a two-column `dl` with teal terms, a programme as a numbered listing with times in teal and notes in pink, and one phrase in the lede marked in pink.
- A thin smear strip can divide sections. The picture is the ornament, so add no other.
- Controls are words in brackets, `[another]`, `[+ photograph]` and the mode names, teal on hover and inverted when pressed. They are not buttons with shadows.
- Use fictional names, or the user's own. Never use a real label's, artist's or festival's name, logo or artwork.

## Live

`assets/live.js` makes any plate move, for real interfaces. It is capture-first: the still
engine renders the plate once on the CPU, exactly as a still page would, the result is
uploaded as a texture, and each frame reads that texture back through this medium's own
machines in one WebGL2 fragment shader. `assets/live-ui.js` builds interface pieces on it.
Both are classic scripts with no dependencies; load them after `pixelsort.js` and `glitch.js`.

```html
<section class="hero"><canvas></canvas><h1>stale<br>vector</h1></section>
<script src="pixelsort.js"></script><script src="glitch.js"></script>
<script src="live.js"></script><script src="live-ui.js"></script>
<script>
  const hero = document.querySelector('.hero');
  const ctl = Glitch.live(hero.querySelector('canvas'), {
    mode: 'smear', seed: 6, scene: 6,                              // still options: the plate
    sweep: 1, mosh: 1, tear: 0.8, develop: 'in', clickPulse: true, hand: hero,   // motion options
  });
  ctl.set({ sweep: 0.4, lo: 0.5 });   ctl.pulse(x, y, 1);   ctl.load({ mode: 'wave', variant: 'water', seed: 3 });
  ctl.pause();   ctl.resume();   ctl.destroy();
</script>
<style>
  .hero { position: relative; height: 100svh; }
  .hero canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
  .hero h1 { position: relative; z-index: 1; }
</style>
```

The canvas is sized from its CSS box (DPR capped at 2); do not set `width`/`height` yourself.

**Still options.** `mode` names the plate: `smear`, `wave`, `drip`, `shatter`, `collage`,
`scan`, `type`, `fall`, `band`, `mosh`, `weave`, or `sorted` (a strip of the stand-in with its rows sorted, what the UI pieces
use; options `scene`, `seed`, `lo`, `hi`, `angle`, `pixel`, `image`, `shape`), or a function
`(ctx, w, h) => {}` that draws your own still. The plate's own mode (`ripple`, `water`,
`dusk`, `mint`, `night`, `day`, `ink`, `paper`, `alpine`, `violet`, `tape`, `foil`, `melt`,
`burst`, `patch`, `plaid`, `blocks`, `grid`) is **`variant`**, because `mode` is taken.
Everything else (`seed`, `scene`, `image`, `text`, `pixel`) is the still function's. Changing a
still option re-renders the plate (20–300 ms, one per task).

**Motion options** never re-render the plate:

| option | default | what it does |
|---|---|---|
| `sweep`, `speed` | 1, 1 | the sort sweep: each band of rows gets a slit, and from it the row is read out spread thin, so streaks grow and retract; only pixels whose lightness falls in the band take the streak |
| `lo`, `hi` | 0.25, 0.95 | the sort threshold band; lower `lo` and more of the picture streaks |
| `mosh` | 1 | datamosh: scroll velocity moves macroblocks (8 work px) along stale vectors, a few go flat; zero when the page stops |
| `tear`, `radius`, `lag` | 0.8, 0.18, 0.12 | the pointer tears the rows under it sideways in bands, R and B a step apart, harder the faster it moves; `hand` is the element that listens (default: the parent) |
| `clickPulse` | false | pointerdown fires `pulse()`: a burst, a band of rows sliding apart and blocks going flat, gone in under a second |
| `develop` | 1 | rows loaded, 0–1: past the loaded edge the last row read drags down; `'in'` arrives in nine steps the first time it is seen (`developMs` 1400); `'scroll'` follows the element through the viewport (`scrollRange`) |
| `dim`, `ground` | 0, `#0b0b0e` | mix toward the ground colour (a control at rest) |
| `reveal`, `thumb` | null, null | `[from, to]` in 0–1 of the width: only this window shows, the rest is ground; `thumb` is one stuck white column at x |
| `alive` | true | the clock runs (the sweep needs it); false holds the picture until something is set |
| `ease` | 0.16 | how fast `set()` targets are reached |
| `own`, `maxField` | auto, 6e6 | `own: true` forces a dedicated WebGL context; the still is capped at `maxField` device px |

The controller: `set(opts)`, `load(opts)` (drops every still option: a new plate),
`pulse(x, y, strength)` in CSS px, `point(x, y)` / `point(null)` to tear from code, `pause()`,
`resume()`, `destroy()`, `state()` → `{ mode: 'gpu'|'still', path, frames, visible, expose,
clock, size, ready, reduced }`, and `bench(n)` → `{ sync, pipelined, size, path }` in ms a frame.
Every controller is pushed to `window.handPulledLive.views`.

**What is live.** All eleven plates and `sorted` are captured and move the same way. No stage
is ported to GLSL: the sort, slit, wave and codec passes stay on the CPU, and the motion is
the shader re-reading the finished plate. Every offset is a whole work pixel, so pixels stay
square. The sweep, mosh, tear and burst are all zero at clock 0, and the sweep fades in over
2.5 s, so frame 0 is the still.

**Parity.** `Glitch.live.parity(opts)` renders the still on a 2D canvas and frame 0 on the
GPU and compares luminance mean, SD, grain (mean |ΔL| between neighbours), mean |pixel
difference| in 8-bit levels and the share of pixels within 2 levels. At 480×320 (sorted
320×96) in headless Chrome, `smear`, `wave` (ripple), `drip`, `sorted`, `fall` (ink), `band` (tape), `mosh` (melt) and
`weave` (plaid) all give
dMean 0, dSdRel 0, dGrainRel 0, MAD 0.000 levels, 100% within 2 levels: the texture is the
still. `live.TOLERANCE` is `{ dMean 0.004, dSdRel 0.02, dGrainRel 0.03, madLevels 1.5 }`.

**Budget.** ≤ 4 ms a frame at 1440×900 CSS. The shader is a handful of texel fetches a
pixel. Not yet measured in real Chrome: run `handPulledLive.views[0].bench(60)` on the
reference page over http in a visible tab. Headless (SwiftShader, DPR 1) gives 1.1 ms sync
at 1440×900, which says nothing about a GPU. The CPU cost is the one-off still render.

**Rules.**
- `prefers-reduced-motion`: every canvas shows its still frame, clock 0, no sweep, mosh,
  tear or burst; `set()` jumps to its target; draws only when something changed.
- Offscreen canvases pause (IntersectionObserver); a hidden tab stops the loop. DPR ≤ 2.
- No WebGL2 (or a lost context): the CPU still, with `dim`, `reveal` and `thumb` applied.
- Big canvases (≥ 0.9 MP) get their own context; small ones share one offscreen context and
  receive frames as ImageBitmaps, so a page can carry dozens of pieces.
- Create each view once. Never create views inside a toggle or a click handler; swap
  `hidden` instead, and use `load()` to change the plate.

### Interface pieces (`Glitch.ui`)

| piece | call | behaviour |
|---|---|---|
| live background | `ui.background(section, opts)` | any plate behind the section: sweep, scroll mosh, pointer tear, click burst |
| button | `ui.button(btn, { rest, seed })` | a dim strip of sorted rows; hover and focus light it and set it streaking; press, Enter and Space burst |
| card | `ui.card(el, opts)` | a plate (`mode`, `variant`) that arrives like a slow file when first seen, then keeps sorting |
| toggle | `ui.toggle(checkbox)` | off: dim, stuck column left; on: lit, sorting, column right, a burst on change; `role=switch` |
| slider | `ui.slider(range)` | the strip shown up to the value, ground after it, a stuck column at the thumb |
| progress | `ui.progress(el)` → `{ ctl, set(p) }` | a file arriving: shown up to p, streaking; bursts at 100%; `role=progressbar` with `aria-valuenow` |
| loader | `ui.loader(el)` → `{ ctl, stop() }` | a strip sorting fast with a tear running along it; `role=status`; holds still under reduced motion |
| focus ring | `ui.focusRing(opts)` | a frame of sorted rows around `:focus-visible`, on a transparent overlay; keep a CSS outline too |
| section transition | `ui.transition(strip)` | a strip of the picture loading row by row as it scrolls into view |
| icon | `ui.icon(el, name, { weight })` | an icon cut out of a sorted strip: still at rest, sorting while its control is hovered or focused, a burst on press. `name` is one of `ui.ICONS` (`lightning`, `shuffle`, `export`, `scissors`, `film`, `play`, `pause`, `broken`, `waveform`) or your own SVG string |

`Glitch.iconMask(svg, { pad, weight })` turns any 256-unit SVG (the Phosphor format) into a
`shape` function for `mode: 'sorted'`: the picture shows only inside the glyph, and `weight`
thickens its strokes in work pixels. The icons in `ui.ICONS` are Phosphor's Light weight,
generated from the `@phosphor-icons/core` package, not drawn by hand. Put an icon in an
`<i class="ic" aria-hidden="true">` next to the label, never in place of it.

Every piece keeps the native element and its semantics; the canvas sits behind it with
`aria-hidden`. Labels stay calm: put a button's label in a `<span>` with the page colour
behind it (`.lbtn span { background: var(--page) }`), knocked out of the strip, and flip it
on `:hover`/`:focus-visible`. Size tracks in CSS (`.pg-toggle { width: 64px; height: 22px }`,
`.pg-slider { width: 100%; height: 18px }`). A minimal desk:

```html
<button class="lbtn" id="go"><span>burst</span></button>
<label><input type="checkbox" id="sort" checked> sort</label>
<input type="range" id="lo" min="0" max="90" value="25">
<div class="bar" id="bar"></div>
<script>
  const ui = Glitch.ui, screen = ui.card(document.querySelector('#screen'), { mode: 'smear', seed: 3, scene: 6 });
  ui.button(go); ui.toggle(sort); ui.slider(lo); const bar = ui.progress(document.querySelector('#bar'));
  ui.focusRing();
  go.onclick = () => screen.pulse(200, 120, 1);
  sort.onchange = () => screen.set({ sweep: sort.checked ? 1 : 0 });
  lo.oninput = () => screen.set({ lo: lo.value / 100 });
  bar.set(0.4);
</script>
```

Keep one machine per surface here too: the page's big picture sorts and moshes, controls
sort only when touched, and type and text blocks never move.

**Optional extra: custom cursor.** `ui.cursor(area, { mark, hover })`, only when the brief asks for one; the system cursor is the default. A native CSS cursor painted once through the still engine at 32 px (1x and 2x); `hover: true` gives links and controls a second mark.
Marks: `arrow` (default), `blocks`. It returns `{ destroy() }`, which puts the previous cursor back.

## Tells that it was generated — avoid all of them

- An RGB-split or scanline filter over a finished layout, or CSS `text-shadow` in red and cyan on a headline.
- Glitch that ignores the picture: stripes and noise that do not line up with anything under them.
- Soft or blurred pixels, anti-aliased blocks, or non-square pixels.
- Neon glow, bloom, a synthwave grid or glowing "cyberpunk" type. The colour is the picture's own, pushed.
- Matrix rain, a terminal font for the large type, or random unicode chosen for looks.
- Glitch in every direction at once, or on every element. Keep one machine per plate and leave the type and text blocks calm.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each plate, and put them next to the reference pins.

- [ ] Each plate reads as a picture that something happened to (a slit, a sort, a wave, a codec, a dropped screen, a cut-up, a scanner, a stuck print) and not as an effect.
- [ ] The page reads as one picture: the plates share a scene, and the hero is saturated smears on dark.
- [ ] Pixels are square and sharp at 100 %.
- [ ] The same seed gives the same plate, "another" gives a new one, and the modes of `wave`, `drip`, `collage`, `type`, `fall`, `band`, `mosh` and `weave` switch.
- [ ] `fall` hangs downward from the ridges, `band` smears whole bands across, `mosh` moves the picture in blocks, and `weave` crosses strips over and under.
- [ ] A dropped photograph is broken each plate's way.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

This is an original implementation. The plates, the stand-in coast and the listing were
written for `glitch.js`, and no photograph or found glitch is included. The mountain valleys
are drawn in code from noise, not traced from any picture. The icons in `live-ui.js` are
Phosphor Icons, Light weight (MIT, Copyright (c) 2023 Phosphor Icons), generated from the
`@phosphor-icons/core` package. The interval
sorting model in `pixelsort.js` follows the one popularised by Kim Asendorf's
ASDFPixelSort and used by Akascape/Pixelort (MIT) and satyarth/pixelsort.
Krzysztofz01/pixel-sorter is GPL-3.0, so it was read for ideas only and none of its code
is used. The other techniques are general practice and were used as inspiration: slit-scan
photography and video, sine and noise displacement, datamosh and macroblock artefacts in
video codecs, the colour-line lag of contact-image-sensor flatbed scanners, and what a
cracked LCD panel shows (stuck driver lines, liquid-crystal bleed). The visual target is a
pixel-glitch Pinterest board kept by the repository's author, and before it the "10 niche
design styles" board by A Song Studio. Both were used as reference only, and none of their
images are in this repository.
