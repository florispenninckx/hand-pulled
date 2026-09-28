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

    fields = {p: process(polys, p, recipe, g, seed, gname) for p in positions}
    step = fit.get('step', 2.0 * px / 2)
    C = trace(fields[trace_pos], g, step, fit.get('min_area', 60))
    Wt = warp_matrix(recipe, trace_pos)
    Wt_inv = np.linalg.inv(Wt)
    # project in a chain outward from the traced position, each master from its neighbour
    chain = sorted(positions, key=lambda p: abs(p - trace_pos))
    per = {p: [] for p in positions}
    for P in C:
        per[trace_pos].append(P)
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
        ink = fields[p] > 0.5
        xor = np.logical_xor(mask, ink).sum() * px * px
        perim = sum(np.linalg.norm(np.diff(np.vstack([P, P[:1]]), axis=0), axis=1).sum() for P in per[p]) or 1
        cs = [[((float(q[0]) + tr, float(q[1])), on) for q, on in c] for c in contours[p]]
        out['masters'][p] = {'contours': cs, 'adv': adv0 * sx + 2 * tr, 'dev': float(xor / perim)}
    return out


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
    return ROOT / 'skills' / recipe['skill'] / 'fonts'


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
    write_ofl(recipe['skill'])
    write_css(recipe['skill'])
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


def write_ofl(skill):
    od = ROOT / 'skills' / skill / 'fonts'
    rs = [load_recipe(n) for n in all_recipes()]
    rs = [r for r in rs if r['skill'] == skill and any(od.glob(f"{r['file']}*.woff2"))]
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


def write_css(skill):
    od = ROOT / 'skills' / skill / 'fonts'
    rs = [load_recipe(n) for n in all_recipes()]
    rs = [r for r in rs if r['skill'] == skill]
    lines = [f'/* The {skill} faces, made by tools/foundry.py (SIL OFL 1.1, see OFL.txt). */', '']
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
    (od / 'fonts.css').write_text('\n'.join(lines))


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


if __name__ == '__main__':
    main()
