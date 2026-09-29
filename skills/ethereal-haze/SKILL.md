---
name: ethereal-haze
description: Design pages in the ethereal haze style, warm and saturated images that feel photographed and printed rather than generated. The inside of a flower held too close to focus; coral, orange, red and pink grain-gradient fields whose soft edges dissolve into stipple; single ribbons of colour turning over cream paper; satin folds under one light; a meadow smeared by a moving shutter; poppies swaying past the lens. Each image carries one small, thin serif word. Use it for fragrance, florists, skincare, beauty and fashion, small galleries and museums, photographers, posters, dream-pop and ambient releases, wedding and invitation pages. Also use it when the user asks for ethereal, dreamy, hazy, soft-focus, blurred, bokeh or macro-flower imagery; grain, grainy or noise gradients; film grain, motion blur, silk or satin, colour ribbons; a warm coral or sunset palette; "quiet luxury"; or a gradient that should look physical rather than like a smooth mesh.
---

# Ethereal haze: warm soft focus, grain and colour

This is the look of a small perfume house's campaign, made from one board of pins. A
flower is shot from so close that you are inside it: long petals rise out of a gold
heart, and only one rim is in focus. The same warm colours come loose from the flower and
become fields: a red sun going white, orange bands like light through a curtain, a blot
of vermilion on grey paper. Each field is grained so heavily that its soft edges turn to
spray. On cream stock, a single ribbon of colour turns in the air. Red satin catches one
light, and a meadow goes past a train window. On each image sits one word in a thin
serif, white and small.

The haze is physical: a lens, a shutter, a spray of grain. There is no mesh gradient and
no glow.

The files next to this SKILL.md:

- `assets/haze.js`: `window.Haze`, six seeded image engines in canvas 2D (`bloom`, `field`, `ribbon`, `silk`, `meadow`, `poppies`), `develop` to put any photograph through one of the looks, and a `grain` overlay. It has no dependencies and uses no WebGL and no `ctx.filter`.
- `assets/live.js` and `assets/live-ui.js`: the same prints on the GPU, moving, and interface pieces built on them. See "Live" below.
- `reference.html`: "Faye", a fictional perfume house. It opens on a live hero ("brume") and ends on a live studio app ("Blend a scent"); in between are a hero bloom, a card set of six ribbons, a full-bleed grain field, four field posters labelled like colour chips, two silks, the meadow and the poppies. **Read it before designing.**

## The engines

| Engine | Look | Board pins | `Haze.<engine>(canvas, opts)` |
|---|---|---|---|
| `bloom` | the inside of a flower: long petals rising from a gold heart below the frame, light between them, one near rim sharp with a bright edge line | 23, 26, 27, 29, 30, 31, 33 | `palette: 'coral' \| 'crimson' \| 'sorbet'` |
| `field` | a grain gradient: soft colour with one or two crisp edges, every edge sprayed to stipple | `fold` 16 (1, 4), `sun` 15 (22), `flow` 14 (3, 10, 18), `flame` 0, `blot` 11 | `form`, `colors` to override the ramp |
| `ribbon` | one band of colour turning in the air over cream paper. Where it twists, the crisp, deep side swaps with the soft, lifted one | 36, 41 | `form: 'shift' \| 'wave' \| 'ember' \| 'orb' \| 'swirl' \| 'smoke'`, `ramp`, `paper` |
| `silk` | satin folds under one light, from the deepest crease to the sheen | 9, 12 | `palette: 'rouge' \| 'bleu'` |
| `meadow` | a field seen from a train: grass, rapeseed and a few poppies drawn out into streaks | 19 | `speed`, `angle` |
| `poppies` | coral cups on long stems, swaying past a slow shutter on milky pink | 39 | `angle`, `speed` |

Every engine also takes `seed`, `width`, `height` and `cssWidth` (so blur and scatter are
measured in CSS pixels on a retina screen), plus the print settings. These are `grain`
(about 0.08), `scatter` (in CSS px: how far a pixel may be taken from), `chroma` (how much
of the grain is coloured), `sat`, `veil` with `veilColor` (a milky lift), and `vignette`.
`Haze.develop(canvas, img, { look })` takes `look: 'bloom' | 'field' | 'silk' | 'meadow' |
'poppies'`. `Haze.FIELD`, `Haze.RIBBON` and `Haze.PALETTES` hold every ramp, so a page can
label an image with its own colours.

