#!/usr/bin/env python3
"""Capture the live site's non-content capabilities to guide the feature agents.

Collects:
  - header / sidebar / footer menus
  - homepage (and key pages) section order
  - every form (fields, labels, required flags, options, action, context)
  - popups (auth, consultation, Elementor popups)
  - JS submission endpoints (admin-ajax actions, webhooks, custom REST routes)
  - management plans ("membership tiers") with prices/benefits + comparison table
  - events (posts in the "כנסים ולייבים" category)
  - WhatsApp regional groups and invite links
  - regions (signup / directory) and the business specialty taxonomy

Outputs data/migration/site_structure.json and docs/LIVE_SITE_INVENTORY.md.
Run crawl_rest.py first (events are read from posts.json when present).

Usage:
  python scripts/migrate/crawl_site_structure.py [--no-cache]
"""

from __future__ import annotations

import argparse
import html as htmllib
import json
import re
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from common import (
    LIVE_BASE,
    MIGRATION_DIR,
    REPO_ROOT,
    clean_text,
    dedupe,
    decoded_path,
    fetch,
    img_src,
    session,
    sitemap_locs,
    soup,
    write_json,
)

EVENTS_CATEGORY_SLUG = "כנסים-ולייבים"
INVENTORY_MD = REPO_ROOT / "docs" / "LIVE_SITE_INVENTORY.md"

# Extra non-page URLs worth inspecting for structure/forms.
EXTRA_PATHS = [
    "/blog/",
    "/videos/",
    "/business/",
    f"/category/{EVENTS_CATEGORY_SLUG}/",
    "/services/",
]


# --------------------------------------------------------------------------- menus


def menu_links(root: Tag | None) -> list[dict[str, Any]]:
    if root is None:
        return []
    out = []
    for a in root.find_all("a", href=True):
        text = clean_text(a.get_text())
        if not text:
            continue
        out.append({"text": text, "href": a["href"], "path": decoded_path(a["href"]) if a["href"].startswith("http") else a["href"]})
    return out


def header_menus(s: BeautifulSoup) -> dict[str, Any]:
    header = s.select_one("header")
    if header is None:
        return {}
    main = []
    for item in header.select(".main-menus-items > .main-menus-item-info"):
        a = item.find("a", href=True)
        if a is None:
            continue
        sub_root = item.select_one(".sub-menu, .main-menus-sub, ul, .dropdown")
        main.append(
            {
                "text": clean_text(a.get_text()),
                "href": a["href"],
                "path": decoded_path(a["href"]),
                "children": [l for l in menu_links(sub_root) if l["href"] != a["href"]] if sub_root else [],
            }
        )
    cta = [{"text": clean_text(a.get_text()), "href": a.get("href"), "classes": a.get("class", [])} for a in header.select("a.btn-1, a.openpopupdate")]
    return {
        "main": main,
        "sidebar": menu_links(header.select_one("#menu-sidebar")),
        "sidebar_socials": [a["href"] for a in header.select(".socials a[href]")],
        "cta_buttons": cta,
        "has_search": header.select_one("input[name=search]") is not None,
        "has_login": header.select_one(".login") is not None,
        "has_cart": header.select_one(".xoo-wsc-cart-trigger") is not None,
    }


def footer_menus(s: BeautifulSoup) -> dict[str, Any]:
    footer = s.select_one("footer")
    if footer is None:
        return {}
    columns = []
    # The theme footer: nav.menu-items > .item > (.name + links).
    for item in footer.select("nav.menu-items > .item"):
        title = item.select_one(".name")
        links = [
            {"text": clean_text(el.get_text()), "href": el.get("href") or f"js:{' '.join(el.get('class', []))}"}
            for el in item.select("a, span.link")
        ]
        columns.append({"title": clean_text(title.get_text()) if title else None, "links": links})
    if columns:
        brand = footer.select_one(".bbf-brand")
        return {
            "columns": columns,
            "brand_text": clean_text(brand.get_text(" ")) if brand else None,
            "contact_links": [a.get("href") for a in footer.select(".bbf-brand a[href]")],
            "social": [
                {"href": a.get("href"), "text": clean_text(a.get_text(" "))} for a in footer.select(".social a[href]")
            ],
        }
    # Fallback: group links under the nearest preceding heading.
    current: dict[str, Any] = {"title": None, "links": []}
    for el in footer.find_all(["h2", "h3", "h4", "h5", "a", "div"]):
        if el.name in ("h2", "h3", "h4", "h5") or (el.name == "div" and "title" in " ".join(el.get("class", []))):
            title = clean_text(el.get_text())
            if title and title != current["title"]:
                if current["links"]:
                    columns.append(current)
                current = {"title": title, "links": []}
        elif el.name == "a" and el.get("href"):
            text = clean_text(el.get_text()) or (el.get("aria-label") or "")
            current["links"].append({"text": text, "href": el["href"]})
    if current["links"]:
        columns.append(current)
    return {"columns": columns, "text": clean_text(footer.get_text(" "))[:1500]}


