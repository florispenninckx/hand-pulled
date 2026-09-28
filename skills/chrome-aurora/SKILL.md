---
name: chrome-aurora
description: Design pages in the chrome aurora style of liquid light on black. A pool of mercury catches a warm lamp on one side and a cool one on the other, with oil-film bands in its fold. Paint trails are dragged across charcoal with a crisp front and a smeared tail. Glossy fluid swirls carry one hot colour. Strip lights on wet glass split into fringes. Soft aurora light sits out of focus. Each plate is shaded per pixel in WebGL, with a 2D fallback, grained, with tiny mono type in the corners. Use it for club nights, electronic and ambient releases, festivals and light installations, audio hardware, galleries, night events, fragrance or tech launches with a futurist edge. Also use it when the user asks for chrome, liquid metal, mercury, iridescent, holographic, oil-slick, thin-film, dichroic, wet glass, dispersion, chromatic aberration, aurora or lens-flare visuals, or for a hero that should be a lit surface rather than a mesh gradient.
---

# Chrome aurora: liquid light on black

This is the look of a club night's wall projection or the sleeve of an ambient record. It
is black, and in it something liquid is lit. A pool of chrome pours in from a corner. The
faces turned to one lamp burn red and orange, the faces turned to the other go cobalt and
cyan, and the fold through the middle shows oil in thin stacked bands. Paint is dragged
across charcoal with a sharp violet front and an orange smear behind it. Cyan swirls hold
one red tongue each. Strip lights ripple on wet glass, and every highlight splits into a
warm fringe and a cool one. An amber slab of light, out of focus, falls into blue. Nothing
is a gradient someone picked. Every colour is a lamp caught on a surface, a film on that
surface, or the fringe a lens adds.

The files next to this SKILL.md:

- `assets/mercury.js`: `window.Mercury`, five seeded plates (`film`, `trail`, `ribbon`,
  `glass`, `aurora`) shaded per pixel in WebGL 1. They run on one shared hidden context,
  and a 2D fallback reads the same seeded lattice and pours the same plate. The file has
  no dependencies and uses no `ctx.filter`.
- `reference.html`: "Afterglass", a fictional four-night festival of light and low sound at
  a fictional glassworks. It has a full-bleed hero pour, four night posters, the hero
  taken apart pass by pass, a board of the other looks, lamp tokens and a programme.
  `?gl=0` forces the fallback. **Read it before designing.**

## The five plates

| Plate | Looks | What it shows | `Mercury.<plate>(canvas, opts)` |
|---|---|---|---|
| `film` | `oxide`, `titanium` | A pool of liquid chrome pouring into black from an edge. Faces turned to the warm lamp burn red, orange and yellow, and faces turned away go cobalt and cyan. The rim is a thin line of lamp light. The fold holds oil as parallel orange and blue sheets. `titanium` fills the frame with anodised cobalt, copper on the turned faces. | `layer: 'height' \| 'normal' \| 'light' \| 'film'` shows the passes |
| `trail` | `ember`, `dusk` | One to three strokes of paint dragged across a grainy ground. Each has a crisp coloured front, a core, and a tail smeared out behind it on one side. | |
| `ribbon` | `lagoon`, `coral`, `volt` | Slow glossy swirls of one colour through black, with one hot colour at their centres: cyan with red tongues, navy with coral, black with electric blue going yellow. | |
| `glass` | `pool`, `eye`, `pinch` | Strip lights reflected on a wet surface, every highlight split into a warm and a cool fringe. `pool` is grey water, `eye` is black chrome rippling round a still centre, `pinch` is petals of light meeting at a point. | |
| `aurora` | `ember`, `flare`, `rose`, `iris` | Light out of focus with lateral colour fringes. `ember` is an amber slab falling into blue and then black, `flare` a white flare in a red cloud cut by a hard arc, `rose` pink air, `iris` a periwinkle haze round a dark hole. | |

