# hand-pulled

Seven graphic-design skills for Claude. Each builds its style from the process that
makes it, and not from a filter over a finished layout: letters drawn stroke by stroke,
files broken by a codec, maps pulled through ink drums, sheets exposed in the sun,
photographs shot through a soft lens, a lamp caught in liquid metal, colour seen through
fluted glass. Each skill ships an original engine with no
dependencies and a live reference page that Claude reads before it designs.

Site: <https://florispenninckx.github.io/hand-pulled/>

| Skill | Looks like | Reference page | Engine |
|---|---|---|---|
| [`maximalist-pop`](skills/maximalist-pop/SKILL.md) | an indie record cover: hand-drawn bubble and curl lettering, one-line writing, stamps, printed paper | [Sweet William](skills/maximalist-pop/reference.html) | `hand.js` |
| [`pixelsort-glitch`](skills/pixelsort-glitch/SKILL.md) | one picture after a machine got hold of it: saturated sort and slit-scan smears on dark, wave warps, sorted drips, a dropped screen, a grid collage, scanner drag, sliced type | [Stale Vector](skills/pixelsort-glitch/reference.html) | `pixelsort.js`, `glitch.js` |
| [`riso-cartography`](skills/riso-cartography/SKILL.md) | risograph-printed town plans and river maps in one to three spot inks: figure and ground, knockouts, overprint and misregistration | [Figure & Ground](skills/riso-cartography/reference.html) | `riso.js`, `cartography.js`, `atlas.js` |
| [`indigo-grain`](skills/indigo-grain/SKILL.md) | a blue board made of grain: cyanotype botanicals and sun-printed photographs, light forms out of navy-black, blurred butterflies, marbling, spray and halftone | [Indigo Grain](skills/indigo-grain/reference.html) | `cyanotype.js`, `botanica.js` |
| [`ethereal-haze`](skills/ethereal-haze/SKILL.md) | a small perfume house's campaign in warm, saturated colour: the inside of a flower held too close, grain-gradient fields, ribbons of colour on cream, silk, a meadow past a slow shutter | [Faye](skills/ethereal-haze/reference.html) | `haze.js` |
| [`chrome-aurora`](skills/chrome-aurora/SKILL.md) | liquid light on black: a pool of mercury between a warm and a cool lamp, oil film in its fold, dragged paint trails, glossy swirls, strip lights on wet glass, aurora out of focus | [Afterglass](skills/chrome-aurora/reference.html) | `mercury.js` |
| [`abstract-texture`](skills/abstract-texture/SKILL.md) | posters where the surface is the picture: soft colour behind reeded glass, satin and marbled swirls, aurora curtains in grain, dragged and torn rows, flowers smeared by a slow shutter | [Kiln Hours](skills/abstract-texture/reference.html) | `surface.js` |

Every artist, label, place and brand on the reference pages is invented.

## Install

In Claude Code, add this repository as a plugin marketplace and install the plugin:

```
/plugin marketplace add florispenninckx/hand-pulled
/plugin install hand-pulled@hand-pulled
```

To take one style only, copy its folder into your skills directory:

```bash
git clone https://github.com/florispenninckx/hand-pulled
cp -r hand-pulled/skills/riso-cartography ~/.claude/skills/
```

Then ask for the page in plain words, for example "the site for my ceramics studio,
printed like a two-colour riso poster". Claude picks the skill from its description,
reads the reference page, copies the engine into your project, and builds with it. Each
SKILL.md ends in a checklist that Claude runs against a real screenshot before it calls
the work done.

## How the engines work

- Each engine is one classic script that sets a global (`Hand`, `PixelSort`, `Glitch`,
  `Riso`, `Carto`, `Atlas`, `Cyanotype`, `Botanica`, `Haze`, `Mercury`, `Surface`). There
  is no build step, no npm package and no network call. The pages open straight from disk.
- `Mercury` (chrome aurora) shades its surfaces in WebGL with its own shaders, and falls
  back to a 2D canvas when WebGL is missing. Everything else is drawn on a 2D canvas. The
  only external resource is Google Fonts.
- Every engine is seeded, so the same seed gives the same plate. A plate can be named by
  its settings and pulled again.
- Each reference page takes your own photograph and puts it through the same process as
  the stand-in. Some plates also take text, or any file.

## Check

```bash
SHOT=../bigbrain/tools/shot.mjs tools/check.sh
```

This validates the plugin manifests and every SKILL.md frontmatter (the name matches the
folder, the description is at most 1024 characters), resolves the relative links on every
page, and loads each page headless at 1440 × 900 and 390 × 844. A page fails if it logs
a console error or scrolls sideways on a phone. `SHOT` points at a headless-Chrome
screenshot script.

## Credits

All engine code in this repository is original. Nothing was copied from the
repositories below. Each SKILL.md has its own "Credits and prior art" section; this is
the full account.

**Read for ideas, credited in a skill**