## What makes it authentic

1. **Soft edges become spray.** This is the whole grain-gradient look. After scaling up, each device pixel takes its colour from a random spot a few pixels away, and most spots are near while a few are far. A soft edge then dissolves into stipple, the way it does in the pins. It does not smear into a smooth ramp. Noise laid *on top of* a smooth gradient reads as dirt, and it is the first thing that gives a generated gradient away.
2. **Grain goes on last, at full resolution, strongest in the midtones.** The scene renders at a third of the size because it is all soft; the spray and the grain are per device pixel, so they stay sharp. A little of the grain is coloured, as film grain is.
3. **One crisp edge, one soft side.** A field has a fold with a sharp S-edge and a long soft fall-off behind it, or a blot that is crisp on one side and sprayed on the other. A ribbon is crisp and deep on one side and soft and lifted on the other, and the sides swap where it twists. If every edge is equally soft, the image is a blur and not a form.
4. **The blur fits the subject.** A flower is defocused by a lens: the scene is averaged over a disc, at two depths, with the near petal sharper. A meadow is averaged along a line, as a moving shutter does it. Neither is a gaussian `filter: blur()`, which gives an even glow with no depth. `Haze.defocus(canvas, r)` and `Haze.motion(canvas, len, angle)` are exported.
5. **Warm and saturated, but never flat.** The board's palette is coral, vermilion, red, pink and gold, and saturation stays high. Within one image, values still move from a deep crease (`#a8102a`, `#420404`) to a near-white heart or sheen. One odd, cool note stays small: a lavender petal, a violet dusk above the flames.
6. **The flower is seen from inside.** The heart sits below the frame and the petals rise past the lens: long, overlapping, each its own hue, amber at the base and paler at the tip. A radial star of petals seen from the front reads as an icon.

## Tokens

| Set | Colours |
|---|---|
| bloom `coral` (hero) | wall `#d62838`, petals `#f0503e` `#f46a4a` `#ea3450` `#f5855a`, heart `#fff6e2` → `#ffd466` → `#f99a36`, rim line `#ffb23a`, odd petal `#c9b4ec` |
| bloom `crimson` / `sorbet` | `#c9072a` `#b20c1e` `#da2541` with pale filaments `#fbd6dc` / `#f47858` `#f592aa` `#f7a2bc` on lilac air `#f0e2f4` |
| field `fold` | `#ec3860` `#f2bf48` `#eef0f4` `#f46238` `#d8205e` |
| field `sun` | `#e2231a` → `#f45c2c` → `#fda844` → `#ffe8cc` → `#fffaf5` |
| field `flow` | `#f53c18` `#f8561e` `#fb7a24` `#fca02e` `#f9bd48` |
| field `flame` | dusk `#a85a98` `#7552a0`, flame `#f64832` `#fb8a2e` `#fdb03a` |
| field `blot` | grey paper `#dadada`, blot `#f5410f`, bleed `#f02f5c` `#ee8284` |
| ribbons | on cream `#f3ede1`: `shift` pale blue → ultramarine `#2a3ab8` → red `#e22b30` → orange `#f5552a` → mauve; `ember` orange → near-black `#2f1111` → dusty pink; `orb` teal `#1a5a5e` → gold `#e6bc62` |
| silk | `rouge` `#420404` → `#b40f0c` → `#fca274`; `bleu` `#04122c` → `#235aa8` → `#e2efff` |
| meadow / poppies | grass `#7ea24a` `#b7ca62`, rapeseed `#e2d236`; poppies `#9a1e14` `#e2442a` `#f5793f` on `#f6e6dc` |
| page | cream `#f3ede1`, card band `#e9e0d0`, ink `#2b2320`, soft ink `#6e5d55` |

Type: one thin display serif and one small geometric sans. The reference uses Marcellus
(a flared Roman) at 34–78 px for words on images, in caps with 0.08 em tracking or in
lowercase. It uses Marcellus caps at 15–30 px on cards, and Jost 300–500 at 7–15 px for
lines, captions, hex labels and card headers. Do not add a third face.

