---
name: chrome-aurora
description: Design pages in the chrome aurora style of liquid light on black. A pool of mercury catches a warm lamp on one side and a cool one on the other, with oil-film bands in its fold. Paint trails are dragged across charcoal with a crisp front and a smeared tail. Glossy fluid swirls carry one hot colour. Strip lights on wet glass split into fringes. Soft aurora light sits out of focus. Each plate is shaded per pixel in WebGL, with a 2D fallback, grained, with tiny mono type in the corners. Use it for club nights, electronic and ambient releases, festivals and light installations, audio hardware, galleries, night events, fragrance or tech launches with a futurist edge. Also use it when the user asks for chrome, liquid metal, mercury, iridescent, holographic, oil-slick, thin-film, dichroic, wet glass, dispersion, chromatic aberration, aurora or lens-flare visuals, or for a hero that should be a lit surface rather than a mesh gradient. A live mode moves it for interfaces.
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

## Live

`assets/live.js` makes a plate move, for real interfaces and apps, and `assets/live-ui.js`
builds controls from it. Load them after `mercury.js`: they attach `Mercury.live` and
`Mercury.ui`. Both are classic scripts with no dependencies. They need WebGL2 and fall back
to the still plate without it.

**How it works (capture-first).** A view runs `mercury.js` once, at the canvas's device
size, to get the finished plate with its grain. It runs it a second time at half size for one
of its own passes: `layer: 'normal'` on the film plate, `layer: 'height'` on the others. Both
are uploaded as textures. A WebGL2 fragment shader then reads them every frame and adds the
motion. Every motion term is exactly zero at clock 0 with the default options, so frame 0 is
the still. The still engine is not forked or ported, and no hook was added to it: its
`layer` option already exposes the passes.

The motion is liquid metal:

| motion | input | what it does | options |
|---|---|---|---|
| **sheen** | pointer (lagged) | A lamp is held over the pointer and mirrored by the captured normals. The highlight slides over the folds, tinted by the metal under it. | `pointer` (0..1, 0.9), `radius` (share of the short side, 0.55), `lag` (s, 0.12), `hand` (element that takes pointer events; default the canvas's parent) |
| **ripple** | click/tap, `pulse()` | A ring spreads out and slows down in the mercury. It bends the normals, the plate is re-sampled through them, and a crest catches the light. Up to 4 at once. | `clickPulse` (true) |
| **aurora** | time | Three hues drift slowly across the chrome and are screened onto its highlights. They fade in over the first seconds. | `drift` (0..1, 1), `speed` (1), `hues` (three hex, `['#35f0c8', '#7b5cff', '#ff4fa0']`) |
| **tilt** | scroll | The reflected room tilts as the canvas moves through the viewport, measured from where it sat on its first frame. | `tilt` (1) |
| level | hover, scroll | The brightness of the whole plate, eased. `rise: true` brings it up out of black the first time the view scrolls in. `scroll: true` ties it to the view's position. | `level` (1), `rise`, `riseMs` (1400), `scroll`, `ease` (s, 0.16) |
| fill | value | The plate is polished between `from` and `to` (0..1 across) and dull and unlit outside. Sliders, switches and progress use it. | `fill: [from, to, soft]` (null) |

Still options are the plate's own: `plate` ('film' | 'trail' | 'ribbon' | 'glass' |
'aurora'), `look`, `seed`, `grain`, `image`. Setting them re-runs the capture. Two options
belong to the capture itself. `zoom` (280 device px): a canvas whose short side is smaller,
or that is longer than 2:1, sees a window onto the middle of a bigger plate, so a 36 px
button shows one smooth fold instead of a whole pour shrunk down. `resolution` (1) is the
share of the device size, with DPR capped at 2 and the capture capped at 4.2 MP.

```js
const ctl = Mercury.live(canvas, { plate: 'film', look: 'oxide', seed: 7,   // still options
                                   drift: 1, pointer: 0.9, tilt: 1 });       // motion options
ctl.set({ level: 0.6 });       // motion options ease; still options re-capture
ctl.load({ plate: 'glass', look: 'eye' });   // a new plate, motion options kept
ctl.pulse(x, y, 0.8);          // a ripple at CSS px of the canvas
ctl.point(x, y); ctl.point(null);            // hold the lamp yourself, or put it down
ctl.pause(); ctl.resume(); ctl.destroy();
ctl.state();   // { mode: 'gpu'|'still', path: 'own'|'bitmap'|'copy'|'cpu', frames, visible, expose, clock, size, ready, reduced }
ctl.bench(60); // { sync, pipelined, size, path } in ms per frame, every term on
Mercury.live.parity({ plate: 'glass', look: 'eye', seed: 3 });   // frame 0 vs the still
```

**UI pieces** (`Mercury.ui`). Each one keeps the native control. The canvas sits behind it
with `aria-hidden`, and every function returns the controller (or `{ ctl, … }`).

