---
name: riso-cartography
description: Design pages, posters and covers that look like risograph-printed maps, in one to three spot inks. Examples are an aqua aerial view of an estuary with white creeks outlined in black and fluorescent green dots, stepped green photo windows of a riverbed and a moor with thin red rules, a yellow-and-grey chart with the land left as bare paper, a grid, and grey insets holding brown rock drawings, and a single green drum of type spread soft over cloud contours. Grain, misregistration, overprint and uncoated paper come from a simulated press, not a filter. Use it for exhibitions, almanacs, outdoor and travel brands, festivals, zines, record sleeves, editorial and cultural sites. Also use it when the user asks for riso, risograph, spot colour, duotone or two-colour print, overprint, misregistration, grain or halftone screens, a printed, aerial or topographic map, a cartographic or survey poster, or an "indie print shop" look.
---

# Risograph cartography: Low Water

A risograph is a stencil duplicator. Each colour is its own drum of translucent soy ink,
pushed through a master onto uncoated paper one pass at a time. Everything that makes
riso look like riso comes from that mechanism: tone is a grain of dots, two inks crossing
make a third colour, drums land a little off each other, and big solids come out uneven.
The sheets here are maps because maps give the mechanism something to do. Water is paper
knocked out of an ink, a grid is a line cut through two drums, and an inset is a window
where one drum stops.

The files next to this SKILL.md:

- `assets/riso.js`: `window.Riso`, the press. It has per-ink drums, grain, halftone and solid screens, misregistration, drum mottle, multiply overprint and paper fibre, plus `INKS` (real Riso colours) and `PAPERS`.
- `assets/cartography.js`: `window.Carto`, seeded terrain and map furniture (isolines, tints, hillshade, rivers, towns, roads, place names).
- `assets/atlas.js`: `window.Atlas`, four finished sheets built on both: `estuary`, `windows`, `chart` and `rain`. Load `riso.js` and `cartography.js` first.
- `reference.html`: "Low Water", an almanac of a fictional estuary by a fictional print club. It has sheet I at full height beside an italic serif title, the other three sheets staggered, sheet I proofed drum by drum, an ink table and a short programme. **Read it before designing.**

## The four sheets

| Sheet | Drums, paper | What is on each drum | Pin feel | `Atlas.<sheet>(canvas, opts)` |
|---|---|---|---|---|
| `estuary` | aqua, black, fluorescent green; white | aqua: the flats as an aerial texture, with the channel and a dendritic creek network knocked out to paper. Black: each creek's banks as hairlines, plus all the type (grotesk caps, a big roman word, an italic serif title). Green: a dozen solid dots | the pale blue aerial map with white rivers and green dots | `image`, `text`, `ink` |
| `windows` | green, bright red, black; white | green: four stepped windows on a 12-column grid, a braided riverbed from above as marbled bands, a moor at eye level with one seated figure, and an ellipse running off onto paper. Red: hairlines along window edges run to the trim, plus one thick bar. Black: sideways slugs and crop marks | the stepped photo windows with red rules | `image`, `ink` |
| `chart` | yellow, light grey, brown; natural | yellow: the sea as a photographic texture, the land and a grid knocked out, one town in solid. Grey: weather over the sea, flat grey insets, a word drawn in huge outline, white labels. Brown: rock faces in the insets, as an outline, fissures and shadow | the chartreuse and grey island chart with rock insets | `image`, `text` |
| `rain` | green only; white | a hill of bold type lines, spread soft the way over-inked type spreads, over thin cloud contours, with a typed head in three columns | the single green drum of blurred type | `text: { words }`, `ink` |

Every sheet also takes `seed`, `width`, `height` (1 : 1.414, A-series), `misregister`
(1 is a normal press day, 2 a sloppy one), and `drums` (indices, to proof one separation).
A dropped photograph goes through the sheet's picture drum, and its darks become ink.

## What makes it authentic

1. **Separations, not colours.** Nothing is filled with a colour. Every mark is drawn in black on one drum's master, at a density from 0 to 1, and `Riso.print` inks it. Decide the drum before drawing.
2. **White is paper.** The estuary's water, the chart's land and grid, and the insets' labels are all knockouts, places where a drum has no ink. They are not white fills on top.
3. **Two inks make the third.** Grey over yellow gives the chart its olive. Plan the overlaps and keep to at most three drums.
4. **The press is imperfect, and that shows.** Each drum lands offset and slightly rotated, so the green dots never sit quite on the banks. Large areas mottle along the feed, and solids have starved specks.
5. **Tone is grain.** Every tint is a stochastic dot screen at a density. A continuous gradient is the quickest tell of a fake.
6. **Maps from process.** Creeks grow by forking and thinning. Rock is drawn from its own height field, and land from distance to a spine plus noise. Nothing is traced from a stock map.

