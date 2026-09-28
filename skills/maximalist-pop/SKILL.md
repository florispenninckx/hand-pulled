---
name: maximalist-pop
description: Design pages lettered by hand in the whimsical maximalist style of indie-pop and folk-pop album art — monoline letters with curled or ink-ball terminals, fat wobbly bubble letters with spirals and button o's, one continuous looping line written over a grainy black-and-white photo, doodled stamps, stars and dots, all on flat printed paper grounds (olive and cream, moss and white, khaki and pale blue, powder blue and olive, black and white). Use it for artist, album and single pages, tour dates, merch and print shops, zines, posters, festival and café sites. Also use it when the user asks for hand-drawn or hand-lettered type, whimsical, cottagecore, folk, dreamy or bedroom-pop lettering, a "maximalist" pop-star look (Billie Eilish, Charli xcx, Clairo-era rollouts), or type that should look drawn by a person instead of set in a font.
---

# Maximalist pop: hand-drawn lettering

This is the look of an indie record rolled out on printed paper. The title is written by a
person with a fine pen, and every free end curls. The shop prints carry letters with ink
balls on the stroke ends. The tour poster is fat white bubble writing on black, with postage
stamps stuck around it. The single is one continuous line looping across a grainy photo of
a wood. The maximalism is in the hand, not in the number of colours. Each surface is one
paper and one ink, and the lettering does all the talking.

The files next to this SKILL.md:

- `assets/hand.js`: `window.Hand`, a hand-drawn alphabet with its own point-by-point strokes (a–z, A–Z, 0–9, punctuation). It is finished four ways, seeded, and has no dependencies. It also provides doodles, perforated stamps, printed-paper grounds and a black-and-white photo treatment.
- `reference.html`: a fictional record, "Sweet William" by Ottilie Fern on Hedgerow Records. It has a lettered cover, a tracklist in pencil around the one-line title over a photo, a print shop, a tour poster with stamps and a "write your own" bench. **Read it before designing.**

## The four hands

| Style | Look | Use it for | `Hand.write(text, { style })` |
|---|---|---|---|
| `curl` | fine line; free ends curl in on themselves; bouncy baseline | covers, titles, one-line credits | `'curl'` |
| `ball` | line with round ink balls on the ends, some curled first | print shop, section heads, posters | `'ball'` |
| `chunky` | fat, wobbly white bubble strokes; tails spiral; some o's become buttons | tour posters, loud headers on black | `'chunky'` |
| `wire` | the whole word written without lifting the pen, big swash in and out | a single title over a photograph | `'wire'` |

Small text such as tracklists and notes is the same hand, written small: `style: 'curl'`, `sw: 0.6`, `curlP: 0.3`, `size: 14`, left-aligned, in a dark "pencil" colour. Don't use a handwriting font for it. A second hand gives the fake away.

## What makes it authentic

1. **One alphabet, one person.** Every word on the page, from the cover to the tracklist, is written by the same `hand.js` alphabet in different finishes. Fonts are only for typed facts: a typewriter (Courier Prime) for captions and prices, and a small italic serif (EB Garamond) for a name under a photo. Never use a script or handwriting font for the lettering.
2. **Paper and one ink.** Each surface is a flat printed ground from `Hand.paper`: a fine screen, streaky uneven coverage and specks, with one ink colour on top. Pairings from the reference:

   | Ground | Ink | Pin feel |
   |---|---|---|
   | olive `#8e8c2d` | cream `#f2efb6` | "earth mother" cover |
   | moss `#8c9a3b` | white `#f5f3e6` (+ pencil `#2f3016`) | one-line title over a photo |
   | black `#0b0b0b` | white `#f4f1e8` | chunky tour poster |
   | khaki `#8a7b1e` | pale blue `#b9cde2` | small ink-ball print |
   | powder blue `#b4c4d8` | olive `#857a1c`, with a cream border | stacked ink-ball print |

3. **It moves like a pen.** Letters bounce off the baseline, lean a few degrees and vary in size, and the seed decides how. `Hand.draw` animates the pen stroke by stroke when the lettering scrolls into view. It is off under `prefers-reduced-motion`.
4. **Terminals carry the style.** Curls, ink balls and spirals are where the charm lives, and they obey rules: a fat spiral inside the x-height reads as an extra letter, so chunky spirals only go on descender tails, and word ends curl only from the top.
5. **Doodles are drawn, not emoji.** They are perforated stamps with a motif (flower, mushroom, strawberry, leaf), five-point stars, four-point sparkles, small crosses and white dots. Put them on the edges around a title, a few at a time, at small tilts.
6. **Photographs are grainy black-and-white.** Pass any image through `Hand.mono` for lifted blacks, soft highlights and film grain. Let the lettering run past the photo's edges.

## Build it