Every plate takes `width`, `height`, `seed`, `look`, `grain` (0 turns it off), `image`
(an `<img>` or canvas whose light and dark become the height of the liquid), `gl` (`false`
forces the fallback) and `resolution` (the share of the size the GPU renders before the
smooth upscale; the defaults are 1 for film and trail, 0.6 for ribbon and glass, 0.5 for
aurora). `Mercury.last` says which path drew the last plate (`'webgl'` or `'2d'`).
`Mercury.webgl()` says whether WebGL is there, and `Mercury.LOOKS` holds every look's
numbers.

## What makes it authentic

1. **Every colour is a reflection.** Each plate is a height field. Its slope gives a
   normal, and the normal reflects a studio: a dark ceiling, a warm lamp at one bearing, a
   cool lamp opposite, a thin strip light overhead. The black ground stays black because
   nothing there faces a lamp. That is why the colour bands bend round the folds and
   bunch up at the rim. A mesh gradient picks colour by position and cannot do that.
2. **The rim is a meniscus.** The pool's height rises steeply at its edge (a square root
   of the distance inside), so the edge turns every way at once and picks up a thin line
   of lamp light all round. Without it the pool looks cut out.
3. **Fringes are dispersion, a few per cent.** The normal is bent a little more for blue
   than for red (`disp` 0.07–0.18), so a highlight's edges split warm on one side and cool
   on the other, and flat areas stay clean. Shifting whole RGB channels is a glitch, not
   glass.
4. **The oil film is optics, and it stays in the fold.** Reflectance of a thin layer is
   computed from Airy's formula at sixteen wavelengths and weighted by the CIE colour
   matching functions. The oil only gathers where the surface creases, as stacked parallel
   sheets, so the rainbow is confined and ordered. A hue rotation across everything reads
   as a contour map.
5. **Liquid is big and slow.** The fields are three- to five-octave gradient noise, warped
   by itself once or twice, at low frequency: a few large shapes per frame that flow into
   each other. Fine marbling all over reads as generated.
6. **Trails have a front and a tail.** A trail is one level of a warped field, measured as
   a true distance so its width stays even. The front is crisp and the tail decays
   exponentially on one side only. Few and wide beats many and thin.
7. **Each seed keeps the same balance.** Ribbon ramps are placed from the field's own
   quantiles (sampled on the CPU first), so every seed shows about the same share of
   black, body colour and hot colour.
8. **Aurora is a lens.** The soft form is sampled once per channel at three slightly
   different scales, as a lens with lateral chromatic aberration would, so its edges
   fringe blue on one side and warm on the other. It is then mapped through a ramp that
   starts in black.
9. **Grain goes on last, at full resolution, strongest in the midtones.** Surfaces render
   at 50–100 % of the size and are upscaled smoothly. Grain added after that stays sharp
   and hides banding in the soft plates.

## Tokens

Page: ground `#050505`, type `#ebe7df`, a warm grey `#8b877e` for secondary text,
hairlines `#242220`, and one hot colour, lamp orange `#ff6a00`, for hover and a single
live dot. The page never adds a colour the plates do not already have.

