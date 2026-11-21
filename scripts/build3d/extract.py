"""Build house.json + overlay.json for the /3d demo from the plot-43 plan sheet.

Usage (from repo root):
  data/build3d-venv/bin/python -I scripts/build3d/extract.py

Inputs : data/build3d-src/Home-Model.pdf (copy of the AutoCAD sheet) + plan_data.py / site_data.py
Outputs: apps/web/lib/build3d/house/house.json, apps/web/lib/build3d/house/overlay.json
See docs/build3d/extraction.md for the method and every assumption.
"""
from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from shapely.geometry import Point, Polygon, LineString, box
from shapely.ops import unary_union

import pdfplan
from pdfplan import ROOT, FRAME, VIEWPORT_DX
import plan_data as PD
import site_data as SD

OUT_DIR = os.path.join(ROOT, 'apps', 'web', 'lib', 'build3d', 'house')

# ---------------------------------------------------------------------------------------
# Frame & calibration
# ---------------------------------------------------------------------------------------
# Model origin = outer north-west corner of the entrance floor (corner column C-E1),
# page point (422.92, 562.76) in the left viewport; the right viewport is the same drawing
# shifted by VIEWPORT_DX.
ORIGIN = {'entrance': (422.92, 562.76), 'lower': (422.92 + VIEWPORT_DX, 562.76)}

# Written dimension (cm) -> measured span between the two wall faces it refers to (page pts)
CALIB = [
    (430, 431.44, 553.24),   # ממ"ד width
    (300, 951.08, 1036.16),  # ממ"ד depth
    (460, 428.56, 559.00),   # master bedroom width
    (340, 568.52, 664.88),   # master bedroom depth
    (330, 428.56, 522.16),   # walk-in closet
    (200, 667.64, 724.40),   # walk-in closet depth
    (170, 727.16, 775.40),   # master shower depth
    (500, 578.80, 720.52),   # living room width
    (800, 656.36, 883.16),   # living + dining depth
    (490, 559.00, 697.84),   # kitchen width
    (440, 883.16, 1007.84),  # kitchen depth
    (300, 431.44, 516.40),   # guest shower width
    (160, 900.08, 945.44),   # guest shower depth
    (320, 1224.76, 1315.48),  # lower bedroom 1 width
    (360, 574.16, 676.16),   # lower bedroom 1 depth
    (410, 1389.16, 1505.32),  # lower bedroom 2 width
    (300, 579.80, 664.76),   # lower bedroom 2 depth
    (290, 1423.12, 1505.32),  # lower bedroom 3 width
    (400, 667.52, 780.92),   # lower bedroom 3 depth
    (350, 1406.20, 1505.32),  # lower bedroom 3 (lower part)
    (170, 1355.20, 1403.32),  # lower shower width
    (200, 724.28, 780.92),   # lower shower depth
]


def calibrate():
    cm = np.array([c[0] for c in CALIB], float) / 100.0
    pt = np.array([c[2] - c[1] for c in CALIB], float)
    k = float((cm @ pt) / (pt @ pt))  # least squares through origin
    resid = cm - k * pt
    return k, float(np.abs(resid).max()), float(np.sqrt((resid ** 2).mean()))


K_FIT, CAL_MAX, CAL_RMS = calibrate()
K = pdfplan.METERS_PER_PT_NOMINAL  # exact 1:100 (fit agrees to <0.05 %)


def r3(v):
    return round(float(v), 3)


def to_m(vp, x, y):
    ox, oy = ORIGIN[vp]
    return [r3((x - ox) * K), r3((y - oy) * K)]


def poly_m(vp, pts):
    return [to_m(vp, x, y) for x, y in pts]


def snap_t(t_pt):
    t = t_pt * K
    return round(round(t / 0.05) * 0.05, 2)


