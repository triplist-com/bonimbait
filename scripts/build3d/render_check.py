"""Validation renders for house.json / overlay.json.

  data/build3d-venv/bin/python -I scripts/build3d/render_check.py

Writes PNGs to data/build3d-shots/extract/:
  overlay_full.png         overlay.json drawn over the sheet raster (both viewports)
  house_<vp>.png           house.json mapped back onto the sheet (inverse transform) per viewport
  house_<vp>_crop<N>.png   zoomed crops of the same
  model_levels.png         top-down model-space plot, both levels overlaid + site
  terrain.png              natural / finished terrain grids
and prints sanity checks (counts, areas, openings inside walls, stacking).
"""
from __future__ import annotations

import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union

from pdfplan import ROOT, PDF_PATH

HOUSE = os.path.join(ROOT, 'apps', 'web', 'lib', 'build3d', 'house', 'house.json')
OVERLAY = os.path.join(ROOT, 'apps', 'web', 'lib', 'build3d', 'house', 'overlay.json')
OUT = os.path.join(ROOT, 'data', 'build3d-shots', 'extract')
os.makedirs(OUT, exist_ok=True)

DPI = 200
SC = DPI / 72.0


def sheet_image(clip=None, dpi=DPI):
    doc = pymupdf.open(PDF_PATH)
    pix = doc[0].get_pixmap(dpi=dpi, clip=pymupdf.Rect(*clip) if clip else None)
    im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    # fade the drawing so the check colours stand out
    return Image.blend(im, Image.new('RGB', im.size, 'white'), 0.55).convert('RGBA')


def font(sz):
    for p in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf',
              '/Library/Fonts/Arial Unicode.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def heb(s):
    return s[::-1]  # crude visual RTL for labels in the check images


def parse_path(d):
    """Minimal SVG path parser for M/L/H/V/Z with absolute coords -> list of polylines."""
    toks = re.findall(r'[MLHVZ]|-?\d+\.?\d*', d)
    polys, cur, i, x, y, cmd = [], [], 0, 0.0, 0.0, None
    while i < len(toks):
        t = toks[i]
        if t in 'MLHVZ':
            cmd = t; i += 1
            if t == 'Z':
                if cur:
                    cur.append(cur[0]); polys.append(cur); cur = []
            continue
        if cmd == 'M':
            if cur:
                polys.append(cur)
            x, y = float(toks[i]), float(toks[i + 1]); i += 2; cur = [(x, y)]; cmd = 'L'
        elif cmd == 'L':
            x, y = float(toks[i]), float(toks[i + 1]); i += 2; cur.append((x, y))
        elif cmd == 'H':
            x = float(toks[i]); i += 1; cur.append((x, y))
        elif cmd == 'V':
            y = float(toks[i]); i += 1; cur.append((x, y))
    if cur:
        polys.append(cur)
    return polys


# ---------------------------------------------------------------------------------------
def check_overlay(ov):
    im = sheet_image()
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(lay)
    T = lambda p: (p[0] * SC, p[1] * SC)
    for v in ov['viewports']:
        b = v['bboxPt']; dr.rectangle([T(b[:2]), T(b[2:])], outline=(0, 0, 0, 255), width=3)
    for b in ov['site']['boundary']:
        for pl in parse_path(b['d']):
            dr.line([T(p) for p in pl], fill=(0, 150, 0, 255), width=4)
    for w in ov['walls']:
        col = (0, 60, 255, 170) if w['material'] == 'concrete' else (255, 40, 40, 170)
        for pl in parse_path(w['d']):
            dr.polygon([T(p) for p in pl], fill=col)
    for r in ov['rooms']:
        for pl in parse_path(r['d']):
            dr.line([T(p) for p in pl], fill=(255, 140, 0, 255), width=2)
        dr.text(T((r['x'], r['y'])), heb(r['nameHe']) + ' %.1f' % r['area'], fill=(120, 60, 0, 255), font=font(14))
    for o in ov['openings']:
        ang = math.radians(o['angle']); hw = o['w'] / 2
        a = (o['x'] - math.cos(ang) * hw, o['y'] - math.sin(ang) * hw)
        b = (o['x'] + math.cos(ang) * hw, o['y'] + math.sin(ang) * hw)
        dr.line([T(a), T(b)], fill=(0, 200, 200, 255), width=6)
    for d in ov['dims']:
        dr.line([T((d['x1'], d['y1'])), T((d['x2'], d['y2']))], fill=(160, 0, 160, 255), width=2)
        dr.text(T(((d['x1'] + d['x2']) / 2, (d['y1'] + d['y2']) / 2)), d['text'], fill=(160, 0, 160, 255), font=font(16))
    for e in ov['site']['elevations']:
        dr.ellipse([T((e['x'] - 3, e['y'] - 3)), T((e['x'] + 3, e['y'] + 3))], outline=(0, 120, 0, 255), width=3)
        dr.text(T((e['x'] + 4, e['y'] - 9)), e['text'], fill=(0, 110, 0, 255), font=font(14))
    out = Image.alpha_composite(im, lay).convert('RGB')
    out.save(os.path.join(OUT, 'overlay_full.png'))
    out.crop((int(400 * SC), int(540 * SC), int(760 * SC), int(1060 * SC))).save(os.path.join(OUT, 'overlay_entrance_house.png'))