# --------------------------------------------------------------------------- sections


def block_summary(el: Tag) -> dict[str, Any]:
    heads = [clean_text(h.get_text(" ")) for h in el.find_all(["h1", "h2", "h3"])]
    widgets = Counter(w.get("data-widget_type") for w in el.select("[data-widget_type]"))
    buttons = dedupe(clean_text(b.get_text()) for b in el.select("a.elementor-button, a.btn, a.btn-1, a.btn-2, button"))
    classes = [c for c in el.get("class", []) if not c.startswith(("elementor-element-", "e-con", "e-flex", "e-grid"))]
    return {
        "tag": el.name,
        "id": el.get("id") or el.get("data-id"),
        "classes": classes[:8],
        "headings": [h for h in heads if h][:8],
        "widgets": dict(widgets),
        "buttons": [b for b in buttons if b][:10],
        "forms": len(el.find_all("form")),
        "text_preview": clean_text(el.get_text(" "))[:200],
    }


def page_sections(s: BeautifulSoup) -> list[dict[str, Any]]:
    """Top-level content blocks in document order."""
    root = s.select_one("div.content") or s.select_one("main") or s.body
    if root is None:
        return []
    # Unwrap single wrappers (Elementor root div, html widget wrappers).
    blocks = [c for c in root.children if isinstance(c, Tag)]
    while len(blocks) == 1:
        inner = [c for c in blocks[0].children if isinstance(c, Tag)]
        if not inner:
            break
        blocks = inner
    out = []
    for b in blocks:
        if b.name in ("script", "style", "link", "noscript", "template"):
            continue
        # Elementor html widgets often contain a hand-built page with <section>s.
        inner_sections = b.find_all("section", recursive=True)
        summary = block_summary(b)
        if b.name != "section" and len(inner_sections) >= 3 and not summary["headings"][:0]:
            top_level = [sec for sec in inner_sections if sec.find_parent("section") is None]
            if len(top_level) >= 3:
                out.extend(block_summary(sec) for sec in top_level)
                continue
        out.append(summary)
    return out


def heading_outline(s: BeautifulSoup) -> list[dict[str, Any]]:
    """Ordered h1/h2 headings of the main content with the block each one introduces."""
    root = s.select_one("div.content") or s.select_one("main") or s.body
    out: list[dict[str, Any]] = []
    if root is None:
        return out
    for h in root.find_all(["h1", "h2"]):
        if h.find_parent(attrs={"data-elementor-type": "popup"}) or h.find_parent("blackout"):
            continue
        # The block = the nearest ancestor holding more than just the heading.
        own = len(clean_text(h.get_text(" ")))
        block = h.parent
        while block is not None and block is not root and len(clean_text(block.get_text(" "))) <= own + 20:
            block = block.parent
        block = block or root
        widgets = Counter(w.get("data-widget_type") for w in block.select("[data-widget_type]"))
        out.append(
            {
                "level": h.name,
                "text": clean_text(h.get_text(" ")),
                "block_classes": [c for c in block.get("class", []) if not c.startswith(("elementor-element-", "e-con", "e-flex", "e-grid"))][:6],
                "widgets": dict(widgets),
                "links": dedupe(clean_text(a.get_text()) for a in block.find_all("a") if clean_text(a.get_text()))[:8],
            }
        )
    return out


def check_links(s: BeautifulSoup) -> list[dict[str, Any]]:
    """Resolve internal header/footer links (some redirect, e.g. /events/ -> /)."""
    results = []
    hrefs = dedupe(a["href"] for a in s.select("header a[href], footer a[href]") if a["href"].startswith(LIVE_BASE))
    for href in hrefs:
        try:
            r = session().head(href, allow_redirects=True, timeout=30)
            results.append({
                "href": href,
                "path": decoded_path(href),
                "status": r.status_code,
                "redirects": [h.status_code for h in r.history],
                "final": unquote(r.url) if r.history else None,
            })
        except Exception as exc:
            results.append({"href": href, "path": decoded_path(href), "error": repr(exc)})
    return results


