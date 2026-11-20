"""Low-level readers for the Home-Model.pdf plan sheet (plot 43).

All coordinates here are PDF page points (PyMuPDF convention: origin top-left, y down).
The sheet has two 1:100 viewports:
  * 'entrance' (left)  - "תכנית פיתוח קומת כניסה"
  * 'lower'    (right) - "תכנית פיתוח קומה תחתונה"
Both viewports are copies of the same site drawing shifted by VIEWPORT_DX points in x
(verified on the lot boundary, the building lines and the stair risers).

Run with the project venv:  data/build3d-venv/bin/python -I scripts/build3d/<script>.py
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass, field

import pymupdf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PDF_PATH = os.path.join(ROOT, 'data', 'build3d-src', 'Home-Model.pdf')

# 1:100 plot: 1 pt = 1/72 in on paper = 0.0254/72*100 m in reality.
METERS_PER_PT_NOMINAL = 0.0254 / 72 * 100  # 0.0352777...

# Drawing frames (thick 1.68 pt rectangles) of the two viewports.
FRAME = {
    'entrance': (181.36, 209.12, 939.88, 1321.52),
    'lower': (966.16, 209.12, 1724.80, 1321.52),
}
VIEWPORT_DX = 784.80  # lower = entrance + DX (same y)

RED = (1.0, 0.0, 0.0)
BLUE = (0.0, 0.0, 1.0)
BLACK = (0.0, 0.0, 0.0)


def viewport_of(x: float) -> str:
    return 'entrance' if x < 952 else 'lower'


def load_page():
    doc = pymupdf.open(PDF_PATH)
    return doc, doc[0]


_DRAWINGS = None


def drawings():
    global _DRAWINGS
    if _DRAWINGS is None:
        _, page = load_page()
        _DRAWINGS = page.get_drawings()
    return _DRAWINGS


def _same(c, ref, tol=0.02):
    return c is not None and all(abs(a - b) < tol for a, b in zip(c, ref))


@dataclass
class Rect:
    x0: float
    y0: float
    x1: float
    y1: float
    mat: str  # 'block' (red fill) | 'concrete' (blue fill)
    vp: str
    sliver: bool = False

    @property
    def w(self):
        return self.x1 - self.x0

    @property
    def h(self):
        return self.y1 - self.y0


def wall_fill_rects() -> list[Rect]:
    """Red / blue filled wall pieces (AutoCAD solid hatches), both viewports.

    The lot boundary is also drawn as blue filled triangle strips; those are excluded
    (they are long and not axis aligned)."""
    out: list[Rect] = []
    for d in drawings():
        f = d.get('fill')
        if not (_same(f, RED) or _same(f, BLUE)):
            continue
        r = d['rect']
        if r.width > 60 and r.height > 60:
            continue  # lot boundary strips
        if len(d['items']) > 8:
            continue  # boundary strips (long triangle strips)
        mat = 'block' if _same(f, RED) else 'concrete'
        sliver = r.width < 2.5 and r.height < 2.5 or (min(r.width, r.height) < 0.5)
        out.append(Rect(round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2), mat,
                        viewport_of(r.x0), sliver))
    return out


def lot_boundary_strips():
    """Centerline points of the thick blue lot-boundary band, per viewport.

    The band is drawn as filled triangle strips whose vertices alternate between the two
    edges of the band; midpoints of consecutive vertex pairs give the centerline."""
    res = {'entrance': [], 'lower': []}
    for d in drawings():
        if not _same(d.get('fill'), BLUE):
            continue
        r = d['rect']
        if not (r.width > 60 or r.height > 60):
            continue
        if len(d['items']) < 6:
            continue
        # unique vertices in order of appearance
        verts = []
        for it in d['items']:
            for p in it[1:]:
                q = (round(p.x, 2), round(p.y, 2))
                if q not in verts:
                    verts.append(q)
        mids = []
        for i in range(0, len(verts) - 1, 2):
            a, b = verts[i], verts[i + 1]
            mids.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
        res[viewport_of(r.x0)].append(mids)
    return res


def stroke_segments(color=None, width=None, wtol=0.01, bbox=None):
    """All straight segments of stroked paths filtered by color / width / bbox."""
    out = []
    for d in drawings():
        if d['type'] not in ('s', 'fs'):
            continue
        c = d.get('color')
        if color is not None and not _same(c, color):
            continue
        w = d.get('width') or 0
        if width is not None and abs(w - width) > wtol:
            continue
        for it in d['items']:
            if it[0] == 'l':
                a, b = it[1], it[2]
                if bbox and not (bbox[0] <= a.x <= bbox[2] and bbox[1] <= a.y <= bbox[3]):
                    continue
                out.append((a.x, a.y, b.x, b.y, w))
    return out


def curves(bbox=None):
    """Bezier curve items (door swings, circles), returned as (p0, p1, p2, p3, width, color)."""
    out = []
    for d in drawings():
        for it in d['items']:
            if it[0] == 'c':
                p0 = it[1]
                if bbox and not (bbox[0] <= p0.x <= bbox[2] and bbox[1] <= p0.y <= bbox[3]):
                    continue
                out.append((it[1], it[2], it[3], it[4], d.get('width') or 0, d.get('color')))
    return out


def chain_polylines(segs, tol=0.6):
    """Greedy chaining of segments (x0,y0,x1,y1,...) into polylines."""
    segs = [((s[0], s[1]), (s[2], s[3])) for s in segs]
    used = [False] * len(segs)
    lines = []
    for i, (a, b) in enumerate(segs):
        if used[i]:
            continue
        used[i] = True
        pl = [a, b]
        grown = True
        while grown:
            grown = False
            for j, (c, d) in enumerate(segs):
                if used[j]:
                    continue
                if math.dist(pl[-1], c) < tol:
                    pl.append(d)
                elif math.dist(pl[-1], d) < tol:
                    pl.append(c)
                elif math.dist(pl[0], d) < tol:
                    pl.insert(0, c)
                elif math.dist(pl[0], c) < tol:
                    pl.insert(0, d)
                else:
                    continue
                used[j] = True
                grown = True
        lines.append(pl)
    return lines


def spot_markers():
    """Centers of the spot-elevation symbols (circle with two black quadrant fills).

    Returns list of (x, y) in page points. Each symbol has two clusters of small black fills
    (opposite quadrants); the symbol center is the midpoint between the cluster centers."""
    pts = []
    for d in drawings():
        if not _same(d.get('fill'), BLACK):
            continue
        r = d['rect']
        if r.width < 3 and r.height < 3:
            pts.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
    clusters: list[list[tuple[float, float]]] = []
    for p in pts:
        for c in clusters:
            if abs(c[0][0] - p[0]) < 4 and abs(c[0][1] - p[1]) < 4:
                c.append(p)
                break
        else:
            clusters.append([p])
    cents = [(sum(q[0] for q in c) / len(c), sum(q[1] for q in c) / len(c), len(c)) for c in clusters]
    return cents
