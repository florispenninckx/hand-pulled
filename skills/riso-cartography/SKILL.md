---
name: riso-cartography
description: Design pages, posters, covers and live interfaces that look like risograph-printed town plans and river maps, in one to three spot inks. Examples are a figure-ground plan with every block in solid blue and the streets, squares and river left as paper; the same town as watercolour blocks, as pink house footprints under a cloverleaf, or as teal hatched blocks on cream; a purple river with its old courses and oxbows; a land-use plan in pastel pink, purple halftone and teal hairlines; and a walk poster in huge black words over a green valley. Towns are grown and rivers migrated, never traced. Grain, misregistration and overprint come from a simulated press, which also runs on the GPU so drums drift and re-ink under the pointer. Use it for exhibitions, architecture and urbanism, city guides, walks, festivals, zines, record sleeves and cultural sites, or when the user asks for riso, risograph, spot colour, two-colour print, overprint, grain or halftone, or a figure-ground, Nolli, town, site, zoning or land-use map.
---

# Risograph cartography: Figure & Ground

A risograph is a stencil duplicator. Each colour is its own drum of translucent soy ink,
pushed through a master onto uncoated paper one pass at a time. Tone becomes a grain of dots,
two inks crossing make a third colour, drums land a little off each other, and big solids come
out uneven.

The sheets here are town plans in the figure-ground manner. Every block that someone owns is
ink, and everything the town shares is paper: streets, squares, quays and the river. That suits
the press, because the streets *are* the knockout. One drum, one master and the paper do all the
drawing. Around the town sit the river that made it, the plan that zones it and a poster that
walks it.

The files next to this SKILL.md:

- `assets/riso.js`: `window.Riso`, the press. It has per-ink drums, grain, halftone and solid screens, misregistration, drum mottle, multiply overprint and paper fibre, plus `INKS` (Riso colours) and `PAPERS`.
- `assets/cartography.js`: `window.Carto`, seeded geography. `Carto.city` grows a street plan and labels its blocks. `Carto.meander` migrates a river for a set number of years and keeps its old courses and oxbows. It also has terrain, isolines, contours, roads and place names.
- `assets/atlas.js`: `window.Atlas`, seven finished sheets built on both. Load `riso.js` and `cartography.js` first.
- `assets/live.js`: `Riso.live`, the same press moving on the GPU (WebGL2). Load it after `atlas.js`. See "Live" below.
- `assets/live-ui.js`: `Riso.ui`, interface pieces printed live: background, button, card, toggle, slider, progress, loader, focus ring and section transition.
- `reference.html`: "Figure & Ground", an atlas of a fictional town by a fictional print club. Sheet I sits at full height beside an italic serif title, with its ink switchable and a photo drop. The other six follow in two staggered rows. Sheet I prints live and follows the pointer with a loupe. Sheet VI is then proofed drum by drum. "The Drum Room", a small made-up press-queue app built from the live pieces, follows, and the page ends with an ink table and a short programme. **Read it before designing.**

## The seven sheets

| Sheet | Drums, paper | What is on each drum | Look on the board | `Atlas.<call>(canvas, opts)` |
|---|---|---|---|---|
| I | blue twice (red, teal or pink on the switch); white | every block solid, with courtyards, slab estates, stippled parks and open squares. A river with bank lines, bridges, a motorway, the round old square and its monument, a serif title and typed notes | the deep one-ink figure-ground plans, blue or red | `blocks`, `mode: 'solid'`, `ink`, `image` |
| II | cornflower; white | each block its own wash, pooled darker at its rim and bloomed, in a town with a ragged edge and a river through it | the blue watercolour town | `blocks`, `mode: 'wash'`, `ink` |
| III | fluorescent pink, bright red; white | pink: house footprints, a many-laned motorway with a cloverleaf, and low cloud. Red: one district and a grain ramp | the pink footprint plan with its interchange | `blocks`, `mode: 'plan'`, `ink` |
| IV | teal; cream | every block ruled its own way: hatch, crosshatch, stipple or scribble, between two paper avenues | the teal hatched grid | `blocks`, `mode: 'hatch'`, `ink` |
| V | purple, black; white | purple: the river now, its old courses fainter the older they are, scroll bars, oxbow lakes and creeks. Black: a small figure-ground town off the floodplain, roads and all the type | the rivers drawn with their meander history | `river` |
| VI | fluorescent pink, purple halftone, teal; white | pink: homes, fields and inset panels. Purple: works and a stepped proposal, with site dots. Teal: streets, river, lake, contours, hollow arrows and all the words, each in a box knocked out of every drum | the pastel zoning over site plans | `zoning` |
| VII | green, black; white | green: a valley of tinted fields, dark woods, contours, a white river, a road, a railway and three villages. Black: huge lowercase words, a head and six numbered stops | the huge-type poster over a green map | `poster`, `ink` |