# --------------------------------------------------------------------------- forms


def field_label(s: BeautifulSoup, field: Tag) -> str | None:
    fid = field.get("id")
    if fid:
        lab = s.find("label", attrs={"for": fid})
        if lab:
            return clean_text(lab.get_text())
    parent_label = field.find_parent("label")
    if parent_label:
        return clean_text(parent_label.get_text())
    # Same field container: a preceding <label>.
    container = field.find_parent(class_=re.compile(r"field|form-group|form-row|wrap|col"))
    if container is not None:
        lab = container.find("label")
        if lab:
            return clean_text(lab.get_text())
    if field.get("placeholder"):
        return clean_text(field["placeholder"])
    if field.get("aria-label"):
        return clean_text(field["aria-label"])
    if field.name == "select":
        first = field.find("option")
        if first is not None:
            text = clean_text(first.get_text())
            # CF7 renders the prompt as the first option, often with value == text.
            if not first.get("value") or (first.get("value") == text and ("*" in text or text.startswith("בח"))):
                return text
    return None


def is_required(field: Tag, label: str | None) -> bool:
    classes = " ".join(field.get("class", []))
    return bool(
        field.has_attr("required")
        or field.get("aria-required") == "true"
        or "validates-as-required" in classes
        or "required" in classes
        or (label or "").strip().endswith("*")
    )


def form_context(form: Tag) -> dict[str, Any]:
    ctx: dict[str, Any] = {}
    popup = form.find_parent(attrs={"data-elementor-type": "popup"})
    if popup is not None:
        ctx["elementor_popup_id"] = popup.get("data-elementor-id")
    blackout = form.find_parent("blackout") or form.find_parent(class_=re.compile(r"popup"))
    if blackout is not None and blackout.get("id"):
        ctx["popup_id"] = blackout.get("id")
    section = form.find_parent("section")
    if section is not None:
        ctx["section"] = section.get("id") or " ".join(section.get("class", [])[:3])
    wrapper = form.find_parent(id=True)
    if wrapper is not None:
        ctx["nearest_id"] = wrapper.get("id")
    # Heading text right above the form (title of the form card).
    card = form.find_parent(class_=re.compile(r"form|card|popup|modal"))
    if card is not None:
        h = card.find(["h1", "h2", "h3", "h4"]) or card.find(class_=re.compile(r"title"))
        if h is not None:
            ctx["title"] = clean_text(h.get_text())
    return ctx


def extract_form(s: BeautifulSoup, form: Tag, page_url: str) -> dict[str, Any]:
    fields = []
    hidden = {}
    for f in form.find_all(["input", "select", "textarea"]):
        ftype = f.get("type", f.name) if f.name == "input" else f.name
        name = f.get("name")
        if ftype == "hidden":
            if name:
                hidden[name] = f.get("value")
            continue
        if ftype in ("submit", "button"):
            continue
        label = field_label(s, f)
        entry: dict[str, Any] = {
            "name": name,
            "type": ftype,
            "label": label,
            "placeholder": f.get("placeholder"),
            "required": is_required(f, label),
        }
        if f.name == "select":
            entry["options"] = [
                {"value": o.get("value", clean_text(o.get_text())), "label": clean_text(o.get_text())}
                for o in f.find_all("option")
            ]
        if ftype in ("checkbox", "radio"):
            entry["value"] = f.get("value")
            entry["checked"] = f.has_attr("checked")
        fields.append(entry)
    submits = dedupe(clean_text(b.get_text()) or b.get("value") for b in form.select("button, input[type=submit], [id$=-submit]"))
    cf7 = hidden.get("_wpcf7")
    kind = "cf7" if cf7 else ("comment" if form.get("id") == "commentform" else ("search" if form.find("input", attrs={"name": re.compile("^s$|search")}) and len(fields) <= 2 else "custom"))
    return {
        "page": page_url,
        "kind": kind,
        "form_id": form.get("id"),
        "classes": form.get("class", []),
        "cf7_id": cf7,
        "action": urljoin(page_url, form.get("action")) if form.get("action") else None,
        "method": (form.get("method") or "get").lower(),
        "context": form_context(form),
        "fields": fields,
        "hidden_fields": {k: v for k, v in hidden.items() if not k.startswith("_wpcf7")},
        "submit_labels": [x for x in submits if x],
        "multi_step": "cf7mls" in " ".join(form.get("class", [])) or bool(form.select(".cf7mls_next, fieldset.fieldset-cf7mls")),
    }


