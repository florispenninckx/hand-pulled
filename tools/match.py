#!/usr/bin/env python3
"""Measure each skill's plates against its Pinterest board.

    python3 tools/match.py [skill ...]        (after `node tools/grab.mjs`)

Reads match-out/grabs/<skill>/ (from grab.mjs) and pins-ref/<board>/NN.jpg, and writes
MATCH_<date>.md plus match-out/sheet_<skill>.jpg: each plate next to its three nearest pins, and
the board's uncovered pins in a strip at the bottom. A dev tool (PIL + numpy), not an engine
dependency; match-out/ and MATCH_*.md are in .git/info/exclude.

Every image is measured at 512 px wide (smaller plates at their own width):
  palette      six Lab colours (k-means) with their shares
  L, Lsd       mean and spread of lightness (0-100)
  dark, light  share of pixels with L < 20 and L > 80
  chroma       mean Lab chroma
  hue          12-bin hue histogram (Lab h, 30 degree steps), weighted by chroma
  grain        std of (L - L blurred at sigma 1.5 px)
  edges        share of pixels whose blurred L gradient exceeds 4 per px
  streak       log2(mean |dL/dy| / mean |dL/dx|): below 0 runs vertical (drips, columns),
               above 0 runs horizontal (bands, slit-scan rows)

Distance between two images is the sum of three terms, each divided by its median over all pin
pairs so they weigh the same: palette (mean nearest-colour Delta E, both ways, share-weighted),
hue (L1 between histograms), and scalars (RMS of z-scores, z taken over all pins).
A pin is a gap when no plate is as close to it as the board's pins are to each other: the
median, over the board, of each pin's distance to its nearest other pin.
"""
import datetime
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'match-out')
PINS = os.path.join(ROOT, 'pins-ref')
BOARD = {'abstract-texture': 'abstract-texture', 'chrome-aurora': 'chrome-aurora',
         'ethereal-haze': 'ethereal-haze', 'indigo-grain': 'indigo-grain',
         'maximalist-boc': 'maximalist-boc', 'pixelsort-glitch': 'pixel-glitch',
         'riso-cartography': 'riso-cartography'}
SCALARS = ['L', 'Lsd', 'dark', 'light', 'chroma', 'grain', 'edges', 'streak']
HUES = ['pink', 'red', 'orange', 'ochre', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue',
        'violet', 'magenta']  # rough names for Lab h in 30 degree bins from 0
WIDTH = 512
FEATURE_VERSION = 1


# ---- measuring ---------------------------------------------------------------------------------

def to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722],
                        [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], -1)


def blur(a, sigma=1.5):
    r = int(3 * sigma + 0.5)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    for axis in (0, 1):
        p = np.pad(a, [(r, r) if i == axis else (0, 0) for i in (0, 1)], mode='reflect')
        n = a.shape[axis]
        a = sum(w * np.take(p, np.arange(i, i + n), axis=axis) for i, w in enumerate(k))
    return a


def kmeans(x, k=6, iters=25, seed=0):
    rng = np.random.default_rng(seed)
    c = [x[rng.integers(len(x))]]
    for _ in range(k - 1):  # k-means++ seeding
        d = np.min(((x[:, None] - np.array(c)[None]) ** 2).sum(-1), 1)
        c.append(x[rng.choice(len(x), p=d / d.sum())] if d.sum() > 0 else x[rng.integers(len(x))])
    c = np.array(c)
    for _ in range(iters):
        lab = np.argmin(((x[:, None] - c[None]) ** 2).sum(-1), 1)
        new = np.array([x[lab == j].mean(0) if np.any(lab == j) else c[j] for j in range(k)])
        if np.allclose(new, c, atol=0.05):
            break
        c = new
    w = np.bincount(lab, minlength=k) / len(x)
    order = np.argsort(-w)
    return c[order], w[order]