# ---------------------------------------------------------------------------------------
# Levels & heights (assumptions, see extraction.md)
# ---------------------------------------------------------------------------------------
LOWER_FFL = -3.25          # drawing: "-3.25 = 268.25 מבוקש"
ENTR_FFL = 0.00            # ±0.00 = 271.50
FINISH = 0.08              # tiles + mortar bed over structural slab
LOWER_SLAB_T = 0.20        # slab on grade, lower floor
ENTR_SLAB_T = 0.25         # entrance slab (suspended over the lower floor)
ROOF_TOP = 3.30            # top of roof structural slab
ROOF_SLAB_T = 0.25
PARAPET_H = 1.00
LOWER_WALL_BASE = LOWER_FFL - FINISH                  # -3.33
ENTR_SLAB_TOP = ENTR_FFL - FINISH                     # -0.08
ENTR_SLAB_BOTTOM = ENTR_SLAB_TOP - ENTR_SLAB_T        # -0.33
ROOF_SLAB_BOTTOM = ROOF_TOP - ROOF_SLAB_T             # 3.05
LOWER_WALL_H = ENTR_SLAB_BOTTOM - LOWER_WALL_BASE     # 3.00
ENTR_WALL_H = ROOF_SLAB_BOTTOM - ENTR_SLAB_TOP        # 3.13
TERRACE_FFL = -0.02
TERRACE_SLAB_TOP = -0.12

OPEN_DEFAULTS = {  # (sill, head) relative to the level floor
    'window': (0.95, 2.20),
    'vitrine': (0.00, 2.40),
    'sliding-door': (0.00, 2.40),
    'door': (0.00, 2.10),
    'entry-door': (0.00, 2.20),
    'mamad-door': (0.00, 2.00),
    'mamad-window': (1.00, 2.00),
    'opening': (0.00, 2.10),
}


def level_of(wid):
    return 'lower' if wid.startswith('L-') else ('site' if wid.startswith('S-') else 'entrance')


# ---------------------------------------------------------------------------------------
# Walls, openings, columns
# ---------------------------------------------------------------------------------------
def wall_geom(w):
    wid, vp, o, band, span, mat, role, ops = w
    mid = (band[0] + band[1]) / 2
    if o == 'H':
        a = to_m(vp, span[0], mid)
        b = to_m(vp, span[1], mid)
        rect = (span[0], band[0], span[1], band[1])
    else:
        a = to_m(vp, mid, span[0])
        b = to_m(vp, mid, span[1])
        rect = (band[0], span[0], band[1], span[1])
    return a, b, rect


SITE_WALL_HEIGHTS = {  # id -> (baseY, top)
    'S-E1': (-3.40, 0.20),
    'S-W1': (-1.70, 0.20),
    'S-W2': (-1.85, 0.20),
    'S-W3': (-1.85, 0.20),
}


def door_swing(vp, o, band, lo, hi):
    """Find the door swing arc next to an opening; return +1/-1 along the wall normal.

    Wall direction is +X for H walls and +Z for V walls; normal n = (-uz, ux):
    H wall -> n = (0, +1) (toward +Z / drawing down); V wall -> n = (-1, 0) (toward -X)."""
    # The swing arcs are drawn as dashed polylines (many short 0.72 pt segments). Every short
    # segment whose distance to one of the two jambs is ~ the door width votes for its side.
    mid = (band[0] + band[1]) / 2
    half = (band[1] - band[0]) / 2
    w = hi - lo
    if o == 'H':
        bb = (lo - 4, mid - w - 6, hi + 4, mid + w + 6)
        hinges = [(lo, mid), (hi, mid)]
    else:
        bb = (mid - w - 6, lo - 4, mid + w + 6, hi + 4)
        hinges = [(mid, lo), (mid, hi)]
    # 1) door handles (tiny 0.36 pt symbols at the free end of the open leaf, next to the hinge
    #    jamb along the wall, ~w away from the wall)
    hv = {1: 0, -1: 0}
    for x0, y0, x1, y1, width in pdfplan.stroke_segments(color=pdfplan.BLACK, bbox=bb):
        if abs(width - 0.36) > 0.02 or math.hypot(x1 - x0, y1 - y0) > 3.5:
            continue
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        along, off = (mx, my - mid) if o == 'H' else (my, mx - mid)
        if min(abs(along - lo), abs(along - hi)) > 0.3 * w or not (0.5 * w < abs(off) < 1.2 * w):
            continue
        side = (1 if off > 0 else -1) if o == 'H' else (-1 if off > 0 else 1)
        hv[side] += 1
    if max(hv.values()) >= 3 and hv[1] != hv[-1]:
        return 1 if hv[1] > hv[-1] else -1
    # 2) fallback: the dashed swing arc
    votes = {1: 0, -1: 0}
    for x0, y0, x1, y1, width in pdfplan.stroke_segments(color=pdfplan.BLACK, bbox=bb):
        if math.hypot(x1 - x0, y1 - y0) > 3.0 or abs(width - 0.72) > 0.02:
            continue
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        if not (bb[0] <= mx <= bb[2] and bb[1] <= my <= bb[3]):
            continue
        off = (my - mid) if o == 'H' else (mx - mid)
        if abs(off) < half + 1.0:
            continue
        d = min(math.dist((mx, my), hp) for hp in hinges)
        if abs(d - w) > 0.2 * w:
            continue
        side = (1 if off > 0 else -1) if o == 'H' else (-1 if off > 0 else 1)  # +x side is -n for V walls
        votes[side] += 1
    if max(votes.values()) < 3:
        return None
    return 1 if votes[1] > votes[-1] else -1


