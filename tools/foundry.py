#!/usr/bin/env python3
"""foundry: process-made display fonts for the hand-pulled skills.

A face is a recipe, one JSON file in tools/recipes/: an OFL base font pinned to a commit of
google/fonts, a list of image operations, and the positions of a custom axis. For every glyph
the tool

  1. rasterises the base outline at each axis position (after an optional warp),
  2. runs the operations on the raster (blur, level, offset, noise, skeleton, carve, ...),
  3. traces ONE position back to outlines, resamples it densely, and projects those samples
     along their normals onto the raster of every other position, so all masters share one
     point structure,
  4. fits quadratic curves to the samples jointly (the same anchors in every master), and
  5. measures how far each fitted master sits from its own raster.

The masters are built into a variable font with fontTools.varLib (one custom axis, 0 → the
lightest process, 1000 → the full process) and written as .woff2 next to OFL.txt and a fonts.css
in skills/<skill>/fonts/. A recipe with "variable": false, or a build that fails the fit check,
gets one static file per position instead.

  .venv/bin/python tools/foundry.py list
  .venv/bin/python tools/foundry.py build soak globule          # or: build all
  .venv/bin/python tools/foundry.py build soak --chars "Hamburg" --proof
  .venv/bin/python tools/foundry.py proof soak                    # PNG of the last build
  .venv/bin/python tools/foundry.py specimen pixelsort-glitch     # a generated specimen.html

Adding a face: copy a recipe in tools/recipes/ and change it.
  name, file, skill, about  the family name, the .woff2 stem, the skill folder, the fonts.css note
  base                      an OFL font in google/fonts: commit, path, sha256 (plus "location"
                            {"wght": 820} to pin a variable base to one instance)
  axis                      tag (4 capitals), name, default, masters (must include the default),
                            instances {name: position}
  warp, track               sx / sy / slant and extra advance in units, per position
  ops                       the process, in order; any number may be {"position": value}, and
                            values between positions are interpolated. The ops are the op_*
                            functions below.
  glyphs                    per-glyph overrides of op params: {"s": {"0": {"drop": 1}}}
  trace, fit, max_error     the master that is traced, the curve fit, and the fit check
  glyph_limit               a glyph worse than this (units) is frozen at the traced master
  swap                      [[hex, hex]] code points whose glyphs the base draws swapped
  variable                  false for a static face (one master)
Build it with --chars and --proof until the proof reads, then build it in full and read the
mean and max error it prints.

Needs fontTools, brotli, numpy, scipy, scikit-image and Pillow. Base fonts are downloaded once
into $FOUNDRY_CACHE (default ~/.cache/hand-pulled-foundry) and checked against their sha256.
"""

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.request
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure, morphology

from fontTools import varLib
from fontTools.designspaceLib import AxisDescriptor, DesignSpaceDocument, InstanceDescriptor, SourceDescriptor
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.basePen import BasePen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / 'tools' / 'recipes'
CACHE = Path(os.environ.get('FOUNDRY_CACHE', Path.home() / '.cache' / 'hand-pulled-foundry'))
UPM = 1000

# Latin: ASCII, the Latin-1 letters, and the punctuation the pages use.
CHARSETS = {
    'latin': (''.join(chr(c) for c in range(0x20, 0x7F))
              + ''.join(chr(c) for c in range(0xC0, 0x100) if c not in (0xD7, 0xF7))
              + ' ¡«»¿·°×£€–—‘’‚“”„…•→'),
}


# ---------------------------------------------------------------------------------------------
# recipes

def load_recipe(name):
    path = RECIPES / f'{name}.json'
    if not path.exists():
        sys.exit(f'no recipe {path}')
    r = json.loads(path.read_text())
    r['id'] = name
    return r


def all_recipes():
    return sorted(p.stem for p in RECIPES.glob('*.json'))


def at(value, pos):
    """A recipe value is a number or {"axis position": number}; the dict is interpolated."""
    if not isinstance(value, dict):
        return value
    pts = sorted((float(k), v) for k, v in value.items())
    if pos <= pts[0][0]:
        return pts[0][1]
    for (a, va), (b, vb) in zip(pts, pts[1:]):
        if pos <= b:
            if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
                return va + (vb - va) * (pos - a) / (b - a)
            return va if pos - a < b - pos else vb
    return pts[-1][1]


def fetch(url, dest, sha=None):
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f'  fetching {url}')
        with urllib.request.urlopen(url) as r:
            dest.write_bytes(r.read())
    if sha:
        got = hashlib.sha256(dest.read_bytes()).hexdigest()
        if got != sha:
            sys.exit(f'{dest}: sha256 {got} does not match the recipe ({sha})')
    return dest


def base_paths(recipe):
    b = recipe['base']
    raw = f"https://raw.githubusercontent.com/{b['repo']}/{b['commit']}/"
    folder = CACHE / b['commit'][:12] / os.path.dirname(b['path'])
    ttf = fetch(raw + b['path'].replace('[', '%5B').replace(']', '%5D'),
                folder / os.path.basename(b['path']), b.get('sha256'))
    ofl = fetch(raw + os.path.dirname(b['path']) + '/OFL.txt', folder / 'OFL.txt')
    return ttf, ofl


# ---------------------------------------------------------------------------------------------
# the base font: instanced, normalised to 1000 units, glyphs as flattened polygons

class PolyPen(BasePen):
    def __init__(self, glyphset, scale):
        super().__init__(glyphset)
        self.s, self.polys, self.cur = scale, [], None

    def _pt(self, p):
        return (p[0] * self.s, p[1] * self.s)

    def _moveTo(self, p):
        self.cur = [self._pt(p)]

    def _lineTo(self, p):
        self.cur.append(self._pt(p))

    def _curveToOne(self, p1, p2, p3):
        p0 = np.array(self.cur[-1]); p1, p2, p3 = (np.array(self._pt(p)) for p in (p1, p2, p3))
        for t in np.linspace(0, 1, 17)[1:]:
            u = 1 - t
            self.cur.append(tuple(u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3))

    def _qCurveToOne(self, p1, p2):
        p0 = np.array(self.cur[-1]); p1, p2 = np.array(self._pt(p1)), np.array(self._pt(p2))
        for t in np.linspace(0, 1, 13)[1:]:
            u = 1 - t
            self.cur.append(tuple(u * u * p0 + 2 * u * t * p1 + t * t * p2))

    def _closePath(self):
        if self.cur and len(self.cur) > 2:
            self.polys.append(np.array(self.cur, float))
        self.cur = None

    _endPath = _closePath


_BASE = {}


def open_base(recipe):
    """(TTFont static instance, scale to 1000 units); cached per process."""
    key = recipe['id']
    if key not in _BASE:
        ttf, _ = base_paths(recipe)
        font = TTFont(ttf)
        loc = recipe['base'].get('location')
        if 'fvar' in font:
            axes = {a.axisTag: a.defaultValue for a in font['fvar'].axes}
            axes.update(loc or {})
            font = instancer.instantiateVariableFont(font, axes)
        _BASE[key] = (font, UPM / font['head'].unitsPerEm)
    return _BASE[key]


def glyph_polys(font, scale, gname):
    pen = PolyPen(font.getGlyphSet(), scale)
    font.getGlyphSet()[gname].draw(pen)
    return pen.polys


# ---------------------------------------------------------------------------------------------
# raster: font units <-> pixels. col = (x - x0) / px, row = (y0 - y) / px

class Grid:
    def __init__(self, x0, y0, w, h, px):
        self.x0, self.y0, self.w, self.h, self.px = x0, y0, w, h, px

    def to_px(self, P):
        return np.stack([(self.y0 - P[:, 1]) / self.px, (P[:, 0] - self.x0) / self.px], 1)   # (row, col)

    def to_units(self, RC):
        return np.stack([self.x0 + RC[:, 1] * self.px, self.y0 - RC[:, 0] * self.px], 1)

    def sample(self, f, P):
        rc = self.to_px(P)
        return ndimage.map_coordinates(f, [rc[:, 0] - 0.5, rc[:, 1] - 0.5], order=1, mode='constant', cval=0.0)


def raster(polys, g, ss=4):
    """Anti-aliased non-zero fill of polygons (font units) on the grid, as coverage 0..1."""
    W, H = g.w * ss, g.h * ss
    if not polys:
        return np.zeros((g.h, g.w))
    edges = []
    for P in polys:
        c = (P[:, 0] - g.x0) / g.px * ss
        r = (g.y0 - P[:, 1]) / g.px * ss
        edges.append(np.stack([c, r, np.roll(c, -1), np.roll(r, -1)], 1))
    E = np.concatenate(edges)
    E = E[E[:, 1] != E[:, 3]]
    x0, y0, x1, y1 = E.T
    d = np.where(y1 > y0, 1, -1).astype(np.int16)
    lo, hi = np.minimum(y0, y1), np.maximum(y0, y1)
    r0 = np.clip(np.ceil(lo - 0.5), 0, H).astype(int)
    r1 = np.clip(np.ceil(hi - 0.5), 0, H).astype(int)
    n = r1 - r0
    keep = n > 0
    x0, y0, x1, y1, d, r0, n = x0[keep], y0[keep], x1[keep], y1[keep], d[keep], r0[keep], n[keep]
    rep = np.repeat(np.arange(len(n)), n)
    rows = r0[rep] + (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n))
    yc = rows + 0.5
    xc = x0[rep] + (yc - y0[rep]) * (x1[rep] - x0[rep]) / (y1[rep] - y0[rep])
    idx = np.clip(np.ceil(xc - 0.5), 0, W).astype(int)
    D = np.zeros((H, W + 1), np.int16)
    np.add.at(D, (rows, idx), d[rep])
    mask = np.cumsum(D[:, :W], axis=1) != 0
    return mask.reshape(g.h, ss, g.w, ss).mean(axis=(1, 3))


def sdf(f):
    """Signed distance in pixels, positive inside the ink (f > 0.5)."""
    inside = f > 0.5
    if not inside.any():
        return -np.full(f.shape, 1e3)
    return np.where(inside, ndimage.distance_transform_edt(inside) - 0.5,
                    -(ndimage.distance_transform_edt(~inside) - 0.5))


def soft(dist):
    return np.clip(dist + 0.5, 0.0, 1.0)


def value_noise(shape, cell, seed, octaves=1):
    """Smooth noise in -1..1 with features `cell` pixels apart."""
    rng = np.random.default_rng(seed)
    out, amp, tot = np.zeros(shape), 1.0, 0.0
    for _ in range(octaves):
        c = max(cell, 1.0)
        lat = rng.uniform(-1, 1, (int(shape[0] / c) + 4, int(shape[1] / c) + 4))
        big = ndimage.zoom(lat, c, order=3, mode='nearest')
        out += amp * big[:shape[0], :shape[1]]
        tot += amp; amp *= 0.5; cell /= 2
    return out / tot


# ---------------------------------------------------------------------------------------------
# operations. Each takes the field (0..1, ink > 0.5) and returns a new one. Lengths are in font
# units and every value may vary along the axis (see at()).

def op_blur(f, o, pos, g, seed):
    s = at(o['r'], pos) / g.px
    return ndimage.gaussian_filter(f, s) if s > 0 else f


def op_level(f, o, pos, g, seed):
    """Threshold at `at`, kept soft over `soft` so later blurs still see a slope."""
    a, s = at(o['at'], pos), at(o.get('soft', 0.04), pos)
    return np.clip((f - a) / (2 * s) + 0.5, 0, 1)


def op_offset(f, o, pos, g, seed):
    return soft(sdf(f) + at(o['d'], pos) / g.px)


def op_round(f, o, pos, g, seed):
    """Round convex corners (open), concave corners (close) or both, with radius r."""
    r = at(o['r'], pos) / g.px
    mode = o.get('mode', 'both')
    if r <= 0:
        return f
    if mode in ('both', 'convex'):
        f = soft(sdf(soft(sdf(f) - r)) + r)
    if mode in ('both', 'concave'):
        f = soft(sdf(soft(sdf(f) + r)) - r)
    return f