| piece | call | behaviour |
|---|---|---|
| live background | `ui.background(section, opts)` | Film · oxide. The lamp follows the pointer, clicks ripple, the aurora drifts and scrolling tilts the room. |
| button | `ui.button(btn, opts)` | Black chrome (glass · eye). Dim at rest (`rest` 0.55). On hover or `:focus-visible` it brightens (`hover` 1) and the lamp follows the pointer. A press, Enter or Space drops a ripple. |
| card | `ui.card(el, opts)` | Rises out of black the first time it scrolls in, then drifts. The lamp follows the pointer. |
| toggle | `ui.toggle(checkbox)` | Wraps the checkbox in a track and adds `role=switch`. The half the thumb sits on is polished. Flipping slides the polish across and ripples. |
| slider | `ui.slider(range)` | Wraps the range. The strip is polished up to the value. |
| progress | `const p = ui.progress(el); p.set(0.4)` | `role=progressbar` with `aria-valuenow`. Polished up to p, and it ripples when it reaches 1. |
| loader | `const l = ui.loader(el); l.stop()` | `role=status`. A chrome bead with a lamp circling over it. It holds still under reduced motion. |
| focus ring | `ui.focusRing()` | One ring for the page: a band of drifting chrome cut out with a CSS mask round whatever has `:focus-visible`. Keep a 1px CSS outline as well, for the fallback and for forced colours. |
| section transition | `ui.transition(strip)` | A strip of aurora light (aurora · ember) that brightens out of black as it scrolls up, with its reflection tilting. |

A minimal page (copy it, then change the plate, look and the pieces):

```html
<section id="hero" style="position:relative;height:80vh;color:#ebe7df">
  <h1 style="position:absolute;left:24px;bottom:24px;font:300 72px/0.9 sans-serif">Night shift</h1>
</section>
<button id="go" style="background:#000;color:#ebe7df;border:1px solid #444;border-radius:999px;padding:12px 22px">Go</button>
<input type="checkbox" id="on"> <input type="range" id="lvl" value="60">
<script src="assets/mercury.js"></script>
<script src="assets/live.js"></script>
<script src="assets/live-ui.js"></script>
<script>
  const ui = Mercury.ui;
  ui.background(document.getElementById('hero'), { plate: 'film', look: 'oxide', seed: 7 });
  ui.button(document.getElementById('go'));
  ui.toggle(document.getElementById('on'));
  ui.slider(document.getElementById('lvl'));
  ui.focusRing();
</script>
```

Keep label text on chrome controls light, with a dark `text-shadow`. Chrome is bright in
places and dark in others, and the shadow is what keeps a label readable on both.

**Fallbacks.**
- `prefers-reduced-motion`: the still frame, clock 0, no lamp, no ripples, no drift, no tilt.
  `set()` jumps straight to its target, and a view draws only when something changed. The
  engine listens for the setting to change.
- No WebGL2, or the shader fails: the still plate from `mercury.js`, with level and fill
  applied as flat darkening. It changes state but does not animate. A lost context is
  rebuilt on `webglcontextrestored`.
- Offscreen: an IntersectionObserver pauses the view, and `visibilitychange` stops the one
  shared rAF loop. A paused view still draws its first frame.
- Contexts: canvases of 0.9 MP or more get their own WebGL2 context. Smaller ones share one
  OffscreenCanvas context and get their frames through `transferToImageBitmap`. Pass
  `own: true | false` to override.

**Parity** (frame 0 against the still, 480×320 and 320×400, headless Chrome, 28 Sep 2026).
The captured still is sampled texel for texel with every term at zero, so parity holds by
construction. `check.sh` still measures it on every run:

| case | mean cpu/gpu | dMean | dSdRel | dGrainRel | MAD (levels) | within 2 |
|---|---|---|---|---|---|---|
| film · oxide · 7 | 0.1643 / 0.1643 | 0 | 0 | 0 | 0 | 100 % |
| glass · eye · 3 | 0.2409 / 0.2409 | 0 | 0 | 0 | 0 | 100 % |
| ribbon · volt · 5 | 0.2498 / 0.2498 | 0 | 0 | 0 | 0 | 100 % |
| aurora · iris · 2 (320×400) | 0.6421 / 0.6421 | 0 | 0 | 0 | 0 | 100 % |

Tolerance: `Mercury.live.TOLERANCE` = dMean 0.004, dSdRel 0.02, dGrainRel 0.03, MAD 1.5.

**Performance.** One fragment pass per frame: two texture reads, a 4-ring loop, one
specular, no noise. Not yet measured in real Chrome for this skill (headless only). The budget is ≤ 4 ms per frame at 1440×900 CSS, DPR 2.
Capture cost is paid once per view, and again on resize (debounced) or when a still option
changes. It is one `mercury.js` pour plus its CPU grain: about 20 ms at 480×320, and a few
hundred ms for a full-screen hero at DPR 2, run as one task per view. Measure in real
Chrome with `ctl.bench(60)`. Headless Chrome renders WebGL in software.

**Still vs live.** Live today: the sheen, ripples, aurora drift, scroll tilt, level and fill
on all five plates. Still, captured once: the fields themselves. The pour does not flow, the
trails do not drag, and the aurora forms do not move. The natural next step is to port the
film plate's studio reflection to the shader so the lamps themselves can move.

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
- [ ] Live pages: `tools/check.sh` section 5 passes, which covers moving, parity and the
      reduced-motion hold, and `ctl.bench(60)` in real Chrome stays under 4 ms.

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
