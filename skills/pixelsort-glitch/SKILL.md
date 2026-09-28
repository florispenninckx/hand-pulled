---
name: pixelsort-glitch
description: Design pages and visuals in the pixel-sort / broken-file glitch style — a picture breaking into macroblocks with its columns dripping down as sorted pixels on mint, 1-bit scanlines that overrun into black bars, a code printout smeared pink and blue by a moving scanner, a JPEG opened as MacRoman mojibake under yellow highlighter, a black-and-white photograph in tiles with flat lavender or white blocks where tiles failed to load. Use it for club nights and festivals, electronic and experimental releases, net art, dev tools and hackathons, editorial headers and zines. Also use it when the user asks for pixel sorting, glitch art, databending, datamosh, macroblocking, melting or dripping pixels, corrupted, broken or lossy images, scanner glitch, mojibake, 1-bit or dithered pixels, or "tiles that did not load".
---

# Pixel-sort glitch: broken files

This is what a picture looks like after something happens to the file. A codec at
the bottom of its bitrate loses its motion vectors, so blocks hang in the air and the
columns under them drip. A one-bit line keeps printing black after the picture stops
asking for it. Someone pulls the sheet while the scanner is still moving. A text
editor opens a JPEG and shows its bytes as accented letters. A grid of tiles loads,
and some tiles never come. Every plate here is made by doing one of those things to a
picture. None of it is a glitch filter laid over a finished design.

The files next to this SKILL.md:

- `assets/pixelsort.js`: `window.PixelSort`, the low-level tools. It has `sort` (interval pixel sorting by threshold, random, edges, waves or border, at any angle, with a mask), `channelShift`, `slices`, and `crush`, which is real JPEG generation loss through the browser's encoder.
- `assets/glitch.js`: `window.Glitch`, five seeded plates built on it (`melt`, `tear`, `printout`, `mojibake`, `mosaic`) and `eye`, the stand-in photograph. Load `pixelsort.js` first. There are no other dependencies.
- `reference.html`: "Stale Vector", a fictional weekend of broken files. It has the melt as the hero, a lede with one highlighted phrase, a board of four plates captioned like file names, and the programme printed as a listing. **Read it before designing.**

## The five plates

