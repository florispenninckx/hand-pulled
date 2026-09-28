# Type (ready to paste into pixelsort-glitch/SKILL.md)

This section is for the hub to wire in. Lane G7 made the face and did not edit SKILL.md or
reference.html. Paste it after the "Type:" paragraph under the palette. `fonts/specimen.html`
shows the face live.

---

## Type

Rowdrag is the skill's own display face. It is a variable font made by `tools/foundry.py` from
an OFL grotesk, under the SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Rowdrag** | A blocky grotesk quantised to a 60-unit pixel grid, whose pixel rows are sorted and dragged sideways into streaks | `'SORT'`: Clean 0, Sorted 500, Dragged 1000 (default 0) | One large word or a title on a calm part of the picture, a night's name, a big number |

```css
.title { font-family: 'Rowdrag'; font-variation-settings: 'SORT' 600; font-size: clamp(56px, 11vw, 160px);
         line-height: .9; letter-spacing: -.01em; }
```

- **It takes the large-type role.** On a surface set in Rowdrag it replaces Archivo 800, so the
  page keeps two faces: Rowdrag and IBM Plex Mono. Never set running text, ledes or captions in it.
- **The axis is the sort.** Choose one value per role and keep it: 0–250 for a clean pixel word,
  400–700 for the house look, 1000 for one wrecked word. It is drawn from pixels, so set it at
  48 px and larger; below that the streaks turn to noise.
- **Type stays calm.** The skill keeps type and text blocks still. If one title must move, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }`, set
  `font-variation-settings: 'SORT' var(--v)` and run `--v` once on load or on hover. Animate one
  element at most, and never under `prefers-reduced-motion`.
- **No glow and no RGB split.** Never add a CSS text-shadow in any colour. The drag is in the
  letters themselves.

Size, full Latin (Western European), `woff2`: Rowdrag 10 KB. Rowdrag has only one axis (no weight),
so a page loads just the one file (`font-display: swap`).
