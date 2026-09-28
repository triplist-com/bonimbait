#!/usr/bin/env python
"""Idempotent loader: data/migration/*.json -> Supabase (direct Postgres).

Usage (from the repo root, with the scripts venv):
  scripts/.venv/bin/python scripts/migrate/load.py                 # everything except images
  scripts/.venv/bin/python scripts/migrate/load.py --only posts,businesses
  scripts/.venv/bin/python scripts/migrate/load.py --dry-run       # transform + write, then ROLLBACK
  scripts/.venv/bin/python scripts/migrate/load.py --only images --images featured,logos
  scripts/.venv/bin/python scripts/migrate/load.py --only images --images all
  # after images: re-run the content load so URLs are rewritten to Storage
  scripts/.venv/bin/python scripts/migrate/load.py

Entities (load order): taxonomy (authors, post categories, tags), posts, pages,
video_pages, specialties, businesses (+contacts, specialties, regions, reviews),
products (+product categories). `images` is opt-in.

Every row is upserted on its legacy key (legacy_wp_id, or name/legacy_id where the
schema has no WP id), and join rows are replaced per parent, so re-running at
cutover is safe. Env:
  MIGRATION_DATABASE_URL  default postgresql://postgres:postgres@127.0.0.1:54322/postgres
  MEDIA_BASE_URL          public base for migrated media (default: local Storage)
  MIGRATION_DATA_DIR      override data/ location
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib.parse import unquote, urlsplit

import psycopg
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import database_url, migration_dir  # noqa: E402
from sanitize import html_to_text, rewrite_internal_link, sanitize_html  # noqa: E402
import media  # noqa: E402

ENTITIES = ["taxonomy", "posts", "pages", "video_pages", "specialties", "businesses", "products"]
SITE_INBOX = "info@bonimbayit.co.il"
REVIEW_SUBSCORES = {
    "תמורה למחיר": "score_value",
    "זמינות ושירותיות": "score_availability",
    "יחסי אנוש": "score_attitude",
    "אמינות ואיכות עבודה": "score_reliability",
}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def nfc_slug(s: Optional[str]) -> str:
    return unicodedata.normalize("NFC", unquote(s or "")).strip().strip("/")


def slugify_he(name: str) -> str:
    s = unicodedata.normalize("NFC", name).strip().lower()
    s = re.sub(r"[\"'׳״`]", "", s)
    s = re.sub(r"[^\w]+", "-", s, flags=re.UNICODE)
    return re.sub(r"-{2,}", "-", s).strip("-")


def utc(ts: Optional[str]) -> Optional[datetime]:
    """'2026-09-28T05:00:00' (WP *_gmt, no tz) or ISO with offset -> aware UTC."""
    if not ts:
        return None
    ts = ts.strip().replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(ts)
    except ValueError:
        try:
            d = datetime.strptime(ts[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def canonical_path(url: Optional[str]) -> Optional[str]:
    """Yoast canonical -> root-relative, decoded + NFC (matches our stored slugs)."""
    if not url:
        return None
    rel = rewrite_internal_link(url)
    if rel.startswith("http"):
        return rel  # external canonical: keep as-is
    parts = urlsplit(rel)
    return unicodedata.normalize("NFC", unquote(parts.path)) or "/"


def robots_noindex(robots: Any) -> bool:
    if isinstance(robots, dict):
        return robots.get("index") == "noindex"
    return isinstance(robots, str) and "noindex" in robots


def none_if_blank(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = str(s).strip()
    return s or None


def text_excerpt(html_or_text: Optional[str], n: int = 300) -> Optional[str]:
    t = html_to_text(html_or_text)
    if not t:
        return None
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


class Ctx:
    def __init__(self, conn: psycopg.Connection, dry_run: bool):
        self.conn = conn
        self.dry_run = dry_run
        self.rw = media.Rewriter()
        self.sanitize_stats: dict[str, int] = {}
        self.report: dict[str, Any] = {"orphans": {}, "counts": {}}
        self._cache: dict[str, Any] = {}

    def data(self, name: str) -> Any:
        if name not in self._cache:
            self._cache[name] = json.loads((migration_dir() / f"{name}.json").read_text(encoding="utf-8"))
        return self._cache[name]

    def clean(self, html: Optional[str]) -> str:
        return sanitize_html(html, self.rw, self.sanitize_stats)

    def orphan(self, kind: str, item: Any) -> None:
        self.report["orphans"].setdefault(kind, []).append(item)

    def count(self, entity: str, n: int) -> None:
        self.report["counts"][entity] = self.report["counts"].get(entity, 0) + n


_ARRAY_COLS = {
    ("video_pages", "youtube_ids"), ("video_pages", "related_youtube_ids"),
    ("businesses", "youtube_ids"), ("business_contacts", "other_phones"),
}


def table_col_is_array(table: str, col: str) -> bool:
    return (table, col) in _ARRAY_COLS


def upsert(conn: psycopg.Connection, table: str, row: dict, conflict: str,
           conflict_where: str = "", keep_on_update: Iterable[str] = ()) -> Any:
    """INSERT ... ON CONFLICT (<conflict>) DO UPDATE; returns id (or None)."""
    cols = list(row)
    vals = []
    for c in cols:
        v = row[c]
        if isinstance(v, (dict, list)) and not table_col_is_array(table, c):
            v = Jsonb(v)
        vals.append(v)
    conflict_cols = {c.strip() for c in conflict.split(",")}
    keep = set(keep_on_update) | conflict_cols
    sets = ", ".join(f"{c} = excluded.{c}" for c in cols if c not in keep) or f"{cols[0]} = excluded.{cols[0]}"
    sql = (
        f"insert into public.{table} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) "
        f"on conflict ({conflict}) {conflict_where} do update set {sets} "
        f"returning {'id' if table not in ('business_contacts',) else 'business_id'}"
    )
    r = conn.execute(sql, vals).fetchone()
    return r[0] if r else None


def replace_links(conn: psycopg.Connection, table: str, parent_col: str, parent_id: Any,
                  child_col: str, child_ids: Iterable[Any]) -> int:
    ids = list(dict.fromkeys(i for i in child_ids if i))
    conn.execute(f"delete from public.{table} where {parent_col} = %s and not ({child_col} = any(%s))",
                 (parent_id, ids))
    for cid in ids:
        conn.execute(f"insert into public.{table} ({parent_col}, {child_col}) values (%s, %s) "
                     f"on conflict do nothing", (parent_id, cid))
    return len(ids)


def id_map(conn: psycopg.Connection, table: str, key: str = "legacy_wp_id") -> dict:
    return {k: v for k, v in conn.execute(f"select {key}, id from public.{table} where {key} is not null")}


# ---------------------------------------------------------------------------
# 1. taxonomy: authors, post categories, tags
# ---------------------------------------------------------------------------
def load_taxonomy(ctx: Ctx) -> None:
    conn = ctx.conn
    authors: dict[int, dict] = {}
    for p in ctx.data("posts"):
        a = p.get("author")
        if a and a.get("id") is not None:
            authors.setdefault(a["id"], a)
    for a in authors.values():
        bio = none_if_blank(a.get("description"))
        bio_html = None
        if bio:
            paras = [x.strip() for x in re.split(r"\r?\n+", bio) if x.strip()]
            bio_html = "".join(f"<p>{x}</p>" for x in paras)
        upsert(conn, "authors", {
            "legacy_wp_id": a["id"], "slug": nfc_slug(a["slug"]), "name": a["name"],
            "bio_html": bio_html, "avatar_url": a.get("avatar"),
        }, "legacy_wp_id")
    ctx.count("authors", len(authors))

    cats = ctx.data("categories")
    for i, c in enumerate(cats):
        seo = c.get("seo") or {}
        upsert(conn, "post_categories", {
            "legacy_wp_id": c["id"], "slug": nfc_slug(c["slug"]), "name": c["name"],
            "description": none_if_blank(html_to_text(c.get("description"))),
            "sort_order": i, "seo_title": seo.get("title"),
            "seo_description": seo.get("description") or seo.get("og_description"),
            "seo_canonical": canonical_path(seo.get("canonical")),
        }, "legacy_wp_id")
    cat_ids = id_map(conn, "post_categories")
    for c in cats:  # parents in a second pass
        if c.get("parent"):
            conn.execute("update public.post_categories set parent_id = %s where legacy_wp_id = %s",
                         (cat_ids.get(c["parent"]), c["id"]))
    ctx.count("post_categories", len(cats))

    tags = ctx.data("tags")
    for t in tags:
        seo = t.get("seo") or {}
        upsert(conn, "post_tags", {
            "legacy_wp_id": t["id"], "slug": nfc_slug(t["slug"]), "name": t["name"],
            "description": none_if_blank(html_to_text(t.get("description"))),
            "seo_title": seo.get("title"), "seo_description": seo.get("description"),
            "noindex": robots_noindex(seo.get("robots")) if seo.get("robots") else True,
        }, "legacy_wp_id")
    ctx.count("post_tags", len(tags))


# ---------------------------------------------------------------------------
# 2. posts
# ---------------------------------------------------------------------------
def load_posts(ctx: Ctx) -> None:
    conn = ctx.conn
    cat_ids = id_map(conn, "post_categories")
    tag_ids = id_map(conn, "post_tags")
    author_ids = id_map(conn, "authors")
    n = links = tlinks = 0
    for p in ctx.data("posts"):
        seo = p.get("seo") or {}
        cats = p.get("category_ids") or [c["id"] for c in p.get("categories") or []]
        for cid in cats:
            if cid not in cat_ids:
                ctx.orphan("post_category_not_found", {"post": p["id"], "category": cid})
        fi = p.get("featured_image") or {}
        author = (p.get("author") or {}).get("id")
        if author is not None and author not in author_ids:
            ctx.orphan("post_author_not_found", {"post": p["id"], "author": author})
        pid = upsert(conn, "posts", {
            "legacy_wp_id": p["id"], "slug": nfc_slug(p["slug"]), "title": html_to_text(p["title"]),
            "content_html": ctx.clean(p.get("content_html")),
            "excerpt": text_excerpt(p.get("excerpt_html"), 500),
            "featured_image": ctx.rw.maybe(fi.get("url")), "featured_image_alt": none_if_blank(fi.get("alt")),
            "seo_title": seo.get("title"),
            "seo_description": seo.get("description") or seo.get("og_description"),
            "seo_canonical": canonical_path(seo.get("canonical")),
            "noindex": robots_noindex(seo.get("robots")),
            "status": "published" if p.get("status") == "publish" else "draft",
            "published_at": utc(p.get("date_gmt") or p.get("date")),
            "primary_category_id": next((cat_ids[c] for c in cats if c in cat_ids), None),
            "author_id": author_ids.get(author),
        }, "legacy_wp_id")
        links += replace_links(conn, "post_category_assignments", "post_id", pid, "category_id",
                               [cat_ids.get(c) for c in cats])
        tids = p.get("tag_ids") or [t["id"] for t in p.get("tags") or []]
        for t in tids:
            if t not in tag_ids:
                ctx.orphan("post_tag_not_found", {"post": p["id"], "tag": t})
        tlinks += replace_links(conn, "post_tag_assignments", "post_id", pid, "tag_id",
                                [tag_ids.get(t) for t in tids])
        n += 1
    ctx.count("posts", n)
    ctx.count("post_category_assignments", links)
    ctx.count("post_tag_assignments", tlinks)


# ---------------------------------------------------------------------------
# 3. pages (slug = full path, e.g. "strategic-partners/thank-you")
# ---------------------------------------------------------------------------
def load_pages(ctx: Ctx) -> None:
    conn = ctx.conn
    pages = ctx.data("pages")
    by_id = {p["id"]: p for p in pages}

    def full_path(p: dict) -> str:
        parts = [nfc_slug(p["slug"])]
        seen = {p["id"]}
        par = p.get("parent")
        while par and par in by_id and par not in seen:
            seen.add(par)
            parts.insert(0, nfc_slug(by_id[par]["slug"]))
            par = by_id[par].get("parent")
        return "/".join(parts)

    for p in pages:
        seo = p.get("seo") or {}
        fi = p.get("featured_image") or {}
        if p.get("parent") and p["parent"] not in by_id:
            ctx.orphan("page_parent_not_found", {"page": p["id"], "parent": p["parent"]})
        upsert(conn, "pages", {
            # Synthetic pages from reconcile_sitemaps.py (e.g. /services/) have no WP id.
            "legacy_wp_id": p["id"], "slug": full_path(p),
            "title": html_to_text(p["title"]) or full_path(p),
            "content_html": ctx.clean(p.get("content_html")),
            "excerpt": text_excerpt(p.get("excerpt_html"), 500),
            "featured_image": ctx.rw.maybe(fi.get("url")), "featured_image_alt": none_if_blank(fi.get("alt")),
            "seo_title": seo.get("title"),
            "seo_description": seo.get("description") or seo.get("og_description"),
            "seo_canonical": canonical_path(seo.get("canonical")),
            "noindex": robots_noindex(seo.get("robots")),
            "template": none_if_blank(p.get("template")),
            "sort_order": p.get("menu_order") or 0,
            "status": "published" if p.get("status") == "publish" else "draft",
            "published_at": utc(p.get("date_gmt") or p.get("date")),
        }, "legacy_wp_id" if p["id"] is not None else "slug")
    ids = id_map(conn, "pages")
    for p in pages:
        if p["id"] is None:
            continue
        conn.execute("update public.pages set parent_id = %s where legacy_wp_id = %s",
                     (ids.get(p.get("parent")) if p.get("parent") else None, p["id"]))
    ctx.count("pages", len(pages))


# ---------------------------------------------------------------------------
# 4. video_pages
# ---------------------------------------------------------------------------
def load_video_pages(ctx: Ctx) -> None:
    conn = ctx.conn
    vids = ctx.data("videos")["videos"]
    linked = 0
    for v in vids:
        seo = v.get("seo") or {}
        yt = v.get("youtube_ids") or ([v["youtube_id"]] if v.get("youtube_id") else [])
        video_id = None
        if yt:
            r = conn.execute("select id from public.videos where youtube_id = any(%s) "
                             "order by array_position(%s, youtube_id) limit 1", (yt, yt)).fetchone()
            video_id = r[0] if r else None
        linked += bool(video_id)
        cats = v.get("categories") or []
        kind = "podcast" if any(nfc_slug(c.get("slug")) == "פודקאסט" for c in cats) else "video"
        body = ctx.clean(v.get("body_html"))
        redirected = bool(v.get("redirected_to"))
        upsert(conn, "video_pages", {
            # A redirected page's crawled id is its redirect TARGET's id (two pages 301 to
            # the same post), so it can't be a key: those rows are keyed by legacy_slug.
            "legacy_wp_id": None if redirected else v["id"], "legacy_slug": nfc_slug(v["legacy_slug"]),
            "title": html_to_text(v["title"]), "body_html": body,
            "excerpt": text_excerpt(v.get("body_text") or body, 300),
            "featured_image": ctx.rw.maybe(v.get("thumbnail_url")),
            "youtube_ids": yt, "related_youtube_ids": v.get("related_youtube_ids") or [],
            "video_id": video_id, "kind": kind, "author_name": none_if_blank(v.get("author")),
            "legacy_categories": [{"name": c.get("name"), "slug": nfc_slug(c.get("slug"))} for c in cats],
            "seo_title": seo.get("title"),
            "seo_description": seo.get("description") or seo.get("og:description"),
            "seo_canonical": canonical_path(seo.get("canonical")),
            "noindex": robots_noindex(seo.get("robots")),
            # 3 pages 301 on the live site (redirects table has them): keep data, hide the row.
            "status": "archived" if redirected else "published",
            "published_at": utc(v.get("date_published") or v.get("date")),
        }, "legacy_slug" if redirected else "legacy_wp_id")
    ctx.count("video_pages", len(vids))
    ctx.report["video_pages_linked_to_videos"] = linked


# ---------------------------------------------------------------------------
# 5. specialties (master list from the live filter + any used by a business)
# ---------------------------------------------------------------------------
def load_specialties(ctx: Ctx) -> None:
    conn = ctx.conn
    names = list(ctx.data("site_structure").get("business_specialties") or [])
    master = set(names)
    for b in ctx.data("businesses")["businesses"]:
        for s in [b.get("primary_specialty"), *(b.get("specialties") or [])]:
            if s and s not in master:
                master.add(s)
                names.append(s)
                ctx.orphan("specialty_not_in_master_list", s)
    for i, name in enumerate(names):
        name = unicodedata.normalize("NFC", name.strip())
        upsert(conn, "specialties", {"name": name, "slug": slugify_he(name), "sort_order": i}, "name")
    ctx.count("specialties", len(names))


# ---------------------------------------------------------------------------
# 6. businesses + contacts + specialties + regions + reviews
# ---------------------------------------------------------------------------
def load_businesses(ctx: Ctx) -> None:
    conn = ctx.conn
    spec_ids = {unicodedata.normalize("NFC", k): v for k, v in conn.execute("select name, id from public.specialties")}
    region_cache: dict[str, Any] = {}

    def region_id(label: str) -> Any:
        if label not in region_cache:
            region_cache[label] = conn.execute("select public.resolve_region(%s)", (label,)).fetchone()[0]
        return region_cache[label]

    bizs = ctx.data("businesses")["businesses"]
    nrev = nreg = nspec = 0
    for b in bizs:
        seo = b.get("seo") or {}
        listing = b.get("listing") or {}
        # 2 crawled businesses have no primary chip: fall back to their first specialty.
        primary = b.get("primary_specialty") or next(iter(b.get("specialties") or []), None)
        if primary and unicodedata.normalize("NFC", primary) not in spec_ids:
            ctx.orphan("business_specialty_not_found", {"business": b["slug"], "specialty": primary})
        lead_email = none_if_blank(b.get("lead_recipient_email"))
        direct = bool(lead_email) and lead_email.lower() != SITE_INBOX
        published = None
        for block in seo.get("json_ld") or []:
            for node in (block.get("@graph") or []) if isinstance(block, dict) else []:
                if node.get("@type") == "WebPage" and node.get("datePublished"):
                    published = utc(node["datePublished"])
        gallery = [{"name": g.get("name") or "", "images": [ctx.rw(u) for u in g.get("images") or []]}
                   for g in b.get("galleries") or []]
        if not gallery and b.get("gallery_image_urls"):
            gallery = [{"name": "", "images": [ctx.rw(u) for u in b["gallery_image_urls"]]}]
        social = b.get("social_links") or {}
        if isinstance(social, list):
            social = {f"link{i + 1}": u for i, u in enumerate(social)}
        bid = upsert(conn, "businesses", {
            "legacy_wp_id": b["id"], "slug": nfc_slug(b["slug"]), "name": html_to_text(b["name"]),
            "description_html": ctx.clean(b.get("about_html")),
            "primary_specialty_id": spec_ids.get(unicodedata.normalize("NFC", primary)) if primary else None,
            "website": none_if_blank(b.get("website")),
            "logo_url": ctx.rw.maybe(b.get("logo_url")),
            "cover_image_url": ctx.rw.maybe(b.get("hero_image_url")),
            "gallery": gallery, "social_links": social,
            "extra_links": b.get("extra_links") or [],
            "youtube_ids": b.get("youtube_ids") or [],
            "lead_routing": "direct" if direct else "site",
            "status": "published",
            "sort_order": listing.get("listing_rank") or 0,
            "seo_title": seo.get("title"),
            "seo_description": seo.get("description") or seo.get("og:description"),
            "seo_canonical": canonical_path(seo.get("canonical")),
            "legacy_url": canonical_path(b.get("url")),
            "published_at": published,
        }, "legacy_wp_id")
        upsert(conn, "business_contacts", {
            "business_id": bid, "phone": none_if_blank(b.get("phone")),
            "whatsapp": none_if_blank(b.get("whatsapp")), "email": none_if_blank(b.get("email")),
            "other_phones": [p for p in b.get("other_phones") or [] if p],
            "lead_email": lead_email if direct else None,
        }, "business_id")
        specs = []
        for s in [primary, *(b.get("specialties") or [])]:
            if not s:
                continue
            sid = spec_ids.get(unicodedata.normalize("NFC", s))
            if sid:
                specs.append(sid)
            else:
                ctx.orphan("business_specialty_not_found", {"business": b["slug"], "specialty": s})
        nspec += replace_links(conn, "business_specialties", "business_id", bid, "specialty_id", specs)
        regs = []
        for label in b.get("regions") or []:
            rid = region_id(label)
            if rid:
                regs.append(rid)
            else:
                ctx.orphan("business_region_unmapped", {"business": b["slug"], "region": label})
        nreg += replace_links(conn, "business_regions", "business_id", bid, "region_id", regs)
        for r in b.get("reviews") or []:
            scale = float(r.get("rating_scale") or 10) or 10.0
            conv = lambda x: None if x is None else round(max(0.0, min(10.0, float(x) * 10.0 / scale)), 2)  # noqa: E731
            subs = {col: None for col in REVIEW_SUBSCORES.values()}
            for label, val in (r.get("sub_ratings") or {}).items():
                col = REVIEW_SUBSCORES.get(label)
                if col:
                    subs[col] = conv(val)
                else:
                    ctx.orphan("review_subscore_unknown", label)
            upsert(conn, "reviews", {
                "legacy_id": f"wp-comment-{r['id']}", "business_id": bid,
                "author_name": none_if_blank(r.get("author")),
                "rating": conv(r.get("rating")) if r.get("rating") is not None else 0,
                **subs,
                "body": none_if_blank(r.get("text")),
                "images": [ctx.rw(u) for u in r.get("images") or []],
                "status": "approved", "source": "migrated",
                "published_at": utc(r.get("date")),
                "created_at": utc(r.get("date")) or datetime.now(timezone.utc),
            }, "legacy_id", "where legacy_id is not null")
            nrev += 1
    ctx.count("businesses", len(bizs))
    ctx.count("business_contacts", len(bizs))
    ctx.count("business_specialties", nspec)
    ctx.count("business_regions", nreg)
    ctx.count("reviews", nrev)


# ---------------------------------------------------------------------------
# 7. products + product categories
# ---------------------------------------------------------------------------
def load_products(ctx: Ctx) -> None:
    conn = ctx.conn
    data = ctx.data("products")
    for i, c in enumerate(data.get("product_categories") or []):
        upsert(conn, "product_categories", {
            "legacy_wp_id": c["id"], "slug": nfc_slug(c["slug"]), "name": c["name"],
            "description": none_if_blank(html_to_text(c.get("description"))), "sort_order": i,
        }, "legacy_wp_id")
    # /category-product/<slug>/ (8 live URLs): a second product taxonomy the crawl
    # has no terms for. Its slugs equal post-category slugs, so names come from there.
    live = ctx.data("live_urls")
    urls = live.get("urls") if isinstance(live, dict) else live
    cp_slugs = sorted({nfc_slug(m.group(1)) for u in urls
                       for m in [re.search(r"/category-product/([^/]+)/", u if isinstance(u, str) else u.get("url", ""))] if m})
    post_cat_names = {nfc_slug(c["slug"]): c["name"] for c in ctx.data("categories")}
    for i, s in enumerate(cp_slugs):
        conn.execute(
            "insert into public.product_categories (slug, name, sort_order) values (%s, %s, %s) "
            "on conflict (slug) do update set name = excluded.name",
            (s, post_cat_names.get(s, s.replace("-", " ")), 100 + i))
    cat_ids = id_map(conn, "product_categories")
    default_cat = next(iter(cat_ids.values()), None) if len(data.get("product_categories") or []) == 1 else None
    for i, p in enumerate(data["products"]):
        imgs = [{"url": ctx.rw(im["url"]), "alt": im.get("alt") or ""} for im in p.get("images") or []]
        price = p.get("regular_price") or p.get("price") or 0
        sale = p.get("sale_price") if p.get("on_sale") else None
        pid = upsert(conn, "products", {
            "legacy_wp_id": p["id"], "slug": nfc_slug(p["slug"]), "name": html_to_text(p["name"]),
            "short_description": none_if_blank(html_to_text(p.get("short_description_html"))),
            "description_html": ctx.clean(p.get("description_html")),
            "is_purchasable": bool(p.get("is_purchasable")),
            "price_agorot": int(round(float(price) * 100)),
            "sale_price_agorot": int(round(float(sale) * 100)) if sale else None,
            "currency": p.get("currency") or "ILS",
            "featured_image": imgs[0]["url"] if imgs else None, "images": imgs,
            "sku": none_if_blank(p.get("sku")),
            "status": "published", "sort_order": i,
            "seo_canonical": canonical_path(p.get("permalink")),
        }, "legacy_wp_id")
        cats = [cat_ids.get(c["id"]) for c in p.get("categories") or [] if isinstance(c, dict)]
        if not any(cats) and default_cat:
            cats = [default_cat]  # the only WC category ("כללי") has count=3 = all products
        replace_links(conn, "product_category_assignments", "product_id", pid, "category_id", cats)
    ctx.count("product_categories", len(data.get("product_categories") or []) + len(cp_slugs))
    ctx.count("products", len(data["products"]))


# ---------------------------------------------------------------------------
# images
# ---------------------------------------------------------------------------
def collect_image_urls(ctx: Ctx, scopes: set[str]) -> list[str]:
    """Ordered: featured (posts) -> logos -> everything else."""
    from sanitize import UPLOADS_RE  # noqa: F401
    out: list[str] = []
    posts = ctx.data("posts")
    bizs = ctx.data("businesses")["businesses"]
    if scopes & {"featured", "all"}:
        out += [(p.get("featured_image") or {}).get("url") for p in posts]
    if scopes & {"logos", "all"}:
        out += [b.get("logo_url") for b in bizs]
    if "all" in scopes:
        vids = ctx.data("videos")["videos"]
        pages = ctx.data("pages")
        prods = ctx.data("products")["products"]
        out += [v.get("thumbnail_url") for v in vids]
        out += [(p.get("featured_image") or {}).get("url") for p in pages]
        for b in bizs:
            out += [b.get("hero_image_url"), *(b.get("gallery_image_urls") or [])]
            for g in b.get("galleries") or []:
                out += g.get("images") or []
            for r in b.get("reviews") or []:
                out += r.get("images") or []
        for p in prods:
            out += [im.get("url") for im in p.get("images") or []]
        # Images referenced from sanitized HTML (img src + <a href> to an image).
        html_sources = [p.get("content_html") for p in posts + pages] + \
                       [v.get("body_html") for v in vids] + [b.get("about_html") for b in bizs] + \
                       [p.get("description_html") for p in prods]
        for h in html_sources:
            if not h:
                continue
            cleaned = sanitize_html(h)  # identity rewriter: leaves live URLs
            for m in re.finditer(r'(?:src|href)="([^"]+)"', cleaned):
                u = m.group(1).replace("&amp;", "&")
                if media.is_upload(u) and re.search(r"\.(?:jpe?g|png|gif|webp|avif|svg)$", urlsplit(u).path, re.I):
                    out.append(u)
    return [u for u in out if u and media.is_upload(u)]


def load_images(ctx: Ctx, scopes: set[str], limit: Optional[int]) -> None:
    urls = collect_image_urls(ctx, scopes)
    uniq = list(dict.fromkeys(media.normalize(u) for u in urls))
    print(f"images: {len(uniq)} unique uploads URLs in scope {sorted(scopes)}", flush=True)
    if ctx.dry_run:
        ctx.report["images"] = {"in_scope": len(uniq)}
        return
    stats = media.migrate_images(uniq, concurrency=3, limit=limit)
    ctx.report["images"] = stats
    print(f"images: {stats}", flush=True)


# ---------------------------------------------------------------------------
LOADERS = {
    "taxonomy": load_taxonomy, "posts": load_posts, "pages": load_pages,
    "video_pages": load_video_pages, "specialties": load_specialties,
    "businesses": load_businesses, "products": load_products,
}
ALIASES = {"authors": "taxonomy", "categories": "taxonomy", "tags": "taxonomy",
           "videos": "video_pages", "reviews": "businesses"}


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help=f"comma list of: {', '.join(ENTITIES + ['images'])}")
    ap.add_argument("--dry-run", action="store_true", help="run everything in a transaction, then roll back")
    ap.add_argument("--images", default="featured,logos", help="image scopes: featured,logos,all")
    ap.add_argument("--image-limit", type=int, default=None, help="max images to fetch this run")
    args = ap.parse_args(argv)

    wanted = ENTITIES[:]
    if args.only:
        req = [ALIASES.get(x.strip(), x.strip()) for x in args.only.split(",") if x.strip()]
        bad = [x for x in req if x not in ENTITIES + ["images"]]
        if bad:
            ap.error(f"unknown entity: {bad}")
        wanted = [e for e in ENTITIES + ["images"] if e in req]

    print(f"data: {migration_dir()}  db: {database_url().split('@')[-1]}  dry_run={args.dry_run}", flush=True)
    t0 = time.time()
    with psycopg.connect(database_url(), autocommit=False) as conn:
        ctx = Ctx(conn, args.dry_run)
        for ent in wanted:
            t = time.time()
            if ent == "images":
                load_images(ctx, set(args.images.split(",")), args.image_limit)
            else:
                LOADERS[ent](ctx)
                if not args.dry_run:
                    conn.commit()  # commit per entity so other agents see data early
                # dry run: one transaction, so later entities still see earlier FKs
            print(f"  {ent}: done in {time.time() - t:.1f}s", flush=True)
        if args.dry_run:
            conn.rollback()
            print("dry run: rolled back", flush=True)
        else:
            conn.commit()

    rep = ctx.report
    rep["sanitize"] = ctx.sanitize_stats
    rep["image_urls"] = {"rewritten_to_storage": ctx.rw.rewritten, "still_live": ctx.rw.pending,
                         "unique_seen": len(ctx.rw.seen)}
    rep["entities"] = wanted
    rep["dry_run"] = args.dry_run
    rep["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not args.dry_run:
        out = migration_dir() / "load_report.json"
        prev = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
        # Merge per-entity so a partial --only run doesn't erase other entities' orphans.
        orphans = prev.get("orphans", {})
        for k in list(orphans):
            if _orphan_owner(k) in wanted:
                del orphans[k]
        orphans.update(rep["orphans"])
        merged = {**prev, **rep, "orphans": orphans,
                  "counts": {**prev.get("counts", {}), **rep["counts"]}}
        out.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"counts": rep["counts"], "orphans": {k: len(v) for k, v in rep["orphans"].items()},
                      "image_urls": rep["image_urls"], **({"images": rep["images"]} if "images" in rep else {})},
                     ensure_ascii=False, indent=1))
    print(f"total {time.time() - t0:.1f}s")
    return 0


def _orphan_owner(kind: str) -> str:
    if kind.startswith("post_"):
        return "posts"
    if kind.startswith("page_"):
        return "pages"
    if kind.startswith("specialty_"):
        return "specialties"
    if kind.startswith(("business_", "review_")):
        return "businesses"
    return ""


if __name__ == "__main__":
    raise SystemExit(main())