# ---------------------------------------------------------------------------------------
class Inv:
    def __init__(self, vp):
        self.ox, self.oy = vp['originPt']; self.k = vp['metersPerPt']

    def __call__(self, p):  # model [x,z] -> image px
        return ((p[0] / self.k + self.ox) * SC, (p[1] / self.k + self.oy) * SC)


def wall_corners(w):
    ax, az = w['a']; bx, bz = w['b']
    L = math.hypot(bx - ax, bz - az); ux, uz = (bx - ax) / L, (bz - az) / L
    nx, nz = -uz, ux; t = w['thickness'] / 2
    return [(ax + nx * t, az + nz * t), (bx + nx * t, bz + nz * t), (bx - nx * t, bz - nz * t), (ax - nx * t, az - nz * t)], (ux, uz, nx, nz, L)


def fixture_corners(f):
    cx, cz = f['center']; sx, sz = f['size']; r = f['rotation']
    # local -> model: local +Z -> (sin r, cos r); local +X -> (cos r, -sin r)
    ex = (math.cos(r), -math.sin(r)); ez = (math.sin(r), math.cos(r))
    pts = []
    for lx, lz in ((-sx / 2, -sz / 2), (sx / 2, -sz / 2), (sx / 2, sz / 2), (-sx / 2, sz / 2)):
        pts.append((cx + lx * ex[0] + lz * ez[0], cz + lx * ex[1] + lz * ez[1]))
    front = (cx + ez[0] * sz / 2, cz + ez[1] * sz / 2)
    return pts, front