```html
<script src="hand.js"></script>
<script>
  Hand.defs();                                                        // #hd-ink, #hd-blob, #hd-worn
  Hand.paper(document.querySelector('.cover'), { ground: '#8e8c2d', screen: .5, mottle: .8 });
  const svg = Hand.letter(document.querySelector('h1'), { style: 'curl', seed: 4, text: 'Sweet\nWilliam' });
  Hand.draw(svg, { duration: 3600 });                                 // pen draws it on
  document.querySelector('.stamp').append(Hand.doodle('stamp', { motif: 'flower', label: 'HR 02' }));
  Hand.scatter(section, ['dot'], { count: 9, seed: 4, avoid: [{ x: .22, y: .2, w: .56, h: .62 }] });
  canvas.getContext('2d').drawImage(Hand.mono(img, { w: 1200, h: 800, grain: .55 }), 0, 0);
</script>
<style>
  h1 { color: #f2efb6; }             /* lettering is currentColor */
  h1 svg { width: min(64vw, 780px); } /* size with CSS; stroke scales with it */
  .tour { --hd-hole: #0b0b0b; }      /* the holes in chunky button o's */
</style>
```

- `write(text, opts)` returns an SVG, and `letter(el, opts)` replaces an element's text with one while keeping the text for screen readers. Options: `style`, `seed`, `size` (px per x-height ×10), `align` (`center|left|right`), `leading`, and any style value (`sw`, `bounce`, `tilt`, `wobble`, `track`, `curlP`, `curlR`, `ballR`, `spiralR`, `button`, `swash`, `loops`, `space`). Use `\n` for line breaks.
- `draw(svg, { duration, delay })` returns a promise.
- `doodle(kind, { size, seed, sw, motif, label })`: `x star sparkle dot spiral flower heart moon mushroom strawberry crown leaf sun button stamp`.
- `scatter(el, kinds, { count, seed, avoid, size: [min, max], rotate })` places doodles inside a positioned element; `avoid` rectangles are fractions of the element.
- `paper(el, { ground, screen, mottle, grain, speck, seed })` sets a tiling printed-paper background.
- `mono(imageOrCanvas, { w, h, contrast, lift, grain, soften, seed })` returns a b/w canvas.
- To export lettering, clone the SVG, set `color`, add a background rect, and copy the filter from `#hd-defs` into its `<defs>` (the reference's "save svg" does this).

## Composition

- Treat each section as a poster: one ground, one lettered title centred with generous space, and small typed facts at the edges (an imprint line top centre, a catalogue number in a corner, a stamp logo in the other).
- On a cover, a small line of the same hand sits above the title and another sits below it.
- For a tracklist around a photo, put side one in pencil above the photo and side two below it, each line indented differently, as if written in the margin. The one-line title crosses the photo, and a few white dots float around it.
- A print shop shows flat sheets at 3:4 with no shadow, no rounded corners and no hover lift. Put a typewriter caption underneath: the title in bold, then the size, inks, edition and price.
- A tour poster is chunky white on black, with stamps and stars around the edges and dates in typewriter plus italic serif below it.
- Controls look like typed paper tags, and a checked tag is inked in.
- Use fictional artists, labels and venues, or the user's own. Never use a real artist's name, likeness, logo or album art.

## Tells that it was generated — avoid all of them

- A handwriting or script font (Caveat, Pacifico, Dancing Script, Great Vibes) standing in for lettering.
- Several colours per surface, gradients, glassmorphism, glowing buttons, or rounded cards with shadows.
- Perfectly repeated letters. If two e's in a word are identical, it is a font.
- Emoji or icon-font "doodles", clip-art flowers, or sparkles as stock icons.
- Spirals and curls on every end at once. The charm comes from the ones that are left plain.
- A stock photo in colour, or an AI portrait. Use the user's photo through `Hand.mono`, or a procedural one.
- Lettering squeezed into a narrow column, or text-on-path gimmicks.

## Verify before calling it done

Take screenshots in a headless browser at 1440×900 and 390×844, once with reduced motion and once after the draw-on finishes.

- [ ] Every lettered word is `hand.js` output, and the typed text is only facts.
- [ ] Each surface has one ground and one ink, with paper texture visible up close.
- [ ] Letters bounce and lean, and the same seed gives the same drawing.
- [ ] Chunky spirals do not read as extra letters, and curls do not collide with neighbours.
- [ ] Lettering has a screen-reader text (`letter()` does this) and the page makes sense without animation.
- [ ] There is no horizontal scroll on a phone, and doodles stay inside their section.
- [ ] There are no console errors.

## Credits and prior art

This is an original implementation. The alphabet, curls, bubble strokes, one-line writing,
stamps and paper were drawn and written point by point for `hand.js`; no font or vector
source was traced. General inspiration: hand-lettered indie and folk album covers, risograph
merch prints and the "10 niche design styles" board by A Song Studio (reference only; no
images are used). Toolkits reviewed while building this set: NovusGFX/retro-design-system
(MIT) for the idea of themes as swappable token worlds, and
wilwaldon/Claude-Code-Frontend-Design-Toolkit for the case against default-looking AI
frontends.