def pseudo_forms(s: BeautifulSoup) -> list[Tag]:
    """JS-driven 'forms' built from divs (e.g. the theme's signup/login popups)."""
    out: list[Tag] = []
    for el in s.select("div.form, div[id^=form-]"):
        if el.find_parent("form") is not None or el.find("form") is not None:
            continue
        if not el.find(["input", "select", "textarea"]):
            continue
        if any(p in out for p in el.parents):
            continue
        out.append(el)
    return out


def form_signature(f: dict[str, Any]) -> str:
    names = ",".join(sorted(str(x["name"]) for x in f["fields"]))
    return f"{f['kind']}|{f['cf7_id']}|{f['form_id']}|{names}"


# --------------------------------------------------------------------------- JS endpoints


def js_endpoints(html: str) -> dict[str, list[str]]:
    return {
        "admin_ajax_actions": sorted(set(re.findall(r"action['\"]?\s*[:=]\s*['\"]([a-z0-9_]+)['\"]", html))),
        "webhooks": sorted(set(re.findall(r"https://hooks\.zapier\.com/[^\s'\"]+|https://hook\.[a-z0-9.]*make\.com/[^\s'\"]+", html))),
        "custom_rest_routes": sorted(set(re.findall(r"/wp-json/((?!wp/v2|wc/|oembed|contact-form-7)[a-z0-9_-]+/v\d+/[a-z0-9_/-]*)", html))),
    }


# --------------------------------------------------------------------------- popups


def embeds(el: Tag) -> list[str]:
    """Third-party embeds (booking widgets, iframes) inside an element."""
    found = [x.get("data-url") for x in el.select("[data-url]")]
    found += [x.get("src") or x.get("data-src") or x.get("data-lazy-src") for x in el.find_all("iframe")]
    found += [f"#{x.get('id')}" for x in el.select("[id*=iframe], [id*=booking]") if x.get("id")]
    return dedupe(found)


def popups(s: BeautifulSoup) -> list[dict[str, Any]]:
    out = []
    for p in s.select("[data-elementor-type=popup]"):
        try:
            settings = json.loads(p.get("data-elementor-settings") or "{}")
        except json.JSONDecodeError:
            settings = {}
        out.append(
            {
                "kind": "elementor",
                "id": p.get("data-elementor-id"),
                "open_selector": settings.get("open_selector"),
                "settings": settings,
                "embeds": embeds(p),
                "headings": dedupe(clean_text(h.get_text()) for h in p.select("h1, h2, h3, .elementor-heading-title"))[:10],
                "buttons": dedupe(clean_text(b.get_text()) for b in p.select("a, button"))[:10],
                "links": dedupe(a.get("href") for a in p.select("a[href]") if a.get("href") != "#")[:10],
                "text": clean_text(p.get_text(" "))[:600],
                "forms": len(p.find_all("form")),
            }
        )
    for p in s.find_all("blackout"):
        out.append(
            {
                "kind": "theme",
                "id": p.get("id"),
                "embeds": embeds(p),
                "classes": p.get("class", []),
                "headings": dedupe(clean_text(h.get_text()) for h in p.select("h1, h2, h3, .title, .title-form"))[:10],
                "buttons": dedupe(clean_text(b.get_text()) for b in p.select("a, button, .btn, .btn-1, .btn-2"))[:10],
                "text": clean_text(p.get_text(" "))[:600],
                "forms": len(p.find_all("form")),
            }
        )
    return out


# --------------------------------------------------------------------------- page-specific


