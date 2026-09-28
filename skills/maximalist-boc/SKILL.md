---
name: maximalist-boc
description: Design pages in a loud, liquid maximalist colour style led by acid green and Klein blue. Graphics are poured, not drawn: liquid chrome and oil-slick foil, marbling with dark veins, agate, moiré line fields, grain blooms, watercolour, spun and blurred light, splash pours, datamosh, caustics, halftone, flat colour fields and collage, all with film grain, many of them on black. Colour comes from a small set of named palettes, and every graphic draws its inks from them. Grounds come from the graphic: black under chrome and veins, a flat field of one of the two lead colours, white card under a wash. Display type is blobby liquid lettering that melts, drips, glows or echoes. Use it for record pages, tour dates, poster and print shops, festivals, club nights, fashion drops and paint brands. Also use it for liquid, melting, blobby or drippy type, acid or neon green with blue, marbled, chrome or swirled colour, "maximalist" colour, psychedelic-but-clean layouts, or a pour / paint-flow look, still or live.
---

# Maximalist BOC: poured colour and liquid type

This is the look of a record rolled out in colour, not in pictures. The cover is acid green
and Klein blue poured into each other and left to settle. Around it hangs a wall of sheets
that were poured the same way: liquid chrome pooled on black, acid ribbons with dark veins,
agate, fine moiré lines, a bloom lost in grain, a watercolour wash, broken video frames. The
title is not set in a font. It is liquid: fat strokes that melt together, swell into drops at
their ends and run down off the baseline. The maximalism is in the colour and the surfaces.
On a still page the type is the one thing that moves; in live mode (below) the paint flows too.

The files next to this SKILL.md:

- `assets/goo.js`: `window.Goo`, liquid display lettering. One alphabet (a–z, A–Z, 0–9, punctuation) drawn point by point as pen strokes, then stroked fat, blurred and cut back at a threshold so the strokes melt into blob letters. Four finishes, seeded, no dependencies. Each SVG carries its own filter, so it scales with CSS and exports as a self-contained file.
- `assets/pour.js`: `window.Pour`, liquid colour. Nine named palettes, named ramps built from them, thirteen modes (the graphic families), a collage of modes, and a photograph poured like paint.
- `assets/live.js`: `Pour.live`, the same sheets on the GPU, still wet: they flow, the pointer combs them, a click drops paint into them, a section pours in as it scrolls. `assets/live-ui.js`: `Pour.ui`, controls poured in live paint (background, button, card, toggle, slider, progress, loader, focus ring, section transition).
- `reference.html`: a fictional record, "citric" by Tamsin Vey on Slowpour Records. It has a poured cover with dripping lettering, two flat fields with echo lettering, a wall of 47 sheets (one per graphic on the moodboard, listed like a print shop), a tour page on oil-slick chrome with glow lettering, a "pour your own" bench, a live hero ("still wet") and "pour desk", a small print-room app built from the live pieces. **Read it before designing.**

## Colour: palettes are sources, not decoration

The palettes were read off the colour pins of the moodboard. They say which colours a
graphic may use. They are never shown as a design element: no colour cards, chip strips,
swatch rows or hex codes as decoration.

| Palette | Colours (names are ours) |
|---|---|
| `record` | klein `#4100f5`, citric `#cdf564`, aquamarine, fuchsia, tangerine, soot `#191414` |
| `flats` | acid `#8ace00`, ultra `#1b2f94` (the two flat fields) |
| `neon` | mint, jade, magenta, sky, lavender, night `#090c08` |
| `wave` | lime, fern, cornflower, ultramarine, navy |
| `oil` | azure, butter, iris, pistachio, orchid, turquoise |
| `spot` | glacier, celery, rose, marigold, harbour |
| `canvas` | cobalt, indigo, apricot, mulberry, aubergine |
| `reef` | abyss, deepsea, tide, violet, lagoon |
| `lakeside` | moss, denim, tomato, sunlight, clay, cream |

A colour is named by its name: `'klein'`, `'citric+40'` (40 % toward white), `'navy-60'`
(60 % toward black) or a plain `'#rrggbb'`. A **ramp** is a list of colours, dark to light,
that a mode maps its field onto: a name from `Pour.RAMPS` (`pour`, `agate`, `mercury`,
`slick`, `acidnight`, `ice`, `plum`, `bloom`, `teal`, `pool`, `spin`, `wash`, `moshgreen`, …)
or a string such as `'night fern acid citric'`.

