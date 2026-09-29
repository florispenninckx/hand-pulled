# Type (ethereal-haze)

This is the `## Type` section of `ethereal-haze/SKILL.md`, kept here beside the faces. When the faces change, change both.

---

## Type

Lull is the skill's own thin display serif, for the one word on an image, and Pollen, Furl and
Waver are its alternates. All four are variable fonts made by `tools/foundry.py` from OFL faces,
under the SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Standard | Use it for |
|---|---|---|---|---|
| **Lull** (main) | A thin high-contrast serif that goes out of focus: razor hairlines at 0, soft swollen stems and serifs at 1000, as through a soft-focus lens | `'FOCS'`: Sharp 0, Soft 500, Bloom 1000 (default 0) | `'FOCS' 250` | The one word on a bloom, field or silk; a card's word in caps; a house or scent name |
| **Pollen** | A flared serif that sheds grain: its edge thins and round grains lift off and drift up and to the right | `'DUST'`: Still 0, Shed 400, Blown 1000 (default 400) | `'DUST' 400` | The word on a grain-gradient field whose edges dissolve into stipple; a collection or scent name |
| **Furl** | A ribbon letter: a geometric sans redrawn with a broad flat pen, so each stroke is a satin ribbon; the axis turns the pen and the ribbon rolls over | `'TURN'`: Upright 0, Turning 500, Rolled 1000 (default 0) | `'TURN' 500` | A word beside a single colour ribbon or a satin fold; an invitation, a name on cream paper |
| **Waver** | A narrow display serif seen through rising heat: rows sway in slow waves that grow toward the top | `'HAZE'`: Clear 0, Haze 500, Mirage 1000 (default 400) | `'HAZE' 500` | The word over a meadow smeared by a moving shutter or poppies swaying past the lens; a longer title that needs a narrow face |

```css
.word { font-family: 'Lull'; font-variation-settings: 'FOCS' 250; color: #fff;
        font-size: clamp(34px, 5vw, 78px); letter-spacing: .08em; text-transform: uppercase; }
.name { font-family: 'Waver'; font-variation-settings: 'HAZE' 500; font-size: clamp(40px, 7vw, 110px); }
```

- **At most two faces on a page.** One display serif, Lull *or* one alternate chosen by the image,
  plus Jost. A display face replaces Marcellus on that page. Never set ledes, lines, captions or
  hex labels in any of them.
- **The axis matches the image.** Start from the standard and keep one value per role. Lull: sharp
  (0–250) on a crisp rim or a card, soft (500) on a field, bloom (750–1000) only at 60 px and up.
  Pollen past 600 and Waver past 700 are for one large word, 60 px and up. Furl reads at any value;
  0 and 1000 are its two flat-pen extremes. The effect is drawn into the letter, so each face stays
  a clean vector at any size.
- **Motion.** For the live hero, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }`, set
  `font-variation-settings: 'FOCS' var(--v)` (or the alternate's axis) and pull `--v` slowly toward
  the standard on load. Animate one element at most, and never under `prefers-reduced-motion`.
- **Glow is never text-shadow.** No glow, no `filter: blur()` and no halo on the word; the bloom,
  the grain and the haze are the axis and the image.

Size, full Latin (Western European), `woff2`: Lull 55 KB, Pollen 58 KB, Furl 62 KB, Waver 80 KB. A
page loads only the face it uses (`font-display: swap`). `fonts/specimen.html` shows all four live.
