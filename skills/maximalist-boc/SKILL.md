---
name: maximalist-boc
description: Design pages in a loud, liquid maximalist colour style — acid green and Klein blue poured into each other, agate bands, marbling with dark veins, moiré line fields, blurred blooms and flat colour fields with film grain, palette cards that name every colour with RGB/HEX/CMYK, and blobby liquid display lettering that melts, drips, glows or echoes. Flat, saturated and in daylight, never lit on black. Use it for record and single pages, tour dates, poster and print shops, festivals, club nights, fashion drops, colour or paint brands and any page whose subject is colour itself. Also use it when the user asks for liquid, melting, gooey, blobby, bubble or drippy type, acid or neon green with blue, marbled or swirled colour, "maximalist" colour, a colour card or palette page, psychedelic-but-clean layouts, or a pour / paint-flow look.
---

# Maximalist BOC: poured colour and liquid type

This is the look of a record rolled out in colour, not in pictures. The cover is acid green
and Klein blue poured into each other and left to settle. The colour card lists the seven
colours of the record like a paint chart, with specs. The prints are pours: agate bands,
marbling, a bloom, a field of fine lines. The title is not set in a font. It is liquid:
fat strokes that melt together, swell into drops at their ends and run down off the
baseline. Everything is flat, saturated and lit by daylight. The maximalism is in the
colour, and the type is the one thing that moves.

The files next to this SKILL.md:

- `assets/goo.js`: `window.Goo`, liquid display lettering. One alphabet (a–z, A–Z, 0–9, punctuation) drawn point by point as pen strokes, then stroked fat, blurred and cut back at a threshold so the strokes melt into blob letters. Four finishes, seeded, no dependencies. Each SVG carries its own filter, so it scales with CSS and exports as a self-contained file.
- `assets/pour.js`: `window.Pour`, liquid colour. Six modes of poured paint on a canvas, sixteen palettes, a photograph poured like paint, and palette cards (bars, strips, pills).
- `reference.html`: a fictional record, "citric" by Tamsin Vey on Slowpour Records. It has a poured cover with dripping lettering, a colour card of seven tracks, two echo fields, nine prints, a tour poster with glow lettering and a "pour your own" bench. **Read it before designing.**

## The four finishes

| Finish | Look | Use it for | `Goo.write(text, { finish })` |
|---|---|---|---|
| `blob` | fat soft bubble letters that touch; free ends swell into drops | section heads, loud one-word titles | `'blob'` |
| `drip` | blob letters with drips hanging off the baseline | covers, the one title that must stop the scroll | `'drip'` |
| `glow` | firm letters in a wide halo, with fading ghost copies stepping away | a title over a busy pour; night and tour pages | `'glow'` |
| `echo` | a solid front with twelve outline copies stacked behind it | flat colour fields, dates, numbers | `'echo'` |

The lettering is `currentColor`. The glow's halo and ghosts take `--goo-glow` and the echo's
rings take `--goo-echo`; both fall back to the text colour.

Liquid type is display type. Keep it to one to three words per surface. Body text, facts,
prices and specs are set in a narrow grotesque (the reference uses Instrument Sans with
`font-stretch` 75–85% for facts). Never set running text in goo.

## The six pours

| Mode | Look | Palettes it was tuned on |
|---|---|---|
| `swirl` | soft ramp between the colours; `twirl` turns it into a vortex | `citric`, `lime`, `aqua`, `sherbet` |
| `bands` | combed agate stripes of one width, each with a dark core line | `agate`, `pool` |
| `moire` | a field of fine lines, coloured by a second field | `plum`, `aqua` |
| `marble` | levels of colour with a vein between them (dark, or white for a wet highlight); `alt` ramps for odd levels | `lava`, `ink`, `cobalt` |
| `bloom` | petals round a centre, reach varied by noise, heavily blurred | `bloom`, `nectar` |
| `field` | one flat colour with grain, or one slow gradient | `acid`, `klein` |

All modes read one field, noise warped by noise, solved on a coarse grid and sampled per
pixel with its slope. Band widths, lines and veins are set in pixels, so edges stay sharp at
any size and a pour looks the same on a phone and a poster.

## What makes it authentic

1. **Two colours carry the page.** Acid green (`#b4f000`, `#95d401`) and Klein blue (`#1f2fb0`) pour into each other on the cover and come back on every surface. Other colours (pool `#5fe0c8`, fuchsia `#ed1fb3`, tangerine `#ff5a2a`) are accents, one per surface. Ink is a green-black (`#0e120c`) and paper is an off-white with green in it (`#eef0e6`).
2. **Flat and in daylight.** A pour is paint seen from above: no light source, no shine, no depth, no black-page glow. The one dark surface (the `ink` marble) is still flat colour on black, not light on black.
3. **The colours are named.** A colour card is part of the design, not an appendix. Each colour gets a name, RGB/HEX/CMYK and a turned name inked in its neighbour's colour (contrast ≥ 3). Each print shows the chips it was poured from.
4. **The type is liquid, not a font.** Letters bounce, lean and vary. Ends swell into drops. Drips hang only from the baseline. The same seed gives the same letters, so a good pour can be kept.
5. **Grain on everything.** Every pour and field carries a monochrome film grain, so a flat colour reads as printed, not as a CSS background.
6. **The type pours in.** Titles wait as a puddle and condense into letters when they scroll into view (`Goo.pour`). It is off under `prefers-reduced-motion`.

## Build it