def membership_plans(s: BeautifulSoup) -> dict[str, Any]:
    plans = []
    for art in s.select("article.plan"):
        price_el = art.select_one(".plan-price")
        prices = []
        if price_el is not None:
            main_price = price_el.select_one(".v")
            if main_price is not None:
                prices.append({"label": clean_text(price_el.select_one(".from").get_text()) if price_el.select_one(".from") else None,
                               "amount": clean_text(main_price.get_text()), "currency": "ILS"})
            for t2 in price_el.select(".tier-2"):
                prices.append({"label": clean_text(t2.find(string=True, recursive=True) or ""), "amount": clean_text((t2.find("b") or t2).get_text()), "currency": "ILS"})
        plans.append(
            {
                "badge": clean_text(art.select_one(".plan-badge").get_text()) if art.select_one(".plan-badge") else None,
                "tier": clean_text(art.select_one(".plan-tier").get_text()) if art.select_one(".plan-tier") else None,
                "name": clean_text(art.select_one(".plan-name").get_text()) if art.select_one(".plan-name") else None,
                "featured": "featured" in art.get("class", []),
                "benefits": [clean_text(li.get_text()).lstrip("+").strip() for li in art.select(".plan-feats li")],
                "prices": prices,
                "vat_note": clean_text(art.select_one(".vat").get_text()) if art.select_one(".vat") else None,
                "cta": clean_text(art.select_one("a.btn").get_text()) if art.select_one("a.btn") else None,
            }
        )
    compare = []
    table = s.select_one("table.compare")
    if table is not None:
        cols = [clean_text(th.select_one(".th-name").get_text()) for th in table.select("thead th") if th.select_one(".th-name")]
        category = None
        for tr in table.select("tbody tr"):
            tds = tr.find_all("td")
            if "row-cat" in tr.get("class", []):
                category = clean_text(tds[0].find(string=True, recursive=False) or tds[0].get_text())
                continue
            name_td = tr.select_one(".feat-name")
            vals = []
            for td in tds[1:]:
                if td.select_one(".ico-yes"):
                    vals.append("yes")
                elif td.select_one(".ico-no"):
                    vals.append("no")
                else:
                    vals.append(clean_text(td.get_text()) or None)
            compare.append({
                "category": category,
                "feature": clean_text(name_td.find(string=True, recursive=False) or name_td.get_text()) if name_td else None,
                "values": dict(zip(cols, vals)),
            })
    faq = [
        {"q": clean_text(q.get_text()), "a": clean_text(q.find_next_sibling().get_text()) if q.find_next_sibling() else None}
        for q in s.select(".faq-item .faq-q, .faq-cols button, .faq-cols .q")
    ]
    return {"plans": plans, "comparison": compare, "faq": faq}


def js_object(html: str, var: str) -> dict[str, str]:
    m = re.search(rf"var\s+{var}\s*=\s*(\{{.*?\}})\s*;", html, re.S)
    if not m:
        return {}
    return dict(re.findall(r"'([^']+)'\s*:\s*'([^']*)'", m.group(1)))


def whatsapp_groups(html: str, s: BeautifulSoup) -> dict[str, Any]:
    links = js_object(html, "WA_LINKS")
    names = js_object(html, "AREA_NAMES")
    select_labels = {o.get("value"): clean_text(o.get_text()) for o in s.select("select#bbwa-area option") if o.get("value")}
    groups = [
        {"key": k, "name": names.get(k) or select_labels.get(k), "select_label": select_labels.get(k), "invite_link": v}
        for k, v in links.items()
    ]
    # Fallback: any chat.whatsapp.com links in the markup.
    if not groups:
        for a in s.select("a[href*='chat.whatsapp.com']"):
            groups.append({"key": None, "name": clean_text(a.get_text()), "invite_link": a["href"]})
    return {
        "groups": groups,
        "submission": js_endpoints(html)["webhooks"],
        "stats": [
            {"value": clean_text(x.select_one(".bbj-stat-num").get_text()), "label": clean_text(x.select_one(".bbj-stat-label").get_text())}
            for x in s.select(".bbj-stat") if x.select_one(".bbj-stat-num") and x.select_one(".bbj-stat-label")
        ],
        "faq": [
            {"q": clean_text(i.select_one(".bbj-faq-q").get_text()), "a": clean_text(i.select_one(".bbj-faq-a").get_text())}
            for i in s.select(".bbj-faq-item") if i.select_one(".bbj-faq-q") and i.select_one(".bbj-faq-a")
        ],
    }


def select_options(s: BeautifulSoup, selector: str) -> list[str]:
    el = s.select_one(selector)
    if el is None:
        return []
    return [clean_text(o.get_text()) for o in el.find_all("option") if o.get("value") not in (None, "", "0")]


def events_from_posts() -> list[dict[str, Any]]:
    path = MIGRATION_DIR / "posts.json"
    if not path.exists():
        return []
    posts = json.loads(path.read_text(encoding="utf-8"))
    events = []
    for p in posts:
        if any(c["slug"] == EVENTS_CATEGORY_SLUG for c in p.get("categories", [])):
            events.append({
                "id": p["id"],
                "title": p["title"],
                "slug": p["slug"],
                "link": p["link"],
                "date": p["date"],
                "excerpt": clean_text(BeautifulSoup(p.get("excerpt_html") or "", "lxml").get_text(" "))[:300],
                "featured_image": (p.get("featured_image") or {}).get("url"),
            })
    return sorted(events, key=lambda e: e["date"] or "", reverse=True)