## Tokens

| Role | Value |
|---|---|
| inks (Riso names, from `Riso.INKS`) | aqua `#5ec8e5`, black, fluorescent green `#44d62c`, green `#00a95c`, bright red `#f15060`, yellow `#ffe800`, light grey `#88898a`, brown `#925f52`, and the rest of the table |
| papers | white `#f7f6f2`, natural `#f3eee2` |
| page | plan-chest grey `#e8e5dc`, ink `#1c1c1a`, soft `#6d6a62`, rules `#cfcabd`, a bright-red hairline `#f15060` for section rules, a fluorescent-green dot as the only bullet |

Type, each face with one job:
- **Instrument Serif**, italic for titles, on the page and on the sheets, with roman for one big word on a sheet.
- **Instrument Sans** 500 in small tracked caps for kickers, labels and printed blocks of text, and 400 for reading.
- **IBM Plex Mono** 400 at 12 px for typed notes, captions, slugs and controls.

## Build it

```html
<figure class="sheet"><div class="paper"><canvas role="img" aria-label="…the sheet and its printed words…"></canvas></div></figure>
<script src="riso.js"></script>
<script src="cartography.js"></script>
<script src="atlas.js"></script>
<script>
  const c = document.querySelector('.sheet canvas'), w = Math.round(c.getBoundingClientRect().width * Math.min(1.5, devicePixelRatio));
  Atlas.estuary(c, { width: w, height: Math.round(w * 1.414), seed: 3, text: { title: 'Low Water' } });
  // your own sheet: Riso.print(canvas, { paper: 'white', layers: [{ ink: 'aqua', draw: (ctx, w, h, rand) => { … }, screen: 'grain', density: .9 }] })
</script>
<style>
  .paper { position: relative; aspect-ratio: 1000 / 1414; background: #f7f6f2; }
  .paper canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
```

- A sheet takes 60–300 ms at 700 px wide. Print one at a time, top first, when it comes near the viewport, after `document.fonts.load` for the faces the sheets set. Re-print only when the width really changes, because phones fire `resize` while scrolling.
- Output is deterministic per seed. Offer `[another pull]` for a new seed rather than randomising on load.
- In React, print in `useEffect` on a canvas ref, keyed on seed, image and size.
- To make your own sheet, copy `atlas.js`'s pattern. Draw each drum's master in sheet units (1000 × 1414) with `field()` for tones and plain canvas paths for lines and type, then print.

## Composition

- The sheet is the page's picture. Show sheets whole, at A-series proportion, on a quiet table colour, with no shadows, rotation or mock-up frames.
- Open with one sheet at full viewport height beside a huge italic serif title, a plain lede and a `dl` of edition facts. After that, the other sheets are staggered in a row, each captioned with a roman numeral, a title, and its drums in mono.
- Show the process once: the same sheet proofed drum by drum, then all together.
- Section rules are a single bright-red hairline. The only ornament is a fluorescent green dot.
- The type printed on a sheet goes on its darkest drum and misregisters with everything else. Repeat those words in the canvas `aria-label`.
- Use fictional places, clubs and people, or the user's own. Never use a real brand's name, logo or map artwork.

## Tells that it was generated — avoid all of them

- A flat vector design with a noise PNG and `mix-blend-mode` on top, called riso.
- CSS gradients, glows, drop shadows, or posters tilted with a shadow like a mock-up.
- Perfect registration and crisp edges everywhere.
- Colours outside the ink table, CMYK-bright cyan, or more than three inks on one sheet.
- White drawn as a fill on top of ink instead of knocked out of it.
- A stock map or satellite photo traced in one colour. Build the geography from its own process.
- A centred hero, three feature cards and a gradient button.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each sheet, and put them next to the reference pins. Then zoom a 400 px crop to 100 %.

- [ ] Every mark sits on one named drum, and overprints give the intended third colours.
- [ ] Water, land and labels that read white are knockouts: paper shows there.
- [ ] Registration visibly drifts: the dots or type sit off the banks.
- [ ] One large area shows grain, mottle and starved specks.
- [ ] The same seed reprints identically, `[another pull]` gives a new sheet, and a dropped photograph prints through the picture drum.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

The engines are original code. Ideas, with thanks: Robpayot/risograph-grain-shader (MIT)
for the grain-screen idea, jywarren/risoAtHome (no licence file, so nothing was copied)
for per-ink separation, and the p5.riso ink table for Riso colour values. The map methods
are textbook: marching squares, fractal noise, and branching growth. General inspiration
came from the "10 niche design styles" board by A Song Studio, used as reference only;
none of its images are used.
