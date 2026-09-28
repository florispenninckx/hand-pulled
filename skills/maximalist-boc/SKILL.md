---
name: maximalist-boc
description: Design pages in a loud, liquid maximalist colour style led by acid green and Klein blue. Graphics are poured, not drawn: liquid chrome and oil-slick foil, marbling with dark veins, agate, moiré line fields, grain blooms, watercolour, spun and blurred light, splash pours, datamosh, caustics, halftone, flat colour fields and collage, all with film grain, many of them on black. Colour comes from a small set of named palettes, and every graphic draws its inks from them. Grounds come from the graphic: black under chrome and veins, a flat field of one of the two lead colours, white card under a wash. Display type is blobby liquid lettering that melts, drips, glows or echoes. Use it for record pages, tour dates, poster and print shops, festivals, club nights, fashion drops and paint brands. Also use it for liquid, melting, blobby or drippy type, acid or neon green with blue, marbled, chrome or swirled colour, "maximalist" colour, psychedelic-but-clean layouts, or a pour / paint-flow look.
---

# Maximalist BOC: poured colour and liquid type

This is the look of a record rolled out in colour, not in pictures. The cover is acid green
and Klein blue poured into each other and left to settle. Around it hangs a wall of sheets
that were poured the same way: liquid chrome pooled on black, acid ribbons with dark veins,
agate, fine moiré lines, a bloom lost in grain, a watercolour wash, broken video frames. The
title is not set in a font. It is liquid: fat strokes that melt together, swell into drops at
their ends and run down off the baseline. The maximalism is in the colour and the surfaces.
The type is the one thing that moves.

The files next to this SKILL.md:

- `assets/goo.js`: `window.Goo`, liquid display lettering. One alphabet (a–z, A–Z, 0–9, punctuation) drawn point by point as pen strokes, then stroked fat, blurred and cut back at a threshold so the strokes melt into blob letters. Four finishes, seeded, no dependencies. Each SVG carries its own filter, so it scales with CSS and exports as a self-contained file.
- `assets/pour.js`: `window.Pour`, liquid colour. Nine named palettes, named ramps built from them, thirteen modes (the graphic families), a collage of modes, and a photograph poured like paint.
- `reference.html`: a fictional record, "citric" by Tamsin Vey on Slowpour Records. It has a poured cover with dripping lettering, two flat fields with echo lettering, a wall of 47 sheets (one per graphic on the moodboard, listed like a print shop), a tour page on oil-slick chrome with glow lettering, and a "pour your own" bench. **Read it before designing.**

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
