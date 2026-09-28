# Type (ready to paste into maximalist-boc/SKILL.md)

This section is for the hub to wire in. Lane L2 made the fonts and did not edit SKILL.md or
reference.html, because L3 is rewriting both. Paste it after "Liquid type is display type"
and add the `@font-face` line to the page. `fonts/specimen.html` shows every face live.

---

## Type

`goo.js` letters the one liquid title. Everything else that is display type uses the skill's own
faces in `fonts/`. They are variable fonts made by `tools/foundry.py` from OFL fonts, under the SIL
OFL 1.1, and they are loaded from the skill itself, not from Google Fonts:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Soak** | A black grotesk soaked until its corners melt and its edges blot | `'BLED'`: Dry 0, Regular 500, Soaked 1000 | Second headlines, club-night names, a big number |
| **Globule** | A wide techno skeleton re-inked as poured liquid, with drops at the ends | `'MELT'`: Poured 0, Regular 500, Molten 1000 | The liquid voice next to a goo title: dates, heads, track names |
| **Flatbed** | A super-extended geometric pressed flat under a roller, with ink traps | `'FLAT'`: Standing 0, Regular 500, Pressed 1000 | Labels, catalogue numbers, formats, tracked small caps, a colour band |
| **Gouge** | A fat round display face with a crescent of light cut into every stroke | `'CARV'`: Scored 0, Regular 500, Gouged 1000 | Shop signs, prices, stickers, one shaded word on a flat field |

```css
.date  { font-family: 'Globule'; font-variation-settings: 'MELT' 400; }
.label { font-family: 'Flatbed'; font-variation-settings: 'FLAT' 800; letter-spacing: .04em; }
```

- **Split the work.** The title (one to three words) is `goo.js`. Heads, dates and labels use a
  face. Facts and running text stay in the sans. Use no more than two faces on a page, and
  never set running text in them.
- **The axis is the effect.** Choose one value per role and keep it. To animate it, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 500; }`, set
  `font-variation-settings: 'MELT' var(--v)` and animate `--v`. Animate one element at most,
  and never under `prefers-reduced-motion`.
- **The glow is not a font.** The board's neon halo is goo.js's `glow` finish on the title (or
  a canvas bloom), never a face and never a CSS text-shadow.
- **Rule 4 still holds.** "The type is liquid, not a font" is about the title: it stays goo.js,
  bouncing and seeded. The faces carry everything around it, which used to be the sans.

Sizes, full Latin (Western European), `woff2`: Soak 62 KB, Globule 59 KB, Flatbed 49 KB, Gouge 65 KB.
A page loads only the faces it uses (`font-display: swap`).