def op_noise(f, o, pos, g, seed):
    """Add smooth noise (amp in field units, cell in font units); `band` limits it to the edge."""
    amp = at(o['amp'], pos)
    if amp == 0:
        return f
    n = value_noise(f.shape, at(o['cell'], pos) / g.px, seed + o.get('seed', 0), o.get('octaves', 2))
    if 'band' in o:
        n *= np.exp(-(sdf(f) * g.px / at(o['band'], pos)) ** 2)
    return f + amp * n


def op_grain(f, o, pos, g, seed):
    """Fine stochastic grain near the edge: white noise blurred to `size`, weighted by a band."""
    rng = np.random.default_rng(seed + o.get('seed', 0) + 7)
    n = ndimage.gaussian_filter(rng.standard_normal(f.shape), at(o['size'], pos) / g.px)
    n /= n.std() + 1e-9
    d = sdf(f) * g.px                             # + inside, - outside, in units
    band = np.exp(-(d / at(o['band'], pos)) ** 2) * (d < at(o['band'], pos))   # the edge only, never the core
    return f + at(o['amp'], pos) * n * band


def op_clean(f, o, pos, g, seed):
    """Drop islands and fill holes smaller than `min` square font units."""
    m = f > 0.5
    a = at(o.get('min', 400), pos) / g.px ** 2
    with warnings.catch_warnings():               # skimage 0.26 renamed the size arguments
        warnings.simplefilter('ignore', FutureWarning)
        keep = morphology.remove_small_objects(m, max(int(a), 1))
        fill = morphology.remove_small_holes(keep, max(int(at(o.get('holes', o.get('min', 400)), pos) / g.px ** 2), 1))
    out = f.copy()
    out[m & ~keep] = 0.0
    out[fill & ~keep] = 1.0
    return out


def op_skeleton(f, o, pos, g, seed):
    """Monoline: the medial axis of the ink, re-inked at radius r, with drops at free ends."""
    m = f > 0.5
    if not m.any():
        return f
    skel, dist = morphology.medial_axis(m, return_distance=True)
    if skel.any():
        stroke = np.median(dist[skel])
        skel &= dist > at(o.get('trim', 0.35), pos) * stroke
    r = at(o['r'], pos) / g.px
    d = ndimage.distance_transform_edt(~skel) if skel.any() else np.full(f.shape, 1e3)
    out = soft(r - d)
    drop = at(o.get('drop', 0), pos)
    if drop > 0 and skel.any():
        nb = ndimage.convolve(skel.astype(int), np.ones((3, 3), int), mode='constant') - 1
        ends = skel & (nb == 1)
        if ends.any():
            out = np.maximum(out, soft(r * drop - ndimage.distance_transform_edt(~ends)))
    return out


def op_trap(f, o, pos, g, seed):
    """Ink traps: notch every concave corner. The fillet that a close of radius r would add is
    grown by `depth` and cut out of the letter."""
    r, depth = at(o['r'], pos) / g.px, at(o['depth'], pos) / g.px
    if r <= 0 or depth <= 0:
        return f
    closed = soft(sdf(soft(sdf(f) + r)) - r)
    fillet = np.clip(closed - f, 0, 1)
    notch = soft(sdf(fillet) + depth)
    return np.minimum(f, 1 - notch)


def op_carve(f, o, pos, g, seed):
    """Shaded display: cut a crescent inside the strokes, `inset` from the edge, `width` wide,
    on the side facing away from `angle` (degrees, 0 = light from the right)."""
    w = at(o['width'], pos) / g.px
    if w <= 0:
        return f
    inset = at(o['inset'], pos) / g.px
    inner = soft(sdf(f) - inset)
    a = math.radians(at(o.get('angle', 135), pos))
    moved = ndimage.shift(inner, (-math.sin(a) * w, math.cos(a) * w), order=1, mode='constant')
    cut = np.minimum(inner, 1 - moved)
    return np.minimum(f, 1 - cut)


def op_inline(f, o, pos, g, seed):
    """An inline: a channel `w` wide cut along the middle of every stroke, kept `inset` inside the
    edge, and moved `shift` units towards `angle` (degrees, 90 = up), the side the light is on."""
    m = f > 0.5
    if not m.any():
        return f
    skel = morphology.skeletonize(m)
    dist = ndimage.distance_transform_edt(m)
    if skel.any():
        skel &= dist > at(o.get('trim', 0.7), pos) * np.median(dist[skel])
    if not skel.any():
        return f
    cut = soft(at(o['w'], pos) / 2 / g.px - ndimage.distance_transform_edt(~skel))
    s = at(o.get('shift', 0), pos) / g.px
    if s:
        a = math.radians(at(o.get('angle', 120), pos))
        cut = ndimage.shift(cut, (-math.sin(a) * s, math.cos(a) * s), order=1, mode='constant')
    cut = np.minimum(cut, soft(sdf(f) - at(o['inset'], pos) / g.px))
    return np.minimum(f, 1 - cut)


def op_stencil(f, o, pos, g, seed):
    """Stencil bridges: a vertical gap `w` wide through the whole letter at the centre of every
    counter, so no counter is an island. Counters smaller than `min` square units are ignored."""
    m = f > 0.5
    holes, n = ndimage.label(ndimage.binary_fill_holes(m) & ~m)
    w = at(o['w'], pos) / g.px
    cols = np.arange(f.shape[1])[None, :]
    cut = np.zeros_like(f)
    for i in range(1, n + 1):
        rr, cc = np.nonzero(holes == i)
        if len(rr) * g.px ** 2 < o.get('min', 1500):
            continue
        band = soft(w / 2 - np.abs(cols - cc.mean()))
        cut = np.maximum(cut, np.broadcast_to(band, f.shape))
    return np.minimum(f, 1 - cut)


def op_extrude(f, o, pos, g, seed):
    """A solid drop shadow: the letter swept `d` units towards `angle` (degrees, -45 = down-right)."""
    d = at(o['d'], pos) / g.px
    if d <= 0:
        return f
    a = math.radians(at(o.get('angle', -45), pos))
    out = f.copy()
    for t in np.linspace(0, d, max(2, int(d / 0.75)) + 1)[1:]:
        out = np.maximum(out, ndimage.shift(f, (-math.sin(a) * t, math.cos(a) * t), order=1, mode='constant'))
    return out


def op_drip(f, o, pos, g, seed):
    """Melt: every column of ink sags down by up to `len` units, the length varying across the
    letter as smooth noise over `cell` units, fading with `fade` (0 = a hard drag, 1 = a taper).
    With `outer` (the default) only the bottom of each column drips."""
    L = at(o['len'], pos) / g.px
    if L <= 0:
        return f
    n = value_noise((1, f.shape[1]), at(o.get('cell', 80), pos) / g.px, seed + o.get('seed', 0), 2)[0]
    Lc = L * np.clip(0.5 + 0.9 * n, 0.05, 1.0)
    fade = at(o.get('fade', 0.6), pos)
    src = f
    if o.get('outer', True):                      # only the lowest edge of each column runs, so
        m = f > 0.5                               # nothing drips into a counter and floods it
        below = np.cumsum(m[::-1], 0)[::-1] - m
        src = f * (below == 0)
    out = f.copy()
    for k in range(1, int(L) + 1):
        sh = np.zeros_like(f)
        sh[k:] = src[:-k]
        wgt = np.clip((Lc - k) / np.maximum(Lc, 1e-6), 0, 1)
        out = np.maximum(out, sh * ((1 - fade) + fade * wgt) * (k <= Lc))
    return out


def _slide(f, dy, dx):
    """f moved by (dy, dx) pixels, whole pixels by slicing when both are whole (fast), else linear."""
    if float(dy).is_integer() and float(dx).is_integer():
        dy, dx = int(dy), int(dx)
        out = np.zeros_like(f)
        H, W = f.shape
        if abs(dy) >= H or abs(dx) >= W:
            return out
        out[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)] = f[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)]
        return out
    return ndimage.shift(f, (dy, dx), order=1, mode='constant')


def op_nib(f, o, pos, g, seed):
    """Broad nib: the skeleton of the ink redrawn with a flat pen `w` units wide held at `angle`
    degrees (0 = flat), over a round hairline `hair` units thick. Strokes that run along the nib
    come out thin and strokes across it thick, so turning the nib turns the contrast over."""
    m = f > 0.5
    if not m.any():
        return f
    skel = morphology.skeletonize(m)
    if 'trim' in o and skel.any():
        dist = ndimage.distance_transform_edt(m)
        skel &= dist > o['trim'] * np.median(dist[skel])
    core = soft(at(o.get('hair', 6), pos) / 2 / g.px - ndimage.distance_transform_edt(~skel))
    w = at(o['w'], pos) / g.px
    a = math.radians(at(o['angle'], pos))
    out = core.copy()
    for t in np.linspace(-w / 2, w / 2, max(int(w / 0.7), 2)):
        out = np.maximum(out, _slide(core, -math.sin(a) * t, math.cos(a) * t))
    return out


def op_trail(f, o, pos, g, seed):
    """A paint trail: the letter swept `len` units towards `angle` (degrees, 180 = to the left)
    while it thins by `taper` units per 100 of travel, so the front stays crisp and the tail runs
    out in strands. `vary` (0..1) lets the rate change smoothly across the sweep, over `cell` units."""
    L = at(o['len'], pos) / g.px
    if L <= 0:
        return f
    a = math.radians(at(o.get('angle', 180), pos))
    k = at(o.get('taper', 20), pos) / 100
    d = sdf(f)
    if o.get('vary', 0):
        n = value_noise(f.shape, at(o.get('cell', 60), pos) / g.px, seed + o.get('seed', 0), 2)
        k = k * np.clip(1 + o['vary'] * n, 0.2, None)
    out = f.copy()
    horiz = abs(math.sin(a)) < 1e-9
    for t in np.arange(1, L + 1, 1.0):
        piece = soft(d - t * k)
        if piece.max() <= 0.5:
            break
        dy, dx = -math.sin(a) * t, math.cos(a) * t
        out = np.maximum(out, _slide(piece, 0.0, float(round(dx))) if horiz else _slide(piece, dy, dx))
    return out


OPS = {k[3:]: v for k, v in globals().items() if k.startswith('op_')}


def process(polys, pos, recipe, g, seed, gname=None):
    """`recipe.glyphs` may override op params per glyph: {"s": {"0": {"drop": 1}}} changes op 0 for s."""
    warp = recipe.get('warp', {})
    sx, sy, sl = at(warp.get('sx', 1), pos), at(warp.get('sy', 1), pos), at(warp.get('slant', 0), pos)
    wp = [np.stack([P[:, 0] * sx + P[:, 1] * sl, P[:, 1] * sy], 1) for P in polys]
    f = raster(wp, g)
    over = recipe.get('glyphs', {}).get(gname, {})
    for i, o in enumerate(recipe['ops']):
        o = {**o, **over.get(str(i), {})}
        f = OPS[o['op']](f, o, pos, g, seed)
    return f


def warp_matrix(recipe, pos):
    w = recipe.get('warp', {})
    return np.array([[at(w.get('sx', 1), pos), at(w.get('slant', 0), pos)], [0.0, at(w.get('sy', 1), pos)]])


# ---------------------------------------------------------------------------------------------
# tracing, projection and joint curve fitting

def resample(C, step):
    """Closed polyline -> points every `step` units along it."""
    seg = np.linalg.norm(np.diff(np.vstack([C, C[:1]]), axis=0), axis=1)
    L = seg.sum()
    n = max(int(round(L / step)), 8)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, L, n, endpoint=False)
    CC = np.vstack([C, C[:1]])
    return np.stack([np.interp(t, s, CC[:, 0]), np.interp(t, s, CC[:, 1])], 1)


def left_normals(P):
    t = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-12
    return np.stack([-t[:, 1], t[:, 0]], 1)