| Look | Ground | Lamps and body | Hot |
|---|---|---|---|
| `film · oxide` | `#000000`, ceiling `#0a1640` | warm `#b0101c` → `#ff6a00`, cool `#0b24c8` → `#2f8cff` | the rim, lamp orange |
| `film · titanium` | cobalt `#0d2fb5`, ceiling `#020a3a` | warm `#6a1606` → `#f08a1e`, cool `#0b37f0` → `#2a7aff` | copper faces |
| `trail · ember` | charcoal `#1b1b1b` | front `#9a4dff`, core `#3b62ff` | tail `#ff5a1c` |
| `trail · dusk` | navy `#070b24` | front `#ff4f8a`, core `#39c6e8` | tail `#ff6a4a` `#ff3a3a` |
| `ribbon · lagoon` | `#020308`, `#0b2a4a` | `#3fa9cf` `#9fe0ee` | `#e2356b` `#ff2a48` |
| `ribbon · coral` | `#070a22`, `#111a4a` | `#26307a` | `#ff7157` `#ff2c52` `#ff7a6a` |
| `ribbon · volt` | `#020203`, `#03070f` | `#0b4fae` `#1c95ff` `#8fd6ff` | `#f4ee6a` |
| `glass · pool` | wall `#1b1f26` → `#8d939b` | strips `#f7e2bd` `#fff0da` `#d6e2ea` | none |
| `glass · eye` | `#030306`, `#14121b` | strips `#fff1dc` `#4aa3ff` | `#ff8a3a` |
| `glass · pinch` | `#050507`, `#0d0d14` | strips `#ffe9d8` `#3a7bd5` | `#f08a3a` |
| `aurora · ember` | `#000000`, `#0a2466` | `#2f96e0` `#f2dfb2` | `#f2a12e` `#d2560e` |
| `aurora · flare` | `#010403`, `#3a0806` | `#c8260e` `#f37a1c` `#fbe3c0` | white core |
| `aurora · rose` | `#b8185e` | `#e8307a` `#f569a0` `#f7a3c2` | `#f57a6c` `#f0503e` |
| `aurora · iris` | `#e2a6d6` | `#b9b9f4` `#9aa6f6` `#6d63ee` | hole `#4a2a7a` → `#1d0d1c` |

Type: one light grotesk and one mono. The reference sets Hanken Grotesk 300 for the
display word (9 vw, tracking −0.045em, white) and for body text at 15–17 px, and Martian
Mono 300–400 at 10–11 px for the masthead, captions, controls and poster corners, in caps
with tracking 0.06em for labels. Inter Tight or Space Grotesk can stand in for the
grotesk, and JetBrains Mono or IBM Plex Mono for the mono. Do not add a third face, and
never set type in chrome.

## Build it

```html
<figure class="plate"><canvas role="img" aria-label="…"></canvas>
  <span class="corner tl">Afterglass<br>I / IV</span><span class="corner br">Teodor Aske<br>live electronics</span>
</figure>
<script src="mercury.js"></script>
<script>
  const c = document.querySelector('.plate canvas'), r = c.getBoundingClientRect(), k = Math.min(1.5, devicePixelRatio);
  Mercury.trail(c, { width: r.width * k, height: r.height * k, seed: 4, look: 'ember' });
  // a photograph as the height of the liquid: Mercury.film(c, { width, height, seed, look: 'oxide', image: img })
  // the film plate's passes: layer: 'height' | 'normal' | 'light' | 'film'
</script>
<style>
  .plate { position: relative; aspect-ratio: 2 / 3; background: #000; margin: 0; }
  .plate canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .corner { position: absolute; font: 400 10px/1.45 'Martian Mono', monospace; color: #ebe7df; }
  .tl { left: 12px; top: 10px; } .br { right: 12px; bottom: 10px; text-align: right; }
</style>
```

- A plate is deterministic per seed. WebGL takes about 20–70 ms at 1440×900 (measured on
  headless Chrome's software GL). The fallback takes 100–300 ms at the same size, because
  it evaluates at up to 480 px on the long side and upscales.
- Render one plate per animation frame, top of the page first, as each comes within
  about 600 px of the viewport. Pour again only when a plate's width really changes:
  phones fire `resize` while scrolling. Cap the pixel ratio at 1.5, since the surfaces
  are soft and the grain reads right at that size.
- All plates share one WebGL context, so a page can hold dozens of them without hitting
  the browser's limit of about sixteen contexts. Nothing animates, so draw once when the
  inputs change, never per frame.
- In React, pour in `useEffect` on a canvas ref, keyed on seed, look and size.
- Test the fallback with `gl: false`, or `?gl=0` on the reference page.

## Composition

- The page is black and the plates are the only colour. Rules are hairlines in a warm
  dark grey, type is off-white, and one hot orange does hover and nothing else.
- The hero is one full-bleed pour. It enters from an edge or a corner and leaves the rest
  of the frame black, and the headline and lede sit in that black. Choose a seed whose
  black falls under the words (`another pour` until it does) instead of adding a scrim.
- Posters are the plate itself at 2 : 3, with type at 10 px in mono pushed into the four
  corners, the way a gig poster is set. There is no type in the middle of an image and no
  big title on a poster.
- Show the surfaces as objects: staggered portrait posters, a board of 3 : 2 tiles, one
  plate per idea. A row of the hero's passes (height, normal, studio, dispersion,
  finished) makes a good "how it is made" band.
