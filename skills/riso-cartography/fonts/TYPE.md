# Type (the "## Type" section of riso-cartography/SKILL.md)

The same menu as the skill's Type section, kept beside the fonts. `specimen.html` shows every
face live, each dial starting at its standard setting.

---

## Type

The skill's own poster faces, in `fonts/`, are a menu of two: Isohypse, and Blockplan with its
second-ink partner. All are variable fonts made by `tools/foundry.py` from OFL grotesks, under the
SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| | Face | Look | Axis (0–1000) and standard setting | Use it for |
|---|---|---|---|---|
| Main | **Isohypse** | A heavy rounded grotesk drawn as a contour map: ring inside ring from its edge, from a solid letter scored with fine lines to a hairline survey | `'TOPO'`: Filled 0, Regular 500, Survey 1000. **Standard 500** | The one huge word over the map, a place or river name, a walk's title |
| Alternate | **Blockplan** | A condensed poster grotesk cut as a stencil: a bridge through every counter | `'CUTS'`: Hairline 0, Regular 400, Open 1000. **Standard 400** | Stacked poster words, a sheet's name, a big stop number |
| Its partner | **Blockplan Drop** | The same letters uncut, fat and rough at the edge as a drum leaves them, extruded into a drop shadow | `'DROP'`: Flat 0, Regular 400, Deep 1000. **Standard 400** | Only under Blockplan, as the second ink |

```css
.place       { font-family: 'Isohypse'; font-variation-settings: 'TOPO' 500; color: #0078bf;
               font-size: clamp(64px, 14vw, 220px); line-height: 1; mix-blend-mode: multiply; }
.stack       { position: relative; font-size: clamp(56px, 10vw, 150px); line-height: .95; }
.stack .top  { position: relative; font-family: 'Blockplan'; font-variation-settings: 'CUTS' 400; color: #f15060; }
.stack .drop { position: absolute; inset: 0; font-family: 'Blockplan Drop'; font-variation-settings: 'DROP' 400;
               color: #0078bf; transform: translate(.03em, .02em) rotate(-.3deg); mix-blend-mode: multiply; }
```
```html
<h2 class="stack"><span class="drop" aria-hidden="true">Riverside</span><span class="top">Riverside</span></h2>
```

- **Two faces at most.** A sheet takes one poster face from the menu: Isohypse, or Blockplan with
  its Drop (the pair is one face in two inks). With Instrument Serif italic for titles and IBM Plex
  Mono for notes, a page still sets at most two faces in any one place.
- **Overprint, like the press.** Set Isohypse in one spot ink straight over the map with
  `mix-blend-mode: multiply`. Set Blockplan Drop in the aria-hidden copy, same size and tracking
  (the advances match), in a second ink, a few hundredths of an em out of register with a fraction
  of a degree of turn. Never use opacity for overprint.
- **Titles only.** Never set running text, notes or map labels in these faces; those stay in the
  sans and the mono. Isohypse's rings need 64 px or more at 500 and 96 px or more past 800; the
  stencil needs 40 px or more.
- **The axes are the plate.** Keep one value per role. To animate one, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 500; }`, set
  `font-variation-settings: 'TOPO' var(--v)` (or `'CUTS'`) and animate `--v` on one element at
  most, never under `prefers-reduced-motion`.
- **No glow, no text-shadow.** The drop is the second face in a second ink, never a CSS shadow.

Sizes, full Latin (Western European), `woff2`: Isohypse 116 KB, Blockplan 22 KB, Blockplan Drop
117 KB (the rings and the rough edge cost the bytes). A page loads only the faces it uses
(`font-display: swap`).
