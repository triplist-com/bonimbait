"""HTML clean-up applied by load.py to crawled WordPress/Elementor HTML.

The rules are documented in scripts/migrate/SANITIZE.md. In short: keep the
content (headings, paragraphs, lists, tables, images, figures, iframes/YouTube
embeds, FAQ <details>, inline SVG), drop what can't render outside WordPress
(scripts, styles, forms, Elementor/CF7 wrappers, shortcodes, hidden elements),
make internal links root-relative and rewrite migrated image URLs.

The original HTML is not stored in the DB; it stays in data/migration/*.json.
"""

from __future__ import annotations

import re
from typing import Callable, Optional
from urllib.parse import unquote, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

LIVE_HOST_RE = re.compile(r"^https?://(?:www\.)?bonimbayit\.co\.il(?=/|$|\?|#)", re.I)
UPLOADS_RE = re.compile(r"^https?://(?:www\.)?bonimbayit\.co\.il/wp-content/uploads/", re.I)
IMAGE_EXT_RE = re.compile(r"\.(?:jpe?g|png|gif|webp|avif|svg|bmp|ico)$", re.I)

# Elements removed with their content.
DROP_TAGS = {
    "script", "style", "noscript", "link", "meta", "template", "object", "embed",
    "input", "select", "textarea", "button", "option", "optgroup", "label",
    "fieldset", "legend", "canvas", "datalist", "output", "progress", "dialog",
}
# Wrappers that are unwrapped (children kept) once they carry no useful attributes.
UNWRAP_WHEN_BARE = {"div", "section", "article", "span", "font", "center", "main", "aside", "header", "footer", "nav", "raw"}
# Elements that count as "content" even without text.
MEDIA_TAGS = {"img", "iframe", "video", "audio", "svg", "table", "hr", "picture", "source", "figure"}
# Elements removed when they end up empty.
PRUNE_WHEN_EMPTY = {"p", "div", "span", "section", "article", "strong", "b", "em", "i", "u",
                    "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "a", "figure",
                    "figcaption", "blockquote", "font", "center", "raw", "summary"}

# Shortcodes left in the text by WordPress plugins that aren't installed/rendered.
SHORTCODE_RE = re.compile(
    r"\[/?(?:read|pdf|gravityform|caption|embed|contact-form-7|elementor-template|bb_track|"
    r"vc_[a-z_]+|et_pb_[a-z_]+|fusion_[a-z_]+|su_[a-z_]+|video|audio|gallery|playlist)"
    r"(?:\s[^\]]*)?\]",
    re.I,
)

GLOBAL_ATTRS = {"id", "dir", "lang", "title", "aria-label", "aria-hidden", "role"}
TAG_ATTRS: dict[str, set[str]] = {
    "a": {"href", "target", "rel", "name"},
    "img": {"src", "alt", "width", "height", "loading"},
    "iframe": {"src", "width", "height", "allow", "allowfullscreen", "frameborder", "title",
               "loading", "referrerpolicy"},
    "video": {"src", "controls", "poster", "width", "height", "preload", "muted", "loop", "playsinline"},
    "audio": {"src", "controls", "preload"},
    "source": {"src", "type", "media"},
    "td": {"colspan", "rowspan", "align"},
    "th": {"colspan", "rowspan", "align", "scope"},
    "col": {"span", "width"},
    "colgroup": {"span"},
    "ol": {"start", "type", "reversed"},
    "li": {"value"},
    "details": {"open"},
    "table": {"border"},
    "time": {"datetime"},
    "blockquote": {"cite"},
}
# Classes worth keeping (WordPress alignment / caption helpers).
KEEP_CLASS_RE = re.compile(r"^(?:align(?:none|left|right|center)|wp-caption(?:-text)?|wp-block-[a-z-]+)$")
SVG_TAGS = {"svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "ellipse",
            "defs", "use", "clippath", "lineargradient", "radialgradient", "stop", "pattern",
            "mask", "symbol", "text", "tspan", "image", "title", "desc"}

UrlRewriter = Callable[[str], Optional[str]]  # None = file is dead: drop the reference