- The display word is large, light, tight and white. It never uses chrome, gradient
  fills or glows.
- Controls are words in brackets: `[another pour]`, `[+ photograph]`. A photograph
  dropped on a plate becomes the height of its liquid, so a face or a window turns into a
  pour that still reads as the picture.
- Use fictional names and events, or the user's own. Never use a real brand's name, logo
  or campaign images.

## Tells that it was generated — avoid all of them

- Chrome or "liquid metal" lettering, bevelled Y2K type, or gradient-filled text.
- A CSS mesh, conic or radial gradient, or blurred blobs drifting behind a hero, standing
  in for a lit surface.
- A rainbow hue sweep over the whole surface, or contour-map bands of every hue. Oil
  lives only in the fold, and most of the plate is two lamps and black.
- An RGB split of the whole image. Dispersion is a few per cent and shows only where the
  light is.
- Thin, bright, jagged lines with a glow ("neon lightning"). Trails are wide paint with a
  tail.
- Busy high-frequency noise: marbling in every corner, more small shapes than large ones.
- Glassmorphism cards with `backdrop-filter` over the plate, glowing CTA pills, sparkle
  emoji, a centred headline over three cards.
- A navy or grey page ground where the board is black, or blacks lifted by a haze.
- A dark scrim or a heavy shadow to rescue type. A faint halo on 10 px corner type is
  fine, but move the words into the black for anything larger.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, scrolled to each plate,
and put them next to the reference images.

- [ ] Each plate reads as a lit surface (metal, paint, glass or light) and not as a
      gradient.
- [ ] The ground is black. Colour appears only where a lamp is caught.
- [ ] Fringes sit on highlights only, and the oil film only in the fold.
- [ ] Grain is visible at 100 % and there is no banding in the aurora plates.
- [ ] The same seed gives the same plate, `another pour` gives a new one, and a dropped
      photograph becomes the height.
- [ ] `Mercury.last === 'webgl'` in headless Chrome, and `gl: false` (`?gl=0`) pours the
      same plates through the fallback.
- [ ] There is no horizontal scroll on a phone and there are no console errors.

## Credits and prior art

This is an original implementation. The height fields, studio, strip-light room, thin
film, trails, ramps, lens model and grain were written for `mercury.js`, and no shader,
code or image was copied. Reviewed for ideas, with thanks:

- ruucm/shadergradient: a single shaded, grained surface can carry a whole hero. The
  repository has no licence file, so only the idea was taken and no code.
- paper-design/liquid-logo (PolyForm Shield 1.0.0): reflection bands on a liquid surface
  and refracting each colour channel separately. Only the ideas were taken, no code.
- dashersw/liquid-glass-js (MIT): displacing a lookup by a height field's slope to fake
  refraction, which the glass plate uses for its room reflection.
- pmndrs/react-three-fiber (MIT): render on demand, drawing when inputs change instead of
  every frame.
- pmndrs/postprocessing (Zlib): chromatic aberration as a per-channel sample offset, and
  grain added as the very last pass.
- Chris Wyman, Peter-Pike Sloan and Peter Shirley, "Simple Analytic Approximations to the
  CIE XYZ Color Matching Functions" (JCGT, 2013): the weights for the thin film.
- Inigo Quilez's article on domain warping: fractal noise warped by fractal noise.
- Airy's thin-film reflectance and the meniscus are textbook optics and physics.

The visual reference was Floris Penninckx's "Chrome Aurora" Pinterest board of liquid
chrome, oil-slick, wet-glass and aurora images, used as reference only. None of its
images are used or included.