def trace(f, g, step, min_area):
    """Contours of the field at 0.5, oriented TrueType-style: ink on the right of travel."""
    out = []
    for c in measure.find_contours(np.pad(f, 1), 0.5):
        if len(c) < 4:
            continue
        P = g.to_units(c - 1 + 0.5)       # contours are in pixel-centre coordinates
        area = 0.5 * np.sum(P[:, 0] * np.roll(P[:, 1], -1) - np.roll(P[:, 0], -1) * P[:, 1])
        if abs(area) < min_area:
            continue
        P = resample(P, step)
        n = left_normals(P)
        d = 1.5 * g.px
        ink_left = np.mean(g.sample(f, P + n * d) - g.sample(f, P - n * d)) > 0
        out.append(P[::-1].copy() if ink_left else P)
    return out


def project(P, f, g, maxd, smooth, nsmooth):
    """Move each sample along its outward normal onto the 0.5 edge of field f. Normals come from
    the contour smoothed over `nsmooth` units, so they fan out evenly round sharp corners, and
    the moves are smoothed over `smooth` units."""
    step = np.linalg.norm(P - np.roll(P, 1, 0), axis=1).mean()
    if step < 1e-3:                               # already collapsed at the neighbouring master
        return P.copy(), False
    Ps = ndimage.gaussian_filter1d(P, nsmooth / step, axis=0, mode='wrap') if nsmooth > 0 else P
    n = left_normals(Ps)                         # ink is on the right, so left is outward
    steps = np.arange(-maxd, maxd + 1e-9, 0.25 * g.px)
    Q = P[:, None, :] + n[:, None, :] * steps[None, :, None]
    v = g.sample(f, Q.reshape(-1, 2)).reshape(len(P), len(steps)) - 0.5
    i0 = np.searchsorted(steps, 0.0)
    inside = v[:, i0] > 0
    t = np.full(len(P), np.nan)
    for k in range(len(P)):
        row = v[k]
        if inside[k]:                             # march out to the first exit
            j = np.nonzero(row[i0:] <= 0)[0]
            if len(j):
                j = i0 + j[0]; a, b = row[j - 1], row[j]
                t[k] = steps[j - 1] + (steps[j] - steps[j - 1]) * a / (a - b)
        else:                                     # march in to the first entry
            j = np.nonzero(row[:i0 + 1][::-1] > 0)[0]
            if len(j):
                j = i0 - j[0]; a, b = row[j], row[j + 1]
                t[k] = steps[j] + (steps[j + 1] - steps[j]) * a / (a - b)
    ok = ~np.isnan(t)
    if ok.mean() < 0.4:                           # the contour vanished: collapse it
        return np.repeat(P.mean(0, keepdims=True), len(P), 0), False
    if not ok.all():
        idx = np.arange(len(P))
        t[~ok] = np.interp(idx[~ok], idx[ok], t[ok], period=len(P))
    if smooth > 0:
        t = ndimage.median_filter(t, size=2 * int(smooth / step) + 1, mode='wrap')
        t = ndimage.gaussian_filter1d(t, smooth / step, mode='wrap')
    return untangle(P + n * t[:, None], np.roll(Ps, -1, 0) - Ps), True


def untangle(R, T, margin=2, rounds=8):
    """Offsetting into a concave corner makes the samples cross and loop back, and a loop fills
    with the wrong winding (a pinhole). Runs that travel against the source tangents T are
    replaced by the straight chord across them."""
    N = len(R)
    for _ in range(rounds):
        fwd = ((np.roll(R, -1, 0) - R) * T).sum(1)
        bad = fwd < 0
        if not bad.any():
            break
        if bad.all():
            return np.repeat(R.mean(0, keepdims=True), N, 0)
        grow = ndimage.maximum_filter1d(bad.astype(np.uint8), 2 * margin + 1, mode='wrap') > 0
        if grow.all():
            return np.repeat(R.mean(0, keepdims=True), N, 0)
        start = int(np.nonzero(~grow)[0][0])
        idx = np.roll(np.arange(N), -start)
        g = grow[idx]
        k = 0
        while k < N:
            if not g[k]:
                k += 1; continue
            e = k
            while e < N and g[e]:
                e += 1
            a, b = idx[k - 1], idx[e % N]
            for q, j in enumerate(range(k, e)):
                w = (q + 1) / (e - k + 1)
                R[idx[j]] = R[a] * (1 - w) + R[b] * w
            k = e
    return R


def fit_quads(Ps, tol, seg0, corner_deg, corner_master):
    """Ps: (M, N, 2) samples of one closed contour in M masters. Returns anchor indices and, per
    master, a list of (on, off) point pairs: one quadratic per segment, the same in all masters."""
    M, N, _ = Ps.shape
    P = Ps[corner_master]
    k = 3
    a = P - np.roll(P, k, 0); b = np.roll(P, -k, 0) - P
    ang = np.degrees(np.abs(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(1))))
    corners = [i for i in range(N) if ang[i] > corner_deg and ang[i] >= ang[(i + np.arange(-k, k + 1)) % N].max()]
    if corners:
        anchors = []
        for c0, c1 in zip(corners, corners[1:] + [corners[0] + N]):
            span = c1 - c0
            parts = max(1, int(round(span / seg0)))
            anchors += [c0 + int(round(span * j / parts)) for j in range(parts)]
    else:
        parts = max(3, int(round(N / seg0)))
        anchors = [int(round(N * j / parts)) for j in range(parts)]
    anchors = sorted(set(x % N for x in anchors))

    def seg_fit(i, j):
        idx = np.arange(i, j + 1) % N
        ctrl, err = [], 0.0
        for m in range(M):
            Q = Ps[m][idx]
            d = np.linalg.norm(np.diff(Q, axis=0), axis=1)
            L = d.sum()
            if L < 1e-6:
                ctrl.append(Q[0]); continue
            t = np.concatenate([[0], np.cumsum(d)]) / L
            A, B, C = (1 - t) ** 2, 2 * t * (1 - t), t ** 2
            R = Q - A[:, None] * Q[0] - C[:, None] * Q[-1]
            P1 = (B[:, None] * R).sum(0) / max((B * B).sum(), 1e-12)
            for _ in range(2):                    # nudge parameters towards the curve
                Bz = A[:, None] * Q[0] + B[:, None] * P1 + C[:, None] * Q[-1]
                dB = 2 * ((1 - t)[:, None] * (P1 - Q[0]) + t[:, None] * (Q[-1] - P1))
                t = np.clip(t + ((Q - Bz) * dB).sum(1) / np.maximum((dB * dB).sum(1), 1e-9), 0, 1)
                t[0], t[-1] = 0, 1
                A, B, C = (1 - t) ** 2, 2 * t * (1 - t), t ** 2
                R = Q - A[:, None] * Q[0] - C[:, None] * Q[-1]
                P1 = (B[:, None] * R).sum(0) / max((B * B).sum(), 1e-12)
            Bz = A[:, None] * Q[0] + B[:, None] * P1 + C[:, None] * Q[-1]
            err = max(err, np.linalg.norm(Bz - Q, axis=1).max())
            ctrl.append(P1)
        return ctrl, err

    segs = []
    stack = [(anchors[i], anchors[i + 1] if i + 1 < len(anchors) else anchors[0] + N) for i in range(len(anchors))][::-1]
    while stack:
        i, j = stack.pop()
        ctrl, err = seg_fit(i, j)
        if err > tol and j - i >= 4:
            mid = (i + j) // 2
            stack += [(mid, j), (i, mid)]
        else:
            segs.append((i % N, ctrl))
    segs.sort(key=lambda s: s[0])
    return [[pt for i, ctrl in segs for pt in ((Ps[m][i], True), (ctrl[m], False))] for m in range(M)]


def _basis(u, K, closed):
    """Design matrix of a quadratic B-spline with K free off-curve points, TrueType style.
    Closed: segment j runs mid(c[j-1], c[j]) -> c[j] -> mid(c[j], c[j+1]).
    Open: fixed on-curve ends P0, P1; returns (A, a0, a1) with sample = A @ c + a0 * P0 + a1 * P1."""
    N = len(u)
    s = np.clip(u * K, 0, K - 1e-9)
    j = np.floor(s).astype(int)
    t = s - j
    A = np.zeros((N, K)); a0 = np.zeros(N); a1 = np.zeros(N)
    r = np.arange(N)
    w0, w1, w2 = (1 - t) ** 2, 2 * t * (1 - t), t * t
    if closed:
        np.add.at(A, (r, (j - 1) % K), 0.5 * w0)
        np.add.at(A, (r, j), 0.5 * w0 + w1 + 0.5 * w2)
        np.add.at(A, (r, (j + 1) % K), 0.5 * w2)
        return A, a0, a1
    first, last = j == 0, j == K - 1
    a0 += np.where(first, w0, 0)
    np.add.at(A, (r[~first], j[~first] - 1), 0.5 * w0[~first])
    np.add.at(A, (r[~first], j[~first]), 0.5 * w0[~first])
    np.add.at(A, (r, j), w1)
    a1 += np.where(last, w2, 0)
    np.add.at(A, (r[~last], j[~last]), 0.5 * w2[~last])
    np.add.at(A, (r[~last], j[~last] + 1), 0.5 * w2[~last])
    return A, a0, a1


def _geo_err(Q, c, closed, ends):
    """Largest distance between the samples and the fitted curve, both ways."""
    pts = [(q, False) for q in c]
    L = np.linalg.norm(np.diff(Q, axis=0), axis=1).sum()
    steps = max(6, int(math.ceil(L / max(len(c), 1) / 1.0)))
    if closed:
        curve = flatten(pts, steps)
    else:
        curve = flatten([(ends[0], True)] + pts + [(ends[1], True)], steps)
    if len(curve) < 2:
        return 0.0
    a = cKDTree(curve).query(Q)[0].max()
    return max(a, _seg_dist(curve, Q, closed).max())


def _seg_dist(X, Q, closed):
    """Distance from each point of X to the polyline Q (its two segments at the nearest vertex)."""
    _, k = cKDTree(Q).query(X)
    n = len(Q)
    best = np.full(len(X), np.inf)
    for off in (-1, 0):
        i = k + off
        j = i + 1
        if closed:
            i, j = i % n, j % n
        else:
            ok = (i >= 0) & (j < n)
            i, j = np.clip(i, 0, n - 1), np.clip(j, 0, n - 1)
        A, B = Q[i], Q[j]
        AB = B - A
        t = np.clip(((X - A) * AB).sum(1) / np.maximum((AB * AB).sum(1), 1e-12), 0, 1)
        d = np.linalg.norm(X - (A + AB * t[:, None]), axis=1)
        if not closed:
            d = np.where(ok, d, np.linalg.norm(X - Q[k], axis=1))
        best = np.minimum(best, d)
    return best


def _solve(A, rhs, K, closed, lam):
    D = np.zeros((K, K)) if closed else np.zeros((max(K - 2, 0), K))
    for i in range(D.shape[0]):
        D[i, [(i - 1) % K, i, (i + 1) % K] if closed else [i, i + 1, i + 2]] = (1, -2, 1)
    support = (A * A).sum(0)                       # a control point no sample pins down
    w = np.array([lam if support[np.nonzero(row)[0]].min() > 0.5 else 1.0 for row in D]) if len(D) else np.zeros(0)
    AA = np.vstack([A, np.sqrt(w)[:, None] * D])
    bb = np.vstack([rhs, np.zeros((D.shape[0], 2))])
    return np.linalg.lstsq(AA, bb, rcond=None)[0]


