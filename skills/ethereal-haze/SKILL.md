---
name: ethereal-haze
description: Design pages in the ethereal haze style of soft-focus editorial photography — flowers held too close to the lens so only colour and petal edges remain, poppies swaying past a slow shutter, leaf sun prints on green paper, sepia figures smeared by motion — each full-bleed, lifted and grained like film, with one small thin serif wordmark in the middle. Use it for fragrance, florists, skincare, fashion and beauty, small museums and galleries, photographers, dream-pop and ambient releases, wedding and invitation pages. Also use it when the user asks for ethereal, dreamy, hazy, soft-focus, blurred, out-of-focus, bokeh, film-grain, motion-blur, sepia, botanical, romantic or "quiet luxury" imagery and type, or for a page that should feel like a photograph rather than a gradient.
---

# Ethereal haze: soft-focus photographs

This is the look of a small perfume house's campaign. A flower is shot so close that the
lens cannot find it, and you get pink air with the edges of petals. Poppies on long stems
move past a slow shutter. A branch lies on sun-sensitive green paper for an afternoon. A
figure walks through a sepia frame too fast to be kept. On each of these sits one word, in
a thin serif, white, small, dead centre. The haze is optical: defocus, motion and grain.
There are no gradients anyone picked by hand, and no glow.

The files next to this SKILL.md:

- `assets/haze.js`: `window.Haze`, four seeded plates drawn in canvas 2D (`petals`, `poppies`, `shade`, `streak`), `develop` to put any photograph through one of the four looks, and a `grain` overlay. It has no dependencies and uses no WebGL and no `ctx.filter`.
- `reference.html`: a fictional perfume house, "Faye", with four scents, one plate each, a notes band and a footer. **Read it before designing.**

## The four plates

| Plate | Look | Pin feel | `Haze.<plate>(canvas, opts)` |
|---|---|---|---|
| `petals` | translucent pink petals, overlapping and deepening like tissue, a few edges nearer and sharper, an ochre bloom low down | "BLUME": a thin serif in caps on blurred pink | `palette: 'blush'` |
| `poppies` | coral-to-oxblood cups on bowed green stems in the corners, a magenta blur low left, all moving diagonally | "porte": lowercase serif and a tiny sans line on coral flowers | `palette: 'coral'`, `angle`, `speed` |
| `shade` | a sun print: olive paper, pale leaf shapes (near ones sharp, lifted ones soft), grass blades, a butter margin | leaf shadows on green paper with a paper border | `palette: 'sage'`, `border`, `t` |
| `streak` | a figure in sepia, smeared sideways by a slow shutter, a ghost where the shutter opened, heavy grain | a sepia motion-blur photograph | `ramp` |

Every plate also takes `seed`, `grain`, `veil` (a milky lift toward `veilColor`), `vignette`,
`width`, `height`, and `cssWidth` (so the blur is measured in CSS pixels on a retina screen).

## What makes it authentic

1. **The blur is a lens, not a filter.** Defocus averages the scene over a disc (an aperture), and motion averages it along a line. A gaussian `filter: blur()` looks like a UI effect, while a disc keeps the bright, hard-edged bokeh of real glass. `Haze.defocus(canvas, r)` and `Haze.motion(canvas, len, angle)` are exported.
2. **Depth of field.** A plate is drawn in two passes: the far layer is blurred heavily, then the near layer is drawn over it and blurred less. One or two petal edges come forward and everything else stays gone. A plate that is evenly blurred reads as a smeared vector.
3. **Petals are tissue.** Each petal is painted once normally and once in `multiply`, so where two overlap the colour deepens, as it does with real petals held to the light. Rims are drawn inside the petal only, so an edge reads as a fold and not as an outline.
4. **Grain goes on last, at full resolution, strongest in the midtones.** The scene renders at about a third of the size because it is all soft; grain is added after upscaling, per device pixel, so it stays sharp. Grain on a blurred layer turns to mush, and grain of even strength reads as dirt.
5. **Lifted and low-contrast.** Blacks never reach black and highlights never clip. The veil pulls everything toward a warm off-white and the sepia ramp starts at a brown-black.
6. **The sun print is physical.** Where a leaf lay, the paper stayed pale; where light fell, it went olive. Leaves lifted off the paper let some light under them and print softer and darker. It is a photogram, not a shadow overlay.

## Tokens

| Palette | Ground | Subject | Ink |
|---|---|---|---|
| `blush` | dusty rose-beige `#d9ccc4` → `#cdb8ad` | petals `#98505e` `#c6848c` `#e3bdb8`, rim `#8f4f58`, bloom `#9c7a3e` `#c9b27c` | white |
| `coral` | milky pink `#efe6df` → `#e6c7cb`, wash `#d98aa0` | poppies `#8a2a1e` `#d2472b` `#ec7b47` `#f4b590`, stems `#7b9451` | white |
| `sage` | olive `#b3b467`, deeper `#a2a65a` at the top | leaves `#e2d49e`, margin `#ebe2b8` | olive `#6f7337` |
| `sepia` | ramp `#2e2210 #4c3a1c #766140 #a38e6c #cdbd9f #e6dcc6` | (the ramp) | parchment `#efe6d2` |