```html
<script src="goo.js"></script>
<script src="pour.js"></script>
<script>
  Pour.plate(document.querySelector('.cover'), { mode: 'swirl', palette: 'citric', seed: 7 });   // painted when seen
  const svg = Goo.letter(document.querySelector('h1'), { finish: 'drip', seed: 11 });         // text kept for screen readers
  Goo.pour(svg, { duration: 1600 });                                                           // condenses out of a puddle
  Pour.swatches(document.querySelector('.card'), [
    { name: 'Klein', hex: '#1f2fb0', label: '01 — 3:41' },
    { name: 'Citric', hex: '#b4f000', label: '02 — 2:58' },
    { name: 'Pour', stops: ['#1f2fb0', '#5fe0c8', '#b4f000'], names: ['klein', 'pool', 'citric'], ink: '#5fe0c8' },
  ], { layout: 'bars' });
</script>
<style>
  .cover { position: relative; color: #eef0e6; }              /* lettering is currentColor */
  .cover canvas.pour { position: absolute; inset: 0; width: 100%; height: 100%; }
  .cover h1 svg { width: min(86vw, 1100px); }                 /* size with CSS; the filter scales with it */
  .tour { color: #ed1fb3; --goo-glow: #eef0e6; }              /* glow halo and ghosts */
</style>
```

- `Goo.write(text, opts)` returns an SVG; `Goo.letter(el, opts)` replaces an element's text with one and keeps the text for screen readers. Options: `finish`, `seed`, `size` (px per x-height ×10), `align` (`center|left|right`), `leading`, `space`, and any finish value (`sw`, `blur`, `cut`, `wob`, `drop`, `dropR`, `drips`, `dripL`, `track`, `bounce`, `tilt`, `wobble`, `halo`, `ghosts`, `echoes`, `ring`). Use `\n` for line breaks.
- `Goo.pour(svg, { duration, delay, from, hold })` animates the letters out of a puddle and returns a promise. `hold: true` leaves the puddle in place, to pour later.
- `Goo.standalone(svg, { color, glow, echo })` bakes the colours into a copy for a `.svg` download; `Goo.toCanvas(svg, { width, color, glow, echo })` resolves to a canvas for PNG export or compositing.
- `Pour.paint(canvas, { mode, palette, seed, ...mode values })` fills a canvas at its own size. `palette` is a name from `Pour.PALETTES`, an array of hex colours, or `{ colors, vein, core, alt }`.
- `Pour.plate(el, opts)` puts a `canvas.pour` in `el`, paints it when it comes into view and repaints on a big resize. `canvas.repaint(opts)` merges new options (a new `seed` is "another pour"); `opts.src` pours an image instead.
- `Pour.photo(canvas, img, { warp, scale, map, amount, grain })` pushes a photograph's pixels along the warped field; `map` gradient-maps it onto a palette.
- `Pour.swatches(el, list, { layout: 'bars'|'strip'|'pills', spec })`: bars are tall cards with specs and a turned name (rows on a phone), a strip is square chips with hex, pills are rounded tabs. Items take `{ name, hex, label, note, stops, names, ink }`.
- `Pour.fit(canvas, max)` sizes a canvas to its box at up to 2× DPR; `Pour.contrast(a, b)` is the WCAG ratio.

## Composition

- The cover is one full-bleed pour with one goo word across it, in off-white, and small facts in the corners (artist, label and catalogue number, date, format).
- A colour card sits right under the cover: one bar per colour, full width, touching, no gaps, no radius.
- A flat field is a pause between loud surfaces: one colour, grain, one echo word in the other main colour.
- Prints are flat sheets at 3:4 in a grid, with no shadow, no radius and no hover lift. Under each: its chip strip, then the title in bold and size, inks, edition and price.
- A tour page puts glow lettering over a pour, with the dates as a stack of solid colour pills.
- Controls are bracketed text links (`[another pour]`, `[+ photograph]`) and rounded tags; a chosen tag is inked in.
- Use fictional artists, labels, venues and colour names, or the user's own. Never use a real artist's name, likeness, logo, typeface or album art.

## Tells that it was generated — avoid all of them

- A "bubble" or "liquid" font (Bungee, Rubik Bubbles, Chewy, Rubik Wet Paint) standing in for lettering, or a CSS text-shadow "glow".
- Purple-to-pink mesh gradients, glassmorphism, rounded cards with drop shadows, glowing buttons.
- Neon lit on black, bloom and chrome. That is a different style (chrome-aurora); this one is paint in daylight.
- A pour with no grain, or smooth CSS `conic-gradient` swirls.
- Liquid type on every heading, or on body text. One word per surface.
- Drips hanging from the tops of letters, or every letter dripping.
- Colours with no names, or hex codes typed in without the colours they name.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, once with reduced motion and once after the letters have poured in.

- [ ] Every lettered word is `goo.js` output, and the typed text is only facts.
- [ ] Acid green and Klein blue lead, with at most one accent per surface.
- [ ] Every pour and field shows grain up close, and bands and veins have sharp edges.
- [ ] Every name on a colour card reads (contrast ≥ 3), including on a gradient.
- [ ] Lettering has a screen-reader text (`letter()` does this) and the page makes sense without animation.
- [ ] There is no horizontal scroll on a phone.
- [ ] There are no console errors.

## Credits and prior art

This is an original implementation. The alphabet was drawn point by point for `goo.js`; no
font or vector source was traced. The melting comes from the metaball trick (blur, then an
alpha threshold) done as an SVG filter. The pours use domain warping as described by Inigo
Quilez ("warp", iquilezles.org), rewritten here on value noise. The palettes were sampled
from a private moodboard of liquid colour posters and colour cards (reference only; no images
are used). Toolkits reviewed while building this set: NovusGFX/retro-design-system (MIT) for
the idea of themes as swappable token worlds, and
wilwaldon/Claude-Code-Frontend-Design-Toolkit for the case against default-looking AI
frontends.