def fit_spline(Ps, tol, seg0, bend, corner_deg, corner_master=0):
    """Ps: (M, N, 2) samples of one closed contour in M masters. Quadratic B-splines of off-curve
    points (TrueType puts the on-curve points halfway between them), split at corners, which
    become on-curve points. Every master gets the same point structure; knots crowd where any
    master bends. Returns, per master, a list of (point, on_curve)."""
    M, N, _ = Ps.shape
    k = 4
    turn = np.zeros(N); curv = np.zeros(N)
    for m in range(M):
        P = Ps[m]
        a = P - np.roll(P, k, 0); b = np.roll(P, -k, 0) - P
        ang = np.abs(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(1)))
        if m == corner_master:                     # corners are the traced master's own
            turn = np.degrees(ang)
        curv = np.maximum(curv, ang / np.maximum(np.linalg.norm(a, axis=1) + np.linalg.norm(b, axis=1), 1e-6))
    corners = [i for i in range(N) if turn[i] > corner_deg and turn[i] >= turn[(i + np.arange(-k, k + 1)) % N].max()]
    corners = [c for n_, c in enumerate(corners) if n_ == 0 or c - corners[n_ - 1] > k]
    curv = ndimage.gaussian_filter1d(curv, 3, mode='wrap')
    step = np.linalg.norm(Ps[0] - np.roll(Ps[0], 1, 0), axis=1).mean()
    stretch = np.max([np.linalg.norm(np.roll(Ps[m], -1, 0) - Ps[m], axis=1) for m in range(M)], 0) / step
    dens = np.clip(stretch, 0.2, 8) * (1 + np.minimum(bend * curv * step * N / (2 * np.pi), 6))

    def piece(idx, closed):
        n = len(idx)
        d = dens[idx]
        u = (np.concatenate([[0], np.cumsum(d)[:-1]]) if closed else np.concatenate([[0], np.cumsum((d[1:] + d[:-1]) / 2)]))
        u = u / (d.sum() if closed else max(u[-1], 1e-9))
        length = step * n
        K = max(3 if closed else 1, int(round(length / seg0)))
        cap = max(3, n // 4)
        while True:
            A, a0, a1 = _basis(u, K, closed)
            C, err = [], 0.0
            for m in range(M):
                Q = Ps[m][idx]
                if closed:
                    rhs = Q
                else:
                    P0, P1 = Ps[m][idx[0]], Ps[m][idx[-1]]
                    rhs = Q - a0[:, None] * P0 - a1[:, None] * P1
                c = _solve(A, rhs, K, closed, 1e-6)
                C.append(c)
                err = max(err, _geo_err(Q, c, closed, None if closed else (Ps[m][idx[0]], Ps[m][idx[-1]])))
            if err <= tol or K >= cap:
                return C
            K = min(cap, int(math.ceil(K * 1.25)))

    if not corners:
        C = piece(np.arange(N), True)
        return [[(C[m][j], False) for j in range(len(C[m]))] for m in range(M)]
    out = [[] for _ in range(M)]
    for c0, c1 in zip(corners, corners[1:] + [corners[0] + N]):
        idx = np.arange(c0, c1 + 1) % N
        C = piece(idx, False) if len(idx) > 3 else [np.zeros((0, 2))] * M
        for m in range(M):
            out[m].append((Ps[m][c0 % N], True))
            out[m] += [(q, False) for q in C[m]]
    return out


def flatten(c, steps=8):
    """(point, on) contour -> polyline."""
    pts = [np.asarray(p, float) for p, _ in c]
    on = [o for _, o in c]
    if not any(on):
        n = len(pts)
        q, o2 = [], []
        for i in range(n):
            q += [(pts[i - 1] + pts[i]) / 2, pts[i]]; o2 += [True, False]
        pts, on = q, o2
    start = on.index(True)
    pts, on = pts[start:] + pts[:start], on[start:] + on[:start]
    out, n, i = [], len(pts), 0
    while i < n:
        p0 = pts[i]
        j = (i + 1) % n
        if on[j]:
            out.append(p0); i += 1; continue
        offs = []
        while not on[j]:
            offs.append(pts[j]); j = (j + 1) % n
        seq = [p0]
        for a, b in zip(offs, offs[1:]):
            seq += [a, (a + b) / 2]
        seq += [offs[-1], pts[j]]
        for q in range(0, len(seq) - 2, 2):
            a, b, e = seq[q], seq[q + 1], seq[q + 2]
            for t in np.linspace(0, 1, steps, endpoint=False):
                out.append((1 - t) ** 2 * a + 2 * t * (1 - t) * b + t * t * e)
        i += len(offs) + 1
    return np.array(out)


def quads_to_polys(contours):
    return [flatten(c) for c in contours if c]


# ---------------------------------------------------------------------------------------------
# one glyph, all masters (runs in a worker process)

def make_glyph(args):
    recipe, gname, positions, trace_pos = args
    font, scale = open_base(recipe)
    adv0 = font['hmtx'][gname][0] * scale
    out = {'name': gname, 'masters': {}}
    fit = recipe.get('fit', {})
    track = recipe.get('track', 0)
    comps = components(font, gname) if recipe.get('composites', True) else None
    if comps:
        for p in positions:
            W = warp_matrix(recipe, p)
            cs = [(c, *(W @ np.array([dx * scale, dy * scale]))) for c, dx, dy in comps]
            out['masters'][p] = {'components': cs, 'contours': [], 'adv': adv0 * W[0, 0] + 2 * at(track, p), 'dev': 0.0}
        return out
    polys = glyph_polys(font, scale, gname)
    if not polys:
        for p in positions:
            sx = warp_matrix(recipe, p)[0, 0]
            out['masters'][p] = {'contours': [], 'adv': adv0 * sx + 2 * at(track, p), 'dev': 0.0}
        return out

    if 'pixel' in recipe:
        return make_pixel(recipe, gname, positions, polys, adv0, out)
    if 'echo' in recipe:
        return make_echo(recipe, gname, positions, polys, adv0, out)
    if 'pieces' in recipe:
        return make_pieces(recipe, gname, positions, polys, adv0, out)
    if 'blocks' in recipe:
        return make_blocks(recipe, gname, positions, polys, adv0, out)

    px = recipe.get('px', 2.0)
    pad = recipe.get('pad', 160)
    allpts = np.concatenate(polys)
    boxes = []
    for p in positions:
        W = warp_matrix(recipe, p)
        q = allpts @ W.T
        boxes.append((q.min(0), q.max(0)))
    lo = np.min([b[0] for b in boxes], 0) - pad
    hi = np.max([b[1] for b in boxes], 0) + pad
    g = Grid(lo[0], hi[1], int(math.ceil((hi[0] - lo[0]) / px)), int(math.ceil((hi[1] - lo[1]) / px)), px)
    seed = recipe.get('seed', 1) * 7919 + zlib.crc32(gname.encode()) % 100000

    flow = recipe.get('flow')               # a flow face is traced once and its samples are moved,
    fields = {p: process(polys, p, recipe, g, seed, gname)   # so only the traced master is processed
              for p in (positions if not flow else [trace_pos])}
    step = fit.get('step', 2.0 * px / 2)
    C = trace(fields[trace_pos], g, step, fit.get('min_area', 60))
    if not C:                   # the process erased this glyph at the traced master (a hairline sign
        for alt in sorted(positions, key=lambda q: abs(q - trace_pos))[1:]:   # under a big blur):
            C = trace(fields[alt], g, step, fit.get('min_area', 60))          # trace the nearest one
            if C:                                                             # that still has ink
                trace_pos = alt
                break
    Wt = warp_matrix(recipe, trace_pos)
    Wt_inv = np.linalg.inv(Wt)
    # project in a chain outward from the traced position, each master from its neighbour
    chain = sorted(positions, key=lambda p: abs(p - trace_pos))
    per = {p: [] for p in positions}
    for P in C:
        per[trace_pos].append(P)
        if flow:
            front = max(float(Q[:, 0].max()) for Q in C)
            for p in chain[1:]:
                per[p].append(flow_warp(P, flow, (p - trace_pos) / 1000, seed, front))
            continue
        for p in chain[1:]:
            src = min((q for q in positions if per[q] and len(per[q]) == len(per[trace_pos]) and q != p and
                       abs(q - trace_pos) < abs(p - trace_pos)), key=lambda q: abs(q - p))
            Q = per[src][-1] @ np.linalg.inv(warp_matrix(recipe, src)).T @ warp_matrix(recipe, p).T
            R, _ = project(Q, fields[p], g, fit.get('reach', 120), fit.get('smooth', 8), fit.get('nsmooth', 16))
            per[p].append(R)
    contours = {p: [] for p in positions}
    for ci in range(len(C)):
        Ps = np.stack([per[p][ci] for p in positions])
        if fit.get('mode', 'spline') == 'spline':
            fitted = fit_spline(Ps, fit.get('tol', 1.5), fit.get('seg', 40), fit.get('bend', 4),
                                fit.get('corner', 50), positions.index(trace_pos))
        else:
            fitted = fit_quads(Ps, fit.get('tol', 1.2), fit.get('seg', 24), fit.get('corner', 60),
                               positions.index(trace_pos))
        for m, p in enumerate(positions):
            contours[p].append(fitted[m])
    for p in positions:
        sx = warp_matrix(recipe, p)[0, 0]
        tr = at(track, p)
        mask = raster(quads_to_polys(contours[p]), g) > 0.5
        ink = fields[p] > 0.5 if p in fields else raster(per[p], g) > 0.5
        xor = np.logical_xor(mask, ink).sum() * px * px
        perim = sum(np.linalg.norm(np.diff(np.vstack([P, P[:1]]), axis=0), axis=1).sum() for P in per[p]) or 1
        cs = [[((float(q[0]) + tr, float(q[1])), on) for q, on in c] for c in contours[p]]
        out['masters'][p] = {'contours': cs, 'adv': adv0 * sx + 2 * tr, 'dev': float(xor / perim)}
    if 'dust' in recipe:
        add_dust(recipe, positions, fields[trace_pos], g, seed, out)
    return out


# ---------------------------------------------------------------------------------------------
# constructed faces: the masters differ only by moving whole pieces, so they are built directly
# (every master has the same points by construction) instead of traced and projected.

def _rect(x0, y0, x1, y1):
    """A rectangle, clockwise (ink on the right of travel)."""
    return [((x0, y0), True), ((x0, y1), True), ((x1, y1), True), ((x1, y0), True)]


def _runs(row):
    """[(start, end)] of the True runs in a boolean row."""
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    return list(zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]))


def make_pixel(recipe, gname, positions, polys, adv0, out):
    """recipe.pixel: the letter quantised to `cell`-unit pixels (a pixel is ink when more than `at`
    of it is covered), one rectangle per run of pixels in a row. Along the axis, a fraction `p`
    of the rows is sorted: the row is cut into `split` strips and each strip's last run is dragged
    right by up to `drag` units, and a fraction `p_shift` of the rows slides by up to `shift`.
    Rectangles overlap by `bleed` units so no hairline seam shows between rows."""
    pc = recipe['pixel']
    cell, split, bleed = pc['cell'], pc.get('split', 2), pc.get('bleed', 1.0)
    W = warp_matrix(recipe, positions[0])
    wp = [P @ W.T for P in polys]
    allp = np.concatenate(wp)
    x0 = math.floor(allp[:, 0].min() / cell) * cell - cell
    y0 = math.ceil(allp[:, 1].max() / cell) * cell + cell
    g = Grid(x0, y0, int(math.ceil((allp[:, 0].max() - x0) / cell)) + 2,
             int(math.ceil((y0 - allp[:, 1].min()) / cell)) + 2, cell)
    ink = raster(wp, g, ss=8) > pc.get('at', 0.5)
    rng = np.random.default_rng(recipe.get('seed', 1) * 7919 + zlib.crc32(gname.encode()) % 100000)
    rects = []                                     # (xa, xb, ya, yb, shift, drag) at full strength
    for r in range(g.h):
        runs = _runs(ink[r])
        if not runs:
            continue
        top = y0 - r * cell
        sort = rng.random() < pc.get('p', 0.35)
        shift = rng.uniform(-1, 1) * pc.get('shift', 0) if rng.random() < pc.get('p_shift', 0.25) else 0.0
        strips = split if sort else 1
        for s in range(strips):
            ya, yb = top - (s + 1) * cell / strips, top - s * cell / strips
            drag = rng.uniform(0.2, 1.0) * pc.get('drag', 0) if sort else 0.0
            for i, (c0, c1) in enumerate(runs):
                rects.append((x0 + c0 * cell, x0 + c1 * cell, ya, yb, shift, drag if i == len(runs) - 1 else 0.0))
    lo, hi = positions[0], positions[-1]
    for p in positions:
        u = (p - lo) / (hi - lo) if hi > lo else 1.0
        tr = at(recipe.get('track', 0), p)
        cs = [_rect(xa + sh * u + tr - bleed, ya - bleed, xb + (sh + dr) * u + tr + bleed, yb + bleed)
              for xa, xb, ya, yb, sh, dr in rects]
        out['masters'][p] = {'contours': cs, 'adv': adv0 * W[0, 0] + 2 * tr, 'dev': 0.0}
    return out