Names and specs may appear as text only where a real product needs them: a print shop
lists the inks of a print in its caption, in small type.

## Structure: the graphic families

| Family | Mode | What it is | Typical ramp and ground |
|---|---|---|---|
| pour | `swirl` | soft ramp between colours; `twirl` makes a vortex, `stretch` pulls it into ribbons | `pour`, `lagoon`, `shallows` |
| chrome and foil | `chrome` | a lit height field: relief, rings of reflection, speculars; `cycle` runs the ramp round for oil-slick and holo | `mercury`, `foil`, `slick`, masked onto night |
| marbling | `marble` | levels of colour with a dark vein between them; `alt` for odd levels, `threads` for fine lines inside | `acidnight`, `ice`, `ember` |
| agate | `bands` | combed stripes of one width; `comb: null` gives contour rings and mazes | `agate`, `reef` |
| moiré | `moire` | a field of fine lines, coloured by a second field | `plum`, `lilac` |
| grain bloom | `bloom` | petals round a centre, heavily blurred, then grained | `bloom`, `teal` |
| spun blur | `spin` | rings smeared along their arcs, as if shot while turning | `spin` |
| watercolour | `bleed` | pooled levels with dark rims and paper granulation | `wash` |
| splash and pour | `splash` | flat pools of colour with pale rims; `order: true` lays them in order | `splash`, `canvas` |
| caustics | `caustic` | the light net on a pool floor | `pool` |
| halftone | `halftone` | a dot screen over a two-colour field | two colours |
| datamosh | `dash` + passes | dashes that follow the field; `mosh`, `shift`, `wave`, `scan` break any mode like video | `moshgreen` |
| flat field | `field` | one colour, a gradient by `angle`, or a `radial` glow | `acid`, `ultra` |
| collage | `collage` | rectangles cut and butted, each its own mode | `tiles: [...]` |

Every mode reads the same fields, noise warped by noise, solved on a coarse grid and sampled
per pixel with its slope. Band widths, lines and veins are set in pixels, so edges stay sharp
at any size. Each mode is one field and one shading rule, and each pass only moves or dims
pixels, so every mode ports to a fragment shader.

## Grounds come from the graphic

- **Black** (night, soot) under chrome, oil and holo, under marbling with dark veins, moiré and datamosh. Light on black is right here.
- **Flat acid or ultra** as a pause between loud surfaces, with echo lettering in the other colour.
- **White card** under a wash, a bench or a form.
- A wall of prints sits edge to edge on soot, like a board.

## The four finishes

| Finish | Look | Use it for | `Goo.write(text, { finish })` |
|---|---|---|---|
| `blob` | fat soft bubble letters that touch; free ends swell into drops | section heads, loud one-word titles | `'blob'` |
| `drip` | blob letters with drips hanging off the baseline | covers, the one title that must stop the scroll | `'drip'` |
| `glow` | firm letters in a wide halo, with fading ghost copies stepping away | a title over chrome or a busy pour; night and tour pages | `'glow'` |
| `echo` | a solid front with twelve outline copies stacked behind it | flat colour fields, dates, numbers | `'echo'` |

The lettering is `currentColor`. The glow's halo and ghosts take `--goo-glow` and the echo's
rings take `--goo-echo`; both fall back to the text colour.

Liquid type is display type. Keep it to one to three words per surface. Body text, facts,
prices and inks are set in a narrow grotesque (the reference uses Instrument Sans with
`font-stretch` 75–85% for facts). Never set running text in goo.

## Type

`goo.js` letters the one liquid title. Everything else that is display type uses the skill's own
faces in `fonts/`. They are variable fonts made by `tools/foundry.py` from OFL fonts, under the SIL
OFL 1.1, and they are loaded from the skill itself, not from Google Fonts:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Soak** | A black grotesk soaked until its corners melt and its edges blot | `'BLED'`: Dry 0, Regular 500, Soaked 1000 | Second headlines, club-night names, a big number |
| **Globule** | A wide techno skeleton re-inked as poured liquid, with drops at the ends | `'MELT'`: Poured 0, Regular 500, Molten 1000 | The liquid voice next to a goo title: dates, heads, track names |
| **Flatbed** | A super-extended geometric pressed flat under a roller, with ink traps | `'FLAT'`: Standing 0, Regular 500, Pressed 1000 | Labels, catalogue numbers, formats, tracked small caps, a colour band |
| **Gouge** | A fat round display face with a crescent of light cut into every stroke | `'CARV'`: Scored 0, Regular 500, Gouged 1000 | Shop signs, prices, stickers, one shaded word on a flat field |