Type: one thin display serif for the wordmark, and one small geometric sans for the line
under it and for captions. The reference uses Marcellus (a flared Roman: set caps with
`letter-spacing` .06em, or lowercase) at 34–78 px, and Jost 300–400 at 10–15 px. Gloock or
Young Serif suit a rounder lowercase wordmark. Do not add a third face.

## Build it

```html
<section class="plate"><canvas></canvas><div class="word"><h2>corail</h2><p>eau de parfum, 50 ml</p></div></section>
<script src="haze.js"></script>
<script>
  const s = document.querySelector('.plate'), r = s.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
  Haze.poppies(s.querySelector('canvas'), { width: r.width * dpr, height: r.height * dpr, cssWidth: r.width, seed: 4 });
  // a photograph instead: Haze.develop(canvas, img, { width, height, cssWidth, look: 'blush' | 'coral' | 'sage' | 'sepia' })
</script>
<style>
  .plate { position: relative; height: 100svh; }
  .plate canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .word { position: absolute; inset: 50% 0 auto; transform: translateY(-50%); text-align: center; color: #fff; }
</style>
```

- Plates are deterministic per seed and take 20–150 ms at 1440×900. Render one per frame, top first, and re-render only when the width changes: phones fire `resize` while scrolling.
- `Haze.grain(el, { opacity, tile, seed })` turns an empty element into a fixed grain overlay, for anything animated on top of a plate.
- In React: render in `useEffect` on a canvas ref, keyed on seed and size.

## Composition

- Full-bleed plates, one per screen. The subject sits in the corners and on the edges, and the middle stays open for the word.
- One wordmark per plate, small (about 5 vw), white, centred horizontally and vertically, with at most one tiny sans line under it. Nothing else on the image except a caption row along the bottom edge in 10–11 px spaced caps.
- A sun print carries its title in the paper margin, small, in the olive ink, like a pencilled plate number.
- Between plates, text goes on a flat ground taken from the plate (`#e6ddd6` for blush): a short serif lede and a two-column list, centred with lots of air.
- A plate can come into focus the first time it is seen: CSS `filter: blur(14px)` easing to none over about 1.8 s. This is a focus pull, and it is off under `prefers-reduced-motion`.
- Controls are words ("another", "+ photograph"), not buttons. Dropping a photograph on a plate develops it in that plate's look.
- Use fictional brands and names, or the user's own. Never use a real brand's name, logo or campaign images.

## Tells that it was generated — avoid all of them

- A mesh or aurora gradient, or blurred CSS blobs drifting behind a hero, standing in for a photograph.
- `filter: blur()` on flat shapes: it gives even, glowing edges with no depth of field.
- Petals with outlines, symmetrical star flowers, or a flower that reads as an icon.
- Pure black, pure white, or a saturated colour at full strength anywhere.
- Grain missing (banding), or grain so even and strong that it reads as dirt or a noise texture.
- Big headlines, a glowing CTA pill, glass cards, sparkle emoji, a centred headline with three cards below.
- More than one word on a plate, or type with a drop shadow to rescue its contrast. Choose a calmer part of the plate instead.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each plate, and put them next to the reference pins.

- [ ] Each plate reads as a photograph of something (petals, poppies, a leaf print, a figure) and not as a gradient.
- [ ] One or two edges are nearer and sharper than the rest.
- [ ] Grain is visible at 100 % and strongest in the midtones, with no banding.
- [ ] The wordmark is legible on its plate without a shadow.
- [ ] The same seed gives the same plate, and "another" gives a new one.
- [ ] A dropped photograph develops in the plate's look.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

This is an original implementation. The petals, cups, leaves, figure, lens blur, sun print
and grain were written for `haze.js`, and no photograph is traced or included. General
inspiration: soft-focus flower and motion-blur photography in fragrance and gallery
branding, cyanotype and anthotype sun prints, and the "10 niche design styles" board by
A Song Studio (reference only; no images are used). Reviewed while building this set:
ruucm/shadergradient and paper-design/liquid-logo (for how far a single shaded surface can
carry a page), pmndrs/postprocessing (Zlib) for grain and dithering practice, and
dashersw/liquid-glass-js (MIT), which this style decided against: haze here is optical,
not glass. Several suggested mesh- and grain-gradient repositories (whatamesh/whatamesh,
kevinsqi/react-mesh-gradient, jordienr/mesh-gradient,
lokesh-coder/react-animated-css-mesh-gradient, JimmyBeldone/react-native-grainy-gradient,
l-ir/webgl-grain) do not exist at those addresses and were not used.