def make_echo(recipe, gname, positions, polys, adv0, out):
    """recipe.echo: the processed letter, plus `n` outline copies of it (rings `ring` units thick,
    lying just inside its edge, so at the axis minimum they hide inside the letter). Along the
    axis, copy k moves to k**power × (dx, dy). The letter and its rings are traced once."""
    ec = recipe['echo']
    px, pad = recipe.get('px', 2.0), recipe.get('pad', 160)
    W = warp_matrix(recipe, positions[0])
    allp = np.concatenate(polys) @ W.T
    lo, hi = allp.min(0) - pad, allp.max(0) + pad
    g = Grid(lo[0], hi[1], int(math.ceil((hi[0] - lo[0]) / px)), int(math.ceil((hi[1] - lo[1]) / px)), px)
    seed = recipe.get('seed', 1) * 7919 + zlib.crc32(gname.encode()) % 100000
    f = process(polys, positions[0], recipe, g, seed, gname)
    fit = recipe.get('fit', {})

    def fitted(field):
        return [fit_spline(P[None], fit.get('tol', 1.5), fit.get('seg', 40), fit.get('bend', 4),
                           fit.get('corner', 50), 0)[0]
                for P in trace(field, g, fit.get('step', px), fit.get('min_area', 60))]

    solid, d = fitted(f), sdf(f)
    rings = [fitted(np.minimum(f, 1 - soft(d - at(ec['ring'], k) / px))) for k in range(1, ec['n'] + 1)]
    lines = quads_to_polys(solid)
    perim = sum(np.linalg.norm(np.diff(P, axis=0), axis=1).sum() for P in lines) or 1
    dev = float(np.logical_xor(raster(lines, g) > 0.5, f > 0.5).sum() * px * px / perim)
    a, b = positions[0], positions[-1]
    for p in positions:
        u = (p - a) / (b - a) if b > a else 1.0
        tr = at(recipe.get('track', 0), p)
        cs = [[((float(q[0]) + tr, float(q[1])), on) for q, on in c] for c in solid]
        for k, rc in enumerate(rings, 1):
            s = k ** ec.get('power', 1.0) * u
            dx, dy = at(ec['dx'], k) * s, at(ec['dy'], k) * s
            cs += [[((float(q[0]) + dx + tr, float(q[1]) + dy), on) for q, on in c] for c in rc]
        out['masters'][p] = {'contours': cs, 'adv': adv0 * W[0, 0] + 2 * tr, 'dev': dev}
    return out


def _lerp(v, u):
    """A piece parameter: a number, or [value at the axis minimum, value at the maximum]."""
    return v[0] + (v[1] - v[0]) * u if isinstance(v, (list, tuple)) else v


def _fit_field(field, g, fit, px):
    return [fit_spline(P[None], fit.get('tol', 1.5), fit.get('seg', 40), fit.get('bend', 4),
                       fit.get('corner', 50), 0)[0]
            for P in trace(field, g, fit.get('step', px), fit.get('min_area', 60))]