def measure(path):
    im = Image.open(path).convert('RGB')
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    lab = to_lab(np.asarray(im, dtype=np.float64))
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    chroma = np.hypot(a, b)
    hue = (np.degrees(np.arctan2(b, a)) + 360) % 360
    hist = np.bincount((hue // 30).astype(int).ravel() % 12, weights=chroma.ravel(), minlength=12)
    hist = hist / hist.sum() if hist.sum() > 1e-6 else hist
    Lb = blur(L)
    gy, gx = np.gradient(Lb)
    flat = lab.reshape(-1, 3)
    sample = flat[np.random.default_rng(1).choice(len(flat), min(4000, len(flat)), replace=False)]
    pal, share = kmeans(sample)
    return {
        'w': im.width, 'palette': pal.round(2).tolist(), 'share': share.round(4).tolist(),
        'hue': hist.round(4).tolist(),
        'L': float(L.mean()), 'Lsd': float(L.std()),
        'dark': float((L < 20).mean()), 'light': float((L > 80).mean()),
        'chroma': float(chroma.mean()), 'grain': float((L - Lb).std()),
        'edges': float((np.hypot(gx, gy) > 4).mean()),
        'streak': float(np.log2((np.abs(gy).mean() + 1e-3) / (np.abs(gx).mean() + 1e-3))),
    }


def measure_cached(paths, cache_file):
    cache = {}
    if os.path.exists(cache_file):
        cache = json.load(open(cache_file))
        if cache.get('_v') != FEATURE_VERSION:
            cache = {}
    cache['_v'] = FEATURE_VERSION
    out = []
    for p in paths:
        key = os.path.relpath(p, ROOT)
        stamp = os.path.getmtime(p)
        if key not in cache or cache[key]['mtime'] != stamp:
            cache[key] = {'mtime': stamp, 'f': measure(p)}
        out.append(cache[key]['f'])
    json.dump(cache, open(cache_file, 'w'))
    return out


# ---- comparing ---------------------------------------------------------------------------------

def palette_d(f, g):
    pf, pg = np.array(f['palette']), np.array(g['palette'])
    d = np.sqrt(((pf[:, None] - pg[None]) ** 2).sum(-1))
    return 0.5 * (np.dot(f['share'], d.min(1)) + np.dot(g['share'], d.min(0)))


def hue_d(f, g):
    return float(np.abs(np.array(f['hue']) - np.array(g['hue'])).sum())


class Metric:
    """Distance with each term scaled by its median over all pin pairs."""

    def __init__(self, pins):
        s = np.array([[p[k] for k in SCALARS] for p in pins])
        self.mu, self.sd = s.mean(0), s.std(0) + 1e-9
        rng = np.random.default_rng(2)
        pairs = [tuple(rng.choice(len(pins), 2, replace=False)) for _ in range(2000)]
        self.scale = [1.0, 1.0, 1.0]
        terms = np.array([self.terms(pins[i], pins[j]) for i, j in pairs])
        self.scale = np.median(terms, 0)

    def z(self, f):
        return (np.array([f[k] for k in SCALARS]) - self.mu) / self.sd

    def terms(self, f, g):
        t = [palette_d(f, g), hue_d(f, g), float(np.sqrt(((self.z(f) - self.z(g)) ** 2).mean()))]
        return [a / s for a, s in zip(t, self.scale)]

    def __call__(self, f, g):
        return float(sum(self.terms(f, g)))


def words(f):
    """A few words that say what an image is, from its numbers."""
    w = ['dark' if f['L'] < 35 else 'light' if f['L'] > 70 else 'mid']
    if f['chroma'] < 8:
        w.append('grey')
    else:
        h = np.array(f['hue'])
        top = [HUES[i] for i in np.argsort(-h)[:2] if h[i] > 0.2]
        w.append('+'.join(top) if top else 'mixed hues')
        if f['chroma'] > 40:
            w.append('saturated')
    if f['grain'] > 6:
        w.append('grainy')
    elif f['grain'] < 1.5:
        w.append('smooth')
    if f['streak'] < -0.6:
        w.append('vertical')
    elif f['streak'] > 0.6:
        w.append('horizontal')
    if f['edges'] > 0.35:
        w.append('busy')
    return ', '.join(w)


# ---- output ------------------------------------------------------------------------------------

def font(size):
    for f in ('/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def thumb(path, h):
    im = Image.open(path).convert('RGB')
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def sheet(skill, plates, pins, near, gaps, path):
    H, pad, F = 170, 10, font(15)
    rows = []
    for i, p in enumerate(plates):
        tiles = [(thumb(p['path'], H), f'plate {i}')]
        tiles += [(thumb(pins[j]['path'], H), f'pin {pins[j]["n"]}  d {d:.2f}') for j, d in near[i]]
        rows.append(tiles)
    if gaps:
        rows.append([(thumb(pins[j]['path'], H), f'gap: pin {pins[j]["n"]}') for j, _ in gaps[:8]])
    width = max(sum(t.width + pad for t, _ in r) for r in rows) + pad
    out = Image.new('RGB', (width, len(rows) * (H + 30) + pad), (245, 244, 240))
    g = ImageDraw.Draw(out)
    for y, r in enumerate(rows):
        x = pad
        top = pad + y * (H + 30)
        for k, (t, label) in enumerate(r):
            out.paste(t, (x, top))
            g.text((x, top + H + 4), label, fill=(20, 20, 20), font=F)
            x += t.width + pad
            if k == 0 and y < len(plates):
                g.line([(x - pad // 2, top), (x - pad // 2, top + H)], fill=(160, 160, 160), width=2)
                x += pad
    out.save(path, quality=86)


def fmt(k, v):
    return f'{v:.2f}' if k in ('dark', 'light', 'edges', 'streak') else f'{v:.1f}'


def report(skill, plates, pins, near, gaps, cover, lo, hi):
    board = BOARD[skill]
    lines = [f'## {skill} (board: {board}, {len(pins)} pins, {len(plates)} plates)', '']
    # scalar bands
    med = {k: float(np.median([p['f'][k] for p in plates])) for k in SCALARS}
    lines += ['Board band is the 10-90 % range over its pins. "Out" counts plates outside it.', '',
              '| metric | board 10 % | board 90 % | plate median | out low | out high |',
              '|---|---|---|---|---|---|']
    for k in SCALARS:
        vs = [p['f'][k] for p in plates]
        lines.append(f'| {k} | {fmt(k, lo[k])} | {fmt(k, hi[k])} | {fmt(k, med[k])} | '
                     f'{sum(v < lo[k] for v in vs)} | {sum(v > hi[k] for v in vs)} |')
    bh = np.mean([p['f']['hue'] for p in pins], 0)
    ph = np.mean([p['f']['hue'] for p in plates], 0)
    lines += ['', 'Hue share (chroma-weighted), board vs plates: ' + ', '.join(
        f'{HUES[i]} {bh[i]:.0%}/{ph[i]:.0%}' for i in np.argsort(-(bh + ph))[:6]) + '.', '']
    # plates
    lines += ['| plate | section | what the numbers say | nearest pins (distance) | outside the band |',
              '|---|---|---|---|---|']
    for i, p in enumerate(plates):
        out = [f'{k} {"low" if p["f"][k] < lo[k] else "high"}' for k in SCALARS
               if not lo[k] <= p['f'][k] <= hi[k]]
        nn = ', '.join(f'{pins[j]["n"]} ({d:.2f})' for j, d in near[i])
        lines.append(f'| {i} | {p["section"]} | {words(p["f"])} | {nn} | {", ".join(out) or "none"} |')
    # gaps
    lines += ['', f'Gaps: {len(gaps)} of {len(pins)} pins have no plate within {cover:.2f} '
              '(the median distance from a pin on this board to its nearest other pin).', '']
    if gaps:
        lines += ['| pin | nearest plate (distance) | what the numbers say |', '|---|---|---|']
        for j, (d, i) in sorted(((j, x) for j, x in gaps), key=lambda t: -t[1][0]):
            lines.append(f'| {pins[j]["n"]} | {i} ({d:.2f}) | {words(pins[j]["f"])} |')
    lines.append('')
    return lines


def main():
    skills = sys.argv[1:] or sorted(BOARD)
    os.makedirs(OUT, exist_ok=True)
    cache = os.path.join(OUT, 'features.json')
    # every pin of every board, so z-scores and term scales are shared across skills
    allpins = []
    for board in sorted(set(BOARD.values())):
        d = os.path.join(PINS, board)
        for f in sorted(os.listdir(d)):
            if f.endswith('.jpg') and f[:2].isdigit():
                allpins.append({'board': board, 'n': int(f[:2]), 'path': os.path.join(d, f)})
    for p, f in zip(allpins, measure_cached([p['path'] for p in allpins], cache)):
        p['f'] = f
    metric = Metric([p['f'] for p in allpins])

    today = datetime.date.today().isoformat()
    md = [f'# Plates against boards, {today}', '',
          'Made by `node tools/grab.mjs && python3 tools/match.py`; the sheets are '
          '`match-out/sheet_<skill>.jpg`. Distances are unitless: about 3 is a typical pair of '
          'pins from all boards, lower is closer. The measures are defined at the top of '
          'tools/match.py.', '']
    summary = ['| skill | plates | median distance to nearest pin | plates out of band on 3+ metrics | gap pins |',
               '|---|---|---|---|---|']
    body = []
    for skill in skills:
        gdir = os.path.join(OUT, 'grabs', skill)
        man = json.load(open(os.path.join(gdir, 'manifest.json')))
        plates = [dict(m, path=os.path.join(gdir, m['file'])) for m in man['plates']]
        for p, f in zip(plates, measure_cached([p['path'] for p in plates], cache)):
            p['f'] = f
        pins = [p for p in allpins if p['board'] == BOARD[skill]]
        D = np.array([[metric(p['f'], q['f']) for q in pins] for p in plates])
        near = [[(int(j), float(D[i, j])) for j in np.argsort(D[i])[:3]] for i in range(len(plates))]
        P = np.array([[metric(p['f'], q['f']) for q in pins] for p in pins])
        np.fill_diagonal(P, np.inf)
        cover = float(np.median(P.min(1)))
        best = D.min(0)
        gaps = [(int(j), (float(best[j]), int(D[:, j].argmin()))) for j in range(len(pins)) if best[j] > cover]
        gaps.sort(key=lambda t: -t[1][0])
        lo = {k: float(np.percentile([p['f'][k] for p in pins], 10)) for k in SCALARS}
        hi = {k: float(np.percentile([p['f'][k] for p in pins], 90)) for k in SCALARS}
        sheet(skill, plates, pins, near, gaps, os.path.join(OUT, f'sheet_{skill}.jpg'))
        body += report(skill, plates, pins, near, gaps, cover, lo, hi)
        n_out = sum(sum(not lo[k] <= p['f'][k] <= hi[k] for k in SCALARS) >= 3 for p in plates)
        summary.append(f'| {skill} | {len(plates)} | {float(np.median(D.min(1))):.2f} | {n_out} | '
                       f'{len(gaps)} of {len(pins)} |')
        print(f'{skill:18} {len(plates):2} plates, median nearest {np.median(D.min(1)):.2f}, '
              f'{len(gaps)} gap pins')
    path = os.path.join(ROOT, f'MATCH_{today}.md')
    open(path, 'w').write('\n'.join(md + summary + [''] + body))
    print(f'wrote {os.path.relpath(path, ROOT)} and match-out/sheet_<skill>.jpg')


if __name__ == '__main__':
    main()