def check_house(h, vp_id):
    vp = next(v for v in h['sheet']['viewports'] if v['id'] == vp_id)
    lvl = 'entrance' if vp_id == 'entrance' else 'lower'
    T = Inv(vp)
    im = sheet_image()
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(lay)
    dr.line([T(p) for p in h['site']['boundary'] + [h['site']['boundary'][0]]], fill=(0, 150, 0, 255), width=4)
    for bl in h['site']['buildingLines']:
        dr.line([T(p) for p in bl], fill=(255, 0, 200, 255), width=3)
    for s in h['site']['spotElevations']:
        x, y = T(s['p']); dr.ellipse([x - 6, y - 6, x + 6, y + 6], outline=(0, 140, 0, 255), width=3)
        dr.text((x + 7, y - 18), '%+.2f' % s['y'], fill=(0, 120, 0, 255), font=font(15))
    for o in h['outdoor']:
        col = {'parking': (90, 90, 90), 'path': (150, 120, 60), 'steps': (200, 100, 0), 'pergola': (130, 0, 200),
               'planter': (0, 140, 60), 'lawn': (60, 180, 60), 'garden': (60, 160, 90)}.get(o['kind'], (0, 0, 0))
        dr.line([T(p) for p in o['outline'] + [o['outline'][0]]], fill=col + (255,), width=3)
    walls = {w['id']: w for w in h['walls']}
    for w in h['walls']:
        if w['level'] not in (lvl, 'site') and not (w['level'] == 'roof' and vp_id == 'entrance'):
            continue
        if w['level'] == 'roof':
            pts, _ = wall_corners(w)
            dr.polygon([T(p) for p in pts], outline=(0, 150, 150, 255))
            continue
        pts, _ = wall_corners(w)
        col = (0, 70, 255, 150) if w['material'] == 'concrete' else (255, 60, 0, 150)
        dr.polygon([T(p) for p in pts], fill=col, outline=(0, 0, 0, 255))
    for c in h['columns']:
        if c['level'] != lvl:
            continue
        cx, cz = c['center']; sx, sz = c['size']
        dr.rectangle([T((cx - sx / 2, cz - sz / 2)), T((cx + sx / 2, cz + sz / 2))], fill=(255, 220, 0, 230), outline=(0, 0, 0, 255))
    for o in h['openings']:
        if o['level'] != lvl:
            continue
        w = walls[o['wallId']]
        pts, (ux, uz, nx, nz, L) = wall_corners(w)
        ax, az = w['a']
        c0 = (ax + ux * (o['offset'] - o['width'] / 2), az + uz * (o['offset'] - o['width'] / 2))
        c1 = (ax + ux * (o['offset'] + o['width'] / 2), az + uz * (o['offset'] + o['width'] / 2))
        col = {'window': (0, 200, 255), 'vitrine': (0, 120, 255), 'sliding-door': (0, 90, 200), 'door': (0, 170, 0),
               'entry-door': (200, 0, 0), 'mamad-door': (120, 0, 120), 'mamad-window': (200, 0, 200),
               'opening': (120, 120, 120)}[o['kind']]
        dr.line([T(c0), T(c1)], fill=col + (255,), width=9)
        if 'swingSide' in o:
            m = ((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2)
            s = o['swingSide']
            tip = (m[0] + nx * s * o['width'] * 0.8, m[1] + nz * s * o['width'] * 0.8)
            dr.line([T(m), T(tip)], fill=col + (255,), width=3)
    for r in h['rooms']:
        if r['level'] != lvl:
            continue
        dr.line([T(p) for p in r['polygon'] + [r['polygon'][0]]], fill=(255, 140, 0, 255), width=3)
        x, y = T(r['labelAt'])
        dr.text((x - 30, y - 10), heb(r['nameHe']) + ' %.1fm2' % r['area'], fill=(150, 70, 0, 255), font=font(17))
    for st in h['stairs']:
        dr.line([T(p) for p in st['footprint'] + [st['footprint'][0]]], fill=(200, 0, 100, 255), width=3)
        dr.line([T(p) for p in st['path']], fill=(200, 0, 100, 255), width=3)
    for s in h['slabs']:
        if s['level'] != lvl:
            continue
        dr.line([T(p) for p in s['outline'] + [s['outline'][0]]], fill=(80, 80, 80, 200), width=2)
    for f in h['fixtures']:
        if f['level'] == lvl or (f['level'] == 'site' and (f.get('y', 0) > -1.5) == (lvl == 'entrance')):
            pts, front = fixture_corners(f)
            dr.polygon([T(p) for p in pts], outline=(200, 0, 160, 255), fill=(255, 0, 200, 50))
            fx, fy = T(front); dr.ellipse([fx - 4, fy - 4, fx + 4, fy + 4], fill=(200, 0, 160, 255))
    out = Image.alpha_composite(im, lay).convert('RGB')
    fr = vp['bboxPt']
    out.crop((int(fr[0] * SC), int(fr[1] * SC), int(fr[2] * SC), int(fr[3] * SC))).save(os.path.join(OUT, 'house_%s.png' % vp_id))
    ox = 0 if vp_id == 'entrance' else 784.8
    crops = [(400, 545, 600, 800), (560, 630, 760, 900), (400, 780, 620, 1060), (600, 870, 860, 1060),
             (290, 640, 440, 1220), (430, 1000, 860, 1220), (290, 400, 880, 600)]
    for i, (x0, y0, x1, y1) in enumerate(crops):
        out.crop((int((x0 + ox) * SC), int(y0 * SC), int((x1 + ox) * SC), int(y1 * SC))).save(
            os.path.join(OUT, 'house_%s_crop%d.png' % (vp_id, i + 1)))


# ---------------------------------------------------------------------------------------
def model_plot(h):
    S = 40  # px per meter
    xs = [p[0] for p in h['site']['boundary']]; zs = [p[1] for p in h['site']['boundary']]
    x0, z0 = min(xs) - 3, min(zs) - 3; x1, z1 = max(xs) + 3, max(zs) + 3
    W, Hh = int((x1 - x0) * S), int((z1 - z0) * S)
    im = Image.new('RGBA', (W, Hh), 'white'); dr = ImageDraw.Draw(im, 'RGBA')
    T = lambda p: ((p[0] - x0) * S, (p[1] - z0) * S)
    for gx in range(int(x0), int(x1) + 1):
        dr.line([T((gx, z0)), T((gx, z1))], fill=(235, 235, 235))
    for gz in range(int(z0), int(z1) + 1):
        dr.line([T((x0, gz)), T((x1, gz))], fill=(235, 235, 235))
    dr.line([T((0, z0)), T((0, z1))], fill=(180, 180, 255)); dr.line([T((x0, 0)), T((x1, 0))], fill=(180, 180, 255))
    dr.line([T(p) for p in h['site']['boundary'] + [h['site']['boundary'][0]]], fill=(0, 150, 0), width=3)
    if h['site'].get('street'):
        dr.line([T(p) for p in h['site']['street']], fill=(120, 120, 120), width=6)
    for o in h['outdoor']:
        dr.polygon([T(p) for p in o['outline']], outline=(150, 120, 60, 255), fill=(200, 180, 120, 40))
    for s in h['slabs']:
        col = {'ground': (120, 120, 120, 30), 'suspended': (0, 0, 255, 25), 'roof': (0, 0, 0, 0), 'terrace': (0, 160, 0, 40)}[s['role']]
        dr.line([T(p) for p in s['outline'] + [s['outline'][0]]], fill=(60, 60, 60, 255), width=2)
    for w in h['walls']:
        pts, _ = wall_corners(w)
        if w['level'] == 'lower':
            col = (0, 160, 0, 150)
        elif w['level'] == 'entrance':
            col = (255, 0, 0, 110) if w['material'] == 'block' else (0, 0, 255, 120)
        elif w['level'] == 'site':
            col = (120, 0, 160, 160)
        else:
            col = (0, 0, 0, 30)
        dr.polygon([T(p) for p in pts], fill=col)
    for c in h['columns']:
        cx, cz = c['center']; sx, sz = c['size']
        dr.rectangle([T((cx - sx / 2, cz - sz / 2)), T((cx + sx / 2, cz + sz / 2))], outline=(0, 0, 0), fill=(255, 220, 0, 200))
    for st in h['stairs']:
        dr.line([T(p) for p in st['path']], fill=(200, 0, 100), width=3)
    dr.text((10, 10), 'model space: green = lower walls, red/blue = entrance walls, purple = site walls, 1 grid = 1 m',
            fill=(0, 0, 0), font=font(18))
    # north arrow
    a = h['site']['northAngle']; c = (x1 - 2, z0 + 2)
    tip = (c[0] + math.sin(a) * 1.5, c[1] - math.cos(a) * 1.5)
    dr.line([T(c), T(tip)], fill=(0, 0, 0), width=4); dr.text(T(tip), 'N', fill=(0, 0, 0), font=font(22))
    im.convert('RGB').save(os.path.join(OUT, 'model_levels.png'))


def terrain_plot(h):
    tn, tf = h['site']['terrainNatural'], h['site']['terrainFinished']
    S = 14
    ims = []
    for t in (tn, tf):
        a = np.array(t['heights']).reshape(t['rows'], t['cols'])
        lo, hi = -4.0, 1.5
        n = np.clip((a - lo) / (hi - lo), 0, 1)
        rgb = np.stack([n * 230 + 20, 120 + n * 60, (1 - n) * 230 + 20], -1).astype(np.uint8)
        im = Image.fromarray(rgb).resize((t['cols'] * S, t['rows'] * S), Image.NEAREST)
        dr = ImageDraw.Draw(im)
        ox, oz = t['origin']
        T = lambda p: ((p[0] - ox + 0.5) * S, (p[1] - oz + 0.5) * S)
        dr.line([T(p) for p in h['site']['boundary'] + [h['site']['boundary'][0]]], fill=(0, 0, 0), width=2)
        for r in range(0, t['rows'], 3):
            for c in range(0, t['cols'], 3):
                dr.text((c * S, r * S), '%.1f' % a[r, c], fill=(0, 0, 0), font=font(9))
        ims.append(im)
    W = ims[0].width * 2 + 20
    out = Image.new('RGB', (W, ims[0].height), 'white')
    out.paste(ims[0], (0, 0)); out.paste(ims[1], (ims[0].width + 20, 0))
    out.save(os.path.join(OUT, 'terrain.png'))


# ---------------------------------------------------------------------------------------
def sanity(h):
    walls = {w['id']: w for w in h['walls']}
    print('walls: %d  (by level: %s)' % (len(h['walls']), {l: sum(1 for w in h['walls'] if w['level'] == l) for l in ('lower', 'entrance', 'roof', 'site')}))
    print('openings: %d  columns: %d  rooms: %d  fixtures: %d  outdoor: %d  slabs: %d' % (
        len(h['openings']), len(h['columns']), len(h['rooms']), len(h['fixtures']), len(h['outdoor']), len(h['slabs'])))
    bad = []
    for o in h['openings']:
        w = walls[o['wallId']]
        L = math.dist(w['a'], w['b'])
        if o['offset'] - o['width'] / 2 < -0.005 or o['offset'] + o['width'] / 2 > L + 0.005:
            bad.append(o['id'])
        if o['head'] > w['height'] + 0.01 and w['role'] != 'parapet':
            bad.append(o['id'] + '(head)')
    print('openings outside their wall:', bad or 'none')
    for lvl in ('lower', 'entrance'):
        rooms = [r for r in h['rooms'] if r['level'] == lvl]
        area = sum(r['area'] for r in rooms)
        fp = [s for s in h['slabs'] if s['level'] == lvl and s['role'] in ('ground', 'suspended')]
        fpa = unary_union([Polygon(s['outline']) for s in fp]).area
        wl = unary_union([Polygon(wall_corners(w)[0]) for w in h['walls'] if w['level'] == lvl])
        overl = sum(Polygon(r['polygon']).intersection(wl).area for r in rooms)
        print('%-8s rooms %2d  room area %.1f m2  slab footprint %.1f m2  walls %.1f m2  (rooms+walls %.1f)  room/wall overlap %.2f m2'
              % (lvl, len(rooms), area, fpa, wl.area, area + wl.area, overl))
        # room polygons overlapping each other
        for i, a in enumerate(rooms):
            for b in rooms[i + 1:]:
                ov = Polygon(a['polygon']).intersection(Polygon(b['polygon'])).area
                if ov > 0.05:
                    print('   overlap %s / %s: %.2f m2' % (a['id'], b['id'], ov))
    # stacking: exterior walls of the lower floor vs entrance floor
    E = unary_union([Polygon(wall_corners(w)[0]) for w in h['walls'] if w['level'] == 'entrance' and w['role'] in ('exterior', 'mamad')])
    for w in h['walls']:
        if w['level'] == 'lower' and w['role'] == 'exterior':
            P = Polygon(wall_corners(w)[0])
            print('   lower %-5s under entrance exterior walls: %3.0f%%' % (w['id'], 100 * P.intersection(E).area / P.area))
    st = h['stairs'][0]
    print('stair: risers %d, rise %.3f m, width %.2f' % (st['risers'], 3.25 / st['risers'], st['width']))
    # every fixture inside a room of its level (or on the site)
    for f in h['fixtures']:
        if f['level'] in ('lower', 'entrance'):
            p = Point(f['center'])
            if not any(Polygon(r['polygon']).buffer(0.05).contains(p) for r in h['rooms'] if r['level'] == f['level']):
                print('   fixture outside rooms:', f['id'])


def main():
    h = json.load(open(HOUSE, encoding='utf-8'))
    ov = json.load(open(OVERLAY, encoding='utf-8'))
    sanity(h)
    check_overlay(ov)
    check_house(h, 'entrance')
    check_house(h, 'lower')
    model_plot(h)
    terrain_plot(h)
    print('images in', OUT)


if __name__ == '__main__':
    main()


# ---------------------------------------------------------------------------------------
# Structural check against apps/web/lib/build3d/house/types.ts (keys, enums, tuple sizes)
# ---------------------------------------------------------------------------------------
ENUMS = {
    'level': {'lower', 'entrance', 'roof', 'site'},
    'material': {'concrete', 'block'},
    'role_wall': {'exterior', 'interior', 'retaining', 'mamad', 'parapet', 'site-retaining', 'fence'},
    'opening': {'door', 'entry-door', 'window', 'vitrine', 'sliding-door', 'mamad-door', 'mamad-window', 'opening'},
    'room': {'living', 'kitchen', 'dining', 'bedroom', 'master', 'bath', 'wc', 'closet', 'mamad', 'entry', 'hall',
             'stairs', 'laundry', 'family', 'storage', 'terrace'},
    'slab': {'ground', 'suspended', 'roof', 'terrace', 'balcony'},
    'outdoor': {'parking', 'path', 'deck', 'lawn', 'gravel', 'planter', 'pergola', 'terrace', 'garden', 'steps'},
    'fixture': {'bed-double', 'bed-single', 'sofa', 'armchair', 'coffee-table', 'dining-table', 'kitchen-island',
                'kitchen-counter', 'toilet', 'sink', 'shower', 'bathtub', 'wardrobe', 'desk', 'tv', 'car',
                'outdoor-table', 'lounge-chair', 'washer', 'tree'},
}
KEYS = {
    'walls': ({'id', 'level', 'material', 'role', 'a', 'b', 'thickness', 'baseY', 'height'}, {'polygonPt'}),
    'columns': ({'id', 'level', 'center', 'size', 'baseY', 'height'}, {'rotation'}),
    'openings': ({'id', 'wallId', 'level', 'kind', 'offset', 'width', 'sill', 'head'}, {'swingSide'}),
    'rooms': ({'id', 'level', 'nameHe', 'kind', 'polygon', 'labelAt', 'area'}, {'dimsLabel'}),
    'stairs': ({'id', 'from', 'to', 'footprint', 'path', 'width', 'risers'}, set()),
    'slabs': ({'id', 'level', 'role', 'outline', 'topY', 'thickness'}, {'holes'}),
    'outdoor': ({'id', 'kind', 'outline', 'y'}, {'nameHe'}),
    'fixtures': ({'id', 'level', 'kind', 'center', 'size', 'rotation'}, {'y'}),
}


def is_vec2(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(q, (int, float)) for q in v)


def check_types(h):
    errs = []
    for coll, (req, opt) in KEYS.items():
        ids = set()
        for r in h[coll]:
            k = set(r)
            if not req <= k:
                errs.append('%s %s missing %s' % (coll, r.get('id'), req - k))
            if k - req - opt:
                errs.append('%s %s extra %s' % (coll, r.get('id'), k - req - opt))
            if r['id'] in ids:
                errs.append('%s duplicate id %s' % (coll, r['id']))
            ids.add(r['id'])
    for w in h['walls']:
        if w['level'] not in ENUMS['level'] or w['material'] not in ENUMS['material'] or w['role'] not in ENUMS['role_wall']:
            errs.append('wall enum ' + w['id'])
        if not (is_vec2(w['a']) and is_vec2(w['b'])):
            errs.append('wall vec ' + w['id'])
    wid = {w['id'] for w in h['walls']}
    for o in h['openings']:
        if o['kind'] not in ENUMS['opening'] or o['wallId'] not in wid or o['level'] not in ('lower', 'entrance', 'roof'):
            errs.append('opening ' + o['id'])
        if 'swingSide' in o and o['swingSide'] not in (1, -1):
            errs.append('swing ' + o['id'])
    for r in h['rooms']:
        if r['kind'] not in ENUMS['room'] or not all(is_vec2(p) for p in r['polygon']) or not is_vec2(r['labelAt']):
            errs.append('room ' + r['id'])
    for s in h['slabs']:
        if s['role'] not in ENUMS['slab'] or not all(is_vec2(p) for p in s['outline']):
            errs.append('slab ' + s['id'])
    for o in h['outdoor']:
        if o['kind'] not in ENUMS['outdoor'] or not all(is_vec2(p) for p in o['outline']):
            errs.append('outdoor ' + o['id'])
    for f in h['fixtures']:
        if f['kind'] not in ENUMS['fixture'] or not is_vec2(f['center']) or not is_vec2(f['size']):
            errs.append('fixture ' + f['id'])
    for c in h['columns']:
        if not is_vec2(c['center']) or not is_vec2(c['size']) or c['level'] not in ('lower', 'entrance', 'roof'):
            errs.append('column ' + c['id'])
    for t in ('terrainNatural', 'terrainFinished'):
        g = h['site'][t]
        if len(g['heights']) != g['rows'] * g['cols']:
            errs.append(t + ' size')
    top = {'version', 'meta', 'sheet', 'levels', 'site', 'walls', 'columns', 'openings', 'rooms', 'stairs', 'slabs',
           'outdoor', 'fixtures'}
    if set(h) != top:
        errs.append('top-level keys %s' % (set(h) ^ top))
    print('types.ts structural check:', errs or 'OK')


if __name__ == '__main__':
    check_types(json.load(open(HOUSE, encoding='utf-8')))