def make_pieces(recipe, gname, positions, polys, adv0, out):
    """recipe.pieces: the processed letter is cut into pieces, each traced once, and every master
    moves the pieces rigidly (turn, squash about the piece's centre, shift), so all masters share
    their points by construction. At the axis minimum the pieces overlap by `bleed` units and read
    as the whole letter. `kind`:
      hbands   horizontal bands (heights `h` [min, max]) at the same heights in every glyph, so a
               word slides like one scanned image; a fraction `p` of bands shift by up to `shift`,
               with a per-glyph `jitter`, open a `gap`, and a fraction `p_double` leave a ghost
               copy `double` units further on
      vbands   vertical reeds `w` units wide, each squashed to `squeeze` about a point `pivot`
               (0..1) across it and moved by `dx`, as fluted glass refracts what is behind it
      shards   the letter broken along `n` Voronoi cells crowded round an impact point; each shard
               moves up to `move` units away from it, falls up to `fall`, and turns up to `turn`°
      reflect  the letter stands whole on the baseline over its mirror image (squashed to `sy`,
               `gap` units below), cut into bands `h` units high that thin by `fade` per band; along
               the axis the bands thin to `thin` and ripple sideways by up to `ripple` units"""
    pc = recipe['pieces']
    kind = pc['kind']
    px, pad = recipe.get('px', 2.0), recipe.get('pad', 160)
    bleed = pc.get('bleed', 1.0)
    W = warp_matrix(recipe, positions[0])
    allp = np.concatenate(polys) @ W.T
    lo, hi = allp.min(0) - pad, allp.max(0) + pad
    if kind == 'reflect':
        lo[1] = min(lo[1], -hi[1] * pc.get('sy', 0.7) - pc.get('gap', 20))
    g = Grid(lo[0], hi[1], int(math.ceil((hi[0] - lo[0]) / px)), int(math.ceil((hi[1] - lo[1]) / px)), px)
    gseed = zlib.crc32(gname.encode()) % 100000
    seed = recipe.get('seed', 1) * 7919 + gseed
    f = process(polys, positions[0], recipe, g, seed, gname)
    fit = recipe.get('fit', {})
    ys = g.y0 - (np.arange(g.h) + 0.5) * px        # the y of each row, the x of each column
    xs = g.x0 + (np.arange(g.w) + 0.5) * px
    word = np.random.default_rng(recipe.get('seed', 1))   # shared by every glyph
    rng = np.random.default_rng(seed)                     # this glyph's own
    pieces = []                                           # (field, params)

    def rows(a, b):                                       # ink between heights a < b, with bleed
        return ((ys >= a - bleed) & (ys <= b + bleed))[:, None]

    if kind == 'hbands':
        edges = [pc.get('from', -400)]
        while edges[-1] < pc.get('to', 1300):
            edges.append(edges[-1] + word.uniform(*pc['h']))
        for a, b in zip(edges, edges[1:]):
            moved = word.random() < pc.get('p', 0.5)
            dx = word.uniform(-1, 1) * pc.get('shift', 0) if moved else 0.0
            dx *= 1 + pc.get('jitter', 0) * rng.uniform(-1, 1)
            ghost = moved and word.random() < pc.get('p_double', 0)
            gdx = math.copysign(pc.get('double', 0), dx or 1)
            gap = pc.get('gap', 0) if moved else 0
            band = f * rows(a, b)
            if band.max() <= 0.5:
                continue
            sy = [1.0, max(0.1, 1 - gap / (b - a))]
            pieces.append((band, {'c': (0, (a + b) / 2), 'tx': [0, dx], 'sy': sy}))
            if ghost:
                pieces.append((band, {'c': (0, (a + b) / 2), 'tx': [0, dx + gdx],
                                      'sy': [1.0, sy[1] * pc.get('ghost_sy', 0.5)]}))
    elif kind == 'vbands':
        w = pc['w']
        x = math.floor(lo[0] / w) * w
        k = 0
        while x < hi[0]:
            band = f * ((xs >= x - bleed) & (xs <= x + w + bleed))[None, :]
            if band.max() > 0.5:
                c = x + pc.get('pivot', 0.5) * w
                dx = pc.get('dx', 0)
                if isinstance(dx, dict):                  # {"amp": a, "every": n}: a slow wave
                    dx = dx['amp'] * math.sin(2 * math.pi * k / dx.get('every', 5) + gseed)
                pieces.append((band, {'c': (c, 0), 'sx': [1.0, pc['squeeze']], 'tx': [0, dx]}))
            x += w
            k += 1
    elif kind == 'shards':
        ink = f > 0.5
        rr, cc = np.nonzero(ink)
        if len(rr):
            P = np.stack([xs[cc], ys[rr]], 1)
            hit = P[rng.integers(len(P))]
            n = pc.get('n', 8)
            spread = pc.get('spread', 160)
            near = hit + rng.normal(0, spread, (n // 2, 2))
            far = P[rng.integers(len(P), size=n - n // 2)]
            seeds = np.vstack([near, far])
            lab = np.full(f.shape, -1)
            lab[rr, cc] = cKDTree(seeds).query(P)[1]
            for i in range(n):
                m = lab == i
                if m.sum() * px * px < pc.get('min', 400):
                    continue
                grown = ndimage.distance_transform_edt(~m) * px <= bleed + px
                cen = P[lab[rr, cc] == i].mean(0)
                v = cen - hit
                v = v / (np.linalg.norm(v) + 1e-9)
                mv = pc.get('move', 60) * rng.uniform(0.3, 1.0)
                pieces.append((f * grown, {'c': tuple(cen), 'tx': [0, v[0] * mv],
                                           'ty': [0, v[1] * mv - pc.get('fall', 0) * rng.uniform(0, 1)],
                                           'rot': [0, rng.uniform(-1, 1) * pc.get('turn', 6)]}))
    elif kind == 'reflect':
        pieces.append((f, {}))
        sy, gap = pc.get('sy', 0.7), pc.get('gap', 20)
        mirror = [np.stack([P[:, 0], -P[:, 1] * sy - gap], 1) for P in polys]
        fm = process(mirror, positions[0], recipe, g, seed, gname) * (ys < -gap)[:, None]
        top, k, h = -gap, 0, pc['h']
        while top > lo[1]:
            b = top - h
            band = fm * rows(b, top)
            if band.max() > 0.5:
                t0 = max(pc.get('floor', 0.25), 1 - pc.get('fade', 0.08) * k)
                ph = 2 * math.pi * k / pc.get('every', 4.5) + (gseed % 628) / 100 * pc.get('jitter', 0)
                amp = pc.get('ripple', 0) * (1 + pc.get('grow', 0) * k)
                pieces.append((band, {'c': (0, top - h / 2), 'sy': [t0, t0 * pc.get('thin', 0.5)],
                                      'tx': [0, amp * math.sin(ph)]}))
            top, k = b, k + 1
    else:
        sys.exit(f'pieces: unknown kind {kind}')

    fitted = [(_fit_field(field, g, fit, px), prm) for field, prm in pieces]
    a, b = positions[0], positions[-1]
    for p in positions:
        u = (p - a) / (b - a) if b > a else 1.0
        tr = at(recipe.get('track', 0), p)
        cs = []
        for cons, prm in fitted:
            cx, cy = prm.get('c', (0, 0))
            t = math.radians(_lerp(prm.get('rot', 0), u))
            R = np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])
            M = R @ np.diag([_lerp(prm.get('sx', 1), u), _lerp(prm.get('sy', 1), u)])
            ox, oy = cx + _lerp(prm.get('tx', 0), u) + tr, cy + _lerp(prm.get('ty', 0), u)
            for c in cons:
                q = np.array([pt for pt, _ in c]) - (cx, cy)
                q = q @ M.T + (ox, oy)
                cs.append([((float(x), float(y)), on) for (x, y), (_, on) in zip(q, c)])
        out['masters'][p] = {'contours': cs, 'adv': adv0 * W[0, 0] + 2 * tr, 'dev': 0.0}
    return out


def make_blocks(recipe, gname, positions, polys, adv0, out):
    """recipe.blocks: the letter compressed like a video frame: a quadtree of square blocks from
    `cell` units down to `min` (big blocks inside, small ones along the edge; a block is ink when
    more than `at` of it is covered). Along the axis the lowest edge of a fraction `p_drip` of the
    `min`-wide columns drips down by up to `drip` units (in `split` strands per column, lengths
    varying as smooth noise over `wave` units), and a fraction `p_slip` of the big blocks slide
    down by up to `slip`."""
    bc = recipe['blocks']
    S, m = bc['cell'], bc['min']
    K = S // m
    bleed = bc.get('bleed', 1.0)
    W = warp_matrix(recipe, positions[0])
    wp = [P @ W.T for P in polys]
    allp = np.concatenate(wp)
    x0 = math.floor(allp[:, 0].min() / S) * S - S
    y0 = math.ceil(allp[:, 1].max() / S) * S + S
    nw = int(math.ceil((allp[:, 0].max() - x0) / S)) + 1
    nh = int(math.ceil((y0 - allp[:, 1].min()) / S)) + 1
    g = Grid(x0, y0, nw * K, nh * K, m)
    ink = raster(wp, g, ss=8) > bc.get('at', 0.5)
    seed = recipe.get('seed', 1) * 7919 + zlib.crc32(gname.encode()) % 100000
    rng = np.random.default_rng(seed)
    rects = []                                     # (xa, xb, ya, yb, dy at full strength)

    def quad(r, c, k):
        sub = ink[r:r + k, c:c + k]
        if not sub.any():
            return
        if sub.all() or k == 1:
            if k == 1 and not sub.all():
                return
            slip = -rng.uniform(0.2, 1) * bc.get('slip', 0) if k > 1 and rng.random() < bc.get('p_slip', 0) else 0.0
            rects.append((x0 + c * m, x0 + (c + k) * m, y0 - (r + k) * m, y0 - r * m, slip))
            return
        h = k // 2
        for dr in (0, h):
            for dc in (0, h):
                quad(r + dr, c + dc, h)

    for R in range(nh):
        for C in range(nw):
            quad(R * K, C * K, K)
    split = bc.get('split', 2)
    wave = value_noise((1, g.w * split), bc.get('wave', 90) / (m / split), seed + 5, 2)[0]
    for c in range(g.w):
        col = np.nonzero(ink[:, c])[0]
        if not len(col) or rng.random() >= bc.get('p_drip', 0.6):
            continue
        bot = y0 - (col.max() + 1) * m
        for s in range(split):
            L = bc.get('drip', 200) * float(np.clip(0.5 + 0.9 * wave[c * split + s], 0.05, 1.0))
            xa = x0 + c * m + s * m / split
            rects.append((xa, xa + m / split, bot - L, bot + m / 2, 'drip'))
    lo, hi = positions[0], positions[-1]
    for p in positions:
        u = (p - lo) / (hi - lo) if hi > lo else 1.0
        tr = at(recipe.get('track', 0), p)
        cs = []
        for xa, xb, ya, yb, dy in rects:
            if dy == 'drip':                           # the strand grows out of the letter's edge
                top = yb
                yb_, ya_ = top, top - (top - ya) * u - m / 2 * (1 - u)
                cs.append(_rect(xa + tr - bleed, ya_ - bleed, xb + tr + bleed, yb_ + bleed))
            else:
                cs.append(_rect(xa + tr - bleed, ya + dy * u - bleed, xb + tr + bleed, yb + dy * u + bleed))
        out['masters'][p] = {'contours': cs, 'adv': adv0 * W[0, 0] + 2 * tr, 'dev': 0.0}
    return out


def add_dust(recipe, positions, f, g, seed, out):
    """recipe.dust: grains that the letter sheds. `n` round grains (radius `r` [min, max]) are
    taken from inside the ink, at least their radius and at most `band` units from the edge, so at
    the axis minimum they hide in the letter. Along the axis each drifts out along the edge normal
    by up to `reach` units (most stay close: distance ~ random**`power`), is carried by `wind`
    (dx, dy per unit of drift), and shrinks to `shrink` of its size. Grains are four off-curve points."""
    dc = recipe['dust']
    d = sdf(f) * g.px
    rng = np.random.default_rng(seed + 11)
    area = (f > 0.5).sum() * g.px ** 2
    n = int(np.clip(area * dc.get('density', 1e-4), dc.get('min_n', 6), dc.get('n', 40)))
    rmin, rmax = dc['r']
    gy, gx = np.gradient(d)
    grains = []
    for _ in range(n * 4):
        if len(grains) >= n:
            break
        r = rng.uniform(rmin, rmax)
        ok = np.argwhere((d > r + 2) & (d < dc.get('band', 40) + r))
        if not len(ok):
            continue
        rr, cc = ok[rng.integers(len(ok))]
        P = g.to_units(np.array([[rr + 0.5, cc + 0.5]]))[0]
        nv = np.array([-gx[rr, cc], gy[rr, cc]])      # outward, in units (rows run down)
        nv = nv / (np.linalg.norm(nv) + 1e-9)
        D = dc.get('reach', 120) * rng.random() ** dc.get('power', 1.6) + r + 4
        wx, wy = dc.get('wind', (0, 0))
        grains.append((P, (nv + (wx, wy)) * D, r))
    a, b = positions[0], positions[-1]
    for p in positions:
        u = (p - a) / (b - a) if b > a else 1.0
        tr = at(recipe.get('track', 0), p)
        for P, mv, r in grains:
            x, y = P + mv * u
            s = r * (1 + (dc.get('shrink', 0.6) - 1) * u) * 0.94
            out['masters'][p]['contours'].append(
                [((x + tr - s, y - s), False), ((x + tr - s, y + s), False),
                 ((x + tr + s, y + s), False), ((x + tr + s, y - s), False)])


def flow_warp(P, fc, u, seed, front=0.0):
    """recipe.flow: every traced sample moved by a smooth field, `u` (0..1) of the way.
    kind "drag": a long exposure. Each row of the letter is stretched back (to the left) from the
    glyph's leading edge `front` by up to `stretch` times its length; how far varies row by row in
    waves `cell` units tall (the same rows in every glyph, sharpened by `sharp`), so the front stays
    crisp and the back breaks into streaks. x moves by a function of x and y, y stays, and
    x' grows with x in every row, so an outline never crosses itself.
    kind "mirage": heat shimmer. Rows sway sideways by `amp` units in waves `wave` units tall
    whose phase drifts across the glyph over `xwave` units; the sway grows with height from
    `base` to `top` (to the power `power`), and the top also lifts by `rise`. The map moves x by
    a function of y (and slowly of x) and y by a function of y, so an outline never crosses itself."""
    x, y = P[:, 0], P[:, 1]
    if fc.get('kind') == 'drag':
        c = fc.get('cell', 60)
        wv = 0.6 * np.sin(2 * math.pi * y / c + 1.3) + 0.4 * np.sin(2 * math.pi * y / (c * 0.37) + 4.1)
        m = np.clip(0.5 + 0.5 * wv, 0, 1) ** fc.get('sharp', 1.5)
        s = fc['stretch'] * u * (fc.get('floor', 0.15) + (1 - fc.get('floor', 0.15)) * m)
        return np.stack([front - (front - x) * (1 + s), y], 1)
    if fc.get('kind', 'mirage') != 'mirage':
        sys.exit(f"flow: unknown kind {fc.get('kind')}")
    base, top = fc.get('base', 0), fc.get('top', 700)
    h = np.clip((y - base) / (top - base), 0, None) ** fc.get('power', 1.5)
    ph = 2 * math.pi * x / fc.get('xwave', 900) + (seed % 628) / 100 * fc.get('jitter', 1)
    dx = fc['amp'] * u * h * np.sin(2 * math.pi * y / fc['wave'] + ph)
    dy = fc.get('rise', 0) * u * h
    return np.stack([x + dx, y + dy], 1)


# ---------------------------------------------------------------------------------------------
# font assembly

def components(font, gname):
    """[(component, dx, dy)] for a plain composite (offsets only), else None."""
    g = font['glyf'][gname]
    if not g.isComposite():
        return None
    out = []
    for c in g.components:
        if hasattr(c, 'transform') or hasattr(c, 'firstPt'):   # scaled, or point-matched
            return None
        out.append((c.glyphName, c.x, c.y))
    return out


def glyph_order(recipe, font, chars):
    """Glyphs for the charset; composites (accented letters) stay composites and pull in their
    components, so an accent is processed once."""
    cmap = font.getBestCmap()
    uni, order = {}, ['.notdef']

    def add(g):
        if g in order:
            return
        comps = components(font, g) if recipe.get('composites', True) else None
        for c, _, _ in comps or []:
            add(c)
        order.append(g)

    for ch in chars:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        uni[ord(ch)] = g
        add(g)
    for a, b in recipe.get('swap', []):              # a base that draws a pair the wrong way round
        a, b = int(a, 16), int(b, 16)
        if a in uni and b in uni:
            uni[a], uni[b] = uni[b], uni[a]
    return order, uni


def tt_glyph(contours):
    pen = TTGlyphPen(None)
    for c in contours:
        if not c:
            continue
        pts = [(tuple(int(round(v)) for v in p), on) for p, on in c]
        if len(pts) > 1 and pts[-1][0] == pts[0][0]:     # the pen would drop it as a closing duplicate
            pts[-1] = ((pts[-1][0][0] + 1, pts[-1][0][1]), pts[-1][1])
        if not any(on for _, on in pts):
            pen.qCurveTo(*[p for p, _ in pts], None)
            pen.closePath()
            continue
        st = next(i for i, (_, on) in enumerate(pts) if on)
        pts = pts[st:] + pts[:st] + [pts[st]]
        pen.moveTo(pts[0][0])
        offs = []
        for p, on in pts[1:]:
            if on:
                if offs:
                    pen.qCurveTo(*offs, p)
                else:
                    pen.lineTo(p)
                offs = []
            else:
                offs.append(p)
        pen.closePath()
    return pen.glyph()


def notdef():
    pen = TTGlyphPen(None)
    for r in ((60, 0, 440, 700), (110, 50, 390, 650)):
        x0, y0, x1, y1 = r
        pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)] if r[0] == 60 else [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        pen.moveTo(pts[0]); [pen.lineTo(p) for p in pts[1:]]; pen.closePath()
    return pen.glyph()


def base_copyright(ofl_path):
    lines = []
    for line in ofl_path.read_text(encoding='utf-8', errors='replace').splitlines():
        if line.startswith('This Font Software is licensed'):
            break
        if line.strip():
            lines.append(line.strip())
    return ' '.join(lines)


def build_master(recipe, order, uni, glyphs, pos, vmetrics):
    fam = recipe['name']
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(uni)
    tt, hm = {'.notdef': notdef()}, {'.notdef': (500, 60)}
    for gname in order[1:]:
        m = glyphs[gname]['masters'][pos]
        if m.get('components'):
            pen = TTGlyphPen(set(order))
            for c, dx, dy in m['components']:
                pen.addComponent(c, (1, 0, 0, 1, int(round(dx)), int(round(dy))))
            tt[gname] = pen.glyph()
        else:
            tt[gname] = tt_glyph(m['contours'])
    fb.setupGlyf(tt)
    gl = fb.font['glyf']
    for gname in order[1:]:
        m = glyphs[gname]['masters'][pos]
        g = gl[gname]
        if g.numberOfContours:
            g.recalcBounds(gl)
        hm[gname] = (max(0, round(m['adv'])), getattr(g, 'xMin', 0))
    fb.setupHorizontalMetrics(hm)
    asc, desc, lg, top, bot = vmetrics
    fb.setupHorizontalHeader(ascent=top, descent=-bot, lineGap=0)
    ver = recipe.get('version', '1.000')
    _, ofl = base_paths(recipe)
    copy = f"{base_copyright(ofl)} Modifications copyright 2026 the hand-pulled contributors."
    ps = fam.replace(' ', '')
    fb.setupNameTable({
        'copyright': copy, 'familyName': fam, 'styleName': 'Regular',
        'uniqueFontIdentifier': f'{ver};HAND;{ps}-Regular', 'fullName': f'{fam} Regular',
        'psName': f'{ps}-Regular', 'version': f'Version {ver}',
        'manufacturer': 'hand-pulled', 'designer': 'hand-pulled foundry (tools/foundry.py)',
        'description': f"{recipe['about']} A Modified Version of {recipe['base']['family']} (SIL OFL 1.1).",
        'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
        'licenseInfoURL': 'https://openfontlicense.org',
    })
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=-desc, sTypoLineGap=lg, usWinAscent=top, usWinDescent=bot,
                fsSelection=0x40 | 0x80, achVendID='HAND', usWeightClass=400, version=4)
    fb.setupPost(keepGlyphNames=False)
    return fb.font


