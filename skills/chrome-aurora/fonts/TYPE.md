# Type (ready to paste into chrome-aurora/SKILL.md)

This section is for the hub to wire in. Lane G7 made the face and did not edit SKILL.md or
reference.html. Paste it after the palette and type notes. `fonts/specimen.html` shows the
face live.

---

## Type

Specula is the skill's own display face. It is a variable font made by `tools/foundry.py` from an
OFL techno face, under the SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Specula** | A wide techno face with an inline: a channel cut along every stroke that widens and slides toward the light | `'SHEN'`: Glint 0, Regular 300, Polished 1000 (default 300) | The page headline in the black beside the plate, an event or product name, a big date |

```css
.head { font-family: 'Specula'; font-variation-settings: 'SHEN' 300; color: #ebe7df;
        font-size: clamp(44px, 8vw, 120px); line-height: 1; letter-spacing: .02em; }
```

- **The page keeps two faces.** Specula for the headline, Martian Mono for everything small
  (corners, captions, controls). Never set running text, ledes or corner type in Specula.
- **It is not chrome.** Set it flat in the off-white `#ebe7df` (or the one hot orange on hover).
  Never fill it with a gradient, `background-clip: text` or the plate itself; the sheen is the
  inline cut, and the ground shows through it. It never goes on a poster: posters keep their
  10 px mono in the corners.
- **The axis is the sheen.** 0 is a hairline glint, 300 the house look, 1000 a rim around an open
  core that needs 64 px or more to read. Keep one value per role. With live mode, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 300; }`, set
  `font-variation-settings: 'SHEN' var(--v)` and let `--v` follow the plate's light. Animate one
  element at most, and never under `prefers-reduced-motion`.
- **Glow is never text-shadow.** Light belongs to the plate. No halo, blur or glow on Specula.

Size, full Latin (Western European), `woff2`: Specula 55 KB (`font-display: swap`).
