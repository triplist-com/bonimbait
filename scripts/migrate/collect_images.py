#!/usr/bin/env python3
"""Collect every unique image URL referenced by the migrated content (no downloads).

Reads the outputs of the other crawlers in data/migration/ and writes
data/migration/images.json:
  {
    "total": N,                  # unique URLs referenced by content
    "by_source": {...},          # posts/pages/products/videos/businesses/site
    "hosts": {...},              # host -> count (non-bonimbayit hosts are external)
    "media_library_total": M,    # WP media library items visible via REST
    "urls": [{"url", "sources": [...]}, ...]
  }

The Wave 2 loader transfers these to Supabase Storage.

Usage:
  python scripts/migrate/collect_images.py
"""

from __future__ import annotations

import html
from collections import Counter, defaultdict
from typing import Any
from urllib.parse import urlparse

from common import MIGRATION_DIR, collect_image_urls, read_json, write_json


def load(name: str) -> Any:
    return read_json(name) if (MIGRATION_DIR / name).exists() else None


def main() -> None:
    sources: dict[str, set[str]] = defaultdict(set)

    def add(source: str, obj: Any) -> None:
        found: set[str] = set()
        collect_image_urls(obj, found)
        sources[source].update(html.unescape(u) for u in found)

    posts = load("posts.json") or []
    for p in posts:
        add("posts", [p.get("content_html"), p.get("excerpt_html"), p.get("featured_image"), (p.get("seo") or {}).get("og_image")])
    for p in load("pages.json") or []:
        add("pages", [p.get("content_html"), p.get("featured_image"), (p.get("seo") or {}).get("og_image")])
    products = load("products.json") or {}
    add("products", [pr.get("images") for pr in products.get("products", [])] + [pr.get("description_html") for pr in products.get("products", [])])
    videos = load("videos.json") or {}
    add("videos", [[v.get("thumbnail_url"), v.get("body_html"), (v.get("seo") or {}).get("og:image")] for v in videos.get("videos", [])])
    businesses = load("businesses.json") or {}
    add("businesses", [[b.get("image_urls"), b.get("about_html")] for b in businesses.get("businesses", [])])
    for c in load("categories.json") or []:
        add("categories", (c.get("seo") or {}).get("og_image"))

    by_url: dict[str, list[str]] = defaultdict(list)
    for src, urls in sources.items():
        for u in urls:
            by_url[u].append(src)
    # Drop obvious non-content chrome (WP emoji, theme icons are kept on purpose: they are real assets).
    urls = sorted(u for u in by_url if "/wp-includes/images/smilies/" not in u and "s.w.org/images/core/emoji" not in u)

    media = load("media.json") or []
    hosts = Counter(urlparse(u).netloc for u in urls)
    out = {
        "total": len(urls),
        "by_source": {k: len(v) for k, v in sorted(sources.items())},
        "hosts": dict(hosts.most_common()),
        "media_library_total": len(media),
        "media_library_not_referenced": len({m["url"] for m in media if m.get("url")} - set(urls)),
        "urls": [{"url": u, "sources": sorted(by_url[u])} for u in urls],
    }
    path = write_json("images.json", out)
    print(f"Wrote {path}: {len(urls)} unique image URLs; by source {out['by_source']}; hosts {dict(hosts.most_common(5))}")


if __name__ == "__main__":
    main()