def build_walls():
    walls, openings, overlay_open = [], [], []
    for w in PD.WALLS:
        wid, vp, o, band, span, mat, role, ops = w
        a, b, rect = wall_geom(w)
        lvl = level_of(wid)
        t = snap_t(band[1] - band[0])
        if lvl == 'lower':
            base, h = LOWER_WALL_BASE, LOWER_WALL_H
        elif lvl == 'entrance':
            base, h = ENTR_SLAB_TOP, ENTR_WALL_H
        if role == 'parapet':  # terrace railing curb
            base, h = TERRACE_SLAB_TOP, 1.05 - TERRACE_SLAB_TOP
        if lvl == 'site':
            base, top = SITE_WALL_HEIGHTS[wid]
            h = top - base
        poly = [[r3(rect[0]), r3(rect[1])], [r3(rect[2]), r3(rect[1])], [r3(rect[2]), r3(rect[3])],
                [r3(rect[0]), r3(rect[3])]]
        walls.append({
            'id': wid, 'level': lvl, 'material': mat, 'role': role, 'a': a, 'b': b,
            'thickness': t, 'baseY': r3(base), 'height': r3(h), 'polygonPt': [poly],
            '_vp': vp,
        })
        for i, op in enumerate(ops):
            lo, hi, kind = op[0], op[1], op[2]
            sill, head = OPEN_DEFAULTS[kind]
            if len(op) > 3:
                sill, head = op[3], op[4]
            oid = '%s-O%d' % (wid, i + 1)
            rec = {
                'id': oid, 'wallId': wid, 'level': 'lower' if lvl == 'lower' else 'entrance', 'kind': kind,
                'offset': r3(((lo + hi) / 2 - span[0]) * K), 'width': r3((hi - lo) * K),
                'sill': sill, 'head': head,
            }
            if kind in ('door', 'entry-door', 'mamad-door'):
                s = door_swing(vp, o, band, lo, hi)
                if s is not None:
                    rec['swingSide'] = s
            openings.append(rec)
            mid = (band[0] + band[1]) / 2
            cx, cy = ((lo + hi) / 2, mid) if o == 'H' else (mid, (lo + hi) / 2)
            overlay_open.append({'viewport': vp, 'kind': kind, 'x': round(cx, 2), 'y': round(cy, 2),
                                 'w': round(hi - lo, 2), 'angle': 0 if o == 'H' else 90})
    return walls, openings, overlay_open


def build_columns():
    cols = []
    for cid, vp, x0, y0, x1, y1 in PD.COLUMNS:
        lvl = 'lower' if cid.startswith('C-L') else 'entrance'
        c = to_m(vp, (x0 + x1) / 2, (y0 + y1) / 2)
        sx, sz = snap_t(x1 - x0), snap_t(y1 - y0)
        base, h = (LOWER_WALL_BASE, LOWER_WALL_H) if lvl == 'lower' else (ENTR_SLAB_TOP, ENTR_WALL_H)
        cols.append({'id': cid, 'level': lvl, 'center': c, 'size': [sx, sz], 'baseY': r3(base), 'height': r3(h),
                     '_inferred': False})
    # Inferred columns (not hatched on the drawing): lower-floor corners of the retaining box
    # under the concrete stubs of the entrance floor, so the suspended slab has supports.
    for cid, vp, x0, y0, x1, y1 in SD.INFERRED_COLUMNS:
        c = to_m(vp, (x0 + x1) / 2, (y0 + y1) / 2)
        cols.append({'id': cid, 'level': 'lower', 'center': c, 'size': [snap_t(x1 - x0), snap_t(y1 - y0)],
                     'baseY': r3(LOWER_WALL_BASE), 'height': r3(LOWER_WALL_H), '_inferred': True})
    return cols