## Type

Lull is the skill's own thin display serif, for the one word on an image. It is a variable font
made by `tools/foundry.py` from an OFL high-contrast serif, under the SIL OFL 1.1, and loaded from
the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Lull** | A thin high-contrast serif that goes out of focus: razor hairlines at 0, soft swollen stems and serifs at 1000, as through a soft-focus lens | `'FOCS'`: Sharp 0, Soft 500, Bloom 1000 (default 0) | The one word on a bloom, field or silk; a card's word in caps; a house or scent name |

```css
.word { font-family: 'Lull'; font-variation-settings: 'FOCS' 250; color: #fff;
        font-size: clamp(34px, 5vw, 78px); letter-spacing: .08em; text-transform: uppercase; }
```

- **It takes the display-serif role.** On a page set in Lull it replaces Marcellus, so the page
  keeps two faces: Lull and Jost. Never set ledes, lines, captions or hex labels in it.
- **The axis is the lens.** Match it to the image: sharp (0–250) on a crisp rim or a card, soft
  (500) on a field, bloom (750–1000) only large, 60 px and up, over a defocused bloom. Keep one
  value per role. The softness is drawn into the letter, so it stays a clean vector at any size.
- **Motion.** For the live hero, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }`, set
  `font-variation-settings: 'FOCS' var(--v)` and pull `--v` slowly into focus on load. Animate one
  element at most, and never under `prefers-reduced-motion`.
- **Glow is never text-shadow.** No glow, no `filter: blur()` and no halo on the word; the bloom
  is the axis and the image.

Size, full Latin (Western European), `woff2`: Lull 55 KB (`font-display: swap`).

## Build it

```html
<section class="plate"><canvas></canvas><div class="word"><h2>sanguine</h2><p>eau de parfum, 50 ml</p></div></section>
<script src="haze.js"></script>
<script>
  const s = document.querySelector('.plate'), r = s.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
  const size = { width: r.width * dpr, height: r.height * dpr, cssWidth: r.width, seed: 4 };
  Haze.field(s.querySelector('canvas'), { ...size, form: 'fold' });
  // Haze.bloom(canvas, { ...size, palette: 'coral' })   Haze.ribbon(canvas, { ...size, form: 'shift' })
  // a photograph instead: Haze.develop(canvas, img, { ...size, look: 'bloom' })