| Plate | What happens to the file | Pin feel | `Glitch.<plate>(canvas, opts)` |
|---|---|---|---|
| `melt` | A band of the picture averages into macroblocks. Stale blocks and single dead pixels drift up as dust, and below the band each run of columns is stretched down and then sorted, so lighter pixels slide to the bottom | mint ground, brown and slate blocks, teal-and-white drip | `image`, `palette: 'mint'` |
| `tear` | A 1-bit picture in scanlines of random height. Once a run goes black it overruns, some rows stipple, and some rows drop out white | white with black horizontal bars and dither clouds | `image`, `ink` (share of black, 0.2) |
| `printout` | A code listing on cream paper in grey, green, red and blue, with lines that barely took toner. In one band the sheet moved: the rows stretch sideways from a point, the channels split, and the lamp tints them pink over blue | a scanned source printout with a pink smear | `text` (defaults to `glitch.js`'s own source) |
| `mojibake` | A picture's JPEG scan data read as MacRoman. Rows of the picture stretch into rust and blue bands, a few bytes are set large as a heading, there is garbage under yellow highlighter, a mint bar, stray punctuation, a green terminal, and a strip packed so tight it reads as a barcode | the "file opened as text" collage | `image`, or `bytes` (any file) |
| `mosaic` | A black-and-white photograph shown through a grid. In `lavender`, tiles in uneven columns are replaced by flat `#c8c6e2`. In `cut`, only a ragged island of tiles is left on white, a few from the wrong place. In `blocks`, a dithered print has white tiles stepping in from the edges in staircases | the grid-tile portrait pins | `image`, `mode` |

Every plate also takes `seed`, `width`, `height`, and `cssWidth`, so a pixel means the same
size on a retina screen. `melt` and `tear` also take `pixel` (work pixels in CSS px:
2 by default).

## What makes it authentic

1. **The damage is a process, not a texture.** A macroblock is the mean of its block. A drip is a column resampled downward and then interval-sorted. A mojibake character is a real byte of a real JPEG. A tear is a run that failed to stop. Because each mark comes from the picture underneath, it lines up with that picture, which is why it reads as broken and not as decorated.
2. **Pixels stay square.** Work is done on a coarse canvas and enlarged nearest-neighbour (`image-rendering: pixelated`). A blurred pixel is the quickest tell of a fake.
3. **Real glitch is directional.** Codecs fail in blocks and along columns. Scanners fail along rows. Text fails left to right. Pick one axis per plate and keep to it.
4. **One picture, broken several ways.** The same photograph goes into every plate, so the page reads as one file failing in different places, not a moodboard of effects.
5. **Flat colour only where a file would put it.** Lavender where a tile did not arrive, yellow where someone highlighted, mint where a bar was drawn. There are no gradients, no glow and no neon.
6. **Drop your own.** Each plate breaks a dropped photograph (or text file, or any file for `mojibake`) the same way it breaks the stand-in.

## Tokens

| Role | Value |
|---|---|
| page | off-white `#fdfdfb`, ink `#1b1b1b`, rules `#ebe9e2` |
| melt | ground `#e9f7f5` → `#cdeeed` → `#b9e2e0`, mass `#27353a #3d5b5c #6c9d9b #8c7652 #a7d8d5 #f6fcfb` |
| printout | paper `#efede6`, ink `#76777c`, green `#3c9656`, red `#c4473d`, blue `#5a78c8`, lamp `#ff72b6` over `#8fb8ff` |
| mojibake | bands `#8b3a1c #b8552a #d9844a #e8b27a #6b2f2a #a0522d #5b3b6e #c9695a #3f6fb5`, highlighter `#e3e64b` with purple `#4a2a6a` text, bar `#5fe3c3`, terminal green `#79e07f` |
| mosaic | lavender `#c8c6e2`, warm grey print `#2a2320` → `#ece5dc`, white tiles `#ffffff` |

Type: one monospace for everything small (IBM Plex Mono 400/500/700, 12–13 px) and one
heavy grotesk for anything large (Archivo 800, uppercase, tracking −0.035em). Large type
looks pasted into the file, like the mojibake heading, and never sits on a glow or a
gradient. Do not add a third face.

## Build it

```html
<div class="plate"><canvas></canvas></div>
<script src="pixelsort.js"></script>
<script src="glitch.js"></script>
<script>
  const el = document.querySelector('.plate'), r = el.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
  Glitch.melt(el.querySelector('canvas'), { width: r.width * dpr, height: r.height * dpr, cssWidth: r.width, seed: 3 });
  // your photograph: pass { image } (an <img> or a canvas) to any plate
  // a lower-level sort: PixelSort.sort(imageData, { mode: 'threshold', lo: .25, hi: .8, angle: 90, mask })
</script>
<style>
  .plate { position: relative; aspect-ratio: 4 / 5; }
  .plate canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
</style>
```

- Plates are deterministic per seed and take 15–150 ms. Render one per frame, top first, after `document.fonts.load` for the faces that `printout` and `mojibake` draw with. Re-render only when the width changes: phones fire `resize` while scrolling.
- A plate can load the way a slow file does: CSS `clip-path` from `inset(0 0 100% 0)` to `inset(0)` in `steps(9)`, the first time it is seen. It is off under `prefers-reduced-motion`.
- In React: render in `useEffect` on a canvas ref, keyed on seed, mode and size.

## Composition

- One hero plate full-bleed (the melt) with the name set large in the heavy grotesk in a corner, where the picture is calm. A single line of details sits in mono on a white strip along the bottom.
- Then a board: plates two up on desktop and one up on a phone, each captioned like a file (`II — tear.pbm`), with a one-line mono note on what happened to it.
- Text blocks are plain and small, like a README: a two-column `dl`, a programme as a numbered listing with times in green and notes in red, and one phrase in the lede under yellow highlighter.
- Controls are words in brackets, `[another]` and `[+ photograph]`, highlighted yellow on hover. They are not buttons with shadows.
- Use fictional names, or the user's own. Never use a real label's, artist's or festival's name, logo or artwork.

## Tells that it was generated — avoid all of them

- An RGB-split or scanline filter over a finished layout, or CSS `text-shadow` in red and cyan on a headline.
- Glitch that ignores the picture: stripes and noise that do not line up with anything under them.
- Soft or blurred pixels, anti-aliased blocks, or non-square pixels.
- Neon on black, glowing "cyberpunk" type, matrix rain, or a terminal font used for the large type.
- Random unicode chosen for looks rather than bytes decoded in a real encoding.
- Glitch in every direction at once, or on every element. Keep to one axis per plate and leave calm space.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each plate, and put them next to the reference pins.

- [ ] Each plate reads as a picture that something happened to (a codec, a scanline, a scanner, an encoding, a tile grid) and not as an effect.
- [ ] Pixels are square and sharp at 100 %.
- [ ] The same seed gives the same plate, "another" gives a new one, and mosaic's modes switch.
- [ ] A dropped photograph is broken the plate's way; a dropped text file prints; any file dropped on mojibake is read as text.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

This is an original implementation. The plates, the stand-in eye and the listing were
written for `glitch.js`, and no photograph or found glitch is included. The interval
sorting model in `pixelsort.js` follows the one popularised by Kim Asendorf's
ASDFPixelSort and used by Akascape/Pixelort (MIT) and satyarth/pixelsort.
Krzysztofz01/pixel-sorter is GPL-3.0, so it was read for ideas only and none of its code
is used. General inspiration: datamosh and macroblock artefacts in video codecs, flatbed
scanner drag, MacRoman mojibake, and the "10 niche design styles" board by A Song Studio
(reference only; no images are used).
