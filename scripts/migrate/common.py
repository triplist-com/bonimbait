"""Shared helpers for the bonimbayit.co.il migration crawlers.

Polite HTTP (browser UA, small delay, retries with backoff), an on-disk cache of
raw responses under data/migration/raw/, sitemap parsing and JSON output.

Set MIGRATION_DATA_DIR to override where data/ lives (useful from a git worktree,
where data/ is gitignored and therefore absent).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlparse

import requests
from bs4 import BeautifulSoup

LIVE_BASE = "https://bonimbayit.co.il"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("MIGRATION_DATA_DIR", REPO_ROOT / "data"))
MIGRATION_DIR = DATA_DIR / "migration"
RAW_DIR = MIGRATION_DIR / "raw"

# Politeness settings for the live site.
LIVE_CONCURRENCY = 4
REQUEST_DELAY_S = 0.3
MAX_RETRIES = 4

_local = threading.local()


def session() -> requests.Session:
    """One requests.Session per thread (Session is not strictly thread-safe)."""
    s = getattr(_local, "session", None)
    if s is None:
        s = requests.Session()
        s.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
            }
        )
        _local.session = s
    return s


def _cache_path(url: str, kind: str) -> Path:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
    ext = "json" if kind == "json" else "html" if kind == "html" else "txt"
    return RAW_DIR / kind / f"{digest}.{ext}"


def fetch(url: str, kind: str = "html", use_cache: bool = True) -> tuple[str, dict[str, str]]:
    """GET a URL with retries/backoff and cache the body + selected headers.

    Returns (body_text, headers). Raises requests.HTTPError on a final non-2xx.
    """
    path = _cache_path(url, kind)
    meta_path = path.with_suffix(path.suffix + ".meta.json")
    if use_cache and path.exists():
        headers = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        return path.read_text(encoding="utf-8"), headers

    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(REQUEST_DELAY_S)
            resp = session().get(url, timeout=60)
            if resp.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"{resp.status_code} for {url}", response=resp)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            body = resp.text
            keep = {k: v for k, v in resp.headers.items() if k.lower().startswith("x-wp") or k.lower() == "content-type"}
            if resp.history:
                # The URL redirected (e.g. a legacy video slug now 301s to a post).
                keep["final_url"] = resp.url
                keep["redirect_status"] = str(resp.history[0].status_code)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8")
            meta_path.write_text(json.dumps({"url": url, **keep}, ensure_ascii=False))
            return body, keep
        except requests.HTTPError as exc:
            last_exc = exc
            status = exc.response.status_code if exc.response is not None else None
            if status is not None and status < 500 and status != 429:
                raise
        except requests.RequestException as exc:
            last_exc = exc
        time.sleep(2 ** attempt)
    assert last_exc is not None
    raise last_exc


def fetch_json(url: str, use_cache: bool = True) -> tuple[Any, dict[str, str]]:
    body, headers = fetch(url, kind="json", use_cache=use_cache)
    return parse_json_lenient(body), headers


def parse_json_lenient(body: str) -> Any:
    """Parse JSON even when a WP plugin leaks HTML before the payload.

    Some live endpoints (e.g. /wp/v2/pages with _embed) print an Elementor
    <div> before the JSON. We find the start offset whose decode consumes the
    rest of the body.
    """
    text = body.lstrip("﻿")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    for m in re.finditer(r"[\[{]", text):
        try:
            obj, end = decoder.raw_decode(text, m.start())
        except json.JSONDecodeError:
            continue
        if not text[end:].strip():
            return obj
    raise ValueError("no JSON payload found in response body")


def soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def sitemap_locs(sitemap_url: str, use_cache: bool = True) -> list[str]:
    """All <loc> values in a sitemap (recurses into sitemap indexes)."""
    body, _ = fetch(sitemap_url, kind="xml", use_cache=use_cache)
    s = BeautifulSoup(body, "xml")
    if s.find("sitemapindex"):
        out: list[str] = []
        for loc in s.select("sitemap > loc"):
            out.extend(sitemap_locs(loc.get_text(strip=True), use_cache))
        return out
    return [loc.get_text(strip=True) for loc in s.select("url > loc")]


def decoded_path(url: str) -> str:
    """URL path with percent-encoding decoded (Hebrew readable)."""
    return unquote(urlparse(url).path)


def slug_from_url(url: str) -> str:
    parts = [p for p in decoded_path(url).split("/") if p]
    return parts[-1] if parts else ""


def clean_text(text: str | None) -> str:
    return " ".join((text or "").split())


YOUTUBE_ID_RE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?(?:[^\"'\s]*&)?v=|shorts/|live/)|youtu\.be/)([\w-]{11})"
)


def youtube_ids(text: str) -> list[str]:
    """Unique YouTube IDs in order of appearance."""
    seen: dict[str, None] = {}
    for m in YOUTUBE_ID_RE.finditer(text or ""):
        seen.setdefault(m.group(1), None)
    return list(seen)


def img_src(tag: Any) -> str | None:
    """Real image URL for an <img>, accounting for WP Rocket lazy-loading."""
    if tag is None:
        return None
    for attr in ("data-lazy-src", "data-src", "src"):
        v = tag.get(attr)
        if v and not v.startswith("data:"):
            return v
    return None


def head_meta(s: BeautifulSoup) -> dict[str, Any]:
    """SEO metadata from <head> (Yoast output)."""
    meta: dict[str, Any] = {"title": clean_text(s.title.string) if s.title and s.title.string else None}
    for m in s.find_all("meta"):
        key = m.get("property") or m.get("name")
        if key in (
            "description",
            "robots",
            "og:title",
            "og:description",
            "og:image",
            "og:type",
            "og:url",
            "article:published_time",
            "article:modified_time",
            "twitter:card",
        ):
            meta[key] = m.get("content")
    canon = s.find("link", rel="canonical")
    meta["canonical"] = canon.get("href") if canon else None
    ld: list[Any] = []
    for tag in s.find_all("script", type="application/ld+json"):
        try:
            ld.append(json.loads(tag.string or ""))
        except (json.JSONDecodeError, TypeError):
            continue
    meta["json_ld"] = ld
    return meta


def post_id_from_body(s: BeautifulSoup) -> int | None:
    body = s.body
    if body is None:
        return None
    for c in body.get("class", []):
        m = re.fullmatch(r"(?:postid|page-id)-(\d+)", c)
        if m:
            return int(m.group(1))
    return None


def write_json(name: str, data: Any) -> Path:
    MIGRATION_DIR.mkdir(parents=True, exist_ok=True)
    path = MIGRATION_DIR / name
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def read_json(name: str) -> Any:
    return json.loads((MIGRATION_DIR / name).read_text(encoding="utf-8"))


def collect_image_urls(obj: Any, found: set[str]) -> None:
    """Recursively collect image-looking URLs from any JSON-like structure."""
    if isinstance(obj, str):
        for m in re.finditer(r"https?://[^\s\"'<>()]+?\.(?:jpe?g|png|gif|webp|svg|avif)(?:\?[^\s\"'<>()]*)?", obj, re.I):
            found.add(m.group(0))
    elif isinstance(obj, dict):
        for v in obj.values():
            collect_image_urls(v, found)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            collect_image_urls(v, found)


def dedupe(items: Iterable[str | None]) -> list[str]:
    return list(dict.fromkeys(i for i in items if i))