def rewrite_internal_link(url: str) -> str:
    """https://bonimbayit.co.il/foo/?x#y -> /foo/?x#y (wp-content URLs are left alone)."""
    if not url:
        return url
    u = url.strip()
    if UPLOADS_RE.match(u) or re.match(r"^https?://(?:www\.)?bonimbayit\.co\.il/wp-content/", u, re.I):
        return u
    if LIVE_HOST_RE.match(u):
        parts = urlsplit(u)
        path = parts.path or "/"
        return urlunsplit(("", "", path, parts.query, parts.fragment))
    return u


def _keep_style(style: str) -> Optional[str]:
    """Keep only text-align from inline styles (everything else is theme spacing)."""
    keep = []
    for decl in style.split(";"):
        if ":" not in decl:
            continue
        prop, val = decl.split(":", 1)
        if prop.strip().lower() == "text-align" and val.strip():
            keep.append(f"text-align: {val.strip()}")
    return "; ".join(keep) or None


def _is_empty(el: Tag) -> bool:
    if el.name in MEDIA_TAGS:
        return False
    if el.find(lambda t: isinstance(t, Tag) and t.name in MEDIA_TAGS):
        return False
    if el.name == "a" and el.get("name"):
        return False
    if el.get("id"):  # anchor target
        return False
    text = el.get_text()
    return not text.replace("\xa0", " ").strip()


def _form_kind(form: Tag) -> str:
    classes = " ".join(
        " ".join(t.get("class", [])) for t in [form, *form.find_all(True)] if isinstance(t, Tag)
    )
    if "bbwa" in classes:
        return "whatsapp"
    if "search" in classes or form.get("role") == "search":
        return "search"
    return "lead"