</script>
<style>
  .plate { position: relative; height: 100svh; }
  .plate canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .word { position: absolute; inset: 50% 0 auto; transform: translateY(-50%); text-align: center; color: #fff; }
</style>
```

- Images are deterministic per seed. At 1440×900 on a 2× screen, one takes 40–200 ms. Render one per frame, top first, and re-render only when the width changes, because phones fire `resize` while scrolling.
- `Haze.grain(el, { opacity, tile, seed })` turns an empty element into a fixed grain overlay, for anything animated on top of an image.
- In React, render in `useEffect` on a canvas ref, keyed on seed and size.

## Composition

- **The hero is a bloom, full-bleed**, with one word in the middle. Pick a seed where the word lands on saturated petal, not on the pale filament.
- **Ribbons go on cards, never full-bleed.** Use cream stock at 3:4.4 in a grid of three (two on a phone). Each card has a tiny spaced-caps header top left, a number over a short rule top right, a word in serif caps bottom left with one short line under it, and three dots of the ribbon's own colours bottom right. The ribbon fills the upper two thirds.
- **Fields work two ways.** One can be full-bleed with a word, or several can sit as small posters labelled like colour chips: a lowercase serif name, the two ends of the ramp in hex with ▾ and "100%–0%", and a tiny caption at the foot.
- **Silk and meadow are quiet interludes**, one word each. Silk can run as a pair, warm and cool side by side.
- One word per image, about 5 vw, white, centred, with at most one tiny sans line under it. The only other thing on an image is a caption row along the bottom edge in 10–11 px spaced caps.
- Between images, text sits on cream: a small kicker, a short serif lede and plenty of air.
- An image can come into focus the first time it is seen: CSS `filter: blur(14px)` eases to none over about 1.8 s. This is a focus pull, and it is off under `prefers-reduced-motion`.
- Controls are words ("another", "+ photograph"), not buttons. Dropping a photograph on an image develops it in that image's look.
- Use fictional brands and names, or the user's own. Never use a real brand's name, logo or campaign images.

## Tells that it was generated: avoid all of them

- A smooth mesh or aurora gradient with no grain, or with uniform noise laid on top. The grain must break up the edges, not sit over them.
- Gaussian CSS blobs drifting behind a hero, or `filter: blur()` on flat shapes. Both give even, glowing edges with no crisp side.
- Pastel on white. The board is saturated and warm; cream is for paper, not for washing colours out.
- Every edge equally soft, so nothing reads as a fold, a petal or a band.
- A ribbon with a hard outline, or with a neon glow around it.
- A flower seen from the front as a symmetrical star, or petals with outlines.
- Grain of even strength everywhere, with no midtone bias, which reads as dirt.
- Big headlines, a glowing CTA pill, glass cards, sparkle emoji, a centred headline with three cards below.
- More than one word on an image, or type with a drop shadow to rescue its contrast. Choose a calmer seed instead.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each section,
and put them next to the reference pins.

- [ ] Every image reads as something physical (petals, a print, a ribbon, cloth, a passing field), not as a CSS gradient.
- [ ] At 100 %, soft edges break into spray and grain is visible in the midtones, with no banding.
- [ ] Each field and ribbon has one crisp side and one soft side.
- [ ] The palette is warm and saturated, with one small cool note at most.
- [ ] Words are legible without a shadow.
- [ ] The same seed gives the same image, and "another" gives a new one.
- [ ] A dropped photograph develops in the image's look.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Live

Use this when a page should move: an app, a landing page, a hero that answers the hand.
`assets/live.js` runs the print on the GPU and animates it. `assets/live-ui.js` builds
interface pieces on it. Both are classic scripts with no dependencies. Load them after
`haze.js`:

```html
<section id="hero" style="position:relative;height:100svh">
  <canvas aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
  <h1 style="position:relative">brume</h1>
</section>
<script src="assets/haze.js"></script><script src="assets/live.js"></script><script src="assets/live-ui.js"></script>
<script>
  const hero = document.getElementById('hero');
  const ctl = Haze.live(hero.querySelector('canvas'), {
    fn: 'bloom', palette: 'sorbet', seed: 11,                          // still options
    drift: 1, mist: 0.6, focusScroll: 0.9, clickPulse: true, hand: hero, // motion options
  });
  ctl.set({ focus: 0.8 });   ctl.pulse(x, y);   ctl.pause();   ctl.resume();   ctl.destroy();
  Haze.ui.button(document.querySelector('button'));   Haze.ui.focusRing();
</script>
```

**How it works (capture-first).** The still engine paints the scene small and blurs it the
way its subject blurs (lens disc, moving shutter, spray). That irregular canvas work runs
**once** on the CPU: `finish()` in haze.js has a `capture` hook that hands over the soft
image and the print settings instead of printing. live.js makes the same high-quality
upscale to device pixels and uploads it. It also uploads the still's own 512² grain and
scatter tile. The print (`finish()`: scatter to stipple, saturation, vignette, veil,
midtone-weighted chroma grain, the same clamps) is ported line by line to one fragment
shader. The live terms sit on top, and each one is exactly zero at clock 0.

**Still options** are the ones of the still engine: `fn` (`'bloom' | 'field' | 'ribbon' |
'silk' | 'meadow' | 'poppies'`, default `'field'`), then `seed`, `palette`, `form`,
`colors`, `ramp`, `paper`, `speed`, `angle`, `grain`, `scatter`, `chroma`, `sat`, `veil`,
`veilColor` and `vignette` as in the table above. For a photograph, pass `image` (a decoded
`<img>`) and `look`. Width, height and cssWidth come from the canvas's CSS size × DPR
(capped at 2). Changing a still option through `set()` recaptures the image. **Motion
options** never recapture:

| option | default | what it does |
|---|---|---|
| `drift`, `driftScale`, `pace` | 1, 0.35, 1 | fog: the soft image slides along a slow noise field (amplitude 1.2 % of the short side). The stipple stays put, so the print holds and the light moves under it |
| `mist`, `breath`, `breathPeriod` | 0.5, 0.35, 11 | pale patches drift through and the whole print lifts toward `glow`, breathing in and out over `breathPeriod` s |
| `focus` | 0 | focus pull: 1 is softer (a wider lens disc), −1 is sharper (the rim comes back, unsharp). `focusRadius` 0.012 of the short side |
| `focusScroll` | 0 | the view is sharp when its centre crosses the middle of the viewport and goes soft by this much as it scrolls away |
| `enter`, `enterMs` | false, 2200 | comes into focus (soft → sharp) the first time it scrolls into view |
| `pointer`, `bloom`, `radius`, `lag`, `sharpen` | true, 0.3, 0.3, 0.25, 0.35 | light swelling toward the pointer as through gauze (a screen lift toward `glow`), lagged. The spot under the pointer also pulls sharper. `hand` is the element that listens (default: the parent) |
| `glow` | `'#fff1e2'` | the colour of the light (mist, bloom, pulses) |
| `clickPulse` | false | pointerdown fires `pulse()`: a soft bloom of light that opens and fades over about 3 s |
| `grainRate` | 12 | grain re-rolled this many times a second; the scatter (the stipple of the edges) never moves |
| `reveal`, `revealPaper` | null, `'#f3ede1'` | colour only left of `reveal` (0–1 of the width), cream paper beyond, and the boundary is stippled by the same scatter. Used by the slider and the progress bar |
| `ease`, `own` | 0.12, auto | how fast set() targets are reached; `own: true` forces a dedicated WebGL2 context |

The controller (all chainable): `set(opts)`, `load(opts)` (a new sheet),
`pulse(x, y, strength)` in CSS px, `point(x, y)` / `point(null)` to steer the light from
code, `pause()`, `resume()`, `destroy()`, `state()` → `{ mode, path, frames, visible, focus,
clock, size, ready, reduced }`, `bench(n)` → `{ sync, pipelined, size, path }` ms per frame.

**UI pieces** (`Haze.ui`). Each keeps the native control (button, checkbox, range, a
focusable element). The canvas is `aria-hidden` behind it. At rest a piece is a little out
of focus. Hover or keyboard focus pulls it sharp and swells the light toward the pointer.
A press, or Enter/Space, is a soft bloom.

| piece | call | notes |
|---|---|---|
| live background | `ui.background(section, opts)` | fog, mist, pointer light, click bloom; opts go to live() |
| button | `ui.button(btn, { ramp, form, rest, sharp })` | a small grain field; rest focus 0.8, sharp −0.35; flip the label colour with `:hover, :focus-visible` in CSS |
| card | `ui.card(el, { form, seed })` | a ribbon that comes into focus when first seen, then drifts |
| toggle | `ui.toggle(checkbox, { ramp })` | adds `role="switch"`; off is soft and mostly paper, on pulls sharp, fills and blooms; a pale disc is the thumb |
| slider | `ui.slider(range, { ramp })` | colour up to the value, paper beyond, light at the thumb |
| progress | `const p = ui.progress(el); p.set(0.4)` | `role="progressbar"` + aria values; colour spreads over cream; blooms at 100 % |
| loader | `const l = ui.loader(el); l.stop()` | `role="status"`; a small sun breathing fast while a lamp circles behind the gauze |
| focus ring | `ui.focusRing(scope?)` | CSS only: a 1px ink outline and a warm halo that breathes on `:focus-visible` (it also shows without WebGL2) |
| section transition | `ui.transition(strip, opts)` | a strip of haze that racks focus with scroll: sharp mid-viewport, soft as it leaves |

Ramps for the pieces: `Haze.ui.RAMPS` (`coral`, `rose`, `apricot`), or pass your own list
of colours. Keep a page to one moving hero and quiet pieces. Motion here is slow: a 10 s
breath, drift you notice only when you look away and back.

**What is live.** Every engine (`bloom`, `field`, `ribbon`, `silk`, `meadow`, `poppies`)
and `develop` with a photograph, through capture. The scene is not re-simulated: petals do
not sway and the meadow does not scroll. The fog, mist, focus, light and grain move over the
captured scene. The GPU port of the scene itself is future work. `Haze.grain()` is a CSS
overlay and needs no live mode.

**Fallbacks.** `prefers-reduced-motion`: the still frame, clock 0, no drift, mist, pointer
light or pulses, and frozen grain. `set()` jumps to its target and the view draws only when
something changed. It listens for changes. No WebGL2: the CPU still from haze.js, like
reduced motion. A lost context rebuilds on restore. Offscreen views pause
(IntersectionObserver) and build lazily when they first come near the viewport. The loop
stops on `visibilitychange`. Paused or hidden views still draw their first frame. DPR is
capped at 2. Canvases ≥ 0.9 MP get their own WebGL2 context. Smaller ones share one
OffscreenCanvas context and receive frames as ImageBitmaps.

**Parity.** `Haze.live.parity(opts)` draws the still with haze.js and frame 0 on the GPU at
480×320 (or `width`/`height`) and compares luminance mean, SD (contrast), mean |neighbour
difference| (grain), mean |pixel difference| in 8-bit levels and the share within 2 levels.
`window.handPulledLive.parity['ethereal-haze']()` runs six cases: bloom coral, field fold,
field flame, ribbon shift, silk rouge and poppies. All six are **bit-exact**: dMean 0,
dSdRel 0, dGrainRel 0, 0.000 levels, 100 % within 2 levels (headless Chrome, 28 Sep 2026).
They are exact because the upscale is the still's own canvas upscale, the print samples with
`texelFetch` at clock 0, and the grain tile is the still's own table. `live.TOLERANCE` is
`{ dMean 0.004, dSdRel 0.02, dGrainRel 0.03, madLevels 1.5 }`, and `live.pass(r)` applies it.

**Budget.** Target ≤ 4 ms a frame at 1440×900 CSS (2880×1800 device px) with every live term
on. **Not measured yet**: this lane could not open the page in a real, visible Chrome, and
headless Chrome renders WebGL in software. To measure, open reference.html in Chrome and
run `handPulledLive.views[0].bench(60)` in the console (the hero, own context). The print
shader costs one texelFetch for scatter, one or two texture reads (nine with a focus pull
under way), four grain fetches and a three-octave value noise for fog and mist.

**Optional extra: custom cursor.** `ui.cursor(area, { mark, hover })`, only when the brief asks for one; the system cursor is the default. A native CSS cursor painted once through the still engine at 32 px (1x and 2x); `hover: true` gives links and controls a second mark.
Marks: `sun` (default), `cross`. It returns `{ destroy() }`, which puts the previous cursor back.

## Credits and prior art

This is an original implementation. The petals, fields, ribbons, silk, meadow, poppies,
lens blur, spray and grain were written for `haze.js`. No photograph or pinned image is
traced, sampled or included, and no code was copied.

- **The board.** The look answers Floris Penninckx's "Ethereal Haze" Pinterest board (42 pins, used as reference only).
  - The ribbon card set follows the layout of an uncredited grain-gradient poster series pinned there (36, 41): header, number over a rule, word, line and three dots. Its words and lines are not reused.
  - The hex-and-percentage labels on the field posters follow an uncredited "diffuse light" art poster (40).
  - The words over soft photographs follow two pinned posters (38, 39).
  - One pin (22) shows a real retail brand. Nothing of it is used.
- **Earlier references.** The first version of this skill was built against the "10 niche design styles" board by A Song Studio (reference only; no images are used).
- **Repositories reviewed.**
  - ruucm/shadergradient and paper-design/liquid-logo: for how far a single shaded surface can carry a page.
  - pmndrs/postprocessing (Zlib): for grain and dithering practice.
  - dashersw/liquid-glass-js (MIT): a direction this style decided against, because haze here is optical, not glass.
  - Several suggested mesh- and grain-gradient repositories do not exist at those addresses and were not used: whatamesh/whatamesh, kevinsqi/react-mesh-gradient, jordienr/mesh-gradient, lokesh-coder/react-animated-css-mesh-gradient, JimmyBeldone/react-native-grainy-gradient and l-ir/webgl-grain.
- **Textbook methods.** These were implemented from the general idea, not from any source:
  - golden-angle (Vogel) disc sampling for defocus
  - Catmull-Rom splines for the ribbon paths
  - Blinn-Phong shading for the silk
  - value noise with fractal sums for every warp
