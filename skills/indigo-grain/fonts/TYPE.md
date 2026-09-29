# Type (the "## Type" section of indigo-grain/SKILL.md)

The same menu as the skill's Type section, kept beside the fonts. `specimen.html` shows every
face live, each dial starting at its standard setting.

---

## Type

Display type uses the skill's own faces in `fonts/`, a menu of three. They are variable fonts made
by `tools/foundry.py` from OFL fonts, under the SIL OFL 1.1, and loaded from the skill itself:

```html
<link rel="stylesheet" href="fonts/fonts.css">
```

| | Face | Look | Axis (0–1000) and standard setting | Use it for |
|---|---|---|---|---|
| Main | **Marbler** | A wide grotesk floated on size and stirred: its strokes drift, bend and curl like combed ink in a marbling bath | `'SWRL'`: Floated 0, Regular 400, Marbled 1000. **Standard 640** | Titles, a cover's one word, one big word over a field or a marbled sheet |
| Alternate | **Sunprint** (+ **Sunprint Halo**) | Letters exposed on cyanotype paper; the strokes swell and pool as the light creeps under. The Halo is the halation alone, static, set behind it | `'EXPO'`: Contact 0, Regular 300, Long 650, Blown 1000. **Standard 300** | Section heads and titles on a print or photogram page, one blown-out word |
| Alternate | **Seep** | An extended geometric softened like a wet print, its ink running down out of every bottom edge | `'MELT'`: Wet 0, Regular 400, Run 1000. **Standard 400** | A wide-tracked poster title, a night or series name |

```css
.title { font-family: 'Marbler'; font-variation-settings: 'SWRL' 640; line-height: 1.15;
         font-size: clamp(56px, 11vw, 180px); }
.print { position: relative; font-family: 'Sunprint'; font-variation-settings: 'EXPO' 300; }
.print::before { content: attr(data-text); position: absolute; inset: 0; font-family: 'Sunprint Halo';
                 color: var(--pale); opacity: .55; z-index: -1; }
.cover { font-family: 'Seep'; font-variation-settings: 'MELT' 400; letter-spacing: .06em; line-height: 1.2; }
```

- **Two faces at most.** A page takes one display face from the menu for its titles (Sunprint with
  its Halo counts as one), beside the page's sans or mono. Never two of the three on one sheet.
  Facts, captions, lists and running text stay in the sans or mono.
- **Set the standard, then move it on purpose.** Marbler's font default is 400, so always set
  `'SWRL' 640`; it drifts more at 1000, for one word at 80 px and up. EXPO 650–1000 closes
  Sunprint's counters by design, for one word at 60 px and up. MELT runs downward, so give Seep a
  line height of 1.2 or more and nothing tight beneath it. Keep one value per role.
- **Motion.** With live mode, tie the axis to the section's develop progress: register
  `@property --v { syntax: '<number>'; inherits: true; initial-value: 640; }`, set
  `font-variation-settings: 'SWRL' var(--v)` (or `'EXPO'`, `'MELT'`) and animate `--v`. Animate one
  element at most, and never under `prefers-reduced-motion`.
- **Glow is never text-shadow.** The halo is the Halo face or the engine's own light.

Sizes, full Latin (Western European), `woff2`: Marbler 57 KB, Sunprint 83 KB, Sunprint Halo 49 KB,
Seep 51 KB. A page loads only the faces it uses (`font-display: swap`).
