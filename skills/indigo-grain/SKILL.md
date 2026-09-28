---
name: indigo-grain
description: Design pages, prints and covers where grain is the medium — deep ultramarine or cobalt dissolving into white, violet-pink glow on near-black, pale photogram flowers on navy, an ultramarine silhouette on paper, all of it soft-focus and made of dense stochastic film-like grain, almost no text, full-bleed. Use when the user asks for cyanotype, sun print, Prussian or indigo blue, a photogram, grain/noise as the actual image rather than a filter, high-ISO or riso-adjacent mood, or a moody blue-violet editorial/cover aesthetic.
---

# Indigo grain

A cyanotype is a sheet brushed with iron salts, laid in the sun with something on top
of it, then washed: where light reached the paper it turns Prussian blue, where an
object blocked it the paper stays pale. This skill keeps that one physical idea — light
exposure mapped to a blue-family ramp — and drops the herbarium-page trappings around
it. What actually sells the look on a mood board is not a specimen card, it is: one hue
family (ultramarine through violet to white and near-black), grain so dense and coarse
it reads as the image rather than a texture over it, soft focus, and a full-bleed frame
with barely a word on it.

The files next to this SKILL.md:

- `assets/cyanotype.js` — `window.Cyanotype`: a shared grain-and-palette compositor
  (`compose`) plus three renderers built on it — `field` (an abstract grain-gradient
  glow, no subject), `print` (a photogram from a procedural mask: pale-on-navy or
  ink-on-paper), and `tone` (the same treatment applied to a photograph the viewer
  drops in).
- `assets/botanica.js` — `window.Botanica`: subjects drawn white-on-black as an exposure
  mask. `nerine` is a spider-lily stem and umbel and `trumpet` a trumpet lily. Both are
  modelled in 3-D and projected flat, so petals foreshorten the way a photographed flower
  does. `profile` is a head in profile, with a bezier-traced face, full hair with fine
  strands, neck and shoulder. `leaf` and `stem` are for the ground.
- `reference.html` — five full-bleed plates: a cobalt field, a violet-on-black glow, a
  lily photogram, a printed profile, and a live "drop in your own photograph" plate.
  **Read it before designing.**

## What makes it authentic

1. **Grain is the medium, not a filter.** It is generated per pixel as a perturbation of
   where a value lands on the colour ramp (`compose` nudges `t` before sampling the
   palette), never as RGB jitter and never as a flat opacity overlay. That is what keeps
   every grain speckle inside the hue family instead of turning it grey or rainbow-noisy,
   and it is dense enough to see at 100% zoom, layered at three block scales (1×1, 2×2,
   4×4) so it does not look like a single repeating dither pattern.
2. **One hue family, always.** Every palette in `Cyanotype.PALETTES` interpolates
   between the same handful of positions — deep ultramarine/navy, cobalt, violet, white,
   near-black. Nothing in this skill introduces an unrelated hue; a "toned" variant would
   still be a ramp inside that family, not a second colour scheme.
3. **Soft focus, not sharp edges.** Every subject is built from a blurred exposure mask
   (`print`/`tone` blend a small "contact" blur with a larger "haze" blur), so edges glow
   rather than cut. A crisp hard-edged silhouette with no falloff is the one place this
   skill should never land outside of very tight, coarse-grained edges (see `paperblue`
   in tokens below).
4. **Photogram polarity is a real physical choice, not just a colour swap.** An object
   that blocks light stays pale where it sat (`polarity: 'negative'` — the lily plates,
   pale bloom glowing out of navy) or an object can print like ink on paper
   (`polarity: 'positive'` — the profile plate, dark ultramarine on white with grain
   concentrated in a band at the edge, `o.edge`/`o.edgeBoost` in `compose`). Getting this
   backwards is the single easiest way to miss the mood board: check which side of the
   mask should stay pale before picking a palette.
5. **Full-bleed, almost no type.** No card, no border, no caption block bigger than a
   line. `reference.html` allows itself exactly one small wordmark and one small
   plate-name line per section, both set with `mix-blend-mode: difference` so they never
   need a scrim.

## Tokens

`Cyanotype.PALETTES`, each `{ ground, stops: [[t, hex], ...] }` — a ramp from pale to
deep, read low-to-high:

