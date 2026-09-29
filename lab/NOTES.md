# Fonts wave 3 A: notes

Lane `fonts/wave3-a` makes new display-face candidates for indigo-grain, riso-cartography and
abstract-texture, for Floris to judge in `lab/index.html`. Nothing here is wired into a skill.

## The bar: what the BOC faces do right

1. One strong idea per face, named by the process: Soak bleeds, Globule melts, Flatbed flattens,
   Gouge carves. You can say what happened to the letter in one word.
2. A characterful heavy base with room for the effect (Archivo Black, Michroma, Lexend Zetta,
   Chango). The process needs mass to act on, and the base already has a voice before it starts.
3. The process is visible at display size and still reads at every axis value. The word survives
   even at 1000.
4. The axis runs from a clean letter to the full effect, so one face covers a quiet heading and a
   loud poster word.
5. The attitude matches the board: blobby, liquid, glowing. These are materials, not decorations.
   The current indigo, riso and abstract faces miss this. They are either too polite (a filter on
   a grotesk) or too busy to read.

## What the boards letter with

- **Indigo Grain.** Display type is rare. It is either tiny spaced sans over a big field (29, 36,
  50) or one huge word taken over by the medium: pin 31 is a marbled, melting "ВЕРА". The materials
  that suit letters are marbling (1, 41, 51), spray and stipple (32, 44), dry-brushed emulsion
  (22, 38) and pool light (50).
  Candidates: **Marbler**, **Spatter**, **Drybrush**, **Caustic**.
- **Riso Cartography.** Spaced caps in a cartouche (1), one huge lowercase grotesk over the map
  (18) and a label italic (23). The map itself is the material: figure-ground street blocks
  (10, 24), contour lines (3, 20, 22), ruled tints (24) and meandering rivers (6, 20).
  Candidates: **Nolli**, **Isohypse**, **Hatchwork**, **Oxbow**.
- **Abstract texture.** Small mono caps (22, 25), a wide light serif (29) and one heavy condensed
  word (30, CANYON). The materials are reeded glass (0, 15), satin folds (5, 7, 8), bloom and
  halation (12, 21) and grain screens.
  Candidates: **Fluted**, **Sateen**, **Halide**, **Pointille**.

## How they are made

`tools/foundry.py` builds from OFL bases (Google Fonts, SIL OFL 1.1) with one recipe per face in
`tools/recipes/`. Each recipe carries `"candidate": true`, so the face lands in
`skills/<style>/fonts/candidates/` with its own `OFL.txt` and `candidates.css`, and never in the
skill's `fonts.css` or its specimen. New processes in the foundry:

- `flow`: a curl-noise swirl or a fold, applied to the outline as a smooth map. Used by Marbler and
  Sateen.
- `reed`: vertical flutes, each shifting its strip. Used by Fluted.
- `dots` with mode `screen` (a halftone lattice, Pointille) or `spray` (grains thrown off the edge,
  Spatter).
- The ops `bloom`, `streets`, `contours`, `hatch` and `caustic`, plus `stretch` on noise, `vary` on
  skeleton and `dir` on drip.
