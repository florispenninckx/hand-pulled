# Type (ready to paste into riso-cartography/SKILL.md)

This section is for the hub to wire in. Lane G7 made the faces and did not edit SKILL.md or
reference.html. Paste it after "Type, each face with one job". `fonts/specimen.html` shows both
faces live, and the two inks stacked.

---

## Type

Blockplan is the skill's own poster face, with a second-ink partner. Both are variable fonts made
by `tools/foundry.py` from an OFL condensed grotesk, under the SIL OFL 1.1, and loaded from the
skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Blockplan** | A condensed poster grotesk cut as a stencil: a bridge through every counter | `'CUTS'`: Hairline 0, Regular 400, Open 1000 (default 400) | The huge poster words, a sheet's name, a big stop number |
| **Blockplan Drop** | The same letters uncut, fat and rough at the edge as a drum leaves them, extruded into a drop shadow | `'DROP'`: Flat 0, Regular 400, Deep 1000 (default 400) | Only under Blockplan, as the second ink |

```css
.stack       { position: relative; font-size: clamp(56px, 10vw, 150px); line-height: .95; }
.stack .top  { position: relative; font-family: 'Blockplan'; font-variation-settings: 'CUTS' 400; color: #f15060; }
.stack .drop { position: absolute; inset: 0; font-family: 'Blockplan Drop'; font-variation-settings: 'DROP' 400;
               color: #0078bf; transform: translate(.03em, .02em) rotate(-.3deg); mix-blend-mode: multiply; }
```
```html
<h2 class="stack"><span class="drop" aria-hidden="true">Riverside</span><span class="top">Riverside</span></h2>
```

- **Two inks, one face.** Blockplan Drop is Blockplan's second drum, not another voice, so the pair
  counts as one face. With Instrument Serif italic for titles and IBM Plex Mono for notes, a page
  still sets at most two faces in any one place. Set the drop in the aria-hidden copy.
- **Misregister it like the press.** Same size, same tracking (the advances match), a second spot
  colour, and an offset of a few hundredths of an em with a fraction of a degree of turn. Overprint
  with `mix-blend-mode: multiply`, never with opacity.
- **Titles only.** Never set running text, notes or map labels in either face; those stay in the
  sans and the mono. The stencil needs 40 px or more to read.
- **The axes are the plate.** Keep one value per role. To animate one, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 400; }`, set
  `font-variation-settings: 'CUTS' var(--v)` and animate `--v` on one element at most, never
  under `prefers-reduced-motion`.
- **No glow, no text-shadow.** The drop is the second face in a second ink, never a CSS shadow.

Sizes, full Latin (Western European), `woff2`: Blockplan 22 KB, Blockplan Drop 117 KB (its rough
edge costs the bytes). A page loads only the faces it uses (`font-display: swap`).