# ---------------------------------------------------------------------------------------
# Rooms, stairs
# ---------------------------------------------------------------------------------------
def build_rooms():
    rooms, ov = [], []
    for rid, vp, name, kind, pts, label, dims, named in PD.ROOMS:
        pm = poly_m(vp, pts)
        P = Polygon(pm)
        lab = to_m(vp, *label) if label else [r3(P.representative_point().x), r3(P.representative_point().y)]
        if label is None:
            c = P.centroid
            if P.contains(c):
                lab = [r3(c.x), r3(c.y)]
        lvl = 'lower' if rid.startswith('R-L') else 'entrance'
        rec = {'id': rid, 'level': lvl, 'nameHe': name, 'kind': kind, 'polygon': pm, 'labelAt': lab,
               'area': round(P.area, 2)}
        if dims:
            rec['dimsLabel'] = dims
        rec['_namedOnPlan'] = named
        rooms.append(rec)
        PP = Polygon(pts)
        lx, ly = label if label else (PP.centroid.x, PP.centroid.y)
        d = 'M' + ' L'.join('%.2f %.2f' % p for p in pts) + ' Z'
        ov.append({'viewport': vp, 'nameHe': name, 'x': round(lx, 2), 'y': round(ly, 2),
                   'area': round(P.area, 1), 'd': d})
    return rooms, ov


def build_stairs():
    s = PD.STAIR
    return [{
        'id': s['id'], 'from': 'lower', 'to': 'entrance',
        'footprint': poly_m('entrance', s['footprint']),
        'path': poly_m('entrance', s['path']),
        'width': r3(s['width_pt'] * K), 'risers': s['risers'],
    }]


# ---------------------------------------------------------------------------------------
# Footprints & slabs
# ---------------------------------------------------------------------------------------
def build_slabs():
    E = Polygon(SD.ENTRANCE_FOOTPRINT)          # page pts, entrance viewport
    L = Polygon([(x - VIEWPORT_DX, y) for x, y in SD.LOWER_FOOTPRINT])
    split = Polygon(SD.SUSPENDED_ZONE)
    stair_hole = Polygon(PD.STAIR['footprint'])
    terrace = Polygon(SD.TERRACE_SLAB)

    def m(poly):
        return [to_m('entrance', x, y) for x, y in list(poly.exterior.coords)[:-1]]

    def parts(g):
        if g.is_empty:
            return []
        return [g] if g.geom_type == 'Polygon' else [q for q in g.geoms if q.area > 1]

    slabs = []
    slabs.append({'id': 'SL-LOWER', 'level': 'lower', 'role': 'ground', 'outline': m(L),
                  'holes': [], 'topY': r3(LOWER_FFL - FINISH), 'thickness': LOWER_SLAB_T})
    sus = E.intersection(split)
    grd = E.difference(split)
    for i, g in enumerate(parts(sus)):
        hole = g.intersection(stair_hole)
        rec = {'id': 'SL-ENTR-SUSP' + ('' if i == 0 else str(i)), 'level': 'entrance', 'role': 'suspended',
               'outline': m(g.difference(stair_hole) if hole.area > 0 and not g.contains(stair_hole) else g),
               'topY': r3(ENTR_SLAB_TOP), 'thickness': ENTR_SLAB_T}
        if hole.area > 0 and g.contains(stair_hole):
            rec['holes'] = [m(stair_hole)]
        slabs.append(rec)
    for i, g in enumerate(parts(grd)):
        gg = g.difference(stair_hole)
        for j, q in enumerate(parts(gg)):
            slabs.append({'id': 'SL-ENTR-GRADE' + ('' if (i == 0 and j == 0) else '%d%d' % (i, j)),
                          'level': 'entrance', 'role': 'ground', 'outline': m(q),
                          'topY': r3(ENTR_SLAB_TOP), 'thickness': ENTR_SLAB_T})
    slabs.append({'id': 'SL-TERRACE', 'level': 'entrance', 'role': 'terrace', 'outline': m(terrace),
                  'topY': TERRACE_SLAB_TOP, 'thickness': ENTR_SLAB_T})
    slabs.append({'id': 'SL-ROOF', 'level': 'roof', 'role': 'roof', 'outline': m(E),
                  'topY': ROOF_TOP, 'thickness': ROOF_SLAB_T})
    # fix suspended slab: keep stair hole as a hole when it lies inside, else it was subtracted
    for s in slabs:
        if 'holes' in s and not s['holes']:
            del s['holes']
    return slabs, E, L