def sanitize_html(
    html: Optional[str],
    image_rewriter: Optional[UrlRewriter] = None,
    stats: Optional[dict] = None,
) -> str:
    """Return cleaned HTML. `image_rewriter` maps wp-content/uploads URLs to Storage URLs."""
    if not html or not html.strip():
        return ""
    st = stats if stats is not None else {}

    def bump(k: str, n: int = 1) -> None:
        st[k] = st.get(k, 0) + n

    rw = image_rewriter or (lambda u: u)
    soup = BeautifulSoup(html, "html.parser")

    # 1. Comments (incl. <!-- SPOTIFY_EMBED ... --> placeholders).
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        c.extract()
        bump("comments")

    # 2. Hidden-on-live elements (.hide-p is display:none in the theme).
    for el in soup.select(".hide-p, .screen-reader-response, .wpcf7-response-output, [hidden]"):
        el.decompose()
        bump("hidden")

    # 3. Forms -> placeholder the renderer can swap for a real CTA/lead form.
    #    CF7 forms sit inside <div class="wpcf7">; replace the wrapper when present.
    for form in soup.find_all("form"):
        if form.parent is None:
            continue
        kind = _form_kind(form)
        target = form
        wrapper = form.find_parent(class_="wpcf7")
        if wrapper is not None:
            target = wrapper
        if kind == "search":
            target.decompose()
        else:
            ph = soup.new_tag("div")
            ph["data-bb-embed"] = "lead-form" if kind == "lead" else "whatsapp-join"
            target.replace_with(ph)
        bump(f"forms_{kind}")

    # 4. Lazy-loaded media: promote data-* sources before stripping attributes.
    for el in soup.find_all(["img", "iframe"]):
        for attr in ("data-lazy-src", "data-src", "data-original"):
            val = el.get(attr)
            if val and (not el.get("src") or el["src"].startswith("data:")):
                el["src"] = val
                break

    # 5. Drop non-rendering elements.
    for el in soup.find_all(list(DROP_TAGS)):
        if el.name == "script" and el.get("type") == "application/ld+json":
            bump("jsonld")
        el.decompose()
        bump("dropped_tags")

    # 6. Attribute whitelist + URL rewrites.
    for el in soup.find_all(True):
        if getattr(el, "decomposed", False):  # inside an element removed earlier in this pass
            continue
        name = el.name.lower()
        if name in SVG_TAGS and (name == "svg" or el.find_parent("svg") is not None):
            for a in list(el.attrs):
                if a.lower().startswith("on") or a in ("class", "style"):
                    del el[a]
            continue
        allowed = GLOBAL_ATTRS | TAG_ATTRS.get(name, set())
        for a in list(el.attrs):
            if a == "class":
                kept = [c for c in el.get("class", []) if KEEP_CLASS_RE.match(c)]
                if kept:
                    el["class"] = kept
                else:
                    del el["class"]
            elif a == "style":
                s = _keep_style(el.get("style", ""))
                if s:
                    el["style"] = s
                else:
                    del el["style"]
            elif a not in allowed:
                del el[a]
        if name == "a" and el.get("href"):
            href = el["href"].strip()
            if href.lower().startswith("javascript:"):
                del el["href"]
            elif href.startswith("#elementor-action"):
                # Elementor popup trigger (lead popup on the live site).
                del el["href"]
                el["data-bb-action"] = "lead-popup"
                bump("popup_links")
            elif UPLOADS_RE.match(href):
                text = el.get_text().strip()
                if text and unquote(text) == unquote(href):
                    # Bare-URL link text (e.g. a <video> fallback): show the file name
                    # instead of the old host, which dies at cutover.
                    el.string = unquote(urlsplit(href).path).rsplit("/", 1)[-1]
                new = rw(href)
                if new is None:  # dead on the live site too: keep the link text only
                    el.unwrap()
                    bump("dead_file_links")
                    continue
                el["href"] = new
            else:
                new = rewrite_internal_link(href)
                if new != href:
                    bump("internal_links")
                el["href"] = new
        elif name in ("img", "video", "source", "audio") and el.get("src"):
            src = el["src"].strip()
            if UPLOADS_RE.match(src):
                new = rw(src)
                if new is None:  # dead on the live site too (renders broken there)
                    el.decompose()
                    bump("dead_media")
                    continue
                el["src"] = new
            elif src.startswith("http://") and "blogspot.com" in src:
                el["src"] = "https://" + src[len("http://"):]
        elif name == "iframe" and el.get("src"):
            src = el["src"].strip()
            if src.startswith("//"):
                src = "https:" + src
            if LIVE_HOST_RE.match(src):
                # WordPress oEmbed of our own post (/embed/#?secret=...): the
                # <blockquote class="wp-embedded-content"> link next to it stays.
                el.decompose()
                bump("wp_oembed_iframes")
                continue
            el["src"] = src

    # 7. Shortcodes in text nodes.
    for s in soup.find_all(string=True):
        if isinstance(s, NavigableString) and "[" in s and SHORTCODE_RE.search(s):
            s.replace_with(NavigableString(SHORTCODE_RE.sub("", str(s))))
            bump("shortcodes")

    # 8. Unwrap bare wrappers (Elementor containers etc.). A <div> with its own
    #    text is kept (unwrapping it would glue its text to the next block).
    for el in reversed(soup.find_all(list(UNWRAP_WHEN_BARE))):
        if el.parent is None or el.attrs:
            continue
        if el.name in ("div", "section", "article", "main", "aside", "header", "footer", "nav", "center"):
            has_own_text = any(
                isinstance(c, NavigableString) and not isinstance(c, Comment) and c.strip()
                for c in el.children
            )
            if has_own_text:
                continue
        el.unwrap()
        bump("unwrapped")

    # 9. Prune empty elements (repeat: removing a child can empty its parent).
    for _ in range(4):
        removed = 0
        for el in soup.find_all(list(PRUNE_WHEN_EMPTY)):
            if el.parent is None or el.get("data-bb-embed"):
                continue
            if _is_empty(el):
                el.decompose()
                removed += 1
        # <p> that only holds <br>s
        for p in soup.find_all("p"):
            if p.parent is not None and not p.get_text().strip() and all(
                isinstance(c, NavigableString) or c.name == "br" for c in p.children
            ):
                p.decompose()
                removed += 1
        bump("pruned", removed)
        if not removed:
            break

    out = str(soup)
    out = re.sub(r"\n\s*\n+", "\n", out).strip()
    return out


def html_to_text(html: Optional[str]) -> str:
    if not html:
        return ""
    return re.sub(r"\s+", " ", BeautifulSoup(html, "html.parser").get_text(" ")).strip()