Every call takes `seed`, `width`, `height` (1 : 1.414, A-series), `misregister` (1 is a normal
press day, 2 a sloppy one) and `drums` (indices, to proof one separation). It returns a promise.

- `text` replaces the words on a sheet:
  - `blocks`: `{ title, river, note: [lines] }`
  - `river`: `{ title, sub: [lines], name, key: [4] }`
  - `zoning`: `{ title, sub, places: [6], key: [5] }`
  - `poster`: `{ lines: ['stav', 'mere'], head: [lines], top, stops: [6] }`
- `ink` swaps the main drum for any name in `Riso.INKS`.
- `image` on sheet I prints a photograph through the town: each block takes the darkness of the picture under it, and the streets stay paper.

## What makes it authentic

1. **The ground is paper.** Streets, squares, quays and water are places where the drum has no ink. They are never white drawn on top. On sheet VI, even the labels sit in boxes cut out of all three drums.
2. **Plans come from process.** Streets follow a field of directions: a grid, a radial pull toward the old square, and the river's own direction, blended and bent by noise. The streets are spaced evenly, arterials first, then locals. The river has migrated for two hundred years before a street is laid, so it has a real history. Nothing is traced from a real city.
3. **Every block is a unit.** The plan is rasterised, and each block gets a number, an area, a direction and a distance to its edge. A block is then filled as one thing: solid, pooled, built up with footprints, ruled or stippled. That is what separates a town plan from a texture.
4. **Separations, not colours.** Every mark is drawn in black on one drum's master, at a density from 0 to 1, and `Riso.print` inks it. Two hits of one ink give sheet I its depth, and pink under purple gives sheet VI its violet. Use at most three drums.
5. **The press is imperfect, and that shows.** Drums land offset and slightly rotated, large solids mottle along the feed and show starved specks, and type misregisters with the plan it labels.
6. **Tone is grain or dots.** Every tint is a stochastic grain or an angled halftone at a density. Only hairlines are printed on the solid screen.

## Tokens