def roof_parapets(E: Polygon):
    """Parapet walls along the roof edge (not drawn on the plans: assumption)."""
    walls = []
    pts = list(E.exterior.coords)[:-1]
    # make sure the ring is clockwise in page coords (y down) so the inside is consistent
    n = len(pts)
    t_pt = 0.20 / K
    for i in range(n):
        p, q = pts[i], pts[(i + 1) % n]
        L = math.dist(p, q)
        if L < 3:
            continue
        # offset centerline half a thickness inside the roof
        ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        nx, ny = -uy, ux
        mid = ((p[0] + q[0]) / 2 + nx * 1, (p[1] + q[1]) / 2 + ny * 1)
        sgn = 1 if E.contains(Point(mid)) else -1
        ox, oy = nx * sgn * t_pt / 2, ny * sgn * t_pt / 2
        a = (p[0] + ox, p[1] + oy)
        b = (q[0] + ox, q[1] + oy)
        corners = [(p[0], p[1]), (q[0], q[1]), (q[0] + 2 * ox, q[1] + 2 * oy), (p[0] + 2 * ox, p[1] + 2 * oy)]
        walls.append({'id': 'P-R%d' % (len(walls) + 1), 'level': 'roof', 'material': 'block', 'role': 'parapet',
                      'a': to_m('entrance', *a), 'b': to_m('entrance', *b), 'thickness': 0.2,
                      'baseY': ROOF_TOP, 'height': PARAPET_H,
                      'polygonPt': [[[r3(x), r3(y)] for x, y in corners]], '_vp': 'entrance'})
    return walls


# ---------------------------------------------------------------------------------------
# Site
# ---------------------------------------------------------------------------------------
def lot_boundary_page():
    strips = pdfplan.lot_boundary_strips()['entrance']
    strips = [s for s in strips if max(abs(s[0][0] - s[-1][0]), abs(s[0][1] - s[-1][1])) > 100 or len(s) > 2]
    strips = [s for s in strips if (max(p[0] for p in s) - min(p[0] for p in s) > 100 or
                                    max(p[1] for p in s) - min(p[1] for p in s) > 300)]
    # chain the strips into one ring
    ring = list(strips.pop(0))
    while strips:
        best = None
        for i, s in enumerate(strips):
            for rev in (False, True):
                ss = s[::-1] if rev else s
                d = math.dist(ring[-1], ss[0])
                if best is None or d < best[0]:
                    best = (d, i, ss)
        d, i, ss = best
        strips.pop(i)
        ring += ss[1:] if d < 1.0 else ss
    if math.dist(ring[0], ring[-1]) < 1.0:
        ring = ring[:-1]
    # drop near-duplicate points
    out = []
    for p in ring:
        if not out or math.dist(out[-1], p) > 0.5:
            out.append(p)
    return out


