# Type (ready to paste into ethereal-haze/SKILL.md)

This section is for the hub to wire in. Lane G7 made the face and did not edit SKILL.md or
reference.html. Paste it after the "Type:" paragraph under the tokens. `fonts/specimen.html`
shows the face live.

---

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
