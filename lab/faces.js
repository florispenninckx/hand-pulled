/* faces.js: every face in the fonts wave 3 A lab, current and candidate, per style.
 * kb is the full-Latin woff2 size. start is where the axis slider begins (the face's Regular).
 * A current face may carry `under`: its companion face set beneath it (Sunprint's Halo, Blockplan's Drop). */
window.LAB_FACES = {
  'indigo-grain': {
    current: [
      { name: 'Sunprint', family: 'Sunprint', tag: 'EXPO', start: 300, base: 'Unbounded', kb: '83 + Halo 49',
        idea: 'Letters exposed on cyanotype paper; the strokes swell and pool as the light creeps under. Set with Sunprint Halo beneath.',
        under: { family: 'Sunprint Halo', fvs: 'normal', mode: 'halo' } },
      { name: 'Seep', family: 'Seep', tag: 'MELT', start: 400, base: 'Krona One', kb: '51',
        idea: 'A wide geometric softened like a wet print, its ink running down out of every bottom edge.' },
    ],
    candidates: [
      { name: 'Marbler', family: 'Marbler', tag: 'SWRL', start: 400, base: 'Syne ExtraBold', kb: '57',
        idea: 'A marbling bath: the letter floated on size and stirred by a curl of the water, its strokes drifting and bending like combed ink.' },
      { name: 'Spatter', family: 'Spatter', tag: 'SPRY', start: 500, base: 'Bowlby One', kb: '89',
        idea: 'An ink spray: the edge eaten by the spray and thrown off as grains, from a clean print to a letter in a cloud of dots.' },
      { name: 'Drybrush', family: 'Drybrush', tag: 'BRSH', start: 500, base: 'Playfair Display Black', kb: '80',
        idea: 'Emulsion coated on with a dry brush: a black Didone whose edges break into hairs dragged off to the right.' },
      { name: 'Caustic', family: 'Caustic', tag: 'WAVE', start: 500, base: 'Dela Gothic One', kb: '114',
        idea: 'Pool light: the web of bright lines a rippled surface throws, cut through a fat letter, from fine threads to soft cells.' },
    ],
  },
  'riso-cartography': {
    current: [
      { name: 'Blockplan', family: 'Blockplan', tag: 'CUTS', start: 400, base: 'Anton', kb: '22 + Drop 117',
        idea: 'A condensed poster grotesk cut as a stencil, set over Blockplan Drop in a second ink, out of register.',
        under: { family: 'Blockplan Drop', fvs: "'DROP' 400", mode: 'drop' } },
    ],
    candidates: [
      { name: 'Nolli', family: 'Nolli', tag: 'STRT', start: 500, base: 'Inter Tight Black', kb: '113',
        idea: 'A figure-ground plan: the letter is the city, cut into blocks by a warped street grid and one avenue; the streets widen as STRT rises.' },
      { name: 'Isohypse', family: 'Isohypse', tag: 'TOPO', start: 500, base: 'Rubik Black', kb: '116',
        idea: 'A contour map: the letter drawn as rings of equal distance from its edge, from heavy bands to fine survey lines.' },
      { name: 'Hatchwork', family: 'Hatchwork', tag: 'TINT', start: 500, base: 'Big Shoulders Display Black', kb: '113',
        idea: 'A ruled map tint: the letter kept as a rim and filled with 45° hatching, from near-solid to a light tint.' },
      { name: 'Oxbow', family: 'Oxbow', tag: 'FLOD', start: 400, base: 'Pacifico', kb: '62',
        idea: 'A river course: a brush script reduced to its centreline and re-inked as a river whose banks swell and narrow as it floods.' },
    ],
  },
  'abstract-texture': {
    current: [
      { name: 'Tideline', family: 'Tideline', tag: 'ECHO', start: 500, base: 'Bricolage Grotesque', kb: '97',
        idea: 'A heavy grotesk trailed by outline copies of itself, like a shape dragged through a slow shutter.' },
    ],
    candidates: [
      { name: 'Fluted', family: 'Fluted', tag: 'REED', start: 500, base: 'Oswald Bold', kb: '45',
        idea: 'Reeded glass: the letter seen through vertical flutes, each shifting its strip, from clear glass to deep reeds.' },
      { name: 'Sateen', family: 'Sateen', tag: 'FOLD', start: 500, base: 'Fredoka Bold (wide)', kb: '34',
        idea: 'Satin: a soft rounded letter folded by two slow shears, like cloth pulled across a table.' },
      { name: 'Halide', family: 'Halide', tag: 'GLOW', start: 400, base: 'Bodoni Moda Bold', kb: '81',
        idea: 'Halation: the heavy strokes and joins of a Didone swell into soft pools of glow while the hairlines stay put.' },
      { name: 'Pointille', family: 'Pointille', tag: 'DOTS', start: 500, base: 'Outfit Black', kb: '70',
        idea: 'A halftone screen: the letter printed as dots on a 45° lattice, a solid core opening into a dotted glow.' },
    ],
  },
};
