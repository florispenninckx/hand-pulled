---
name: riso-cartography
description: Design pages, posters and covers that look like risograph-printed town plans and river maps, in one to three spot inks. Examples are a figure-ground plan with every block in solid red and the streets, squares and river left as paper; the same town as blue watercolour blocks, as pink house footprints under a motorway cloverleaf, or as teal hatched blocks on cream; a purple river with every old course and oxbow behind it; a land-use plan in pastel pink, purple halftone and teal hairlines with hollow arrows; and a walk poster with huge black words over a green valley map. The towns are grown and the rivers migrated, never traced. Grain, misregistration and overprint come from a simulated press, not a filter. Use it for exhibitions, architecture and urbanism, city guides, walks, festivals, zines, record sleeves and cultural sites. Also use it when the user asks for riso, risograph, spot colour, two-colour print, overprint, grain or halftone, or a figure-ground, Nolli, town, site, zoning or land-use map.
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
- `reference.html`: "Figure & Ground", an atlas of a fictional town by a fictional print club. Sheet I sits at full height beside an italic serif title, with its ink switchable and a photo drop. The other six follow in two staggered rows. Sheet VI is then proofed drum by drum, and the page ends with an ink table and a short programme. **Read it before designing.**

## The seven sheets

| Sheet | Drums, paper | What is on each drum | Look on the board | `Atlas.<call>(canvas, opts)` |
|---|---|---|---|---|
| I | bright red twice; white | every block solid, with courtyards, slab estates, stippled parks and open squares. A river with bank lines, bridges, a motorway, the round old square and its monument, a serif title and typed notes | the deep one-ink figure-ground plans, blue or red | `blocks`, `mode: 'solid'`, `ink`, `image` |
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
| inks (Riso names, from `Riso.INKS`) | bright red `#f15060`, cornflower `#62a8e5`, fluorescent pink `#ff48b0`, teal `#00838a`, purple `#765ba7`, green `#00a95c`, black. For sheet I also blue `#0078bf`, and the rest of the table |
| papers | white `#f7f6f2`, cream `#efe4cc`, natural `#f3eee2` |
| page | plan-chest grey `#e8e5dc`, ink `#1c1c1a`, soft `#6d6a62`, rules `#cfcabd`, a bright-red hairline `#f15060` for section rules, a fluorescent-pink dot as the only bullet |

Type, each face with one job:
- **Instrument Serif**, italic for titles, on the page and on the sheets.
- **Instrument Sans** 500 for the huge poster words, the head and small tracked caps, and 400 for reading.
- **IBM Plex Mono** 400 at 12–14 px for typed notes, map labels, keys, captions and controls.

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