| Palette | Pale end | Deep end | Used for |
|---|---|---|---|
| `cobalt` | `#ffffff` | `#1c7fc4` | grain-gradient field, cyan-turquoise into white |
| `nightglow` | `#06060c` (this one runs dark→pale) | `#faeef8` | violet-pink glow on near-black |
| `navy` | `#c4cbf2` | `#2c3c8c` | photogram: pale-lilac bloom, flat mid-cobalt ground |
| `paperblue` | `#faf9f4` | `#0a1050` | printed silhouette: ultramarine ink, paper ground |
| `lily` | `#f5f2fb` | `#0a1740` | toned photograph: pale highlights, deep-blue shadow |

`navy`, `lily` and `paperblue` all put the pale colour at `t = 0` and the ink colour at
`t = 1` — that convention is what makes `polarity` behave predictably in `print()`.
`cobalt` and `nightglow` back `field()`, which has no object/background concept, only a
height field, so they were tuned by eye against the target glow instead.

Type, used sparingly: 'Fraunces' italic for the wordmark and the one caption per plate,
'Space Mono' for the small "another" / "+ photograph" controls. Nothing else.

## Composition

- One full-bleed plate per idea. Never combine the abstract glow, the photogram and the
  silhouette on one canvas — `reference.html` stacks five plates as five `100svh`
  sections rather than crowding one page.
- Let the subject bleed off the frame edge (stems running off the bottom, a profile
  cropped by the frame) rather than centring it with margin on all sides.
- Grain density and softness do more compositional work than colour variety — resist the
  urge to add a second accent hue to "finish" a plate that looks plain; increase
  `grain`, adjust `soft`/`haze`, or add a second, dimmer bloom/pool instead.
- Text, if any, sits at a frame edge in one line, blended so it never needs its own
  background chip.

## Build it

Copy both engines into the project (dependency-free classic scripts; they set
`window.Cyanotype` and `window.Botanica`).

```html
<canvas id="plate"></canvas>
<script src="cyanotype.js"></script>
<script src="botanica.js"></script>
<script>
  // an abstract grain-gradient glow — no subject, just warped pools of colour
  Cyanotype.field(document.getElementById('plate'), {
    width: 1440, height: 900, seed: 7, palette: 'cobalt', grain: 1.15,
  });

  // a photogram: draw the mask in `objects`, white = opaque, grey = translucent
  Cyanotype.print(document.getElementById('plate'), {
    width: 900, height: 1400, seed: 3, palette: 'navy', polarity: 'negative',
    focus: 0.6, haze: 1.15, soft: 0.62, grain: 1.05,
    objects: (ctx, w, h, rand) => {
      const size = Math.min(0.13 * h, 0.23 * w);
      Botanica.nerine(ctx, rand, { x: w * 0.5, y: h * 1.03, tx: w * 0.55, ty: h * 0.26, size });
    },
  });

  // the same treatment applied to a photograph the viewer supplies
  // Cyanotype.tone(canvas, imgElement, { palette: 'lily', focus: 0.55, haze: 1.2, soft: 0.6 });
</script>
```

- `Cyanotype.field(canvas, { width, height, seed, palette, softness, grain, scale, pools })`
  sums warped gaussian "blob" and line "band" pools into a height field, then ramps and
  grains it. Omit `pools` to use the hand-tuned defaults per palette (`autoPools`).
- `Cyanotype.print(canvas, { width, height, seed, palette, polarity, focus, haze, soft, grain, coarse, layers, bg, bgDither, accents, objects(ctx, w, h, rand) })`
  builds a black mask, lets `objects` paint white/grey shapes on it, blurs it twice
  (`focus` = small contact blur, `haze` = larger soft-focus blur, `soft` mixes the two),
  then maps to the ramp according to `polarity`. `positive` polarity also derives an edge
  band that concentrates grain right at the silhouette's boundary.
  - `coarse` (0..~1) gates a per-pixel stochastic dither boost by the local gradient of
    the target field, so only genuine transitions (a blue-to-white edge, an ink-to-paper
    wash) pick up a hard, coarse-grained noise — flat pools/paper keep the ordinary fine
    grain. It stays per-pixel, never block-quantized, so a "hard" edge reads as grain,
    not pixel art.
  - `layers` is `[{ objects, focus, haze, soft, mode }, ...]` in place of one `objects`.
    Each layer draws and blurs on its own, which gives a real depth of field: one sharp,
    the others hazy. The results screen-blend together in order. A layer with
    `mode: 'multiply'` darkens what is already there instead. It fills itself white and
    paints stems or leaves in grey, so they sit in shadow in front of a lit ground.
  - `bg` is an ink density behind the subject, independent of the object mask (`positive`
    polarity only). `{ from, to }` is a wash from ink to paper across the width. A
    function `(u, v) → 0..1` of the fractional position gives any other shape.
    `bgDither` (0..1) turns that density into stochastic ink specks instead of a smooth
    tint, like the speckled paper in front of a printed profile.
  - `accents` is `[{ x, y, r, a }, ...]` (canvas px): a faint lilac wash blended in after
    grain — for a bloom's throat. It is plain alpha blending, not a `soft-light`/hue blend
    mode, because a hue-only blend barely moves a base that is already near-white, which
    is exactly where a throat highlight sits.