def vertical_metrics(recipe, font, scale, glyphs, positions):
    os2 = font['OS/2']
    sy = max(warp_matrix(recipe, p)[1, 1] for p in positions)
    asc = round(os2.sTypoAscender * scale * sy)
    desc = round(-os2.sTypoDescender * scale * sy)
    lg = round(os2.sTypoLineGap * scale)
    ys = [p[1] for gd in glyphs.values() for m in gd['masters'].values() for c in m['contours'] for p, _ in c]
    top = max(asc, math.ceil(max(ys, default=asc)) + 10)
    bot = max(desc, math.ceil(-min(ys, default=-desc)) + 10)
    return asc, desc, lg, top, bot


def out_dir(recipe):
    """skills/<skill>/fonts, or its subfolder `dir` (e.g. "candidates": faces on trial, with their
    own OFL.txt and <dir>.css, never listed in the skill's fonts.css)."""
    od = ROOT / 'skills' / recipe['skill'] / 'fonts'
    return od / recipe['dir'] if recipe.get('dir') else od


def build(name, chars=None, jobs=None, proof=False):
    recipe = load_recipe(name)
    t0 = time.time()
    font, scale = open_base(recipe)
    order, uni = glyph_order(recipe, font, chars or CHARSETS[recipe.get('charset', 'latin')])
    positions = sorted(int(p) for p in recipe['axis']['masters'])
    trace_pos = int(recipe.get('trace', positions[0]))
    work = [(recipe, gname, positions, trace_pos) for gname in order[1:]]
    with ProcessPoolExecutor(max_workers=jobs or os.cpu_count()) as ex:
        glyphs = {r['name']: r for r in ex.map(make_glyph, work, chunksize=2)}
    # A glyph whose projection broke (a hairline that tore) is frozen at its traced shape, so one
    # stray glyph cannot push the whole family to statics; it keeps each master's advance.
    for g in order[1:]:
        ms = glyphs[g]['masters']
        if ms[trace_pos].get('contours') and any(m['dev'] > recipe.get('glyph_limit', 40) for m in ms.values()):
            print(f"  {g}: projection failed (worst {max(m['dev'] for m in ms.values()):.0f} units), frozen at {trace_pos}")
            for p in positions:
                ms[p] = {**ms[trace_pos], 'adv': ms[p]['adv'], 'dev': 0.0}
    vm = vertical_metrics(recipe, font, scale, glyphs, positions)
    devs = {p: [glyphs[g]['masters'][p]['dev'] for g in order[1:]] for p in positions}
    worst = {p: max(((glyphs[g]['masters'][p]['dev'], g) for g in order[1:]), default=(0, '')) for p in positions}
    npts = [sum(len(c) for c in glyphs[g]['masters'][positions[0]]['contours']) for g in order[1:]]
    print(f"{recipe['name']}: {len(order)} glyphs in {time.time() - t0:.0f}s, {np.mean(npts):.0f} points per glyph")
    for p in positions:
        tag = 'traced' if p == trace_pos else 'projected'
        print(f"  {recipe['axis']['tag']} {p:4d} ({tag}): mean edge error {np.mean(devs[p]):.2f} units, "
              f"worst {worst[p][0]:.2f} ({worst[p][1]})")

    masters = {p: build_master(recipe, order, uni, glyphs, p, vm) for p in positions}
    od = out_dir(recipe)
    od.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / 'build' / recipe['id']
    tmp.mkdir(parents=True, exist_ok=True)
    limit = recipe.get('max_error', 4.0)
    ok_var = recipe.get('variable', True) and all(np.mean(devs[p]) <= limit for p in positions)
    for old in face_files(od, recipe):
        old.unlink()
    files = []
    if ok_var:
        vf = make_variable(recipe, masters, positions, tmp)
        vf.save(tmp / f"{recipe['file']}.ttf")
        vf.flavor = 'woff2'
        dest = od / f"{recipe['file']}.woff2"
        vf.save(dest)
        files.append(dest)
    else:
        statics = [int(p) for p in recipe.get('static', positions) if int(p) in masters]
        for p in statics:
            stem = recipe['file'] if len(statics) == 1 else f"{recipe['file']}-{p}"
            f = masters[p]
            f.save(tmp / f"{stem}.ttf")
            f.flavor = 'woff2'
            dest = od / f"{stem}.woff2"
            f.save(dest)
            files.append(dest)
    for f in files:
        print(f"  wrote {f.relative_to(ROOT)} ({f.stat().st_size / 1024:.1f} KB)")
    meta = {'variable': ok_var, 'files': [f.name for f in files], 'positions': positions,
            'error': {str(p): round(float(np.mean(devs[p])), 2) for p in positions}}
    (tmp / 'meta.json').write_text(json.dumps(meta, indent=1))
    write_ofl(recipe['skill'], recipe.get('dir'))
    write_css(recipe['skill'], recipe.get('dir'))
    if proof:
        make_proof(name)
    return meta


def make_variable(recipe, masters, positions, tmp):
    ax = recipe['axis']
    ds = DesignSpaceDocument()
    a = AxisDescriptor()
    a.tag, a.name, a.minimum, a.maximum = ax['tag'], ax['name'], positions[0], positions[-1]
    a.default = int(ax.get('default', positions[0]))
    if a.default not in positions:
        sys.exit(f"{recipe['id']}: the default {a.default} must be one of the master positions")
    ds.addAxis(a)
    for p in positions:
        s = SourceDescriptor()
        s.font = masters[p]
        s.location = {ax['name']: p}
        s.name = f'm{p}'
        ds.addSource(s)
    for label, p in ax.get('instances', {}).items():
        i = InstanceDescriptor()
        i.familyName, i.styleName = recipe['name'], label
        i.location = {ax['name']: p}
        ds.addInstance(i)
    vf, _, _ = varLib.build(ds, exclude=['MVAR'])
    vf['name'].setName(recipe['name'].replace(' ', ''), 25, 3, 1, 0x409)
    return vf


def write_ofl(skill, sub=None):
    od = ROOT / 'skills' / skill / 'fonts' / (sub or '')
    rs = [load_recipe(n) for n in all_recipes()]
    rs = [r for r in rs if r['skill'] == skill and r.get('dir') == sub and any(od.glob(f"{r['file']}*.woff2"))]
    if not rs:
        return
    names = ', '.join(r['name'] for r in rs)
    head = [f"Fonts in this folder: {names}.", '',
            'Each one is a Modified Version, made with tools/foundry.py in the hand-pulled repository:',
            'the base font is rasterised, processed as an image and traced back to outlines.', '']
    seen = set()
    for r in rs:
        b = r['base']
        _, ofl = base_paths(r)
        files = ', '.join(p.name for p in sorted(od.glob(f"{r['file']}*.woff2")))
        head += [f"{r['name']} ({files})",
                 f"  from {b['family']}, {b['repo']} @ {b['commit']}, {b['path']}",
                 f"  {base_copyright(ofl)}", '']
        seen.add(b['family'])
    head += ['Modifications copyright 2026 the hand-pulled contributors.', '',
             'Reserved Font Names: as the OFL requires of Modified Versions, our fonts carry our own',
             f"names ({names}) and use no Reserved Font Name of their bases",
             f"({', '.join(sorted(seen))}). We reserve no names for our own fonts.", '', '-' * 70, '']
    body = base_paths(rs[0])[1].read_text(encoding='utf-8', errors='replace')
    i = body.find('This Font Software is licensed')
    (od / 'OFL.txt').write_text('\n'.join(head) + '\n' + body[i:])


def face_files(od, recipe):
    """This face's .woff2 files: file.woff2 or file-<strength>.woff2 (so not sunprint-halo for sunprint)."""
    pat = re.escape(recipe['file']) + r'(-\d+)?\.woff2'
    return sorted(f for f in od.glob('*.woff2') if re.fullmatch(pat, f.name))


def write_css(skill, sub=None):
    od = ROOT / 'skills' / skill / 'fonts' / (sub or '')
    rs = [load_recipe(n) for n in all_recipes()]
    rs = [r for r in rs if r['skill'] == skill and r.get('dir') == sub]
    what = f'The {skill} {sub}' if sub else f'The {skill} faces'
    lines = [f'/* {what}, made by tools/foundry.py (SIL OFL 1.1, see OFL.txt). */', '']
    for r in rs:
        ax = r['axis']
        files = face_files(od, r)
        if not files:
            continue
        if len(files) == 1 and files[0].stem == r['file']:
            if r.get('variable', True):
                lines.append(f"/* {r['name']}: {r['about']} Axis '{ax['tag']}' 0–1000, default {ax.get('default', 0)}. */")
            else:
                lines.append(f"/* {r['name']}: {r['about']} Static. */")
            lines.append(f"@font-face {{ font-family: '{r['name']}'; src: url('{files[0].name}') format('woff2'); font-display: swap; }}")
        else:
            lines.append(f"/* {r['name']}: {r['about']} Static strengths as weights. */")
            for f in files:
                p = int(f.stem.rsplit('-', 1)[1])
                w = 100 + round(p / 1000 * 8) * 100
                lines.append(f"@font-face {{ font-family: '{r['name']}'; src: url('{f.name}') format('woff2'); font-weight: {w}; font-display: swap; }}")
        lines.append('')
    (od / (f'{sub}.css' if sub else 'fonts.css')).write_text('\n'.join(lines))


# ---------------------------------------------------------------------------------------------
# proof sheets (PNG, from the build's .ttf in the cache)

def make_proof(name, text=None, out=None):
    from PIL import Image, ImageDraw, ImageFont
    recipe = load_recipe(name)
    tmp = CACHE / 'build' / recipe['id']
    meta = json.loads((tmp / 'meta.json').read_text())
    text = text or 'Hamburg aegkrs\nABCDEFGHIJKLM\nnopqrstuvwxyz 0123'
    rows = []
    if meta['variable']:
        path = tmp / f"{recipe['file']}.ttf"
        for p in [0, 250, 500, 750, 1000]:
            f = ImageFont.truetype(str(path), 90)
            f.set_variation_by_axes([p])
            rows.append((f'{recipe["axis"]["tag"]} {p}', f))
    else:
        for fn in meta['files']:
            rows.append((fn, ImageFont.truetype(str(tmp / fn.replace('.woff2', '.ttf')), 90)))
    lines = text.split('\n')
    H = len(rows) * len(lines) * 120 + len(rows) * 40
    im = Image.new('L', (2400, H), 255)
    d = ImageDraw.Draw(im)
    y = 10
    for label, f in rows:
        d.text((10, y), label, fill=120)
        y += 30
        for ln in lines:
            d.text((20, y), ln, font=f, fill=0)
            y += 120
    dest = Path(out) if out else tmp / 'proof.png'
    im.save(dest)
    print(f'  proof {dest}')
    return dest


# ---------------------------------------------------------------------------------------------
# specimen pages (skills without a hand-made one): every face with a live axis and a test strip

