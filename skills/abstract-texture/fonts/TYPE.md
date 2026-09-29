# Type (the "## Type" section of abstract-texture/SKILL.md)

The same menu as the skill's Type section, kept beside the fonts. `specimen.html` shows every
face live, each dial starting at its standard setting.

---

## Type

The skill's own display faces, in `fonts/`, are a menu of three, each for the "one heavy word set
up the sheet". They are variable fonts made by `tools/foundry.py` from OFL fonts, under the
SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| | Face | Look | Axis (0–1000) and standard setting | Use it for |
|---|---|---|---|---|
| Main | **Halide** | A wide Didone overexposed: the light of its heavy strokes spreads into the film, so stems swell into soft pools and joins fill with glow while the hairlines hold | `'GLOW'`: Dry 0, Regular 400, Bloom 1000. **Standard 610** | The wide serif word on a poster or sleeve, a gallery, fragrance or night's name, pale on a dark surface |
| Alternate | **Sateen** | A wide rounded letter printed on silk and pulled, so its strokes ripple in soft folds | `'FOLD'`: Flat 0, Regular 500, Folded 1000. **Standard 500** | A soft word over satin, marbled or aurora surfaces, a launch or a record title |
| Alternate | **Tideline** | A heavy grotesk trailed by six outline copies of itself, like a shape dragged through a slow shutter | `'ECHO'`: Still 0, Echo 500, Reverb 1000. **Standard 500** | The heavy word over streaks and motion blur, a section opener |

```css
.word  { font-family: 'Halide'; font-variation-settings: 'GLOW' 610; font-size: clamp(64px, 12vw, 180px);
         line-height: 1.05; }
.soft  { font-family: 'Sateen'; font-variation-settings: 'FOLD' 500; line-height: 1.1; }
.echo  { font-family: 'Tideline'; font-variation-settings: 'ECHO' 500; line-height: 1.1; letter-spacing: .01em; }
```

- **Two faces at most.** A sheet takes one display face from the menu, or the thin serif capitals,
  for its title, with Geist Mono for the small type. Never two of the menu on one sheet, and never
  running text, captions or dates in them.
- **Set the standard, then move it on purpose.** Halide's font default is 400, so always set
  `'GLOW' 610`; past 850 the letters swell heavier, for one word at 80 px and up. Sateen and Tideline default
  to their flat, still letter at 0, so set 500. Tideline's rings fan far down and to the right at
  1000, so give the line extra leading. Keep one value per role. The faces are vector and stay
  sharp, so they sit on any surface, set last like all type here.
- **Motion.** To let a face breathe, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 610; }`, set
  `font-variation-settings: 'GLOW' var(--v)` (or `'FOLD'`, `'ECHO'`) and animate `--v`. Animate one
  element at most, and never under `prefers-reduced-motion`.
- **No CSS glow.** Halide's glow and Tideline's echo are in the outlines, never a text-shadow or
  a blur.

Sizes, full Latin (Western European), `woff2`: Halide 81 KB, Sateen 34 KB, Tideline 97 KB.
A page loads only the faces it uses (`font-display: swap`).
