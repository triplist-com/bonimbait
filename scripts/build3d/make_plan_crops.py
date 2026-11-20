"""Render the two viewports of the plan sheet as separate web images.

  data/build3d-venv/bin/python -I scripts/build3d/make_plan_crops.py

apps/web/public/build3d/plan-entrance.webp  = sheet bbox FRAME['entrance'] (page points)
apps/web/public/build3d/plan-lower.webp     = sheet bbox FRAME['lower']
Both are 1400 px wide; px = (pt - bbox.x0) * 1400 / (bbox.x1 - bbox.x0) (same factor in y).
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pymupdf
from PIL import Image

from pdfplan import FRAME, PDF_PATH, ROOT

WIDTH = 1400
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'build3d')


def main():
    doc = pymupdf.open(PDF_PATH)
    page = doc[0]
    for vp, (x0, y0, x1, y1) in FRAME.items():
        zoom = WIDTH / (x1 - x0)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=pymupdf.Rect(x0, y0, x1, y1))
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        path = os.path.join(OUT, 'plan-%s.webp' % vp)
        im.save(path, 'WEBP', quality=80, method=6)
        print(path, im.size, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
