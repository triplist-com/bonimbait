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
import requests

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
        "product_category_assignments": product_memberships(),
    }


def product_memberships() -> int:
    """Crawled archive memberships (crawl_product_terms.py) across both product taxonomies."""
    p = migration_dir() / "product_terms.json"
    if not p.exists():
        return len(j("products")["products"])  # fallback: every product in the one product_cat
    return sum(len(set(t.get("product_slugs") or [])) for t in json.loads(p.read_text(encoding="utf-8"))["terms"])


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
        elif t == "product_category_assignments":
            where = "product_id in (select id from public.products where legacy_wp_id is not null)"
        sql = f"select count(*) from public.{t}" + (f" where {where}" if where else "")
        out[t] = conn.execute(sql).fetchone()[0]
    return out


# Every table holding migrated/seeded content. Each text/varchar/jsonb/array
# column is scanned for the old host's wp-content (uploads, plugins, themes).
CONTENT_TABLES = [
    "authors", "post_categories", "post_tags", "posts", "pages", "video_pages",
    "specialties", "businesses", "business_contacts", "reviews",
    "product_categories", "products", "service_plans", "service_plan_prices",
    "redirects", "whatsapp_groups", "regions",
]
OLD_HOST_PATTERN = "%bonimbayit.co.il/wp-content%"


def old_host_references(conn) -> dict[str, int]:
    """{'table.column': rows} for every content column still pointing at the old host's wp-content."""
    cols = conn.execute(
        "select table_name, column_name, data_type from information_schema.columns "
        "where table_schema = 'public' and table_name = any(%s) "
        "and data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')",
        (CONTENT_TABLES,)).fetchall()
    out = {}
    for table, col, dtype in cols:
        expr = f'"{col}"::text' if dtype in ("jsonb", "json", "ARRAY") else f'"{col}"'
        n = conn.execute(f'select count(*) from public."{table}" where {expr} like %s',
                         (OLD_HOST_PATTERN,)).fetchone()[0]
        if n:
            out[f"{table}.{col}"] = n
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
    "products_with_old_host_images": "select slug from public.products where coalesce(featured_image,'') || images::text "
                                     "like '%bonimbayit.co.il/wp-content/%'",
    "product_category_names_vs_seo": "select slug from public.product_categories where seo_title is not null "
                                     "and position(name in seo_title) = 0",
    "specialties_unused": "select name from public.specialties s where not exists "
                          "(select 1 from public.business_specialties x where x.specialty_id = s.id)",
}
# Orphan kinds that mean data was dropped (fail the run). The rest are informational.
# businesses_without_region is informational: 1 crawled business has no regions at all.
HARD_ORPHANS = {"posts_without_category", "products_with_old_host_images"}


def storage_check(manifest: dict, sample_size: int = 25) -> dict:
    """Are migrated files really in the target Storage? The manifest must record
    an upload to this target for every referenced file, and a sample of public
    URLs must answer 200 (a load without `--only images` rewrites links but
    uploads nothing)."""
    target = media.upload_target()
    keys = {e["key"] for e in manifest.values() if e["status"] in ("uploaded", "replaced")}
    in_target = {e["key"] for e in manifest.values()
                 if e["status"] == "uploaded" and target in media.uploaded_to(e)}
    missing = sorted(keys - in_target)
    sample = sorted(in_target)[:: max(1, len(in_target) // sample_size)][:sample_size]
    bad_http = []
    for key in sample:
        url = media.public_url(key)
        try:
            code = requests.head(url, timeout=30, allow_redirects=True).status_code
        except requests.RequestException as e:
            code = type(e).__name__
        if code != 200:
            bad_http.append(f"{code} {url}")
    return {"target": target, "files": len(keys), "not_uploaded_to_target": missing,
            "sampled": len(sample), "sample_failures": bad_http}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    exp = expected()
    with psycopg.connect(database_url()) as conn:
        got = db_counts(conn)
        db_orphans = {k: [r[0] for r in conn.execute(q)] for k, q in DB_ORPHAN_QUERIES.items()}
        old_host_refs = old_host_references(conn)
        live_urls_left = sum(old_host_refs.values())

    manifest = media.load_manifest()
    by_status: dict[str, int] = {}
    for e in manifest.values():
        st = e["status"]
        k = st if st in ("uploaded", "replaced", "404", "gone") else "error"
        by_status[k] = by_status.get(k, 0) + 1
    # Dead on the live site (404, or a redirect to the homepage) with no replacement:
    # the loader drops these references; listed so an editor can re-supply the files.
    img_404 = sorted(u for u, e in manifest.items() if e["status"] in ("404", "gone"))
    img_err = sorted(u for u, e in manifest.items() if e["status"] not in ("uploaded", "replaced", "404", "gone"))

    storage = storage_check(manifest)

    rep_path = migration_dir() / "load_report.json"
    loader = json.loads(rep_path.read_text(encoding="utf-8")) if rep_path.exists() else {}

    entities = {k: {"json": exp[k], "db": got[k], "ok": exp[k] == got[k]} for k in exp}
    result = {
        "entities": entities,
        "all_counts_match": all(v["ok"] for v in entities.values()),
        "loader_orphans": loader.get("orphans", {}),
        "db_orphans": {k: {"count": len(v), "sample": v[:10]} for k, v in db_orphans.items()},
        "images": {"manifest": by_status, "dead_on_live": img_404, "errors": img_err[:20],
                   "rows_still_pointing_at_live_uploads": live_urls_left,
                   "old_host_references": old_host_refs,
                   "loader_rewrite": loader.get("image_urls"),
                   "storage": storage},
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
        print("\nfiles:", by_status, f"| dead on live (dropped): {len(img_404)} | errors: {len(img_err)}")
        for u in img_404:
            print("  dead", u)
        print(f"old-host wp-content references in content tables: {live_urls_left}",
              old_host_refs or "")
        print(f"storage {storage['target']}: {storage['files']} files, "
              f"{len(storage['not_uploaded_to_target'])} not uploaded to this target "
              f"(run load.py --only images --images all), "
              f"{len(storage['sample_failures'])}/{storage['sampled']} sampled URLs failing")
        for f in storage["sample_failures"][:10]:
            print("  ", f)
    bad = (not result["all_counts_match"] or any(db_orphans[k] for k in HARD_ORPHANS)
           or bool(old_host_refs) or bool(storage["not_uploaded_to_target"])
           or bool(storage["sample_failures"]))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
