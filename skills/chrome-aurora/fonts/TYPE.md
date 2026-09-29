# Type (chrome-aurora)

This is the `## Type` section of `chrome-aurora/SKILL.md`, kept here beside the faces. When the faces change, change both.

---

## Type

Specula is the skill's own display face, and Pool, Fluted and Contrail are its alternates. All four
are variable fonts made by `tools/foundry.py` from OFL faces, under the SIL OFL 1.1, and loaded from
the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Standard | Use it for |
|---|---|---|---|---|
| **Specula** (main) | A wide techno face with an inline: a channel cut along every stroke that widens and slides toward the light | `'SHEN'`: Glint 0, Satin 300, Sheen 700, Polished 1000 (default 700) | `'SHEN' 700` | The page headline in the black beside the plate, an event or product name, a big date |
| **Pool** | A rounded techno face standing on liquid metal: under the baseline each letter has a banded mirror image that thins as it sinks and ripples sideways | `'RIPL'`: Still 0, Ripple 400, Wake 1000 (default 0) | `'RIPL' 400` | One line over a wet-glass or mercury plate: a venue, a release, a wordmark |
| **Fluted** | A fat round display face; the axis puts it behind fluted glass, each reed narrowing the letter to a bent bright bar | `'REED'`: Flat 0, Reeded 450, Deep 1000 (default 0) | `'REED' 0` | A heavy word or a big number set flat: a product name, a price, a date; reeds only for one word that sits behind glass |
| **Contrail** | A heavy italic dragged through the light: a crisp leading edge, and every row behind it pulled back into a streak | `'TRAL'`: Fixed 0, Moving 400, Streaked 1000 (default 0) | `'TRAL' 400` | A club night or track name next to a paint-trail plate; anything that should read as moving |

```css
.head { font-family: 'Specula'; color: #ebe7df;   /* default = standard, SHEN 700 */
        font-size: clamp(44px, 8vw, 120px); line-height: 1; letter-spacing: .02em; }
.name { font-family: 'Pool'; font-variation-settings: 'RIPL' 400; line-height: 1.45; }
.run  { font-family: 'Contrail'; font-variation-settings: 'TRAL' 400; padding-left: .32em; }
```

- **At most two faces on a page.** One display face, Specula *or* one alternate, for the headline;
  Martian Mono for everything small (corners, captions, controls). Never set running text, ledes or
  corner type in a display face.
- **It is not chrome.** Set every face flat in the off-white `#ebe7df` (or the one hot orange on
  hover). Never fill it with a gradient, `background-clip: text` or the plate itself; the sheen,
  the reflection and the trail are cut into the letters, and the ground shows through them. They
  never go on a poster: posters keep their 10 px mono in the corners.
- **The axis is the light.** Start from the standard and keep one value per role. Specula: 0 is a
  hairline glint, 700 the house look, 1000 a rim that needs 64 px or more. Pool's reflection hangs
  below the baseline, so give it `line-height: 1.45` and one line only. Fluted stays at 0 unless the
  word is meant to be behind glass. Contrail's trail runs back past the first letter, so indent it
  about `.32em`.
- **Motion.** With live mode, register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 700; }`, set
  `font-variation-settings: 'SHEN' var(--v)` (or the alternate's axis, from its standard) and let
  `--v` follow the plate's light. Animate one element at most, and never under
  `prefers-reduced-motion`.
- **Glow is never text-shadow.** Light belongs to the plate. No halo, blur or glow on any face.

Size, full Latin (Western European), `woff2`: Specula 66 KB, Pool 98 KB, Fluted 84 KB, Contrail 83 KB.
A page loads only the face it uses (`font-display: swap`). `fonts/specimen.html` shows all four
live.