```css
.date  { font-family: 'Globule'; font-variation-settings: 'MELT' 400; }
.label { font-family: 'Flatbed'; font-variation-settings: 'FLAT' 800; letter-spacing: .04em; }
```

- **Split the work.** The title (one to three words) is `goo.js`. Heads, dates and labels use a
  face. Facts and running text stay in the sans. Use no more than two faces on a page, and
  never set running text in them.
- **The axis is the effect.** Choose one value per role and keep it. To animate it, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 500; }`, set
  `font-variation-settings: 'MELT' var(--v)` and animate `--v`. Animate one element at most,
  and never under `prefers-reduced-motion`.
- **The glow is not a font.** The board's neon halo is goo.js's `glow` finish on the title (or
  a canvas bloom), never a face and never a CSS text-shadow.
- **Rule 4 still holds.** "The type is liquid, not a font" is about the title: it stays goo.js,
  bouncing and seeded. The faces carry everything around it, which used to be the sans.

Sizes, full Latin (Western European), `woff2`: Soak 62 KB, Globule 59 KB, Flatbed 49 KB, Gouge 65 KB.
A page loads only the faces it uses (`font-display: swap`).

## Build it

```html
<script src="goo.js"></script>
<script src="pour.js"></script>
<script>
  // a pour: a mode (the family), a ramp (the inks), a seed; painted when it scrolls into view
  Pour.plate(document.querySelector('.cover'), { mode: 'swirl', ramp: 'ultra klein-20 ultra cornflower acid citric', seed: 1, scale: 0.62 });
  // liquid chrome pooled on black
  Pour.plate(document.querySelector('.tour'), { mode: 'chrome', ramp: 'slick', cycle: 0.7, mask: { cut: 0.5, ground: 'night' } });
  // acid marbling, broken like a video frame
  Pour.plate(document.querySelector('.sheet'), { mode: 'marble', ramp: 'night fern-40 fern jade', mosh: 0.35, block: 40 });
  const svg = Goo.letter(document.querySelector('h1'), { finish: 'drip', seed: 11 });   // text kept for screen readers
  Goo.pour(svg, { duration: 1600 });                                                     // condenses out of a puddle
