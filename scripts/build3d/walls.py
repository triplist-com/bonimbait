"""Wall decomposition: filled wall pieces -> straight runs (centerline + thickness).

AutoCAD draws every wall as a set of axis-aligned solid-hatch rectangles, split where the
material changes (red = blocks, blue = reinforced concrete) and at corners. We:
  1. fold tiny slivers (pipe-recess notches) into a bounding rectangle,
  2. classify every piece as horizontal 'H', vertical 'V' or square-ish 'S',
  3. merge touching collinear pieces of the same material and thickness band into runs,
  4. attach square corner pieces to an adjacent run.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from pdfplan import Rect, wall_fill_rects

TOL = 0.35  # pt, coordinate tolerance (~1 cm)


@dataclass
class Run:
    vp: str
    orient: str  # 'H' (along x) | 'V' (along y)
    mat: str
    lo: float  # start along the run axis
    hi: float  # end along the run axis
    b0: float  # band start (perpendicular axis)
    b1: float  # band end
    pieces: list = field(default_factory=list)

    @property
    def length(self):
        return self.hi - self.lo

    @property
    def thick(self):
        return self.b1 - self.b0

    def rect(self):
        if self.orient == 'H':
            return (self.lo, self.b0, self.hi, self.b1)
        return (self.b0, self.lo, self.b1, self.hi)


def fold_slivers(rects: list[Rect]) -> list[Rect]:
    solid = [r for r in rects if not r.sliver]
    sl = [r for r in rects if r.sliver]
    groups: list[list[Rect]] = []
    for r in sl:
        for g in groups:
            if any(abs(r.x0 - q.x0) < 3 and abs(r.y0 - q.y0) < 3 or
                   (r.x0 <= q.x1 + 0.6 and q.x0 <= r.x1 + 0.6 and r.y0 <= q.y1 + 0.6 and q.y0 <= r.y1 + 0.6)
                   for q in g):
                g.append(r)
                break
        else:
            groups.append([r])
    for g in groups:
        x0 = min(q.x0 for q in g); y0 = min(q.y0 for q in g)
        x1 = max(q.x1 for q in g); y1 = max(q.y1 for q in g)
        # widen the bbox to the wall band of the neighbouring solid piece
        for s in solid:
            if s.vp != g[0].vp:
                continue
            if abs(s.y1 - y0) < 1.0 or abs(s.y0 - y1) < 1.0:  # stacked vertically
                if s.x0 - 0.5 <= x0 and x1 <= s.x1 + 0.5:
                    x0, x1 = s.x0, s.x1
            if abs(s.x1 - x0) < 1.0 or abs(s.x0 - x1) < 1.0:
                if s.y0 - 0.5 <= y0 and y1 <= s.y1 + 0.5:
                    y0, y1 = s.y0, s.y1
        if (x1 - x0) * (y1 - y0) < 1.0:
            continue
        solid.append(Rect(x0, y0, x1, y1, g[0].mat, g[0].vp))
    return solid


def orient_of(r: Rect) -> str:
    if r.w >= r.h * 1.4:
        return 'H'
    if r.h >= r.w * 1.4:
        return 'V'
    return 'S'


def build_runs(rects: list[Rect] | None = None) -> list[Run]:
    rects = fold_slivers(rects if rects is not None else wall_fill_rects())
    runs: list[Run] = []
    squares: list[Rect] = []
    for r in rects:
        o = orient_of(r)
        if o == 'S':
            squares.append(r)
            continue
        if o == 'H':
            runs.append(Run(r.vp, 'H', r.mat, r.x0, r.x1, r.y0, r.y1, [r]))
        else:
            runs.append(Run(r.vp, 'V', r.mat, r.y0, r.y1, r.x0, r.x1, [r]))

    def merge_pass(runs):
        changed = True
        while changed:
            changed = False
            runs.sort(key=lambda u: (u.vp, u.orient, round(u.b0), u.lo))
            out: list[Run] = []
            for u in runs:
                if out:
                    p = out[-1]
                    if (p.vp == u.vp and p.orient == u.orient and p.mat == u.mat and
                            abs(p.b0 - u.b0) < TOL and abs(p.b1 - u.b1) < TOL and u.lo <= p.hi + TOL):
                        p.hi = max(p.hi, u.hi)
                        p.pieces += u.pieces
                        changed = True
                        continue
                out.append(u)
            runs = out
        return runs

    runs = merge_pass(runs)

    # attach squares: prefer a collinear run of the same material whose band matches
    leftovers = []
    for s in squares:
        best = None
        for u in runs:
            if u.vp != s.vp:
                continue
            if u.orient == 'H' and abs(u.b0 - s.y0) < TOL and abs(u.b1 - s.y1) < TOL:
                if abs(u.hi - s.x0) < TOL or abs(u.lo - s.x1) < TOL:
                    score = (u.mat == s.mat, u.length)
                    if best is None or score > best[0]:
                        best = (score, u)
            if u.orient == 'V' and abs(u.b0 - s.x0) < TOL and abs(u.b1 - s.x1) < TOL:
                if abs(u.hi - s.y0) < TOL or abs(u.lo - s.y1) < TOL:
                    score = (u.mat == s.mat, u.length)
                    if best is None or score > best[0]:
                        best = (score, u)
        if best and best[1].mat == s.mat:
            u = best[1]
            if u.orient == 'H':
                u.lo = min(u.lo, s.x0); u.hi = max(u.hi, s.x1)
            else:
                u.lo = min(u.lo, s.y0); u.hi = max(u.hi, s.y1)
            u.pieces.append(s)
        else:
            leftovers.append(s)
    for s in leftovers:
        # standalone square piece (usually a concrete column in a block wall)
        o = 'H' if s.w >= s.h else 'V'
        if o == 'H':
            runs.append(Run(s.vp, 'H', s.mat, s.x0, s.x1, s.y0, s.y1, [s]))
        else:
            runs.append(Run(s.vp, 'V', s.mat, s.y0, s.y1, s.x0, s.x1, [s]))
    runs = merge_pass(runs)
    return runs


if __name__ == '__main__':
    rs = build_runs()
    for u in sorted(rs, key=lambda u: (u.vp, u.orient, u.b0, u.lo)):
        print(u.vp[:3], u.orient, u.mat[:4], 'band %.2f-%.2f (t=%.2f)' % (u.b0, u.b1, u.thick),
              'span %.2f-%.2f (L=%.2f)' % (u.lo, u.hi, u.length), len(u.pieces))
    print(len(rs))
