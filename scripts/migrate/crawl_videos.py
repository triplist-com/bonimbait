#!/usr/bin/env python3
"""Crawl every video page listed in video-sitemap.xml and match it to our index.

The `video` post type is not exposed in the WP REST API, so we parse HTML.
Each video page has a main YouTube link in `.main-banner a.play-video`; the
"additional content" slider below it links to *other* videos, so we keep the
main ID separate from IDs found elsewhere on the page.

Matching uses data/processed/segments/*.json (the videos indexed for search)
and data/raw/metadata/*.json (every video we have metadata for).

Output: data/migration/videos.json

Usage:
  python scripts/migrate/crawl_videos.py [--limit N] [--no-cache]
"""

from __future__ import annotations

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup

from common import (
    DATA_DIR,
    LIVE_BASE,
    LIVE_CONCURRENCY,
    clean_text,
    dedupe,
    fetch,
    head_meta,
    img_src,
    post_id_from_body,
    sitemap_locs,
    slug_from_url,
    soup,
    write_json,
    youtube_ids,
)
from crawl_businesses import parse_hebrew_date


def load_existing() -> tuple[set[str], dict[str, dict[str, Any]]]:
    """(indexed_ids, metadata_by_id) from our pipeline output."""
    indexed = {p.stem for p in (DATA_DIR / "processed" / "segments").glob("*.json")}
    meta: dict[str, dict[str, Any]] = {}
    for p in (DATA_DIR / "raw" / "metadata").glob("*.json"):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        # channel_videos.json is a list of every channel video; others are one video each.
        for item in d if isinstance(d, list) else [d]:
            if isinstance(item, dict):
                vid = item.get("youtube_id") or item.get("id") or p.stem
                meta[vid] = {"title": item.get("title"), "upload_date": item.get("upload_date") or item.get("published_at")}
    return indexed, meta


def parse_video(url: str, html: str) -> dict[str, Any]:
    s = soup(html)
    single = s.select_one(".main-single-post") or s.select_one("div.content") or s.body
    title_el = single.select_one("h1.title") or s.select_one("h1")
    banner = single.select_one(".main-banner")
    main_ids = youtube_ids(str(banner)) if banner else []

    # Body text lives in .content-txt; embedded iframes there may add more IDs.
    body_el = single.select_one(".content-txt")
    body_html = body_el.decode_contents().strip() if body_el else ""
    body_ids = youtube_ids(body_html)

    # IDs on the page outside the "additional content" slider (related videos).
    page_copy = BeautifulSoup(str(s.select_one("div.content") or s.body), "lxml")
    for junk in page_copy.select("section.additional-content, [data-elementor-type=popup], header, footer"):
        junk.decompose()
    own_ids = dedupe(main_ids + body_ids + youtube_ids(str(page_copy)))
    related_ids = [i for i in youtube_ids(str(s.select_one("section.additional-content") or "")) if i not in own_ids]

    crumbs = s.select("#breadcrumbs a.breadcrumb-cat-chip")
    categories = [
        {"name": clean_text(a.get_text()), "slug": unquote([p for p in urlparse(a["href"]).path.split("/") if p][-1]), "url": a["href"]}
        for a in crumbs
        if a.get("href")
    ]
    date_el = s.select_one("#breadcrumbs .breadcrumb-date")
    stats = [clean_text(x.get_text()) for x in single.select(".side-stats .side-stat-num")]
    comments_count = s.select_one("#comments .comments-count strong")

    meta = head_meta(s)
    date_published = None
    date_modified = None
    for block in meta.get("json_ld", []):
        items = block.get("@graph", [block]) if isinstance(block, dict) else []
        for it in items:
            if isinstance(it, dict):
                date_published = date_published or it.get("datePublished")
                date_modified = date_modified or it.get("dateModified")

    author = single.select_one(".author-name-box")
    return {
        "id": post_id_from_body(s),
        "url": url,
        "legacy_slug": slug_from_url(url),
        "legacy_slug_raw": [p for p in urlparse(url).path.split("/") if p][-1],
        "title": clean_text(title_el.get_text()) if title_el else None,
        "youtube_id": main_ids[0] if main_ids else (own_ids[0] if own_ids else None),
        "youtube_ids": own_ids,
        "related_youtube_ids": related_ids,
        "thumbnail_url": img_src(banner.find("img")) if banner else None,
        "body_html": body_html,
        "body_text": clean_text(body_el.get_text(" ")) if body_el else "",
        "categories": categories,
        "date_label": clean_text(date_el.get_text()) if date_el else None,
        "date": parse_hebrew_date(date_el.get_text()) if date_el else None,
        "date_published": date_published,
        "date_modified": date_modified,
        "author": clean_text(author.get_text()) if author else None,
        "side_stats": stats,  # [views?, comments?] as rendered; icons only, no labels
        "comment_count": int(comments_count.get_text()) if comments_count and comments_count.get_text().strip().isdigit() else None,
        "seo": meta,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()
    use_cache = not args.no_cache

    urls = [u for u in sitemap_locs(f"{LIVE_BASE}/video-sitemap.xml", use_cache) if "/video/" in urlparse(u).path]
    if args.limit:
        urls = urls[: args.limit]
    print(f"{len(urls)} video URLs")

    def work(u: str) -> dict[str, Any]:
        try:
            body, headers = fetch(u, use_cache=use_cache)
            v = parse_video(u, body)
            # Some legacy video URLs 301 to a post; keep them, flagged, so the loader adds a redirect.
            v["redirected_to"] = headers.get("final_url")
            return v
        except Exception as exc:
            return {"url": u, "legacy_slug": slug_from_url(u), "error": repr(exc)}

    with ThreadPoolExecutor(max_workers=LIVE_CONCURRENCY) as pool:
        videos = list(pool.map(work, urls))

    indexed, meta = load_existing()
    for v in videos:
        ids = v.get("youtube_ids") or []
        match = next((i for i in ids if i in indexed), None)
        v["matched_existing"] = match is not None
        v["matched_youtube_id"] = match
        v["in_raw_metadata"] = any(i in meta for i in ids)

    ok = [v for v in videos if "error" not in v]
    errors = [v for v in videos if "error" in v]
    live_ids = {v["youtube_id"] for v in ok if v.get("youtube_id")}
    out = {
        "count": len(ok),
        "errors": errors,
        "matched_existing": sum(1 for v in ok if v["matched_existing"]),
        "in_raw_metadata": sum(1 for v in ok if v["in_raw_metadata"]),
        "without_youtube_id": [v["url"] for v in ok if not v.get("youtube_id")],
        "redirected": [{"from": v["url"], "to": v["redirected_to"]} for v in ok if v.get("redirected_to")],
        "indexed_total": len(indexed),
        "indexed_not_on_live_site": sorted(indexed - live_ids),
        "duplicate_youtube_ids": sorted({i for i in live_ids if sum(1 for v in ok if v.get("youtube_id") == i) > 1}),
        "videos": ok,
    }
    path = write_json("videos.json", out)
    print(f"Wrote {path}: {len(ok)} videos ({len(errors)} errors), {out['matched_existing']} matched indexed "
          f"({len(indexed)} indexed), {out['in_raw_metadata']} in raw metadata, {len(out['without_youtube_id'])} without YouTube ID, "
          f"{len(out['redirected'])} redirect elsewhere")


if __name__ == "__main__":
    main()
