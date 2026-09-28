# Type (ready to paste into abstract-texture/SKILL.md)

This section is for the hub to wire in. Lane G7 made the face and did not edit SKILL.md or
reference.html. Paste it after the type list (Cormorant Garamond, Geist Mono).
`fonts/specimen.html` shows the face live.

---

## Type

Tideline is the skill's own display face, the "one heavy word set up the sheet". It is a variable
font made by `tools/foundry.py` from an OFL grotesk, under the SIL OFL 1.1, and loaded from the
skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Tideline** | A heavy grotesk trailed by six outline copies of itself, like a shape dragged through a slow shutter | `'ECHO'`: Still 0, Echo 500, Reverb 1000 (default 0) | The one heavy word on a poster or sleeve, a night's name, a section opener |

```css
.word { font-family: 'Tideline'; font-variation-settings: 'ECHO' 500; font-size: clamp(64px, 12vw, 180px);
        line-height: 1.1; letter-spacing: .01em; }
```

- **It is the heavy word, not a third voice.** A sheet uses Tideline or the thin serif capitals
  for its title, with Geist Mono for the small type, so no more than two faces. Never set running
  text, captions or dates in it.
- **The axis is the echo.** At 0 it is a plain black grotesk; at 500 the rings stand clear of the
  letter; at 1000 they fan far down and to the right, so give the line extra leading. Keep one value
  per role. It is vector and stays sharp, so it can sit on any surface, set last like all type here.
- **Motion.** To let the echo breathe, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }`, set
  `font-variation-settings: 'ECHO' var(--v)` and animate `--v`. Animate one element at most, and
  never under `prefers-reduced-motion`.
- **No glow.** The echo is outlines, never a CSS text-shadow or a blur.

Size, full Latin (Western European), `woff2`: Tideline 97 KB (`font-display: swap`).