| Role | Value |
|---|---|
| inks (Riso names, from `Riso.INKS`) | blue `#0078bf` (sheet I, the board's blue), bright red `#f15060`, cornflower `#62a8e5`, fluorescent pink `#ff48b0`, teal `#00838a`, purple `#765ba7`, green `#00a95c`, black, and the rest of the table |
| papers | white `#f7f6f2`, cream `#efe4cc`, natural `#f3eee2` |
| page | plan-chest grey `#e8e5dc`, ink `#1c1c1a`, soft `#6d6a62`, rules `#cfcabd`, a bright-red hairline `#f15060` for section rules, a fluorescent-pink dot as the only bullet |

Type, each face with one job:
- **Instrument Serif**, italic for titles, on the page and on the sheets.
- **Instrument Sans** 500 for the huge poster words, the head and small tracked caps, and 400 for reading.
- **IBM Plex Mono** 400 at 12–14 px for typed notes, map labels, keys, captions and controls.

## Type

The skill's own poster faces, in `fonts/`, are a menu of two: Isohypse, and Blockplan with its
second-ink partner. All are variable fonts made by `tools/foundry.py` from OFL grotesks, under the
SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| | Face | Look | Axis (0–1000) and standard setting | Use it for |
|---|---|---|---|---|
| Main | **Isohypse** | A heavy rounded grotesk drawn as a contour map: ring inside ring from its edge, from a solid letter scored with fine lines to a hairline survey | `'TOPO'`: Filled 0, Regular 500, Survey 1000. **Standard 500** | The one huge word over the map, a place or river name, a walk's title |
| Alternate | **Blockplan** | A condensed poster grotesk cut as a stencil: a bridge through every counter | `'CUTS'`: Hairline 0, Regular 400, Open 1000. **Standard 400** | Stacked poster words, a sheet's name, a big stop number |
| Its partner | **Blockplan Drop** | The same letters uncut, fat and rough at the edge as a drum leaves them, extruded into a drop shadow | `'DROP'`: Flat 0, Regular 400, Deep 1000. **Standard 400** | Only under Blockplan, as the second ink |

```css
.place       { font-family: 'Isohypse'; font-variation-settings: 'TOPO' 500; color: #0078bf;
               font-size: clamp(64px, 14vw, 220px); line-height: 1; mix-blend-mode: multiply; }
.stack       { position: relative; font-size: clamp(56px, 10vw, 150px); line-height: .95; }
.stack .top  { position: relative; font-family: 'Blockplan'; font-variation-settings: 'CUTS' 400; color: #f15060; }
.stack .drop { position: absolute; inset: 0; font-family: 'Blockplan Drop'; font-variation-settings: 'DROP' 400;
               color: #0078bf; transform: translate(.03em, .02em) rotate(-.3deg); mix-blend-mode: multiply; }
```
```html
<h2 class="stack"><span class="drop" aria-hidden="true">Riverside</span><span class="top">Riverside</span></h2>
```

- **Two faces at most.** A sheet takes one poster face from the menu: Isohypse, or Blockplan with
  its Drop (the pair is one face in two inks). With Instrument Serif italic for titles and IBM Plex
  Mono for notes, a page still sets at most two faces in any one place.
- **Overprint, like the press.** Set Isohypse in one spot ink straight over the map with
  `mix-blend-mode: multiply`. Set Blockplan Drop in the aria-hidden copy, same size and tracking
  (the advances match), in a second ink, a few hundredths of an em out of register with a fraction
  of a degree of turn. Never use opacity for overprint.
- **Titles only.** Never set running text, notes or map labels in these faces; those stay in the
  sans and the mono. Isohypse's rings need 64 px or more at 500 and 96 px or more past 800; the
  stencil needs 40 px or more.
- **The axes are the plate.** Keep one value per role. To animate one, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 500; }`, set
  `font-variation-settings: 'TOPO' var(--v)` (or `'CUTS'`) and animate `--v` on one element at
  most, never under `prefers-reduced-motion`.
- **No glow, no text-shadow.** The drop is the second face in a second ink, never a CSS shadow.

Sizes, full Latin (Western European), `woff2`: Isohypse 116 KB, Blockplan 22 KB, Blockplan Drop
117 KB (the rings and the rough edge cost the bytes). A page loads only the faces it uses
(`font-display: swap`).

## Build it

```html
<figure class="sheet"><div class="paper"><canvas role="img" aria-label="…the sheet and its printed words…"></canvas></div></figure>
<script src="riso.js"></script>
<script src="cartography.js"></script>
<script src="atlas.js"></script>
<script>
  const c = document.querySelector('.sheet canvas'), w = Math.round(c.getBoundingClientRect().width * Math.min(1.5, devicePixelRatio));
  Atlas.blocks(c, { width: w, height: Math.round(w * 1.414), seed: 3, mode: 'solid', ink: 'blue', text: { title: 'Harrowgate' } });
  // your own sheet: const town = Carto.city({ seed: 3, spacing: 40, water: [{ pts: Carto.meander({ seed: 3, from: [600, -80], to: [-80, 800] }).path, width: 50 }] });
  // then Riso.print(canvas, { paper: 'white', layers: [{ ink: 'teal', draw: (ctx, w, h) => { … town.blockAt(x, y) … }, screen: 'grain', density: .95 }] })
