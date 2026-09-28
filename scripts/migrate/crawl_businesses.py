#!/usr/bin/env python3
"""Crawl every business (professional) profile listed in business-sitemap.xml.

Businesses are a custom post type that is not exposed in the WP REST API, so we
parse the rendered HTML (custom `bonimbayit` theme). We also walk the
/recommended/ directory listing to capture listing order, the listing gallery
and chips.

Output: data/migration/businesses.json

Usage:
  python scripts/migrate/crawl_businesses.py [--limit N] [--no-cache]
"""

from __future__ import annotations

import argparse
import html as htmllib
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import unquote, urlparse, parse_qs

from bs4 import BeautifulSoup, Tag

from common import (
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

HEBREW_MONTHS = {
    "ינואר": 1, "פברואר": 2, "מרץ": 3, "מרס": 3, "אפריל": 4, "מאי": 5, "יוני": 6,
    "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12,
}

SOCIAL_HOSTS = ("facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "youtube.com", "youtu.be", "twitter.com", "x.com", "pinterest.")
# Links that are part of the site chrome, not the business itself.
CHROME_LINK_MARKERS = (
    "bonimbayit", "UCCehs0A1gUmOUtZIhvkXVJQ", "open.spotify.com/show/54ad9OeT6XsRf8ZtUtC4Su",
    "sharer", "share?url", "whatsapp.com/send?text", "digi", "tomer.chen.rihana",
)
TIER_MARKER_RE = re.compile(r"premium|vip|gold|silver|platinum|tier|badge|verified|featured|recommend|pro-|sponsor|מומלץ|פרימיום|מאומת", re.I)


def parse_hebrew_date(text: str) -> str | None:
    """'מאי 07, 2024' or '7 במאי 2024' -> '2024-05-07'."""
    t = clean_text(text)
    m = re.search(r"([א-ת]+)\s+(\d{1,2}),\s*(\d{4})", t)
    if m and m.group(1) in HEBREW_MONTHS:
        return f"{int(m.group(3)):04d}-{HEBREW_MONTHS[m.group(1)]:02d}-{int(m.group(2)):02d}"
    m = re.search(r"(\d{1,2})\s+ב?([א-ת]+)\s+(\d{4})", t)
    if m and m.group(2) in HEBREW_MONTHS:
        return f"{int(m.group(3)):04d}-{HEBREW_MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", t)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def to_number(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    return float(m.group(0)) if m else None


def hidden_value(s: BeautifulSoup, name: str) -> str | None:
    tag = s.find("input", attrs={"name": name})
    v = tag.get("value") if tag else None
    return v.strip() if v else None


def names(section: Tag | None) -> list[str]:
    if section is None:
        return []
    return dedupe(clean_text(n.get_text()) for n in section.select(".items .item .name"))


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return digits or None


def whatsapp_link(phone: str | None) -> str | None:
    digits = normalize_phone(phone)
    if not digits:
        return None
    if digits.startswith("0"):
        digits = "972" + digits[1:]
    return f"https://wa.me/{digits}"


def parse_reviews(s: BeautifulSoup) -> list[dict[str, Any]]:
    reviews: list[dict[str, Any]] = []
    section = s.select_one("section#comments.section-business") or s.select_one("section.section-business.comments")
    if section is None:
        return reviews
    for item in section.select("div.item[id^=comment-]"):
        cid = item.get("id", "").replace("comment-", "")
        l1 = item.select_one(".rating .l-1")
        l2 = item.select_one(".rating .l-2")
        date_el = item.select_one(".date")
        # Author name, when rendered, sits in .l-2 next to the date.
        author = None
        if l2 is not None:
            parts = [clean_text(t) for t in l2.find_all(string=True) if clean_text(t)]
            date_txt = clean_text(date_el.get_text()) if date_el else ""
            others = [p for p in parts if p != date_txt]
            author = others[0] if others else None
        more = item.select_one(".readmore-comment")
        full = more.get("data-full-comment") if more else None
        short = item.select_one(".comment")
        text = htmllib.unescape(full) if full else (clean_text(short.get_text()) if short else "")
        sub = {}
        for star in item.select(".rat-comments-star"):
            val = star.find("span")
            label = clean_text(star.find(string=True, recursive=False) or "")
            sub[label] = to_number(val.get_text()) if val else None
        score_txt = clean_text(l1.get_text()) if l1 else ""
        score = to_number(score_txt.split("/")[0]) if score_txt else None
        scale = to_number(score_txt.split("/")[1]) if "/" in score_txt else None
        reviews.append(
            {
                "id": int(cid) if cid.isdigit() else cid,
                "author": author,
                "rating": score,
                "rating_scale": scale,
                "sub_ratings": sub,
                "text": text.strip(),
                "date_raw": clean_text(date_el.get_text()) if date_el else None,
                "date": parse_hebrew_date(date_el.get_text()) if date_el else None,
                "images": dedupe(img_src(i) for i in item.find_all("img")),
            }
        )
    return reviews


def parse_business(url: str, html: str) -> dict[str, Any]:
    s = soup(html)
    body_classes = (s.body.get("class") if s.body else []) or []
    content = s.select_one("div.content") or s.body
    post_id = post_id_from_body(s)

    title_el = content.select_one("h1.title") if content else None
    name = clean_text(title_el.get_text()) if title_el else None

    about_el = s.select_one("#about-text")
    about_html = None
    about_text = None
    if about_el is not None:
        about_copy = BeautifulSoup(str(about_el), "lxml")
        for junk in about_copy.select(".btn-hide-about, script, style"):
            junk.decompose()
        inner = about_copy.select_one("#about-text")
        about_html = inner.decode_contents().strip() if inner else None
        about_text = clean_text(inner.get_text(" ")) if inner else None

    overall = s.select_one(".overall-rating .persent")
    count_el = s.select_one(".information .number-comments .number") or s.select_one(".overall-rating .number-comments .number")
    category_scores = {}
    for line in s.select(".rating-block .rating-line"):
        n = line.select_one(".name")
        r = line.select_one(".rating")
        if n:
            category_scores[clean_text(n.get_text())] = to_number(r.get_text()) if r else None

    gallery_section = s.select_one("section#gallerys") or s.select_one("section.gallerys")
    galleries: list[dict[str, Any]] = []
    if gallery_section is not None:
        for g in gallery_section.select(".items > .item"):
            gname = g.select_one(".additional .name")
            imgs = dedupe(img_src(i) for i in g.select(".gallery img")) or dedupe(img_src(i) for i in g.select(".photo img"))
            galleries.append({"name": clean_text(gname.get_text()) if gname else None, "images": imgs})

    phone = hidden_value(s, "business_phone")
    # Collect outbound links from the business content only (not header/footer/popups).
    ext_links: list[str] = []
    if content is not None:
        scope = BeautifulSoup(str(content), "lxml")
        for junk in scope.select("header, footer, .share, [data-elementor-type=popup], .page-share"):
            junk.decompose()
        for a in scope.find_all("a", href=True):
            href = a["href"]
            if href.startswith(("http", "mailto:", "tel:", "whatsapp:")) and not any(m in href for m in CHROME_LINK_MARKERS):
                ext_links.append(href)
    ext_links = dedupe(ext_links)
    emails = dedupe(h[7:].split("?")[0] for h in ext_links if h.startswith("mailto:"))
    tels = dedupe(h[4:] for h in ext_links if h.startswith("tel:"))
    # Links to individual YouTube videos are profile videos (see youtube_ids), not social profiles.
    video_links = [h for h in ext_links if youtube_ids(h)]
    socials = [h for h in ext_links if any(k in h for k in SOCIAL_HOSTS) and h not in video_links]
    whatsapps = [h for h in ext_links if "wa.me" in h or "whatsapp" in h]
    websites = [h for h in ext_links if h.startswith("http") and h not in socials and h not in whatsapps and h not in video_links]

    # Tier/badge-ish markers: classes or labels in the profile header matching known words.
    markers: set[str] = set()
    for el in (content.select(".information, .information-main, .title-block, .business-logo, .content-block") if content else []):
        for cls in el.get("class", []):
            if TIER_MARKER_RE.search(cls):
                markers.add(f"class:{cls}")
        for sub in el.find_all(class_=TIER_MARKER_RE):
            for cls in sub.get("class", []):
                if TIER_MARKER_RE.search(cls):
                    markers.add(f"class:{cls}")
    for cls in body_classes:
        if TIER_MARKER_RE.search(cls):
            markers.add(f"body:{cls}")

    rate_link = s.select_one("#new-comment") or s.select_one(".comments-rating .buttons a.btn-1")
    hero = s.select_one(".business-hero-img img")
    logo = s.select_one(".business-logo img")
    reviews = parse_reviews(s)
    all_images = dedupe(
        [img_src(logo), img_src(hero)]
        + [i for g in galleries for i in g["images"]]
        + [i for r in reviews for i in r["images"]]
    )

    return {
        "id": post_id,
        "url": url,
        "slug": slug_from_url(url),
        "slug_raw": [p for p in urlparse(url).path.split("/") if p][-1],
        "name": name,
        "primary_specialty": clean_text(s.select_one(".primary-service").get_text()) if s.select_one(".primary-service") else None,
        "specialties": names(s.select_one("section#services")),
        "regions": names(s.select_one("section#locations")),
        "about_html": about_html,
        "about_text": about_text,
        "phone": phone,
        "phone_digits": normalize_phone(phone),
        "whatsapp": whatsapps[0] if whatsapps else whatsapp_link(phone),
        "whatsapp_is_derived": not whatsapps and bool(phone),
        "email": emails[0] if emails else None,
        "lead_recipient_email": hidden_value(s, "business_recipients") or hidden_value(s, "provider_email"),
        "website": websites[0] if websites else None,
        "extra_links": websites[1:],
        "social_links": socials,
        "other_phones": [t for t in tels if normalize_phone(t) != normalize_phone(phone)],
        "logo_url": img_src(logo),
        "hero_image_url": img_src(hero),
        "galleries": galleries,
        "gallery_image_urls": dedupe(i for g in galleries for i in g["images"]),
        "youtube_ids": youtube_ids(str(content)) if content else [],
        "aggregate_rating_percent": to_number(overall.get_text()) if overall else None,
        "review_count": int(to_number(count_el.get_text()) or 0) if count_el else len(reviews),
        "category_scores": category_scores,
        "reviews": reviews,
        "review_form_url": rate_link.get("href") if rate_link else None,
        "profile_sections": [clean_text(a.get_text()) for a in s.select(".sticky-menu .anchor")],
        "tier_markers": sorted(markers),
        "body_classes": body_classes,
        "image_urls": all_images,
        "seo": head_meta(s),
    }


def parse_listing_page(html: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Parse one /recommended/ page: returns (items, next_page_urls)."""
    s = soup(html)
    items = []
    for it in s.select(".items-business > .item"):
        bid = (it.get("id") or "").rsplit("-", 1)[-1]
        link = it.select_one("a.title-block") or it.select_one("a.business-page-btn")
        items.append(
            {
                "id": int(bid) if bid.isdigit() else None,
                "url": link.get("href") if link else None,
                "name": clean_text(link.get_text()) if link else None,
                "item_classes": it.get("class", []),
                "chips": [clean_text(c.get_text()) for c in it.select(".biz-chip")],
                "listing_images": dedupe(img_src(i) for i in it.select(".biz-main-slide img")),
                "logo_url": img_src(it.select_one(".logo-block img")),
                "rating_percent": to_number(it.select_one(".comments-raitings").get_text()) if it.select_one(".comments-raitings") else None,
                "review_count": to_number(it.select_one(".number-comments .number").get_text()) if it.select_one(".number-comments .number") else None,
                "badges": [clean_text(b.get_text()) for b in it.find_all(class_=TIER_MARKER_RE) if clean_text(b.get_text())],
                "badge_classes": sorted({c for b in it.find_all(class_=TIER_MARKER_RE) for c in b.get("class", []) if TIER_MARKER_RE.search(c)}),
            }
        )
    pages = dedupe(a.get("href") for a in s.select("nav.bb-biz-pagination a.page-numbers"))
    return items, pages


def crawl_listing(use_cache: bool) -> list[dict[str, Any]]:
    base = f"{LIVE_BASE}/recommended/"
    first, _ = fetch(base, use_cache=use_cache)
    items, pages = parse_listing_page(first)
    nums = [int(m.group(1)) for p in pages if (m := re.search(r"/page/(\d+)/", p))]
    last = max(nums) if nums else 1
    for n in range(2, last + 1):
        body, _ = fetch(f"{base}page/{n}/", use_cache=use_cache)
        more, _ = parse_listing_page(body)
        items.extend(more)
    for rank, it in enumerate(items, 1):
        it["listing_rank"] = rank
    print(f"  /recommended/: {len(items)} listing items over {last} pages")
    return items


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()
    use_cache = not args.no_cache

    urls = [u for u in sitemap_locs(f"{LIVE_BASE}/business-sitemap.xml", use_cache) if urlparse(u).path.rstrip("/") != "/business"]
    if args.limit:
        urls = urls[: args.limit]
    print(f"{len(urls)} business URLs")

    def work(u: str) -> dict[str, Any]:
        try:
            body, headers = fetch(u, use_cache=use_cache)
            b = parse_business(u, body)
            b["redirected_to"] = headers.get("final_url")
            return b
        except Exception as exc:  # keep going; record the failure
            return {"url": u, "slug": slug_from_url(u), "error": repr(exc)}

    with ThreadPoolExecutor(max_workers=LIVE_CONCURRENCY) as pool:
        businesses = list(pool.map(work, urls))

    listing = crawl_listing(use_cache)
    by_id = {b.get("id"): b for b in businesses if b.get("id")}
    by_url = {unquote(b["url"]).rstrip("/"): b for b in businesses}
    for it in listing:
        b = by_id.get(it["id"]) or (by_url.get(unquote(it["url"]).rstrip("/")) if it.get("url") else None)
        if b is None:
            continue
        b["listing"] = {k: it[k] for k in ("listing_rank", "chips", "listing_images", "badges", "badge_classes", "item_classes")}
        b["image_urls"] = dedupe(b["image_urls"] + it["listing_images"] + [it["logo_url"]])

    ok = [b for b in businesses if "error" not in b]
    errors = [b for b in businesses if "error" in b]
    out = {
        "count": len(ok),
        "errors": errors,
        "listing_count": len(listing),
        "not_in_listing": [b["url"] for b in ok if "listing" not in b],
        "businesses": ok,
    }
    path = write_json("businesses.json", out)
    with_reviews = sum(1 for b in ok if b["reviews"])
    print(f"Wrote {path}: {len(ok)} businesses ({len(errors)} errors), {with_reviews} with reviews, "
          f"{sum(len(b['reviews']) for b in ok)} reviews total")


if __name__ == "__main__":
    main()