# --------------------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()
    use_cache = not args.no_cache

    page_urls = sitemap_locs(f"{LIVE_BASE}/page-sitemap.xml", use_cache)
    urls = dedupe(page_urls + [LIVE_BASE + p for p in EXTRA_PATHS])
    # One sample of each content template, to capture their forms/popups.
    for sm in ("post", "video", "business", "product"):
        locs = [u for u in sitemap_locs(f"{LIVE_BASE}/{sm}-sitemap.xml", use_cache) if urlparse(u).path.count("/") > 2]
        if locs:
            urls.append(locs[0])

    pages: dict[str, dict[str, Any]] = OrderedDict()
    raw_html: dict[str, str] = {}
    forms: dict[str, dict[str, Any]] = OrderedDict()
    all_popups: dict[str, dict[str, Any]] = OrderedDict()
    endpoints: dict[str, set[str]] = {"admin_ajax_actions": set(), "webhooks": set(), "custom_rest_routes": set()}

    for url in urls:
        try:
            html, _ = fetch(url, use_cache=use_cache)
        except Exception as exc:
            pages[url] = {"url": url, "error": repr(exc)}
            continue
        raw_html[url] = html
        s = soup(html)
        body_classes = s.body.get("class", []) if s.body else []
        template = next((c for c in body_classes if c.startswith("page-template-")), None)
        page_forms = [extract_form(s, f, url) for f in s.find_all("form")]
        for el in pseudo_forms(s):
            pf = extract_form(s, el, url)
            pf["kind"] = "js-div"
            pf["form_id"] = el.get("id")
            page_forms.append(pf)
        for f in page_forms:
            sig = form_signature(f)
            if sig in forms:
                forms[sig]["seen_on"].append(url)
            else:
                forms[sig] = {**f, "seen_on": [url]}
        for p in popups(s):
            key = f"{p['kind']}:{p['id']}"
            all_popups.setdefault(key, {**p, "seen_on": []})["seen_on"].append(url)
        for k, v in js_endpoints(html).items():
            endpoints[k].update(v)
        pages[url] = {
            "url": url,
            "path": decoded_path(url),
            "title": clean_text(s.title.string) if s.title and s.title.string else None,
            "template": template,
            "h1": [clean_text(h.get_text(" ")) for h in s.find_all("h1")],
            "sections": page_sections(s),
            "form_count": len(page_forms),
            "outbound_contact_links": dedupe(
                a["href"] for a in s.select("div.content a[href], main a[href]")
                if a["href"].startswith(("tel:", "mailto:", "https://wa.me", "whatsapp:", "https://chat.whatsapp.com"))
            ),
        }

    home_url = f"{LIVE_BASE}/"
    home = soup(raw_html[home_url])

    def by_path(fragment: str) -> tuple[str, str] | None:
        for u, h in raw_html.items():
            if fragment in decoded_path(u):
                return u, h
        return None

    tiers_page = by_path("/membership-tiers/")
    wa_page = by_path("/הצטרפו-לקבוצות-הווטסאפ/")
    recommended = by_path("/recommended/")

    # Regions: the signup popup and the directory filter each carry a list.
    region_lists: dict[str, list[str]] = {}
    for sig, f in forms.items():
        for fld in f["fields"]:
            label = (fld.get("label") or "").strip()
            opts = [
                o["label"] for o in fld.get("options", [])
                if o["value"] and o["label"] != label and "*" not in o["label"] and not o["label"].startswith("בח")
            ]
            if fld["type"] == "select" and any("מרכז" in o or "שפלה" in o or "השפלה" in o for o in opts):
                key = f"{f['context'].get('popup_id') or f['form_id'] or f['cf7_id']}:{fld['name']}"
                region_lists.setdefault(key, opts)
    rec_soup = soup(recommended[1]) if recommended else None
    if rec_soup is not None:
        region_lists["directory_filter:locations"] = select_options(rec_soup, "select[name=locations]")

    specialties = select_options(rec_soup, "select[name=services]") if rec_soup is not None else []

    site = {
        "base": LIVE_BASE,
        "menus": {"header": header_menus(home), "footer": footer_menus(home)},
        "homepage_sections": pages[home_url]["sections"],
        "homepage_outline": heading_outline(home),
        "menu_link_checks": check_links(home),
        "global_widgets": {
            "floating": [
                {"href": a.get("href"), "classes": a.get("class", []), "text": clean_text(a.get_text())}
                for a in home.select("body > a, a.consultation-float-wrap, a.chat-custom-text")
            ],
        },
        "pages": list(pages.values()),
        "forms": list(forms.values()),
        "popups": list(all_popups.values()),
        "js_endpoints": {k: sorted(v) for k, v in endpoints.items()},
        "membership_tiers": membership_plans(soup(tiers_page[1])) if tiers_page else None,
        "whatsapp_groups": whatsapp_groups(wa_page[1], soup(wa_page[1])) if wa_page else None,
        "events": events_from_posts(),
        "regions": region_lists,
        "business_specialties": specialties,
    }
    path = write_json("site_structure.json", site)
    print(f"Wrote {path}: {len(pages)} pages, {len(forms)} unique forms, {len(all_popups)} popups")
    write_inventory(site)
    print(f"Wrote {INVENTORY_MD}")