SPECIMEN = {
    'pixelsort-glitch': {'bg': '#0b0b12', 'fg': '#f2f2f2', 'dim': '#8a8fa6', 'ink': '#ff3d8b', 'panel': '#15151f',
                         'word': 'Scanline', 'line': 'rows dragged out of the slit'},
    'riso-cartography': {'bg': '#f4efe4', 'fg': '#1d1d1d', 'dim': '#6b665c', 'ink': '#e8413b', 'ink2': '#1f6fb2',
                         'panel': '#ebe4d4', 'word': 'Riverside', 'line': 'walk the old course of the river',
                         'stack': ['Blockplan', 'Blockplan Drop']},
    'ethereal-haze': {'bg': '#f6e7da', 'fg': '#3a1c14', 'dim': '#9a6a5a', 'ink': '#e2553f', 'panel': '#f1d9c8',
                      'word': 'Poppy', 'line': 'the inside of a flower, too close'},
    'chrome-aurora': {'bg': '#07080a', 'fg': '#e9edf2', 'dim': '#7d8594', 'ink': '#9fe8ff', 'panel': '#111317',
                      'word': 'MERCURY', 'line': 'LIQUID LIGHT ON BLACK'},
    'abstract-texture': {'bg': '#d9d6cf', 'fg': '#141414', 'dim': '#5f5c56', 'ink': '#2b50ff', 'panel': '#cdc9c0',
                         'word': 'reverb', 'line': 'a surface seen through glass'},
    'indigo-grain': {'bg': '#1e3590', 'fg': '#f3f3ef', 'dim': '#cfd8f2', 'ink': '#f3f3ef', 'panel': '#111a4a',
                     'word': 'Tide', 'line': 'cobalt into white'},
}


def _esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def make_specimen(skill):
    od = ROOT / 'skills' / skill / 'fonts'
    th = SPECIMEN[skill]
    rs = [r for r in (load_recipe(n) for n in all_recipes()) if r['skill'] == skill and not r.get('dir') and face_files(od, r)]   # candidates stay off the specimen
    faces, strips, codes = [], [], []
    for i, r in enumerate(rs):
        ax, files = r['axis'], face_files(od, r)
        var = len(files) == 1 and files[0].stem == r['file'] and r.get('variable', True)
        fam = r['name']
        word = th['word']
        if var:
            tag, dflt = ax['tag'], int(ax.get('default', 0))
            inst = ', '.join(f"{k} {v}" for k, v in ax.get('instances', {}).items())
            live = ' live' if i == 0 else ''
            faces.append(f'''  <section class="face">
    <h2>{_esc(fam)} <span>{tag} 0–1000 · variable · {files[0].stat().st_size // 1024} KB</span></h2>
    <p class="note">{_esc(r['about'])}</p>
    <p class="sample{live}" id="s{i}" style="font-family:'{fam}';--v:{dflt};font-variation-settings:'{tag}' var(--v)">{_esc(word)}</p>
    <label class="dial"><span>{tag}</span><input type="range" min="0" max="1000" value="{dflt}" data-for="s{i}" aria-label="{_esc(ax['name'])}"><output>{'live' if live else dflt}</output></label>
    <p class="alpha" style="font-family:'{fam}';font-variation-settings:'{tag}' {dflt}">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 &amp;?! «éàöç»</p>
    <div class="strip">{''.join(f"""<div><p style="font-family:'{fam}';font-variation-settings:'{tag}' {v}">{_esc(word[:4])}</p><span>{tag} {v}</span></div>""" for v in (0, 250, 500, 750, 1000))}</div>
    <p class="meta">Named instances: {inst or 'none'}.</p>
  </section>''')
            codes.append(f".x{{font-family:'{fam}'; font-variation-settings:'{tag}' {dflt};}}")
        else:
            ws = [(100 + round(int(f.stem.rsplit('-', 1)[1]) / 1000 * 8) * 100, f) if f.stem != r['file'] else (400, f)
                  for f in files]
            faces.append(f'''  <section class="face">
    <h2>{_esc(fam)} <span>static · {' / '.join(f"{w}: {f.stat().st_size // 1024} KB" for w, f in ws)}</span></h2>
    <p class="note">{_esc(r['about'])}</p>
    <p class="sample" style="font-family:'{fam}';font-weight:{ws[-1][0]}">{_esc(word)}</p>
    <p class="alpha" style="font-family:'{fam}';font-weight:{ws[-1][0]}">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 &amp;?! «éàöç»</p>
    <div class="strip">{''.join(f"""<div><p style="font-family:'{fam}';font-weight:{w}">{_esc(word[:4])}</p><span>weight {w}</span></div>""" for w, _ in ws)}</div>
  </section>''')
            codes.append(f".x{{font-family:'{fam}'; font-weight:{ws[-1][0]};}}")
    stack = ''
    if th.get('stack') and all(any(r['name'] == n for r in rs) for n in th['stack']):
        front, back = th['stack']
        rb = next(r for r in rs if r['name'] == back)
        stack = f'''  <section class="face">
    <h2>Two inks <span>{_esc(front)} over {_esc(back)}, misregistered</span></h2>
    <p class="note">Set the same words twice at the same size: {_esc(back)} in the second ink underneath, {_esc(front)} on top, and nudge the lower layer a few hundredths of an em, as a second drum would.</p>
    <p class="stack" data-text="{_esc(th['line'])}" style="--b:'{back}';--f:'{front}'">{_esc(th['line'])}</p>
  </section>'''
        codes.append(f".two{{position:relative;font-family:'{front}';color:{th['ink']}}}\n"
                     f".two::before{{content:attr(data-text);position:absolute;inset:0;z-index:-1;font-family:'{back}';"
                     f"font-variation-settings:'{rb['axis']['tag']}' 400;color:{th['ink2']};mix-blend-mode:multiply;transform:translate(.02em,.015em)}}")
    first = rs[0]
    title = f"{first['name']} specimen" if len(rs) == 1 else f"{skill} type specimen"
    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(title)}</title>
<meta name="description" content="The {skill} display faces ({', '.join(r['name'] for r in rs)}), made by tools/foundry.py, each with its process axis.">
<link rel="stylesheet" href="fonts.css">
<style>
  @property --v {{ syntax: '<number>'; inherits: true; initial-value: 0; }}
  :root {{ --bg:{th['bg']}; --fg:{th['fg']}; --dim:{th['dim']}; --ink:{th['ink']}; --ink2:{th.get('ink2', th['dim'])}; --panel:{th['panel']};
          --gut:clamp(16px,4vw,56px); --mono:ui-monospace,'SF Mono',Menlo,monospace; --sans:system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif; }}
  * {{ box-sizing:border-box; }}
  html,body {{ margin:0; }}
  body {{ background:var(--bg); color:var(--fg); font:400 16px/1.5 var(--sans); overflow-x:hidden; }}
  main {{ padding:var(--gut); max-width:1400px; margin:0 auto; }}
  header {{ padding-bottom:28px; border-bottom:1px solid var(--dim); }}
  .kicker,.meta,.dial,.strip span,h2 span {{ font:400 12px/1.4 var(--mono); letter-spacing:.06em; text-transform:uppercase; color:var(--dim); }}
  .kicker {{ display:flex; flex-wrap:wrap; gap:8px 24px; }}
  h1 {{ font:700 13px/1.4 var(--mono); letter-spacing:.08em; text-transform:uppercase; margin:18px 0 0; }}
  .face {{ padding:clamp(36px,6vw,80px) 0; border-bottom:1px solid var(--dim); }}
  h2 {{ font:700 13px/1.4 var(--mono); letter-spacing:.08em; text-transform:uppercase; margin:0 0 14px; display:flex; flex-wrap:wrap; gap:6px 18px; }}
  .note {{ max-width:64ch; color:var(--dim); margin:0 0 24px; }}
  .sample {{ font-size:clamp(56px,15vw,220px); line-height:1; margin:0 0 20px; color:var(--ink); overflow-wrap:anywhere; }}
  .live {{ animation:sweep 8s ease-in-out infinite alternate; }}
  @keyframes sweep {{ 0%,8% {{ --v:0; }} 92%,100% {{ --v:1000; }} }}
  @media (prefers-reduced-motion: reduce) {{ .live {{ animation:none; }} }}
  .dial {{ display:grid; grid-template-columns:auto 1fr auto; gap:16px; align-items:center; max-width:640px; margin-bottom:32px; }}
  .dial input {{ width:100%; min-width:0; accent-color:var(--ink); }}
  .dial output {{ min-width:5ch; text-align:right; }}
  .alpha {{ font-size:clamp(26px,5.4vw,72px); line-height:1.15; margin:0 0 32px; overflow-wrap:anywhere; }}
  .strip {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); border:1px solid var(--dim); }}
  .strip div {{ container-type:inline-size; padding:18px 12px 12px; border-right:1px solid var(--dim); background:var(--panel); display:grid; gap:10px; overflow:hidden; }}
  .strip div:last-child {{ border-right:0; }}
  .strip p {{ font-size:26cqi; line-height:1; margin:0; white-space:nowrap; }}
  .stack {{ position:relative; isolation:isolate; font-family:var(--f); font-size:clamp(40px,9vw,140px); line-height:1.02; margin:0; color:var(--ink); }}
  .stack::before {{ content:attr(data-text); position:absolute; inset:0; z-index:-1; font-family:var(--b); color:var(--ink2); mix-blend-mode:multiply; transform:translate(.02em,.015em); }}
  pre {{ font:400 12.5px/1.6 var(--mono); background:var(--panel); padding:20px; overflow-x:auto; margin:0; white-space:pre; }}
  footer {{ padding:40px 0 8px; font:400 12px/1.6 var(--mono); color:var(--dim); }}
  footer a {{ color:var(--fg); }}
</style>
</head>
<body>
<main>
  <header>
    <div class="kicker"><span>hand-pulled foundry</span><span>{skill}</span><span>SIL OFL 1.1</span></div>
    <h1>{_esc(', '.join(r['name'] for r in rs))}: display faces, titles only</h1>
  </header>
{chr(10).join(faces)}
{stack}
  <section class="face">
    <h2>Set it</h2>
    <pre>&lt;link rel=&quot;stylesheet&quot; href=&quot;fonts/fonts.css&quot;&gt;

{_esc(chr(10).join(codes))}</pre>
  </section>
  <footer>Made by tools/foundry.py from {_esc(', '.join(sorted({r['base']['family'] for r in rs})))} (SIL OFL 1.1); our faces carry their own names. See <a href="OFL.txt">OFL.txt</a>.</footer>
</main>
<script>
  document.querySelectorAll('.dial input').forEach(function (inp) {{
    var el = document.getElementById(inp.dataset.for), out = inp.nextElementSibling;
    inp.addEventListener('input', function () {{ el.classList.remove('live'); el.style.setProperty('--v', inp.value); out.textContent = inp.value; }});
  }});
</script>
</body>
</html>
'''
    (od / 'specimen.html').write_text(html)
    print(f'  wrote {(od / "specimen.html").relative_to(ROOT)}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list')
    b = sub.add_parser('build')
    b.add_argument('names', nargs='+')
    b.add_argument('--chars', help='only these characters (a quick trial build)')
    b.add_argument('--jobs', type=int)
    b.add_argument('--proof', action='store_true')
    p = sub.add_parser('proof')
    p.add_argument('name')
    p.add_argument('--text')
    p.add_argument('--out')
    sp = sub.add_parser('specimen', help='write skills/<skill>/fonts/specimen.html from the recipes')
    sp.add_argument('skill')
    a = ap.parse_args()
    if a.cmd == 'list':
        for n in all_recipes():
            r = load_recipe(n)
            print(f"{n:12s} {r['name']:16s} {r['skill']:18s} {r['axis']['tag']}  {r['about']}")
    elif a.cmd == 'build':
        names = all_recipes() if a.names == ['all'] else a.names
        for n in names:
            build(n, a.chars, a.jobs, a.proof)
    elif a.cmd == 'proof':
        make_proof(a.name, a.text.replace('\\n', '\n') if a.text else None, a.out)
    elif a.cmd == 'specimen':
        make_specimen(a.skill)


if __name__ == '__main__':
    main()
