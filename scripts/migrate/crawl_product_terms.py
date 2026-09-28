#!/usr/bin/env python3
"""Crawl the product taxonomy archives the REST crawl can't see.

The live site has two product taxonomies:
  * product_cat       /product-category/<slug>/   (1 term, "כללי"; in the WC Store API)
  * category_product  /category-product/<slug>/   (8 construction-stage terms; NOT in REST)

Neither the Store API nor wp/v2 exposes category_product terms or memberships,
so this reads each archive page listed in the live sitemaps (live_urls.json):
  * term id    <body class="... term-293 ...">
  * name       <title>ארכיון <name> - בונים בית</title>  (the archive heading text)
  * SEO        Yoast title / description / canonical from <head>
  * products   the product cards (.posts .product-item a[href*="/product/"])

Output: data/migration/product_terms.json
  {"terms": [{"id", "taxonomy", "slug", "name", "sort_order", "seo_title",
              "seo_description", "canonical", "product_slugs": [...]}]}

9 requests, sequential, cached under raw/html (use --no-cache to refetch).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import data_dir  # noqa: E402

os.environ.setdefault("MIGRATION_DATA_DIR", str(data_dir()))

from common import MIGRATION_DIR, fetch, head_meta, soup, write_json  # noqa: E402

TAXONOMY_BY_PREFIX = {"category-product": "category_product", "product-category": "product_cat"}
TITLE_RE = re.compile(r"^(?:ארכיון\s+)?(.+?)(?:\s+Archives)?\s+-\s+בונים בית$")


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", unquote(s))


def parse_archive(url: str, html: str, taxonomy: str) -> dict:
    s = soup(html)
    body_cls = " ".join(s.body.get("class") or []) if s.body else ""
    m = re.search(r"\bterm-(\d+)\b", body_cls)
    meta = head_meta(s)
    title = meta.get("title") or ""
    tm = TITLE_RE.match(title)
    name = tm.group(1).strip() if tm else ""
    if not name:
        h1 = s.find("h1")
        name = (h1.get_text(" ", strip=True) if h1 else "").replace("הטבות לפי שלבי הבניה", "").strip()
    cards = s.select(".posts .product-item a[href*='/product/']") or s.select("li.product a[href*='/product/']")
    slugs = []
    for a in cards:
        path = urlparse(a["href"]).path
        mm = re.search(r"/product/([^/]+)/?", path)
        if mm:
            slug = nfc(mm.group(1))
            if slug not in slugs:
                slugs.append(slug)
    return {
        "id": int(m.group(1)) if m else None,
        "taxonomy": taxonomy,
        "slug": nfc(urlparse(url).path.strip("/").split("/")[-1]),
        "name": name,
        "seo_title": title or None,
        "seo_description": meta.get("description"),
        "canonical": meta.get("canonical") or url,
        "url": url,
        "product_slugs": slugs,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()
    import json

    live = json.loads((MIGRATION_DIR / "live_urls.json").read_text(encoding="utf-8"))
    urls = [u["url"] for u in live["urls"] if u.get("type") in ("category_product", "product_cat")]
    terms = []
    for url in urls:
        prefix = urlparse(url).path.strip("/").split("/")[0]
        html, _ = fetch(url, kind="html", use_cache=not args.no_cache)
        t = parse_archive(url, html, TAXONOMY_BY_PREFIX[prefix])
        terms.append(t)
        print(f"  {t['taxonomy']:16} {t['id']} {t['slug']:12} {t['name']:14} products={len(t['product_slugs'])}")
    # Live menu order of the stage terms is the construction order (term ids descend).
    stage = sorted((t for t in terms if t["taxonomy"] == "category_product"), key=lambda t: -(t["id"] or 0))
    for i, t in enumerate(stage, start=1):
        t["sort_order"] = i
    for t in terms:
        t.setdefault("sort_order", 0)
    write_json("product_terms.json", {"terms": terms})
    print(f"wrote product_terms.json: {len(terms)} terms, "
          f"{sum(len(t['product_slugs']) for t in terms)} memberships")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