def building_line_page(lot_ring):
    segs = [s for s in pdfplan.stroke_segments(color=pdfplan.RED) if s[0] < 950 and abs(s[4] - 1.08) < 0.01]
    pts = []
    for x0, y0, x1, y1, w in segs:
        if math.hypot(x1 - x0, y1 - y0) < 2.5:
            continue
        pts += [(x0, y0), (x1, y1)]
    hull = Polygon(pts).convex_hull if len(pts) > 3 else None
    from shapely.geometry import MultiPoint
    hull = MultiPoint(pts).convex_hull
    ring = hull.exterior
    keep = [p for p in pts if ring.distance(Point(p)) < 12]
    cx, cy = hull.centroid.x, hull.centroid.y
    keep.sort(key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    out = []
    for p in keep:
        if not out or math.dist(out[-1], p) > 1.5:
            out.append(p)
    return out


def build_site(walls_all, slabs_E, slabs_L):
    lot = lot_boundary_page()
    lotP = Polygon(lot)
    bl = building_line_page(lot)
    spots = []
    for x, y, yrel, absv, vp in SD.SPOTS:
        xe = x - VIEWPORT_DX if vp == 'lower' else x
        rec = {'p': to_m('entrance', xe, y), 'y': yrel}
        if absv is not None:
            rec['labelAbs'] = absv
        spots.append(rec)
    for x, y, absv, note in SD.SURVEY:
        spots.append({'p': to_m('entrance', x, y), 'y': r3(absv - SD.ZERO_ABS), 'labelAbs': absv})

    lot_m = [to_m('entrance', x, y) for x, y in lot]
    xs = [p[0] for p in lot_m]; zs = [p[1] for p in lot_m]
    margin = 4.0
    x0 = math.floor(min(xs) - margin); z0 = math.floor(min(zs) - margin)
    x1 = math.ceil(max(xs) + margin); z1 = math.ceil(max(zs) + margin)
    cell = 1.0
    cols = int(round((x1 - x0) / cell)) + 1
    rows = int(round((z1 - z0) / cell)) + 1
    gx = np.array([x0 + c * cell for c in range(cols)])
    gz = np.array([z0 + r * cell for r in range(rows)])
    natural = SD.natural_terrain(gx, gz, to_m)
    finished = SD.finished_terrain(gx, gz, natural, to_m, Polygon(lot_m))

    street = SD.street_polyline(lot_m)
    site = {
        'boundary': lot_m,
        'buildingLines': [[to_m('entrance', x, y) for x, y in bl] + [to_m('entrance', *bl[0])]],
        'spotElevations': spots,
        'terrainNatural': {'origin': [x0, z0], 'cell': cell, 'cols': cols, 'rows': rows,
                           'heights': [r3(v) for v in natural.ravel()]},
        'terrainFinished': {'origin': [x0, z0], 'cell': cell, 'cols': cols, 'rows': rows,
                            'heights': [r3(v) for v in finished.ravel()]},
        'street': street,
        'northAngle': r3(SD.NORTH_ANGLE),
        'neighbors': [{'labelHe': n, 'at': to_m('entrance', x, y)} for n, x, y in SD.NEIGHBORS],
    }
    return site, lot, bl, lotP


def sample_grid(t, x, z):
    """Bilinear sample of a TerrainGrid dict at model (x, z)."""
    c = (x - t['origin'][0]) / t['cell']; r = (z - t['origin'][1]) / t['cell']
    c = min(max(c, 0), t['cols'] - 1.001); r = min(max(r, 0), t['rows'] - 1.001)
    c0, r0 = int(c), int(r); fc, fr = c - c0, r - r0
    H = t['heights']; W = t['cols']
    v00 = H[r0 * W + c0]; v01 = H[r0 * W + c0 + 1]; v10 = H[(r0 + 1) * W + c0]; v11 = H[(r0 + 1) * W + c0 + 1]
    return (v00 * (1 - fc) + v01 * fc) * (1 - fr) + (v10 * (1 - fc) + v11 * fc) * fr


def boundary_fences(site):
    """Boundary walls ("חומה קיימת" / "ק.אבן+מעקה" / "חומה מוצעת") along the lot line.

    Split into pieces of <= 4 m; each piece spans from 10 cm below the lowest adjacent grade
    (finished inside / natural outside) to 50 cm above the highest one."""
    ring = [tuple(p) for p in site['boundary']]
    P = Polygon(ring)
    walls = []
    n = len(ring)
    # merge the densely sampled arcs into chords of <= 4 m
    pieces, cur = [], [ring[0]]
    for i in range(1, n + 1):
        p = ring[i % n]
        if math.dist(cur[0], p) > 4.0 and len(cur) > 1:
            pieces.append((cur[0], cur[-1])); cur = [cur[-1]]
        cur.append(p)
    if len(cur) > 1:
        pieces.append((cur[0], cur[-1]))
    split = []
    for a, b in pieces:  # long sides -> equal pieces of <= 2 m (heights follow the slope)
        k = max(1, math.ceil(math.dist(a, b) / 2.0))
        for i in range(k):
            split.append(((a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k),
                          (a[0] + (b[0] - a[0]) * (i + 1) / k, a[1] + (b[1] - a[1]) * (i + 1) / k)))
    for a, b in split:
        L = math.dist(a, b)
        if L < 0.3:
            continue
        ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        nx, nz = -uz, ux
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if P.contains(Point(m[0] + nx * 0.3, m[1] + nz * 0.3)):
            nx, nz = -nx, -nz  # make n point outward
        vals_in, vals_out = [], []
        for q in (a, m, b):
            vals_in.append(sample_grid(site['terrainFinished'], q[0] - nx * 0.6, q[1] - nz * 0.6))
            vals_out.append(sample_grid(site['terrainNatural'], q[0] + nx * 0.6, q[1] + nz * 0.6))
        base = min(vals_in + vals_out) - 0.1
        top = max(vals_in + vals_out) + 0.5
        walls.append({'id': 'F-B%d' % (len(walls) + 1), 'level': 'site', 'material': 'block', 'role': 'fence',
                      'a': [r3(a[0]), r3(a[1])], 'b': [r3(b[0]), r3(b[1])], 'thickness': 0.25,
                      'baseY': r3(base), 'height': r3(top - base)})
    return walls


def build_outdoor():
    out = []
    lot = Polygon(lot_boundary_page())
    for oid, kind, name, vp, pts, y in SD.OUTDOOR:
        P = Polygon([(x - VIEWPORT_DX, yy) if vp == 'lower' else (x, yy) for x, yy in pts])
        if kind not in ('pergola',):
            P = P.intersection(lot.buffer(0.5))
        if P.is_empty:
            continue
        if P.geom_type != 'Polygon':
            P = max(P.geoms, key=lambda g: g.area)
        P = P.simplify(0.3)
        rec = {'id': oid, 'kind': kind, 'outline': [to_m('entrance', x, yy) for x, yy in list(P.exterior.coords)[:-1]],
               'y': y}
        if name:
            rec['nameHe'] = name
        out.append(rec)
    return out


def build_fixtures():
    fx = []
    for fid, lvl, kind, vp, cx, cy, sx, sz, rot, y in SD.FIXTURES:
        xe = cx - VIEWPORT_DX if vp == 'lower' else cx
        rec = {'id': fid, 'level': lvl, 'kind': kind, 'center': to_m('entrance', xe, cy),
               'size': [r3(sx), r3(sz)], 'rotation': r3(rot)}
        if y is not None:
            rec['y'] = y
        fx.append(rec)
    return fx


# ---------------------------------------------------------------------------------------
# Overlay helpers
# ---------------------------------------------------------------------------------------
def fill_paths():
    """SVG path data of every red / blue wall hatch, grouped per viewport + material."""
    groups = {}
    for r in pdfplan.wall_fill_rects():
        key = (r.vp, r.mat)
        groups.setdefault(key, []).append('M%.2f %.2fH%.2fV%.2fH%.2fZ' % (r.x0, r.y0, r.x1, r.y1, r.x0))
    out = []
    for vp in ('entrance', 'lower'):
        for mat in ('concrete', 'block'):
            if (vp, mat) in groups:
                out.append({'viewport': vp, 'material': mat, 'd': ''.join(groups[(vp, mat)])})
    return out


def path_d(pts, close=True):
    d = 'M' + ' L'.join('%.2f %.2f' % (p[0], p[1]) for p in pts)
    return d + (' Z' if close else '')


def main():
    walls, openings, ov_open = build_walls()
    columns = build_columns()
    rooms, ov_rooms = build_rooms()
    stairs = build_stairs()
    slabs, E, L = build_slabs()
    walls += roof_parapets(E)
    site, lot_page, bl_page, lotP = build_site(walls, E, L)
    walls += boundary_fences(site)
    outdoor = build_outdoor()
    fixtures = build_fixtures()

    # ---------- assumptions list ----------
    assumptions = SD.ASSUMPTIONS + [
        'Scale 1:100: least-squares fit over %d written dimensions gives %.6f m/pt (nominal %.6f, max residual %.1f cm); the nominal value is used.'
        % (len(CALIB), K_FIT, K, CAL_MAX * 100),
    ]

    inferred_cols = [c['id'] for c in columns if c.pop('_inferred')]
    for c in columns:
        pass
    for w in walls:
        w.pop('_vp', None)
    named_off = [r['id'] for r in rooms if not r.pop('_namedOnPlan')]

    meta = {
        'titleHe': 'בית פרטי — מגרש 43',
        'plot': '43',
        'zeroAbsolute': SD.ZERO_ABS,
        'sourcePdf': {'title': 'Model', 'creator': 'AutoCAD 2023 - English 2023 (24.2s (LMS Tech))',
                      'pageWidthPt': 1899, 'pageHeightPt': 1701, 'sizeBytes': os.path.getsize(pdfplan.PDF_PATH)},
        'assumptions': assumptions,
    }
    viewports = [
        {'id': 'entrance', 'titleHe': 'תכנית פיתוח קומת כניסה', 'bboxPt': list(FRAME['entrance']),
         'originPt': list(ORIGIN['entrance']), 'metersPerPt': K},
        {'id': 'lower', 'titleHe': 'תכנית פיתוח קומה תחתונה', 'bboxPt': list(FRAME['lower']),
         'originPt': [round(ORIGIN['lower'][0], 2), ORIGIN['lower'][1]], 'metersPerPt': K},
    ]
    levels = [
        {'id': 'lower', 'nameHe': 'קומה תחתונה', 'floorY': LOWER_FFL, 'slabThickness': LOWER_SLAB_T,
         'ceilingHeight': r3(ENTR_SLAB_BOTTOM - LOWER_FFL)},
        {'id': 'entrance', 'nameHe': 'קומת כניסה', 'floorY': ENTR_FFL, 'slabThickness': ENTR_SLAB_T,
         'ceilingHeight': r3(ROOF_SLAB_BOTTOM - ENTR_FFL)},
        {'id': 'roof', 'nameHe': 'גג', 'floorY': ROOF_TOP, 'slabThickness': ROOF_SLAB_T, 'ceilingHeight': 0},
    ]
    house = {
        'version': 1, 'meta': meta,
        'sheet': {'widthPt': 1899, 'heightPt': 1701, 'image': '/build3d/plan-sheet.webp', 'viewports': viewports},
        'levels': levels, 'site': site, 'walls': walls, 'columns': columns, 'openings': openings,
        'rooms': rooms, 'stairs': stairs, 'slabs': slabs, 'outdoor': outdoor, 'fixtures': fixtures,
    }

    # ---------- overlay ----------
    built = unary_union([Polygon(SD.ENTRANCE_FOOTPRINT),
                         Polygon([(x - VIEWPORT_DX, y) for x, y in SD.LOWER_FOOTPRINT])])
    built_area = (Polygon(SD.ENTRANCE_FOOTPRINT).area + Polygon(SD.LOWER_FOOTPRINT).area) * K * K
    lot_area = lotP.area * K * K
    storey_walls = [w for w in walls if w['role'] not in ('parapet', 'site-retaining', 'fence')]
    overlay = {
        'widthPt': 1899, 'heightPt': 1701,
        'viewports': [{'id': v['id'], 'bboxPt': v['bboxPt'], 'titleHe': v['titleHe']} for v in viewports],
        'walls': fill_paths(),
        'openings': ov_open,
        'rooms': ov_rooms,
        'dims': [{'viewport': vp, 'text': t, 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2} for vp, t, x1, y1, x2, y2 in PD.DIMS],
        'site': {
            'boundary': [{'viewport': 'entrance', 'd': path_d(lot_page)},
                         {'viewport': 'lower', 'd': path_d([(x + VIEWPORT_DX, y) for x, y in lot_page])}],
            'elevations': [{'viewport': vp, 'x': x, 'y': y, 'text': t} for vp, x, y, t in SD.OVERLAY_ELEVATIONS],
        },
        'stats': {
            'walls': len(storey_walls),
            'concreteWalls': sum(1 for w in storey_walls if w['material'] == 'concrete'),
            'blockWalls': sum(1 for w in storey_walls if w['material'] == 'block'),
            'openings': len(openings),
            'rooms': len(rooms),
            'levels': 2,
            'builtAreaM2': round(built_area, 1),
            'lotAreaM2': round(lot_area, 1),
        },
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, 'house.json'), 'w', encoding='utf-8') as f:
        json.dump(house, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT_DIR, 'overlay.json'), 'w', encoding='utf-8') as f:
        json.dump(overlay, f, ensure_ascii=False, separators=(',', ':'))

    print('calibration: fit %.7f m/pt, nominal %.7f, max resid %.2f cm, rms %.2f cm' % (K_FIT, K, CAL_MAX * 100, CAL_RMS * 100))
    print('walls %d (storey %d, concrete %d, block %d), openings %d, rooms %d, columns %d (inferred %s), fixtures %d, outdoor %d, slabs %d'
          % (len(walls), len(storey_walls), overlay['stats']['concreteWalls'], overlay['stats']['blockWalls'],
             len(openings), len(rooms), len(columns), inferred_cols, len(fixtures), len(outdoor), len(slabs)))
    print('lot area %.1f m2, built (entrance+lower footprints) %.1f m2' % (lot_area, built_area))
    print('rooms named on plan: %d, unnamed (descriptive names): %s' % (len(rooms) - len(named_off), named_off))
    print('terrain grid %dx%d' % (site['terrainNatural']['cols'], site['terrainNatural']['rows']))


if __name__ == '__main__':
    main()