- `Cyanotype.tone(canvas, image, { width, height, seed, palette, focus, haze, soft, grain, gamma })`
  runs a photograph through the same blur-and-ramp pipeline instead of a drawn mask.
- `Cyanotype.PALETTES`, `Cyanotype.ramp(pal, t)`, `Cyanotype.mulberry32(seed)` are
  exposed for building new palettes or driving your own seeded randomness the same way.
- `Botanica.nerine(ctx, rand, { x, y, tx, ty, size, florets, spread, bow })` draws a
  stem from `(x, y)` (put it below the frame) to an umbel at `(tx, ty)`. There are 6–8
  florets on short pedicels, each with narrow, crisped, twisted tepals that recurve
  back, plus upswept stamens. `size` is one tepal's length.
- `Botanica.trumpet(ctx, rand, { x, y, size, angle, tilt, shade })` draws one trumpet
  lily with its tube base at `(x, y)`. It points along `angle` and turns toward the
  viewer by `tilt` (0 is side-on, about 0.8 is nearly face-on). It returns
  `{ x, y, r }` for the throat, for an `accents` wash. The tepals are painted back to
  front, with a darker base and a midrib, so overlaps show.
- `Botanica.profile(ctx, rand, { x, y, scale, hair, volume, mirror })` draws a head in
  profile looking right. `(x, y)` is the crown of the skull, and `scale` is the
  crown-to-chin height. The neck, shoulder and chest run off the bottom of the frame.
- `Botanica.leaf`, `stem`, `ribbon`, `walk` and `bloom` are the primitives underneath,
  exported for new subjects. `bloom` takes the full 3-D flower spec; see `NERINE` and
  `TRUMPET` in the source.
- A 1440×900 plate takes well under a second. Render once per change or per "another"
  click, never per frame — nothing here animates.

## Tells that it was generated — avoid all of them

- Grain as a faint CSS noise overlay at low opacity sitting on top of clean colour —
  the grain here **is** the pixel data, dense enough to see at 100% zoom.
- A second, unrelated hue introduced to "add interest." Stay inside the ultramarine →
  violet → white/near-black family.
- Hard vector edges with no soft-focus falloff anywhere (the printed-silhouette plate is
  the one deliberate exception, and even it grains up at the boundary).
- A photogram with the polarity backwards — ink where the object should have stayed
  pale, or vice versa.
- A busy page: a card, a border, a paragraph of caption copy, a centred logo lockup.
  One small wordmark, one short plate name, nothing else.

## Verify before calling it done

Screenshot in a headless browser at both a desktop and a phone width, then zoom in on a
patch of grain and on one subject edge.

- [ ] Grain is visibly stochastic and dense at 100% zoom, not a smooth gradient with a
      faint texture laid over it.
- [ ] Every plate stays inside the ultramarine/violet/white/near-black family — no stray
      hue.
- [ ] The photogram plates read as pale-on-navy; the printed-silhouette plate reads as
      ink-on-paper. If either looks inverted, check which end of the palette's ramp is
      pale and which `polarity` was passed.
- [ ] Soft focus is visible — no subject has a crisp, unblurred edge except the
      silhouette's deliberately tighter, coarse-grained one.
- [ ] At most one short line of text per plate; no card, border or logo lockup.
- [ ] No console errors; no horizontal scroll at phone width; the same seed reproduces
      the same plate; `prefers-reduced-motion` leaves nothing moving (there is no
      animation to disable).

## Credits and prior art

Original implementation, built from the physical process (iron-salt exposure, blur as
soft focus, grain as ramp-position noise) rather than ported from any reference
repository. Historical reference for the process itself: Anna Atkins, *Photographs of
British Algae: Cyanotype Impressions* (1843) — no image, text or code from that or any
other source is reproduced here; every plate is generated at runtime.
