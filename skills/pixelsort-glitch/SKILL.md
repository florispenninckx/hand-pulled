---
name: pixelsort-glitch
description: Design pages and visuals in the pixel-sort and slit-scan glitch style. A picture's rows are sorted and dragged sideways from a slit into saturated teal, pink, orange and violet smears on a dark ground. Rows are pushed by waves until they come apart in moiré contour lines, and columns drip out of macroblocks. A dropped LCD shows cracks, shards and stuck colour columns. The picture is cut on a grid into a collage in hot pink on black, a photocopy is pulled across a scanner until its RGB lines split into fringes, and heavy type is sliced, doubled and streaked on paper or in blue ink. Use it for club nights and festivals, electronic and experimental releases, net art, dev tools and hackathons, editorial headers and zines. Also use it when the user asks for pixel sorting, slit-scan, glitch art, databending, datamosh, macroblocking, melting or dripping pixels, wave or displacement warps, a cracked or broken screen, scanner glitch, glitched typography, or corrupted, broken or lossy images.
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
- `assets/glitch.js`: `window.Glitch`, seven seeded plates built on it (`smear`, `wave`, `drip`, `shatter`, `collage`, `scan`, `type`), `dusk` (the stand-in photograph, a coast at dusk drawn in code), and the helpers `macroblock`, `slitRow`, `slitCol`, `scanlines` and `vivid`. Load `pixelsort.js` first. There are no other dependencies.
- `reference.html`: "Stale Vector", a fictional weekend of broken files. The smear is the hero, and below it are a lede with one phrase marked in pink and a three-column board of six plates captioned like file names. A smear strip divides the page, and the programme is printed as a listing. **Read it before designing.**

## The seven plates

| Plate | What happens to the picture | Board pins it answers | `Glitch.<plate>(canvas, opts)` |
|---|---|---|---|
| `smear` | The picture is read through a slit band by band. Each band draws a narrow strip of the picture out across the whole width, and the strip walks sideways from band to band, so every edge comes out as a staircase. Each row is then sorted inside its mid-tone runs, a few bands land with red and blue out of register, and scanlines and grain go on top | 1, 3, 5, 11: long horizontal smears of teal, pink and orange, over dark | `image` |
| `wave` | `ripple`: an edge meanders down the plate. Left of it, every row is dragged flat from the edge. Right of it, the rows are pushed back and forth by a few pixels, and the picture comes apart in contour lines, like the moiré of a screen shot through a screen. `water`: the columns are sorted into streaks, and then the picture wobbles as if seen through moving water | 2, 4, 11 | `image`, `mode` |
| `drip` | A band of the picture turns into macroblocks, stale blocks drift up as dust, and below the band each run of columns is stretched down and interval-sorted. `dusk` does this over the coast, and `mint` over a pale mint ground | 9, 15, 20, 21 | `image`, `mode` |
| `shatter` | An LCD that hit the floor. The backlight washes the picture pale and cold, cut driver lines leave clustered columns stuck on one colour, the glass breaks into wedges that each show the panel slightly moved and turned, the middle is crushed into splinters, and liquid crystal bleeds along the cracks in spiky black stains | 6, 18 | `image` |
| `collage` | The picture is cut into rectangles on a loose grid. Some pieces stay in place, some move, and some are blown up until their pixels show. Each piece is broken one way: streaked from one row, seen through a mesh, macroblocked, cut to its darks, or tinted pink, grey, blue or rust. Thin runs of colour leak out of the pieces sideways. `night` uses grey, mesh and hot pink on black. `day` uses pale streaks, one blue, rust and black on white | 8, 13, 16, 7 | `image`, `mode` |
| `scan` | A black-and-white photocopy on a flatbed whose sheet moved while the head ran. Where the sheet wobbled, edges snake. Where it stalled, rows repeat into streaks. Where it was jerked, a line blurs flat. The head reads R, G and B a few lines apart, so every moved edge splits into a rainbow fringe | 10, 17 | `image` |
| `type` | `ink`: a one-colour print in blue on cream, with rules, numbers, a dot grid and a ghost of the title. Columns of the sheet are dragged down where the scanner stuck on a line, the words are set large, and small print is knocked out of a solid band. `paper`: heavy lowercase words, loosely spaced, over a band of the picture pulled sideways. The lines are sliced and shifted, one is doubled, and ink is flicked over them | 19, 14 | `image`, `mode`, `text` |

"Board pins" are the pins on the pixel-glitch reference board that each plate was built
against. They were used as reference only (see Credits). Every plate also takes `seed`,
`width`, `height`, `cssWidth` and `scene`. `scene` picks the stand-in picture and
defaults to the seed. `pixel` sets the size of a work pixel in CSS px: 1 by default and
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
| `drip` mint | ground `#e9f7f5` → `#cdeeed` → `#b9e2e0`, mass `#27353a #3d5b5c #6c9d9b #8c7652 #a7d8d5 #f6fcfb` |

Type: use one monospace for everything small (IBM Plex Mono 400/500/700, 12–13 px) and
one heavy grotesk for anything large (Archivo 800, lowercase, tracking −0.045em, line
height 0.8; Archivo 700 for a lede). Large type sits flat on the picture, where the
picture is calm, and never on a glow. Do not add a third face.

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
- [ ] The same seed gives the same plate, "another" gives a new one, and the modes of `wave`, `drip`, `collage` and `type` switch.
- [ ] A dropped photograph is broken each plate's way.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

This is an original implementation. The plates, the stand-in coast and the listing were
written for `glitch.js`, and no photograph or found glitch is included. The interval
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
