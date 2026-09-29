# Type (pixelsort-glitch)

This is the `## Type` section of `pixelsort-glitch/SKILL.md`, kept here beside the faces. When the faces change, change both.

---

## Type

Rowdrag is the skill's own display face, and Slipband is its alternate. Both are variable fonts
made by `tools/foundry.py` from OFL grotesks, under the SIL OFL 1.1, and loaded from the skill
itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Standard | Use it for |
|---|---|---|---|---|
| **Rowdrag** (main) | A blocky grotesk quantised to a 60-unit pixel grid, whose pixel rows are sorted and dragged sideways into streaks | `'SORT'`: Clean 0, Sorted 500, Dragged 1000 (default 0) | `'SORT' 600` | One large word or a title on a calm part of the picture, a night's name, a big number |
| **Slipband** | A black expanded grotesk cut into bands at the same heights all along the line; the bands slide sideways, open slits and leave stuttered ghosts, as on a slipping scanner | `'SLIP'`: Still 0, Slipped 500, Torn 1000 (default 500) | `'SLIP' 500` | A wide one-line headline or masthead that reads as one scanned strip: a release title, a zine header, a hackathon or tool name |

```css
.title { font-family: 'Rowdrag'; font-variation-settings: 'SORT' 600; font-size: clamp(56px, 11vw, 160px);
         line-height: .9; letter-spacing: -.01em; }
.mast  { font-family: 'Slipband'; font-variation-settings: 'SLIP' 500; font-size: clamp(40px, 8vw, 128px);
         line-height: .95; }
```

- **At most two faces on a page.** A display face takes the large-type role and replaces
  Archivo 800, so the page keeps Rowdrag *or* Slipband, plus IBM Plex Mono. Never both display
  faces on one page, and never running text, ledes or captions in either.
- **The axis is the glitch.** Start from the standard and choose one value per role. Rowdrag: 0–250
  for a clean pixel word, 400–700 for the house look, 1000 for one wrecked word; it is drawn from
  pixels, so set it at 48 px and larger. Slipband: 0 for a whole word, 500 for the house look, 1000
  for one torn word; the bands line up along the line, so keep a Slipband head to one line, 40 px
  and larger.
- **Type stays calm.** The skill keeps type and text blocks still. If one title must move, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }`, set
  `font-variation-settings: 'SORT' var(--v)` (or `'SLIP'`) and run `--v` once on load or on hover.
  Animate one element at most, and never under `prefers-reduced-motion`.
- **No glow and no RGB split.** Never add a CSS text-shadow in any colour. The drag is in the
  letters themselves.

Size, full Latin (Western European), `woff2`: Rowdrag 10 KB, Slipband 80 KB. Each has one axis (no
weight), so a page loads just the one file it uses (`font-display: swap`). `fonts/specimen.html`
shows both faces live.