</script>
<style>
  .paper { position: relative; aspect-ratio: 1000 / 1414; background: #f7f6f2; }
  .paper canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
```

- A sheet takes 0.3–1 s at 700–1000 px wide, mostly growing the town. Print one at a time, top first, when it comes near the viewport, after `document.fonts.load` for the faces the sheets set. Re-print only when the width really changes, because phones fire `resize` while scrolling.
- Output is deterministic per seed. Offer `[another pull]` for a new seed rather than randomising on load.
- In React, print in `useEffect` on a canvas ref, keyed on seed, ink, image and size.
- To make your own sheet, copy `atlas.js`'s pattern. Grow a town with `Carto.city`, draw each drum's master in sheet units (1000 × 1414) with `blocksCanvas` for per-block fills and plain canvas paths for lines and type, then print.

## Composition

- The sheet is the page's picture. Show sheets whole, at A-series proportion, on a quiet table colour, with no shadows, rotation or mock-up frames.
- Open with one figure-ground sheet at full viewport height beside a huge italic serif title, a plain lede and a `dl` of edition facts. On a phone, the sheet comes straight after the title. After that, the other sheets are staggered in rows, each captioned with a roman numeral, a title, and its drums in mono.
- Show the process once: one sheet proofed drum by drum, then all together.
- Section rules are a single bright-red hairline. The only ornament is a fluorescent-pink dot.
- The type printed on a sheet goes on its darkest drum and misregisters with everything else. Repeat those words in the canvas `aria-label`, and keep the label in step when a control changes the ink.
- Use fictional towns, rivers, clubs and people, or the user's own. Never use a real brand's name, logo or map artwork, and never trace a real city's plan.

## Live

`assets/live.js` makes the press move, for real interfaces. The press itself runs on the GPU.
The CPU still engine (`Riso.print`, or an `Atlas` sheet on top of it) runs once with `capture`,
which stops before the press and hands over the geography: each drum's master as drawn (the
grown town, the migrated river, the type), each drum's registration error and the noise table.
These are uploaded once. Then a WebGL2 shader, ported from `riso.js` line for line, pulls the
print every frame:

1. the paper: tone, fibre on the same coarse grid, flecks;
2. per drum, the registration (shift and rotation), the master's density and the drum mottle
   (its coarse grid rendered in a first pass from the same permutation table);
3. the screen (stochastic grain, halftone dot or solid) and starved specks;
4. the overprint, `paper × Π(1 − c + c·ink)`.

The hash and the Perlin noise are bit for bit the CPU's, and every motion term is zero at time
0, so frame 0 is the still. After that the print evolves while the map holds:

- the drums drift out of registration and back;
- they are re-inked: the mottle moves;
- the fine grain is re-rolled from the same hash, each pixel at its own phase;
- the paper feeds through the drums, top down and staggered (on first view, or tied to scroll);
- contours are traced along the terrain in fresh ink;
- the pointer is a loupe, and a click is a stamp of fresh ink with starved specks.

Load the scripts in this order. All are classic scripts with no dependencies.

```html
<script src="riso.js"></script><script src="cartography.js"></script><script src="atlas.js"></script>
<script src="live.js"></script><script src="live-ui.js"></script>
<canvas id="map" style="width:100%;height:60vh;display:block" role="img" aria-label="Map of the town"></canvas>
<script>
  const ctl = Riso.live(document.getElementById('map'), {
    sheet: 'blocks', mode: 'solid', ink: 'blue', seed: 7,        // still options (an Atlas sheet)
    feed: 'in', drift: 1, pointer: 1, clickPulse: true,           // motion options
  });
  ctl.set({ slip: 0.5 });   ctl.pulse(x, y);   ctl.pause();   ctl.resume();   ctl.destroy();
</script>
```

**Still options** choose what is printed. There are two sources:

- `sheet: 'blocks' | 'river' | 'zoning' | 'poster'` plus that sheet's `Atlas` options
  (`mode`, `seed`, `ink`, `image`, `text`, `drums`, `misregister`…);
- or `layers` plus `paper`, `seed`, `misregister`…, exactly as `Riso.print` takes them.
  The interface pieces use this source.

`width` and `height` come from the canvas: its CSS size × min(2, DPR) × `resolution`.

**Motion options** never reprint the still:

| option | default | what it does |
|---|---|---|
| `drift`, `speed` | 1, 1 | the drums wander out of registration and back, each on its own slow period |
| `reink` | 1 | the drums are re-inked: each drum's mottle moves along the feed, at its own rate |
| `grainRate` | 3 | fresh grain: re-rolls a second per pixel, each at its own phase (0 holds the grain) |
| `slip` | 0 | deliberate misregistration: each drum knocked its own way, 1 = 3% of the canvas size; buttons use 0.5 for hover |
| `offsets` | null | per-layer `[dx, dy]` in CSS px (`null` for a layer at rest): slides a drum's image; toggles, sliders and progress run on it |
| `feed`, `feedMs`, `scrollRange` | 1, 2400, [0, 1] | the paper feed, 0–1; `'in'` feeds once on first view, `'scroll'` follows the section through the viewport |
| `trace`, `traceLevels`, `traceRate`, `traceInk` | 0, 14, 1.6, first ink | contours of `Riso.live.ground()` lit level by level in grain-screened fresh ink |
| `pointer`, `radius`, `zoom`, `lag`, `hand` | 0, 0.16, 1.8, 0.16, parent | the loupe: strength, radius (fraction of the short side), magnification, trailing; `hand` is the element that listens |
| `clickPulse`, `stampInk` | false, first ink | pointerdown stamps a disc of fresh ink |
| `ease` | 0.18 | how fast `set()` targets are reached |
| `resolution`, `maxField`, `own` | 1, 5.3e6, auto | resolution scale; pixel cap of the capture (5.3e6 holds 2880×1800); `own: true` forces a dedicated WebGL context |

**The controller:**

- `set(opts)`: motion options ease to the new value, and still options reprint. A reprint with
  `feed: 'in'` feeds through again.
- `load(opts)`: replaces every still option, for a new sheet.
- `pulse(x, y, strength, size)` in CSS px; `point(x, y)` / `point(null)` steers the loupe from code.
- `pause()`, `resume()`, `destroy()`.
- `state()` returns `{ mode, path, frames, visible, expose, clock, size, ready, reduced }`.
- `bench(n)` returns `{ sync, pipelined, size, path }` in ms per frame.

Every view is listed in `window.handPulledLive.views`. `tools/check.sh` reads it.

**What evolves, what is captured.** The press evolves: paper, registration, mottle, grain,
specks and overprint are computed every frame, for all seven sheets and any `layers` you draw
(up to four drums). The geography is captured once: the masters, and each drum's registration
error at rest. A new town, river or layout is a CPU capture, which happens on `set({ seed })`
and is queued so that only one runs at a time. The trace runs on its own smooth ground
(`Riso.live.ground(w, h, seed)`), not on `Carto`'s terrain. `Riso.ui.mapLayers` prints its
contours from that same ground so the two line up. On the reference page sheet I is live, and
each of sheets II–VII has a `[live]` switch: its live view is made on the first press, and after
that the switch only swaps which canvas shows and pauses the hidden one. The drum-by-drum proof
stays still.

**Parity.** `Riso.live.parity(opts)` prints the still on the CPU, captures the same sheet, draws
the GPU's frame 0 at the same size and compares their luminance: mean, standard deviation
(contrast), mean absolute difference of neighbouring pixels (grain), and mean absolute
difference per pixel. `Riso.live.TOLERANCE` is `{ dMean 0.004, dSdRel 0.02, dGrainRel 0.03,
madLevels 1.5 }`. The page registers blocks/solid, zoning, poster and the print case as
`handPulledLive.parity['riso-cartography']`. They are computed once after the first view, and
`state().ready` waits for them. Sheets at 360 wide, the print at 320×240; the numbers are the
same in Chrome (ANGLE/Metal) and headless (SwiftShader):

| case | Δmean | Δcontrast | Δgrain | mean pixel diff | within 2 levels |
|---|---|---|---|---|---|
| I blocks, solid, blue | 0 | 0 | 0 | 0.039 levels | 99.95% |
| II blocks, wash | 0 | 0 | 0 | 0.010 levels | 100% |
| III blocks, plan | 0 | 0 | 0 | 0.027 levels | 99.99% |
| IV blocks, hatch | 0 | 0 | 0 | 0.057 levels | 99.96% |
| V river | 0 | 0 | 0.01% | 0.018 levels | 100% |
| VI zoning | 0 | 0 | 0 | 0.019 levels | 100% |
| VII poster | 0 | 0 | 0 | 0.025 levels | 99.99% |
| `Riso.print`: grain, halftone, solid | 0 | 0 | 0 | 0.013 levels | 100% |

**Budget.** Two passes: the drums' mottle grid (small, redrawn only while the drums are being
re-inked) and the press at full resolution. With `ctl.bench(60)` in Chrome on an M1 Pro
(ANGLE/Metal), at 2880×1800 device px on its own context, with drift, re-ink, grain, feed, trace,
loupe and four stamps on:

| view | pipelined | sync (1-px readPixels each frame) |
|---|---|---|
| sheet I, blocks/solid, 2 drums | 2.2 ms | 3.0 ms (4.1 ms on the first, cold run) |
| sheet VI, zoning, 3 drums | 2.3 ms | 3.1 ms (4.5 ms cold) |
| the Drum Room map, 2 drums | 2.2 ms | 3.1 ms (4.4 ms cold) |

The app's browser pane was hidden (`document.hidden`) while these were taken. `bench()` is
synchronous so it still runs; repeat it in a visible tab to confirm. The capture costs far more
than any frame (1.5–3 s at 2880×1800), so reprint rarely and keep motion in `set()`. Needs
`EXT_color_buffer_float` for the grids; without it the view falls back to the still.

**Rules.**

- `prefers-reduced-motion`: every canvas shows its still. There is no drift, re-ink, grain,
  feed, trace, loupe or stamp. `set()` still changes state (a toggle still slides its
  drum) but jumps rather than animates.
- Offscreen canvases pause (IntersectionObserver), and a hidden tab stops the loop.
- DPR is capped at 2, captures are capped at `maxField` pixels, and only one print runs at a time.
- Without WebGL2 (or after a lost context), the still is printed straight onto the canvas. It
  changes state but does not animate.
- Big canvases (≥ 0.9 MP) get their own context. Small ones share one offscreen context and
  receive frames as ImageBitmaps, so a page can carry dozens of live pieces.
- Make a view once and swap `hidden`; never make one inside a toggle's handler on every press.
- The canvas is decoration: it gets `aria-hidden` unless you give it a `role` (a map that
  *is* the content keeps `role="img"` and its label). Native controls stay on top and keep
  their semantics. Pointer events are used throughout, so touch works.

### Interface pieces (`Riso.ui`)

Each piece puts a canvas behind a native element and returns its controller. The defaults are
the board's blue plus fluorescent pink; `ink` and `seed` override them.

| piece | call | behaviour |
|---|---|---|
| live background | `ui.background(section, opts)` | a blue map (grain tint + contours) behind the section: drums drift, the pointer is a loupe, a click stamps pink, contours are traced |
| button | `ui.button(btn, { density, key })` | a block of ink plus a pink key line, a hair out of register. Hover and focus knock the drums further out; a press (or Enter/Space) stamps. `density: 0.3` gives a pale secondary button |
| card | `ui.card(el, opts)` | a small map that feeds through the drums the first time it scrolls in; a loupe on hover |
| toggle | `ui.toggle(checkbox)` | an outline, a tint and a knob on three drums; on slides the tint in and the knob across. Adds `role="switch"` |
| slider | `ui.slider(range)` | a ruled track and a bar of ink pulled along it to the value |
| progress | `ui.progress(el)` → `{ set(p), ctl }` | ink creeping along the strip, a pink stamp at 100%; `role="progressbar"` and `aria-valuenow` |
| loader | `ui.loader(el)` → `{ ctl, stop() }` | a small plate with the press running: drums wandering, contours traced fast in pink; `role="status"` |
| focus ring | `ui.focusRing()` | pink and blue hairlines out of register around the `:focus-visible` element, multiplied over the page. Keep a 1px CSS outline too |
| section transition | `ui.transition(strip)` | blue contours over a pink tint, fed through as the strip scrolls past |
| icon | `ui.icon(el, name, { ink, key, weight })` | the icon on two drums, a grain of blue and a pink hairline, multiplied onto a pale ground; pointing at or focusing its control slips the drums apart. The element sets the size |

Helpers: `ui.mapLayers({ ink, tintInk, seed, levels, lo, hi })` returns tint and contour layers
for `Riso.live({ layers })`; `ui.contours` and `ui.tint` are its two draw functions.
`Riso.iconMask(svg, { pad, weight, shade })` turns any SVG of `<path d>` outlines into a layer's
`draw` (black on the white master). `ui.ICONS` holds eleven Phosphor icons in the light weight
(MIT, inlined, never fetched): sun, image, drop, sliders, play, pause, aperture, flower,
butterfly, clock, lightning. Never type an icon's path by hand; copy it from the source.

A made-up app built from these pieces is "The Drum Room" in `reference.html`: toggles and a
slider drive a live background, a button starts a run, and a progress bar, a loader and job
cards follow it; icons head the desk, the proof button and the cards, and the pointer is the
system's own. Copy its structure, not its names.

**Optional extra: custom cursor.** `ui.cursor(area, { mark, inks, hover })`, only when the brief asks for one; the system cursor is the default. A native CSS cursor painted once through the still engine at 32 px (1x and 2x); `hover: true` gives links and controls a second mark.
Marks: `register` (default), `crop`, `arrow`. It returns `{ destroy() }`, which puts the previous cursor back.

## Tells that it was generated — avoid all of them

- A street grid of perfect rectangles, or a spider web of rays around one centre point.
- A river drawn as a regular sine wave. Real meanders are uneven, cut off and leave oxbows.
- Blocks filled with one texture across the whole sheet, ignoring where one block ends and the next begins.
- A flat vector design with a noise PNG and `mix-blend-mode` on top, called riso.
- CSS gradients, glows, drop shadows, or posters tilted with a shadow like a mock-up.
- Perfect registration and crisp edges everywhere.
- Colours outside the ink table, CMYK-bright cyan, or more than three inks on one sheet.
- White drawn as a fill on top of ink instead of knocked out of it.
- A centred hero, three feature cards and a gradient button.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each sheet, and put them next to the reference pins. Then zoom a 400 px crop to 100 %.

- [ ] The streets, squares and river read as paper, and every block reads as one unit.
- [ ] No two seeds share a street, and no plan looks like a spider web or a sine wave.
- [ ] Every mark sits on one named drum, and overprints give the intended third colours.
- [ ] Registration visibly drifts: type and hairlines sit off the fills.
- [ ] One large area shows grain, mottle and starved specks.
- [ ] The same seed reprints identically, `[another pull]` gives a new town, the ink switch reprints sheet I in the new ink, and a dropped photograph prints through its blocks.
- [ ] Live: frame 0 matches the still (`handPulledLive.parity['riso-cartography']()` all pass), the drums drift in blue, not violet, and the loupe and stamp answer the pointer.
- [ ] With reduced motion, every canvas holds its still and the controls still work.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

The engines are original code, and no code was copied from any of these sources.

Map methods:
- Streets: the tensor-field street modelling of Chen, Esch, Wonka, Müller and Zhang, "Interactive Procedural Street Modeling" (SIGGRAPH 2008). The streets are traced with Jobard and Lefer's evenly spaced streamlines (1997).
- The river: the migration model of Howard and Knutson, "Sufficient conditions for river meandering" (1984). Drawing its old courses together follows Harold Fisk's 1944 maps of the lower Mississippi valley.
- Figure and ground: Giambattista Nolli's plan of Rome (1748).
- Blocks: textbook connected-component labelling, with distances from Borgefors' two-pass chamfer transform (1986).

The press:
- The grain-screen idea comes from Robpayot/risograph-grain-shader (MIT).
- Per-ink separation comes from jywarren/risoAtHome. It has no licence file, so nothing was copied.
- Riso colour values come from the p5.riso ink table.

References, used as reference only; none of their images are used or included:
- Floris Penninckx's "Riso Cartography" Pinterest board, for what the sheets should look like.
- The "10 niche design styles" board by A Song Studio, for general inspiration.
