#!/usr/bin/env python3
"""Export posts, pages, categories, tags, media and products from the live WP REST API.

Outputs (under data/migration/):
  posts.json, pages.json, categories.json, tags.json, media.json, products.json

Usage:
  python scripts/migrate/crawl_rest.py [--no-cache] [--skip-media]
"""

from __future__ import annotations

import argparse
import html
import math
from typing import Any
from urllib.parse import unquote

from common import LIVE_BASE, fetch_json, write_json

API = f"{LIVE_BASE}/wp-json"


def paged(endpoint: str, params: str = "", use_cache: bool = True) -> list[dict[str, Any]]:
    """Fetch every page of a WP collection endpoint (per_page=100)."""
    first_url = f"{API}/{endpoint}?per_page=100&page=1{params}"
    first, headers = fetch_json(first_url, use_cache)
    total_pages = int(headers.get("X-WP-TotalPages") or headers.get("x-wp-totalpages") or 1)
    items: list[dict[str, Any]] = list(first)
    for page in range(2, total_pages + 1):
        data, _ = fetch_json(f"{API}/{endpoint}?per_page=100&page={page}{params}", use_cache)
        items.extend(data)
    expected = headers.get("X-WP-Total") or headers.get("x-wp-total")
    print(f"  {endpoint}: {len(items)} items (X-WP-Total={expected})")
    return items


def rendered(field: Any) -> str:
    if isinstance(field, dict):
        return field.get("rendered") or ""
    return field or ""


def yoast(item: dict[str, Any]) -> dict[str, Any]:
    y = item.get("yoast_head_json") or {}
    og_image = (y.get("og_image") or [{}])[0].get("url") if y.get("og_image") else None
    return {
        "title": y.get("title"),
        "description": y.get("description"),
        "canonical": y.get("canonical"),
        "robots": y.get("robots"),
        "og_title": y.get("og_title"),
        "og_description": y.get("og_description"),
        "og_type": y.get("og_type"),
        "og_url": y.get("og_url"),
        "og_image": og_image,
        "article_published_time": y.get("article_published_time"),
        "article_modified_time": y.get("article_modified_time"),
        "schema": y.get("schema"),
    }


def terms(item: dict[str, Any], taxonomy: str) -> list[dict[str, Any]]:
    out = []
    for group in (item.get("_embedded") or {}).get("wp:term") or []:
        for t in group:
            if t.get("taxonomy") == taxonomy:
                out.append({"id": t["id"], "name": html.unescape(t["name"]), "slug": unquote(t["slug"])})
    return out


def featured(item: dict[str, Any]) -> dict[str, Any] | None:
    media = (item.get("_embedded") or {}).get("wp:featuredmedia") or []
    if not media or "source_url" not in media[0]:
        return None
    m = media[0]
    return {"id": m.get("id"), "url": m.get("source_url"), "alt": m.get("alt_text"), "mime": m.get("mime_type")}


def author(item: dict[str, Any]) -> dict[str, Any] | None:
    authors = (item.get("_embedded") or {}).get("author") or []
    if not authors or "name" not in authors[0]:
        return {"id": item.get("author")} if item.get("author") else None
    a = authors[0]
    return {
        "id": a.get("id"),
        "name": a.get("name"),
        "slug": a.get("slug"),
        "description": a.get("description"),
        "avatar": (a.get("avatar_urls") or {}).get("96"),
    }


def normalize_post(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "type": item.get("type"),
        "slug": unquote(item["slug"]),
        "slug_raw": item["slug"],
        "link": item.get("link"),
        "status": item.get("status"),
        "title": html.unescape(rendered(item.get("title"))),
        "content_html": rendered(item.get("content")),
        "excerpt_html": rendered(item.get("excerpt")),
        "date": item.get("date"),
        "date_gmt": item.get("date_gmt"),
        "modified": item.get("modified"),
        "modified_gmt": item.get("modified_gmt"),
        "parent": item.get("parent"),
        "menu_order": item.get("menu_order"),
        "template": item.get("template"),
        "sticky": item.get("sticky"),
        "comment_status": item.get("comment_status"),
        "category_ids": item.get("categories"),
        "tag_ids": item.get("tags"),
        "categories": terms(item, "category"),
        "tags": terms(item, "post_tag"),
        "featured_image": featured(item),
        "author": author(item),
        "acf": item.get("acf") or None,
        "seo": yoast(item),
    }


