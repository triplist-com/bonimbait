#!/usr/bin/env python3
"""Sitemap reconciliation: fill crawl gaps left by the paged REST listing.

The paged `wp/v2/posts?per_page=100` listing silently omits some items (e.g.
posts 80673/80677, excluded by a plugin), and some pages only exist as HTML.
This step, run after crawl_rest.py:

1. Re-reads the live Yoast sitemaps (post, page, service) and finds every URL
   whose decoded path isn't in posts.json / pages.json.
2. For each, fetches the HTML and takes the id from
   <link rel="alternate" type="application/json" href=".../wp-json/wp/v2/<type>/<id>">
   or the shortlink `?p=<id>`, then fetches `wp/v2/<posts|pages>/<id>?_embed=1`
   and normalizes it exactly like crawl_rest.py.
3. Falls back to scraping the HTML (title, content area, Yoast head meta) when
   REST has nothing. A 200 with an empty body (e.g. /services/, the archive of
   an empty `service` CPT that isn't in REST) becomes an empty page record with
   `synthetic: true`.
4. Fetches, by id, every category/tag referenced by a post but missing from
   categories.json / tags.json.

Appends to the JSON files in place (idempotent: dedupes on id / link) and writes
reconcile_report.json. Polite: sequential requests with the shared delay/retries.

  MIGRATION_DATA_DIR=/path/to/main/data scripts/.venv/bin/python scripts/migrate/reconcile_sitemaps.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import data_dir  # noqa: E402

# common.py reads MIGRATION_DATA_DIR at import time; point it at the real data/.
os.environ.setdefault("MIGRATION_DATA_DIR", str(data_dir()))

import requests  # noqa: E402

from common import LIVE_BASE, MIGRATION_DIR, fetch, fetch_json, head_meta, sitemap_locs, soup  # noqa: E402
from crawl_rest import normalize_post, normalize_term  # noqa: E402

SITEMAP_TYPES = {"post": "posts", "page": "pages", "service": "pages"}
JSON_LINK_RE = re.compile(r"/wp-json/wp/v2/([a-z_-]+)/(\d+)")
SHORTLINK_RE = re.compile(r"[?&]p=(\d+)")


def npath(url: str) -> str:
    p = unicodedata.normalize("NFC", unquote(urlparse(url).path))
    return p if p.endswith("/") else p + "/"


def load(name: str) -> Any:
    return json.loads((MIGRATION_DIR / name).read_text(encoding="utf-8"))


def save(name: str, data: Any) -> None:
    (MIGRATION_DIR / name).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def sitemap_urls(use_cache: bool) -> list[dict[str, str]]:
    out = []
    for t in SITEMAP_TYPES:
        try:
            for loc in sitemap_locs(f"{LIVE_BASE}/{t}-sitemap.xml", use_cache):
                out.append({"url": loc, "type": t})
        except requests.HTTPError as e:
            print(f"  {t}-sitemap.xml: {e}")
    return out


def rest_by_id(rest_base: str, wp_id: int) -> Optional[dict]:
    try:
        data, _ = fetch_json(f"{LIVE_BASE}/wp-json/wp/v2/{rest_base}/{wp_id}?_embed=1")
        return data if isinstance(data, dict) and data.get("id") == wp_id else None
    except (requests.HTTPError, ValueError):
        return None


def scrape(url: str, html: str, sm_type: str) -> dict:
    """HTML fallback in the normalize_post() shape."""
    s = soup(html) if html.strip() else None
    meta = head_meta(s) if s else {}
    body_cls = " ".join((s.body.get("class") or [])) if s and s.body else ""
    m = re.search(r"(?:postid|page-id)-(\d+)", body_cls)
    content = ""
    title = ""
    if s:
        h1 = s.find("h1")
        title = (h1.get_text(" ", strip=True) if h1 else "") or (meta.get("og:title") or meta.get("title") or "")
        area = s.select_one(".entry-content, article .content, main, #content")
        content = area.decode_contents() if area else ""
    path = npath(url).strip("/")
    return {
        "id": int(m.group(1)) if m else None,
        "type": "page" if SITEMAP_TYPES[sm_type] == "pages" else "post",
        "slug": path.split("/")[-1], "slug_raw": urlparse(url).path.strip("/").split("/")[-1],
        "link": url, "status": "publish", "title": title, "content_html": content,
        "excerpt_html": "", "date": None, "date_gmt": None, "modified": None, "modified_gmt": None,
        "parent": 0, "menu_order": 0, "template": "service-archive" if sm_type == "service" else "",
        "sticky": None, "comment_status": None, "category_ids": [], "tag_ids": [],
        "categories": [], "tags": [], "featured_image": None, "author": None, "acf": None,
        "seo": {"title": meta.get("title"), "description": meta.get("description"),
                "canonical": meta.get("canonical") or url, "robots": meta.get("robots"),
                "og_description": meta.get("og:description")},
        "synthetic": True,
        "synthetic_reason": "empty 200 body" if not html.strip() else "no REST record; scraped HTML",
        "sitemap_type": sm_type,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-cache", action="store_true", help="re-fetch sitemaps (item fetches always go live)")
    args = ap.parse_args()

    posts, pages = load("posts.json"), load("pages.json")
    have = {npath(p["link"]) for p in posts + pages if p.get("link")}
    ids = {("posts", p["id"]) for p in posts} | {("pages", p["id"]) for p in pages}
    report: dict[str, Any] = {"added_posts": [], "added_pages": [], "skipped": [], "terms_added": []}

    urls = sitemap_urls(use_cache=not args.no_cache)
    # /blog/ is WP's page_for_posts; Content owns it as a route.
    missing = [u for u in urls if npath(u["url"]) not in have and npath(u["url"]) != "/blog/"]
    print(f"sitemap URLs: {len(urls)}; missing from crawl: {len(missing)}")

    for u in missing:
        url, sm_type = u["url"], u["type"]
        try:
            html, _ = fetch(url, kind="html", use_cache=False)
        except requests.HTTPError as e:
            report["skipped"].append({"url": url, "reason": str(e)})
            continue
        rec = None
        m = JSON_LINK_RE.search(html) or None
        candidates: list[tuple[str, int]] = []
        if m:
            candidates.append((m.group(1), int(m.group(2))))
        sl = re.search(r"rel=['\"]shortlink['\"][^>]*href=['\"]([^'\"]+)", html)
        if sl and SHORTLINK_RE.search(sl.group(1)):
            wid = int(SHORTLINK_RE.search(sl.group(1)).group(1))
            candidates += [(SITEMAP_TYPES[sm_type], wid), ("posts", wid), ("pages", wid)]
        for rest_base, wid in dict.fromkeys(candidates):
            data = rest_by_id(rest_base, wid)
            if data:
                rec = normalize_post(data)
                rec["source"] = f"sitemap-reconcile:rest {rest_base}/{wid}"
                break
        if rec is None:
            rec = scrape(url, html, sm_type)
            rec["source"] = "sitemap-reconcile:html"
        bucket = "posts" if rec.get("type") == "post" else "pages"
        key = (bucket, rec["id"])
        if rec["id"] is not None and key in ids:
            report["skipped"].append({"url": url, "reason": f"id {rec['id']} already crawled under another path"})
            continue
        (posts if bucket == "posts" else pages).append(rec)
        ids.add(key)
        report[f"added_{bucket}"].append({"id": rec["id"], "url": npath(url), "source": rec["source"],
                                          "title": rec.get("title")})
        print(f"  + {bucket[:-1]} {rec['id']} {npath(url)}  ({rec['source']})")

    # Terms referenced by posts but missing from the term lists.
    for fname, field, rest in (("categories.json", "category_ids", "categories"), ("tags.json", "tag_ids", "tags")):
        terms = load(fname)
        known = {t["id"] for t in terms}
        wanted = sorted({i for p in posts for i in (p.get(field) or [])} - known)
        for tid in wanted:
            try:
                data, _ = fetch_json(f"{LIVE_BASE}/wp-json/wp/v2/{rest}/{tid}")
                terms.append({**normalize_term(data), "source": "sitemap-reconcile"})
                report["terms_added"].append({"taxonomy": rest, "id": tid, "slug": unquote(data.get("slug", ""))})
            except (requests.HTTPError, ValueError) as e:
                # Hidden term: fall back to the name/slug embedded in a post.
                emb = next((t for p in posts for t in (p.get("categories" if rest == "categories" else "tags") or [])
                            if t["id"] == tid), None)
                if emb:
                    terms.append({"id": tid, "name": emb["name"], "slug": emb["slug"], "slug_raw": emb["slug"],
                                  "description": "", "parent": 0, "count": None, "link": None,
                                  "taxonomy": "category" if rest == "categories" else "post_tag", "seo": {},
                                  "source": "sitemap-reconcile:embedded"})
                    report["terms_added"].append({"taxonomy": rest, "id": tid, "slug": emb["slug"], "embedded": True})
                else:
                    report["skipped"].append({"term": f"{rest}/{tid}", "reason": str(e)[:120]})
        save(fname, terms)
        print(f"  {rest}: {len(wanted)} missing ids referenced by posts")

    save("posts.json", posts)
    save("pages.json", pages)
    save("reconcile_report.json", report)
    print(json.dumps({k: len(v) for k, v in report.items()}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