# --------------------------------------------------------------------------- markdown


def write_inventory(site: dict[str, Any]) -> None:
    L: list[str] = []
    add = L.append
    add("# Live site inventory (bonimbayit.co.il)")
    add("")
    add("Generated by `scripts/migrate/crawl_site_structure.py` from the public site. The raw data is in")
    add("`data/migration/site_structure.json` (gitignored). Re-run the script to refresh it.")
    add("")

    add("## Header menu")
    for m in site["menus"]["header"].get("main", []):
        add(f"- **{m['text']}** → `{m['path']}`" + (f" ({len(m['children'])} children)" if m["children"] else ""))
        for c in m["children"]:
            add(f"  - {c['text']} → `{c['path']}`")
    add("")
    add("Sidebar (hamburger) menu: " + ", ".join(f"{l['text']} (`{l['path']}`)" for l in site["menus"]["header"].get("sidebar", [])))
    add("")
    add("Header CTAs: " + ", ".join(sorted({c['text'] for c in site["menus"]["header"].get("cta_buttons", []) if c['text']})))
    add("")
    add("## Footer")
    for col in site["menus"]["footer"].get("columns", []):
        links = ", ".join(
            f"{l['text'] or l['href']} (`{decoded_path(l['href']) if l['href'].startswith(LIVE_BASE) else l['href']}`)"
            for l in col["links"][:15]
        )
        add(f"- **{col['title'] or '(no title)'}**: {links}")
    if site["menus"]["footer"].get("brand_text"):
        add(f"- Brand block: {site['menus']['footer']['brand_text']}")
    add("")

    broken = [c for c in site.get("menu_link_checks", []) if c.get("final") or c.get("status", 200) >= 400 or c.get("error")]
    if broken:
        add("Header/footer links that redirect or fail on the live site:")
        for c in broken:
            add(f"- `{unquote(c['href'])}` → " + (f"`{c['final']}`" if c.get("final") else str(c.get("status") or c.get("error"))))
        add("")

    add("## Homepage section order (by heading)")
    for i, sec in enumerate(site["homepage_outline"], 1):
        widgets = ", ".join(k.split(".")[0] for k in list(sec["widgets"])[:6] if k)
        add(f"{i}. **{sec['text']}** ({sec['level']})" + (f" — widgets: {widgets}" if widgets else "") + (f" — links: {', '.join(sec['links'][:5])}" if sec["links"] else ""))
    add("")

    add("## Forms")
    add("")
    add("| Kind | Where | Title/context | Fields (* = required) | Submit |")
    add("|---|---|---|---|---|")
    for f in site["forms"]:
        if len(f["seen_on"]) > 6:
            where = f"site-wide ({len(f['seen_on'])} pages)"
        else:
            where = ", ".join(sorted({decoded_path(u) for u in f["seen_on"]}))[:120]
        ctx = f["context"].get("title") or f["context"].get("popup_id") or f["form_id"] or ""
        flds = ", ".join(
            f"{(x['label'] or x['name'] or '?').rstrip('* ')[:40]}{'*' if x['required'] else ''} ({x['type']}{', ' + str(len(x['options'])) + ' opts' if x.get('options') else ''})"
            for x in f["fields"]
        )
        add(f"| {f['kind']}{' #' + f['cf7_id'] if f['cf7_id'] else ''} | {where} | {ctx[:60]} | {flds} | {', '.join(f['submit_labels'])[:40]} |")
    add("")
    add("JS submission endpoints seen in page source:")
    for k, v in site["js_endpoints"].items():
        add(f"- {k}: " + (", ".join(f"`{x}`" for x in v) if v else "none"))
    add("")

    add("## Popups")
    for p in site["popups"]:
        add(
            f"- `{p['kind']}:{p['id']}` — {' / '.join(p['headings'][:3]) or p['text'][:80]}"
            + (f" ({p['forms']} form)" if p["forms"] else "")
            + (f" — opened by `{p['open_selector']}`" if p.get("open_selector") else "")
            + (f" — embeds: {', '.join(p['embeds'])}" if p.get("embeds") else "")
        )
    add("")

    mt = site.get("membership_tiers") or {}
    add("## Membership tiers / management plans (`/membership-tiers/`)")
    for p in mt.get("plans", []):
        price = "; ".join(f"{(x['label'] + ': ') if x['label'] else ''}{x['amount']} ₪" for x in p["prices"])
        add(f"- **{p['name']}** ({p['tier']}, {p['badge']}{', featured' if p['featured'] else ''}) — {price} {p['vat_note'] or ''}")
        for b in p["benefits"]:
            add(f"  - {b}")
    if mt.get("comparison"):
        add("")
        add(f"Comparison table: {len(mt['comparison'])} feature rows across {len({r['category'] for r in mt['comparison']})} categories.")
    add("")

    add("## Events")
    ev = site.get("events") or []
    add(f"{len(ev)} posts in category `{EVENTS_CATEGORY_SLUG}` (conferences and lives). Most recent:")
    for e in ev[:10]:
        add(f"- {e['date'][:10] if e['date'] else ''} — {e['title']}")
    add("")

    wa = site.get("whatsapp_groups") or {}
    add("## WhatsApp groups (`/הצטרפו-לקבוצות-הווטסאפ/`)")
    add("Join flow: form (name, WhatsApp phone, area, not-a-professional checkbox, newsletter opt-in) → "
        "POST to " + (", ".join(f"`{w}`" for w in wa.get("submission", [])) or "unknown") + " → reveals the regional invite link.")
    for g in wa.get("groups", []):
        add(f"- {g['name']} (`{g['key']}`) → {g['invite_link']}")
    add("")

    add("## Regions")
    for k, v in site["regions"].items():
        add(f"- `{k}` ({len(v)}): {', '.join(v)}")
    add("")

    add(f"## Business specialties ({len(site['business_specialties'])})")
    add(", ".join(site["business_specialties"]))
    add("")

    add("## Notes for feature agents")
    add("- Signup (`popup-signup`) is a JS form (div, not `<form>`) with reCAPTCHA, Google social login, "
        "13 regions + construction phase, newsletter opt-in, and SMS phone verification popups.")
    add("- 'Show phone' on business profiles opens `popup-verification-phone` (name, email, mobile) — phone reveal is lead-gated.")
    add("- The consultation modal (`.openpopupdate`, header CTA) is an Elementor popup embedding Calendly "
        "(`tzuri-galili-bonimbayit/demo45min`) plus a Zoho booking placeholder; there is no native form.")
    add("- Business reviews: overall % + 4 sub-scores (תמורה למחיר, זמינות ושירותיות, יחסי אנוש, אמינות ואיכות עבודה); "
        "review form lives at `/?page_id=285?b=<business_id>`.")
    add("- No tier/badge markup was found on business profiles or the /recommended/ listing; listing order is the only ranking signal.")
    add("- Several region vocabularies coexist (directory 14 incl. 'כל הארץ', signup 13, CF7 lead forms 14, WhatsApp 11 areas). "
        "Pick one canonical list and map the others.")
    add("")

    add("## Pages")
    add("| Path | Template | H1 | Forms |")
    add("|---|---|---|---|")
    for p in site["pages"]:
        if "error" in p:
            add(f"| {p['url']} | error | {p['error'][:60]} | |")
            continue
        add(f"| `{p['path']}` | {p['template'] or ''} | {' / '.join(p['h1'])[:60]} | {p['form_count']} |")
    add("")
    INVENTORY_MD.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY_MD.write_text("\n".join(L), encoding="utf-8")


if __name__ == "__main__":
    main()