def normalize_term(t: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": t["id"],
        "name": html.unescape(t.get("name", "")),
        "slug": unquote(t.get("slug", "")),
        "slug_raw": t.get("slug"),
        "description": t.get("description"),
        "parent": t.get("parent"),
        "count": t.get("count"),
        "link": t.get("link"),
        "taxonomy": t.get("taxonomy"),
        "seo": yoast(t),
    }


def normalize_product(p: dict[str, Any]) -> dict[str, Any]:
    prices = p.get("prices") or {}
    minor = int(prices.get("currency_minor_unit") or 0)

    def money(v: Any) -> float | None:
        if v in (None, ""):
            return None
        return int(v) / math.pow(10, minor)

    return {
        "id": p["id"],
        "name": html.unescape(p.get("name", "")),
        "slug": unquote(p.get("slug", "")),
        "slug_raw": p.get("slug"),
        "type": p.get("type"),
        "permalink": p.get("permalink"),
        "sku": p.get("sku"),
        "price": money(prices.get("price")),
        "regular_price": money(prices.get("regular_price")),
        "sale_price": money(prices.get("sale_price")),
        "currency": prices.get("currency_code"),
        "on_sale": p.get("on_sale"),
        "description_html": p.get("description"),
        "short_description_html": p.get("short_description"),
        "images": [{"id": i.get("id"), "url": i.get("src"), "alt": i.get("alt"), "name": i.get("name")} for i in p.get("images") or []],
        "categories": [{"id": c.get("id"), "name": html.unescape(c.get("name", "")), "slug": unquote(c.get("slug", ""))} for c in p.get("categories") or []],
        "tags": [{"id": c.get("id"), "name": html.unescape(c.get("name", "")), "slug": unquote(c.get("slug", ""))} for c in p.get("tags") or []],
        "attributes": p.get("attributes"),
        "is_purchasable": p.get("is_purchasable"),
        "is_in_stock": p.get("is_in_stock"),
        "add_to_cart": p.get("add_to_cart"),
        "average_rating": p.get("average_rating"),
        "review_count": p.get("review_count"),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--no-cache", action="store_true", help="refetch instead of using data/migration/raw")
    ap.add_argument("--skip-media", action="store_true", help="skip the (large) media library listing")
    args = ap.parse_args()
    use_cache = not args.no_cache

    print("Posts...")
    posts = [normalize_post(p) for p in paged("wp/v2/posts", "&_embed=1", use_cache)]
    print(f"  wrote {write_json('posts.json', posts)}")

    print("Pages...")
    pages = [normalize_post(p) for p in paged("wp/v2/pages", "&_embed=1", use_cache)]
    print(f"  wrote {write_json('pages.json', pages)}")

    print("Categories + tags...")
    cats = [normalize_term(t) for t in paged("wp/v2/categories", "", use_cache)]
    write_json("categories.json", cats)
    tags = [normalize_term(t) for t in paged("wp/v2/tags", "", use_cache)]
    write_json("tags.json", tags)

    print("Products (WC Store API)...")
    products = [normalize_product(p) for p in paged("wc/store/v1/products", "", use_cache)]
    product_cats = paged("wc/store/v1/products/categories", "", use_cache)
    write_json("products.json", {"products": products, "product_categories": product_cats})

    if not args.skip_media:
        print("Media library...")
        media = [
            {
                "id": m["id"],
                "url": m.get("source_url"),
                "mime": m.get("mime_type"),
                "alt": m.get("alt_text"),
                "title": html.unescape(rendered(m.get("title"))),
                "date": m.get("date"),
                "post": m.get("post"),
                "width": (m.get("media_details") or {}).get("width"),
                "height": (m.get("media_details") or {}).get("height"),
            }
            for m in paged("wp/v2/media", "", use_cache)
        ]
        write_json("media.json", media)

    print(f"Done: {len(posts)} posts, {len(pages)} pages, {len(cats)} categories, {len(tags)} tags, {len(products)} products")


if __name__ == "__main__":
    main()