</script>
<style>
  .cover { position: relative; color: #f3f5ea; }              /* lettering is currentColor */
  canvas.pour { position: absolute; inset: 0; width: 100%; height: 100%; }
  .cover h1 svg { width: min(86vw, 1100px); }                 /* size with CSS; the filter scales with it */
  .tour { color: #cdf564; --goo-glow: #4100f5; }              /* glow halo and ghosts */
</style>
```

- `Goo.write(text, opts)` returns an SVG; `Goo.letter(el, opts)` replaces an element's text with one and keeps the text for screen readers. Options: `finish`, `seed`, `size`, `align` (`center|left|right`), `leading`, `space`, and any finish value (`sw`, `blur`, `cut`, `wob`, `drop`, `dropR`, `drips`, `dripL`, `track`, `bounce`, `tilt`, `wobble`, `halo`, `ghosts`, `echoes`, `ring`). Use `\n` for line breaks.
- `Goo.pour(svg, { duration, delay, from, hold })` animates the letters out of a puddle and returns a promise. `hold: true` leaves the puddle in place, to pour later.
- `Goo.standalone(svg, { color, glow, echo })` bakes the colours into a copy for a `.svg` download; `Goo.toCanvas(svg, { width, color, glow, echo })` resolves to a canvas for PNG export or compositing.
- `Pour.paint(canvas, opts)` fills a canvas at its own size. `opts`: `mode`, `ramp`, `seed`, the field (`scale`, `warp`, `octaves`, `stretch`, `center`, `twirl`, `ridge`, `burst`, `comb`, `wander`, `contrast`), the mode's own values (see `Pour.MODES` for every default), and the extras below.
- Extras on any mode: `mask: { cut, soft, ground, dots, fade }` cuts the pour out of a ground along a second field (chrome pooled on black); `vignette`; the passes `shift`, `wave`/`waves`, `mosh`/`block`, `scatter`/`scatterP`, `scan`/`scanDark`; and `grain`/`grainSize`.
- `Pour.plate(el, opts)` puts a `canvas.pour` first in `el`, paints it when it comes into view and repaints on a big resize. `canvas.repaint(opts)` merges new options (a new `seed` is "another pour"); `opts.src` pours an image instead.
- `Pour.collage(canvas, { tiles: [opts, ...], cuts, seed })` cuts the canvas into rectangles and paints each with the next tile's options (also `mode: 'collage'`).
- `Pour.photo(canvas, img, { warp, map, amount, grain })` pushes a photograph's pixels along the warped field; `map` gradient-maps it onto a ramp.
- `Pour.color(name)` gives the hex of a colour name, `Pour.ramp(spec)` a ramp's hex list, `Pour.PALETTES`, `Pour.RAMPS` and `Pour.MODES` the tables; `Pour.fit(canvas, max)` sizes a canvas to its box at up to 2× DPR; `Pour.contrast(a, b)` is the WCAG ratio.

## Live

Live mode is for apps and sites where the graphics should respond: a hero you can drag through,
buttons that stir when hovered, a card that pours in as it scrolls up. Use it for heroes,
section backgrounds and a few key controls; the wall of sheets and small print plates stay
still (`Pour.plate`). Load the two live files after `pour.js`:

```html
<script src="assets/pour.js"></script>
<script src="assets/live.js"></script>     <!-- Pour.live -->
<script src="assets/live-ui.js"></script>  <!-- Pour.ui -->
```

**How it works (capture-first).** `live.js` asks the still engine to paint the sheet once on
the CPU without its grain (a `capture` hook in `pour.js` also hands over the field under the
paint), uploads both as textures, and each frame a WebGL2 shader moves where every pixel reads
the paint from, then adds the still's film grain back with the same integer hash, on top and
unmoved. Palettes and structure are therefore exactly the still's: any mode, ramp or pass that
`Pour.paint` accepts works live. Every live term is zero at time 0, so frame 0 is the still.

**The motion is the pour's own:**

| Term | What it looks like | Options (defaults) |
|---|---|---|
| flow | the paint slides along its own level lines, settles across them and swells slowly, like a sheet that has not dried | `drift` (1), `speed` (1), `wet` (1: 0 is dry and still, 1.6 is runny) |
| comb | the pointer is a comb dragged through the paint: it pulls the paint along its way, in teeth | `pointer` (0; 1 in `ui.background`), `reach` (0.16 of the short side), `tooth` (14 px), `lag` (0.12 s), `hand` (the element that hears the pointer; default the canvas's parent) |
| drop | a click drops paint in: a ring pushes out, spreads and settles (up to 4 at once) | `clickPulse` (false), `ctl.pulse(x, y, strength)` |
| pour-in | the sheet is poured down from the top with a drippy front, onto `ground` | `develop`: a number 0–1, `'in'` (once, when a quarter is in view) or `'scroll'`; `developMs` (1800), `scrollRange`, `ground` ('night') |
| reveal | controls: poured from the left up to a fraction, its edge running | `reveal` (null or 0–1) |
| grain | the still's grain, a share of the specks re-rolled 24 times a second, like film boiling | `alive` (true), `grainRate` (24), `boil` (0.3) |

Other motion options: `ease` (0.18 s, how `set()` eases `wet`, `reveal`, `develop`), `ring`
(`{ pad, band, radius }` px: draw only a band round the edge, transparent inside; the focus
ring uses it), `own` (own WebGL context; default for canvases ≥ 0.9 MP), `resolution` (1),
`maxField` (1.2e6: the captured sheet is painted at most this many pixels and scaled up).
Still options (`mode`, `ramp`, `seed`, `scale`, `warp`, `vein`, `mosh`...) repaint the sheet.
Bloom's own `radius` is a still option, which is why the comb's size is called `reach`.

**API.** `Pour.live(canvas, opts) → ctl | null`. The canvas fills its box (CSS), DPR is capped at 2.

- `ctl.set(opts)` merges options (motion next frame, still options repaint); `ctl.load(opts)` a new sheet (all still options replaced);
- `ctl.pulse(x, y, s)` a drop at CSS px of the canvas; `ctl.point(x, y)` / `ctl.point(null)` drags or lifts the comb yourself;
- `ctl.pause()`, `ctl.resume()`, `ctl.destroy()`;
- `ctl.state()` → `{ mode: 'gpu'|'still', path, frames, visible, expose, clock, size, ready, reduced }`;
- `ctl.bench(n)` → `{ sync, pipelined, size, path }` ms per frame with every term on;
- `Pour.live.parity(opts)`, `Pour.live.TOLERANCE`, `Pour.live.pass(r)`; `window.handPulledLive` holds every controller and the parity cases for `tools/check.sh`.

**UI pieces (`Pour.ui`).** Each keeps the native control; the canvas is `aria-hidden` behind it.

| Piece | Call | Behaviour |
|---|---|---|
| background | `ui.background(section, opts)` | a live sheet behind the section: flowing, combed by the pointer, a drop on click |
| button | `ui.button(btn, opts)` | still at rest (`rest` wet 0), stirred and combed on hover and `:focus-visible` (`hover` 1), a drop on press, Enter and Space |
| card | `ui.card(el, opts)` | poured in from the top the first time it scrolls in, then flowing and combable |
| toggle | `ui.toggle(checkbox)` | adds `role="switch"`; paint poured across the track when on; a pale thumb over it |
| slider | `ui.slider(range)` | paint poured from the left up to the value; the thumb follows |
| progress | `ui.progress(el, { value })` → `{ ctl, set(p) }` | `role="progressbar"` with `aria-valuenow`; fills as a pour, a drop when it reaches 1 |
| loader | `ui.loader(el)` → `{ ctl, stop() }` | `role="status"`; a small sheet stirred fast with a drop every beat |
| focus ring | `ui.focusRing(opts)` | one per page: a band of live paint round whatever has `:focus-visible`; keep a CSS outline too |
| section transition | `ui.transition(strip, opts)` | a strip between sections poured down as it scrolls up the viewport |

Buttons put their label on busy paint: wrap it in a `<span>` with a dark backing (see `.pill span`
in `reference.html`), and flip its colour on `:hover` and `:focus-visible`.

**Minimal example:**

```html
<section class="hero" id="hero"><h1>still wet</h1><button id="go"><span>pour</span></button></section>
<script>
  const ui = Pour.ui;
  ui.focusRing();
  const hero = ui.background(document.getElementById('hero'), { mode: 'marble', ramp: 'klein cornflower acid citric', vein: 2.2, seed: 4 });
  ui.button(document.getElementById('go'), { mode: 'chrome', ramp: 'mercury' });
  document.getElementById('go').addEventListener('click', () => hero.load({ mode: 'bands', ramp: 'agate', seed: 9 }));
</script>
<style>
  .hero { position: relative; min-height: 90svh; }   /* ui.* makes the host position: relative and isolates it */
  #go span { background: rgba(9,12,8,.74); color: #f3f5ea; padding: 3px 8px; border-radius: 999px; }
</style>
```

**Fallbacks.** With `prefers-reduced-motion` every view shows its still frame (clock 0, no flow,
comb or drops, grain frozen) and `set()` jumps to its target, drawing only when something
changed; it listens for the setting changing. Without WebGL2, or when the context is lost, the
view draws the CPU still (`Pour.paint`) and treats state the same way (reveal as a flat ground,
no motion). Offscreen views pause (IntersectionObserver) and the loop stops on a hidden tab. A
paused view still draws its first frame.

**Parity and performance.** `live.parity()` paints the still on the CPU and frame 0 on the GPU at
480×320 and compares them. Five cases (the cover's swirl, marble, moiré, oil-slick chrome, and
dash with `mosh` and `scan`): mean luminance, SD and grain all identical, mean difference 0.000
levels, 100 % of pixels within 2 levels: bit-exact, because frame 0 reads the captured sheet
at its pixel centres and the grain hash is the still's own. Tolerance (from LIVE_PATTERN):
dMean 0.004, dSdRel 0.02, dGrainRel 0.03, madLevels 1.5. The shader is one pass of texture
reads with a handful of field taps, a four-tap comb and four drops; the cost that matters is
the one-off CPU paint of the sheet (up to `maxField`, built one per task).
Frame time in real Chrome has not been measured yet (headless Chrome runs SwiftShader, so its
numbers mean nothing): measure with `ctl.bench(60)` in a visible Chrome tab against the budget
of 4 ms per frame at 1440×900 CSS, DPR 2.

## What makes it authentic

1. **Two colours lead.** Acid green and Klein blue pour into each other on the cover and come back as the flat fields, the lettering and the acid ribbons. Every other colour comes from the palettes, a few per surface.
2. **Many surfaces, one set of inks.** A page can carry a dozen families at once, as a board does. What holds it together is that every graphic draws from the same palettes.
3. **Liquid, not drawn.** Every graphic is a field that flowed: no vector shapes, no icons, no CSS gradients standing in for a pour.
4. **Grain on everything.** Every pour and field carries a monochrome film grain, so a flat colour reads as printed, not as a CSS background.
5. **The type is liquid, not a font.** Letters bounce, lean and vary. Ends swell into drops. Drips hang only from the baseline. The same seed gives the same letters, so a good pour can be kept.
6. **The type pours in.** Titles wait as a puddle and condense into letters when they scroll into view (`Goo.pour`). It is off under `prefers-reduced-motion`.

## Composition

- The cover is one full-bleed pour with one goo word across it and small facts in the corners (artist, label and catalogue number, date, format).
- A flat field is a pause between loud surfaces: one colour, grain, one echo word in the other lead colour.
- A wall of sheets hangs edge to edge on black in columns, with no shadow, no radius and no hover lift. Under each is the title, the family, and a print shop's small line: inks, edition, price.
- A tour page puts glow lettering over chrome on black, with the dates as a plain ruled list.
- Controls are bracketed text links (`[another pour]`, `[+ photograph]`) and rounded tags; a chosen tag is inked in.
- Use fictional artists, labels, venues and print names, or the user's own. Never use a real artist's name, likeness, logo, typeface or album art.

## Tells that it was generated — avoid all of them

- A "bubble" or "liquid" font (Bungee, Rubik Bubbles, Chewy, Rubik Wet Paint) standing in for lettering, or a CSS text-shadow "glow".
- Colour cards, swatch strips or hex codes used as decoration. The palettes feed the graphics; they are not a graphic.
- Purple-to-pink mesh gradients, glassmorphism, rounded cards with drop shadows, glowing buttons.
- A pour with no grain, or smooth CSS `conic-gradient` swirls.
- Liquid type on every heading, or on body text. One word per surface.
- Drips hanging from the tops of letters, or every letter dripping.
- One family repeated across a whole page; the board mixes chrome, veins, lines, blooms and blur.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, once with reduced motion and once after the letters have poured in.

- [ ] Every lettered word is `goo.js` output, and the typed text is only facts.
- [ ] Acid green and Klein blue lead, and every other colour comes from a palette.
- [ ] No colour card, chip strip or hex code appears as decoration.
- [ ] Every pour and field shows grain up close, and bands and veins have sharp edges.
- [ ] Lettering has a screen-reader text (`letter()` does this) and the page makes sense without animation.
- [ ] There is no horizontal scroll on a phone.
- [ ] There are no console errors.
- [ ] Live pages: every `handPulledLive.parity['maximalist-boc']()` case has `.pass`; visible views are moving; with reduced motion every view drew one still frame and does not change.

## Credits and prior art

This is an original implementation. The alphabet was drawn point by point for `goo.js`; no
font or vector source was traced. The melting comes from the metaball trick (blur, then an
alpha threshold) done as an SVG filter. The pours use domain warping as described by Inigo
Quilez ("warp", iquilezles.org), rewritten here on value noise. The palettes and families
were read off a private moodboard of liquid colour graphics (reference only; no images are
used). Toolkits reviewed while building this set: NovusGFX/retro-design-system (MIT) for
the idea of themes as swappable token worlds, and
wilwaldon/Claude-Code-Frontend-Design-Toolkit for the case against default-looking AI
frontends.
