#!/usr/bin/env python
"""Load report: JSON counts vs DB counts per entity, plus orphans.

  scripts/.venv/bin/python scripts/migrate/verify_load.py            # human-readable
  scripts/.venv/bin/python scripts/migrate/verify_load.py --json     # machine-readable

Exit code 1 when a count doesn't match or DB-level orphans exist.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import database_url, migration_dir  # noqa: E402
import media  # noqa: E402


def j(name: str):
    return json.loads((migration_dir() / f"{name}.json").read_text(encoding="utf-8"))


def expected() -> dict[str, int]:
    posts = j("posts")
    biz = j("businesses")["businesses"]
    prods = j("products")
    live = j("live_urls")
    urls = live.get("urls") if isinstance(live, dict) else live
    cp = {m.group(1) for u in urls for m in [re.search(r"/category-product/([^/]+)/",
                                                       u if isinstance(u, str) else u.get("url", ""))] if m}
    specs = set(j("site_structure").get("business_specialties") or [])
    for b in biz:
        specs |= {s for s in [b.get("primary_specialty"), *(b.get("specialties") or [])] if s}
    return {
        "authors": len({p["author"]["id"] for p in posts if p.get("author")}),
        "post_categories": len(j("categories")),
        "post_tags": len(j("tags")),
        "posts": len(posts),
        "post_category_assignments": sum(len(set(p.get("category_ids") or [])) for p in posts),
        "post_tag_assignments": sum(len(set(p.get("tag_ids") or [])) for p in posts),
        "pages": len(j("pages")),
        "video_pages": len(j("videos")["videos"]),
        "specialties": len(specs),
        "businesses": len(biz),
        "business_contacts": len(biz),
        "business_regions": sum(len(set(b.get("regions") or [])) for b in biz),
        "reviews": sum(len(b.get("reviews") or []) for b in biz),
        "product_categories": len(prods.get("product_categories") or []) + len(cp),
        "products": len(prods["products"]),
    }


LEGACY_FILTER = {  # only count migrated rows (other agents may add zz-test- rows)
    "authors": "legacy_wp_id is not null",
    "post_categories": "legacy_wp_id is not null",
    "post_tags": "legacy_wp_id is not null",
    "posts": "legacy_wp_id is not null",
    "pages": "(legacy_wp_id is not null or template = 'service-archive')",
    "video_pages": "slug_not_test",
    "businesses": "legacy_wp_id is not null",
    "reviews": "source = 'migrated'",
    "products": "legacy_wp_id is not null",
}


def db_counts(conn) -> dict[str, int]:
    out = {}
    for t in expected():
        where = LEGACY_FILTER.get(t, "")
        if where == "slug_not_test":
            where = "legacy_slug not like 'zz-test-%'"
        elif t in ("post_category_assignments", "post_tag_assignments"):
            where = "post_id in (select id from public.posts where legacy_wp_id is not null)"
        elif t in ("business_contacts", "business_regions"):
            where = "business_id in (select id from public.businesses where legacy_wp_id is not null)"
        elif t == "specialties":
            where = "slug not like 'zz-test-%'"
        elif t == "product_categories":
            where = "slug not like 'zz-test-%'"
        sql = f"select count(*) from public.{t}" + (f" where {where}" if where else "")
        out[t] = conn.execute(sql).fetchone()[0]
    return out


DB_ORPHAN_QUERIES = {
    "posts_without_category": "select slug from public.posts where legacy_wp_id is not null and not exists "
                              "(select 1 from public.post_category_assignments a where a.post_id = posts.id)",
    "posts_primary_category_missing": "select slug from public.posts where legacy_wp_id is not null and primary_category_id is null",
    "posts_without_author": "select slug from public.posts where legacy_wp_id is not null and author_id is null",
    "businesses_without_region": "select slug from public.businesses where legacy_wp_id is not null and not exists "
                                 "(select 1 from public.business_regions r where r.business_id = businesses.id)",
    "businesses_without_specialty": "select slug from public.businesses where legacy_wp_id is not null and not exists "
                                    "(select 1 from public.business_specialties s where s.business_id = businesses.id)",
    "businesses_without_primary_specialty": "select slug from public.businesses where legacy_wp_id is not null and primary_specialty_id is null",
    "businesses_without_phone": "select b.slug from public.businesses b left join public.business_contacts c on c.business_id = b.id "
                                "where b.legacy_wp_id is not null and c.phone is null",
    "video_pages_not_linked_to_videos": "select legacy_slug from public.video_pages where video_id is null and status = 'published'",
    "specialties_unused": "select name from public.specialties s where not exists "
                          "(select 1 from public.business_specialties x where x.specialty_id = s.id)",
}
# Orphan kinds that mean data was dropped (fail the run). The rest are informational.
# businesses_without_region is informational: 1 crawled business has no regions at all.
HARD_ORPHANS = {"posts_without_category"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    exp = expected()
    with psycopg.connect(database_url()) as conn:
        got = db_counts(conn)
        db_orphans = {k: [r[0] for r in conn.execute(q)] for k, q in DB_ORPHAN_QUERIES.items()}
        live_urls_left = conn.execute(
            "select (select count(*) from public.posts where content_html ~ 'bonimbayit\\.co\\.il/wp-content/uploads/') +"
            "(select count(*) from public.posts where featured_image like '%bonimbayit.co.il/wp-content/%') +"
            "(select count(*) from public.businesses where coalesce(logo_url,'') || coalesce(cover_image_url,'') || gallery::text "
            "  like '%bonimbayit.co.il/wp-content/%')").fetchone()[0]

    manifest = media.load_manifest()
    by_status: dict[str, int] = {}
    for e in manifest.values():
        k = e["status"] if e["status"] in ("uploaded", "404") else "error"
        by_status[k] = by_status.get(k, 0) + 1
    img_404 = sorted(u for u, e in manifest.items() if e["status"] == "404")
    img_err = sorted(u for u, e in manifest.items() if e["status"] not in ("uploaded", "404"))

    rep_path = migration_dir() / "load_report.json"
    loader = json.loads(rep_path.read_text(encoding="utf-8")) if rep_path.exists() else {}

    entities = {k: {"json": exp[k], "db": got[k], "ok": exp[k] == got[k]} for k in exp}
    result = {
        "entities": entities,
        "all_counts_match": all(v["ok"] for v in entities.values()),
        "loader_orphans": loader.get("orphans", {}),
        "db_orphans": {k: {"count": len(v), "sample": v[:10]} for k, v in db_orphans.items()},
        "images": {"manifest": by_status, "404_on_live": img_404, "errors": img_err[:20],
                   "rows_still_pointing_at_live_uploads": live_urls_left,
                   "loader_rewrite": loader.get("image_urls")},
        "sanitize": loader.get("sanitize"),
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=1))
    else:
        print(f"{'entity':28} {'json':>6} {'db':>6}")
        for k, v in entities.items():
            print(f"{k:28} {v['json']:>6} {v['db']:>6}  {'OK' if v['ok'] else 'MISMATCH'}")
        print("\nloader orphans:", {k: len(v) for k, v in result["loader_orphans"].items()} or "none")
        for k, v in result["loader_orphans"].items():
            print(f"  {k}: {v[:10]}")
        print("\ndb checks:")
        for k, v in result["db_orphans"].items():
            print(f"  {k}: {v['count']}" + (f"  e.g. {v['sample'][:5]}" if v["count"] else ""))
        print("\nimages:", by_status, f"| 404 on live: {len(img_404)} | errors: {len(img_err)}"
              f" | rows still pointing at live uploads: {live_urls_left}")
        for u in img_404[:20]:
            print("  404", u)
    bad = not result["all_counts_match"] or any(db_orphans[k] for k in HARD_ORPHANS)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
