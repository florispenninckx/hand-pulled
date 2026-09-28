# Type (replaces the Type section in indigo-grain/SKILL.md)

This section is for the hub to wire in. Lane G7 re-drew Sunprint's exposure range, added Seep, and
did not edit SKILL.md or reference.html. Replace the current "## Type" section with the one below.
`fonts/specimen.html` shows all three faces live.

---

## Type

Display type uses the skill's own faces in `fonts/`. They are made by `tools/foundry.py` from OFL
fonts, under the SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| Face | Look | Axis (0–1000) | Use it for |
|---|---|---|---|
| **Sunprint** | Letters laid on cyanotype paper and exposed; the strokes swell and pool as the light creeps under, until at 1000 the print is blown out and the counters drown | `'EXPO'`: Contact 0, Regular 300, Long 650, Blown 1000 (default 300) | Titles, section heads, one big word over a field |
| **Sunprint Halo** | The halation alone: a soft swollen ghost with a grainy edge | static | Behind Sunprint at the same size and tracking (the advances match), in a paler ink of the ramp |
| **Seep** | The wide, soft, melting title cut: an extended geometric softened like a wet print, its ink running down out of every bottom edge | `'MELT'`: Wet 0, Regular 400, Run 1000 (default 400) | A wide-tracked poster title, a cover's one word, a night or series name |

```css
.title      { position: relative; font-family: 'Sunprint'; font-variation-settings: 'EXPO' 300; }
.title::before { content: attr(data-text); position: absolute; inset: 0; font-family: 'Sunprint Halo';
                 color: var(--pale); opacity: .55; z-index: -1; }
.cover      { font-family: 'Seep'; font-variation-settings: 'MELT' 400; letter-spacing: .06em;
              font-size: clamp(48px, 9cqw, 140px); line-height: 1.2; }
```

- **Two faces at most.** Use Sunprint (with its Halo, which counts as part of it) or Seep for a
  page's titles, never both on one sheet, beside the page's sans or mono. Facts, captions, lists
  and running text stay in the sans or mono.
- **The axis is the process.** Keep one value per role. EXPO 650–1000 is for one blown-out word,
  60 px and up; its counters close by design. MELT runs downward, so give Seep line height of 1.2
  or more and nothing tight beneath it.
- **Motion.** With live mode, tie the axis to the section's develop progress: register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 300; }`, set
  `font-variation-settings: 'EXPO' var(--v)` (or `'MELT'`) and animate `--v`. Animate one element
  at most, and never under `prefers-reduced-motion`.
- **Glow is never text-shadow.** The halo is the Halo face or the engine's own light.

Sizes, full Latin (Western European), `woff2`: Sunprint 83 KB, Sunprint Halo 49 KB, Seep 51 KB.
A page loads only the faces it uses (`font-display: swap`).