| Repository | Licence | Used for |
|---|---|---|
| [Robpayot/risograph-grain-shader](https://github.com/Robpayot/risograph-grain-shader) | MIT | the grain-screen idea behind `riso.js` |
| [jywarren/risoAtHome](https://github.com/jywarren/risoAtHome) | no licence file | the idea of per-ink separation. There is no licence, so nothing was copied |
| [Akascape/Pixelort](https://github.com/Akascape/Pixelort) | MIT | the interval-sorting model (after Kim Asendorf's ASDFPixelSort, also used by satyarth/pixelsort) |
| [Krzysztofz01/pixel-sorter](https://github.com/Krzysztofz01/pixel-sorter) | GPL-3.0 | ideas only. None of its code is used, so this repository stays MIT |
| [NovusGFX/retro-design-system](https://github.com/NovusGFX/retro-design-system) | MIT | the idea of a theme as a swappable world of tokens |
| [wilwaldon/Claude-Code-Frontend-Design-Toolkit](https://github.com/wilwaldon/Claude-Code-Frontend-Design-Toolkit) | no licence file | the case against default-looking AI frontends |
| [ruucm/shadergradient](https://github.com/ruucm/shadergradient) | no licence file | how far one shaded, grained surface can carry a page (ethereal haze, chrome aurora). No licence, so nothing was copied |
| [paper-design/liquid-logo](https://github.com/paper-design/liquid-logo) | PolyForm Shield 1.0.0 | reflection bands on a liquid surface and refracting each colour channel separately (chrome aurora). Ideas only |
| [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) | Zlib | grain and dithering practice; chromatic aberration as a per-channel offset, with grain as the last pass (chrome aurora) |
| [dashersw/liquid-glass-js](https://github.com/dashersw/liquid-glass-js) | MIT | a direction the haze style decided against, since its haze is optical, not glass; in chrome aurora, a lookup displaced by a height field's slope, for the glass plate |
| [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | MIT | rendering on demand, only when the inputs change (chrome aurora) |

The Riso ink colours follow the ink table published with p5.riso. The town plans follow
published methods: tensor-field streets (Chen et al., SIGGRAPH 2008) traced as evenly
spaced streamlines (Jobard and Lefer, 1997), and river migration after Howard and Knutson
(1984). The figure-ground manner goes back to Nolli's plan of Rome (1748), and the drawn
meander history to Fisk's Mississippi maps (1944). Marching squares, fractal noise, chamfer
distances, connected-component labelling and the cyanotype chemistry are textbook. Anna Atkins's *Photographs of British Algae* (1843) is the historical reference
for the sun print.
The slit-scan, the wave pushes, codec macroblocks, a flatbed scanner's split colour lines
and a cracked LCD in `glitch.js` are general practice.
The haze engine's disc defocus, Catmull-Rom ribbons and Blinn-Phong silk are textbook methods.
The indigo engines solve marbling backward after Lu, Jaffer, Jin, Zhao and Mao, "Mathematical
Marbling" (2012). They use Steven Worley's cellular noise for the marble lace and pool light,
Ken Perlin's improved noise, the voxel-landscape column scan for the lit relief, and the
printer's halftone screen.
The chrome engine weights its thin film by Wyman, Sloan and Shirley, "Simple Analytic
Approximations to the CIE XYZ Color Matching Functions" (JCGT, 2013). It and the texture
engine fold their liquids with Inigo Quilez's domain warping, noise warped by noise. The
texture engine's streaks are an exponential moving average along a row, its reeds are
cylinder lenses, and its halftone and dither are print practice.

**Looked at, not used.** These are 3D, fluid and light-scattering engines for WebGL,
WebGPU or C++. Only chrome aurora uses WebGL, with its own shaders and no library, so
none of them fed into the code:
[InteractiveComputerGraphics/SPlisHSPlasH](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH) (MIT),
[piellardj/water-webgpu](https://github.com/piellardj/water-webgpu) (MIT),
[jeantimex/precomputed_atmospheric_scattering](https://github.com/jeantimex/precomputed_atmospheric_scattering) (MIT),
[Ameobea/three-good-godrays](https://github.com/Ameobea/three-good-godrays) (custom),
[Erkaman/glsl-godrays](https://github.com/Erkaman/glsl-godrays) (custom),
[ektogamat/fake-glow-material-threejs](https://github.com/ektogamat/fake-glow-material-threejs) (MIT),
[PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT).

**Not found.** These were on the list but return 404 on GitHub at these addresses
(checked 28 September 2026): idevelop/cyanotype, mxgmn/Cyanotype, whatamesh/whatamesh,
kevinsqi/react-mesh-gradient, JimmyBeldone/react-native-grainy-gradient, l-ir/webgl-grain,
jordienr/mesh-gradient, lokesh-coder/react-animated-css-mesh-gradient.

**Visual reference.** Six styles are aimed at Floris Penninckx's own Pinterest boards,
one each: "Riso Cartography", "Pixel Glitch", "Ethereal Haze", "Indigo Grain", "Chrome
Aurora" and "Abstract texture". The first versions of the older styles, and
`maximalist-pop` still, followed the "10 niche design styles" board by A Song Studio.
All of them were used as reference only. None of their images, or any other third-party
image, are in this repository. The plates in `plates/` are
screenshots of this repository's own reference pages.

## Licence

MIT, see [LICENSE](LICENSE). The licence covers the engines, pages and briefs in this
repository. It does not cover the projects credited above, which keep their own licences.
