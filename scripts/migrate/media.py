"""Migrate bonimbayit.co.il/wp-content/uploads images to Supabase Storage.

* Local cache: data/migration/raw/images/<storage key>
* Manifest:    data/migration/raw/images/manifest.json
      { "<normalized live url>": {"key": "uploads/2023/10/x.png", "status": "uploaded"|"404"|"error", ...} }
* Object key:  the uploads/YYYY/MM/file path. Supabase Storage only accepts ASCII
  keys, so a filename with other characters (Hebrew, spaces, %) becomes
  "<sha1[:10]>-<ascii remnant><.ext>" in the same uploads/YYYY/MM/ folder.
* Public URL:  MEDIA_BASE_URL + "/" + key  (default: local Storage public URL).

Only URLs with status "uploaded" are rewritten by the loader, so content keeps
working (hot-linked to the live site) until its image is migrated.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import quote, unquote, urlsplit

import requests

from paths import images_dir, media_base_url, supabase_env

UPLOADS_URL_RE = re.compile(
    r"https?://(?:www\.)?bonimbayit\.co\.il/wp-content/uploads/[^\s\"'<>)\]]+", re.I
)
SAFE_KEY_RE = re.compile(r"^[A-Za-z0-9/_.\-]+$")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
MIME_FALLBACK = {".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml"}


def normalize(url: str) -> str:
    """https, no www, no query/fragment, percent-encoding decoded."""
    parts = urlsplit(url.strip())
    return "https://bonimbayit.co.il" + unquote(parts.path)


def is_upload(url: Optional[str]) -> bool:
    return bool(url) and bool(UPLOADS_URL_RE.match(url.strip()))


def storage_key(url: str) -> str:
    path = urlsplit(normalize(url)).path  # decoded
    rel = path.split("/wp-content/", 1)[1]  # uploads/2023/10/x.png
    if SAFE_KEY_RE.match(rel):
        return rel
    folder, _, name = rel.rpartition("/")
    stem, ext = os.path.splitext(name)
    ascii_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-._")[:60]
    digest = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:10]
    ext = re.sub(r"[^A-Za-z0-9.]", "", ext).lower()
    return f"{folder}/{digest}{'-' + ascii_stem if ascii_stem else ''}{ext}"


def public_url(key: str) -> str:
    return f"{media_base_url()}/{quote(key)}"


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------
_lock = threading.Lock()


def manifest_path() -> Path:
    return images_dir() / "manifest.json"


def load_manifest() -> dict:
    p = manifest_path()
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {}


def save_manifest(m: dict) -> None:
    p = manifest_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(p)


class Rewriter:
    """Callable used by the loader: live uploads URL -> Storage URL (if migrated)."""

    def __init__(self) -> None:
        self.manifest = load_manifest()
        self.seen: set[str] = set()
        self.rewritten = 0
        self.pending = 0

    def __call__(self, url: str) -> str:
        if not is_upload(url):
            return url
        n = normalize(url)
        self.seen.add(n)
        entry = self.manifest.get(n)
        if entry and entry.get("status") == "uploaded":
            self.rewritten += 1
            return public_url(entry["key"])
        self.pending += 1
        return url

    def maybe(self, url: Optional[str]) -> Optional[str]:
        return self(url) if url else url


# ---------------------------------------------------------------------------
# Download + upload
# ---------------------------------------------------------------------------
_tls = threading.local()


def _session() -> requests.Session:
    s = getattr(_tls, "s", None)
    if s is None:
        s = requests.Session()
        s.headers["User-Agent"] = UA
        _tls.s = s
    return s


def _download(url: str, dest: Path) -> tuple[str, int]:
    if dest.exists() and dest.stat().st_size > 0:
        return "cached", dest.stat().st_size
    # Request the percent-encoded form of the decoded path.
    path = urlsplit(normalize(url)).path
    fetch_url = "https://bonimbayit.co.il" + quote(path)
    last = "error"
    for attempt in range(4):
        try:
            r = _session().get(fetch_url, timeout=60)
            if r.status_code == 404:
                return "404", 0
            if r.status_code in (429, 500, 502, 503, 504):
                last = f"http {r.status_code}"
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_name(dest.name + ".part")
            tmp.write_bytes(r.content)
            tmp.replace(dest)
            time.sleep(0.2)
            return "downloaded", len(r.content)
        except requests.RequestException as e:
            last = f"{type(e).__name__}: {e}"[:200]
            time.sleep(2 ** attempt)
    return f"error: {last}", 0


def _upload(key: str, src: Path) -> str:
    env = supabase_env()
    ext = os.path.splitext(key)[1].lower()
    ctype = mimetypes.guess_type(key)[0] or MIME_FALLBACK.get(ext, "application/octet-stream")
    url = f"{env['API_URL'].rstrip('/')}/storage/v1/object/media/{quote(key)}"
    headers = {
        "Authorization": f"Bearer {env['SERVICE_ROLE_KEY']}",
        "apikey": env["SERVICE_ROLE_KEY"],
        "x-upsert": "true",
        "Content-Type": ctype,
        "Cache-Control": "max-age=31536000",
    }
    for attempt in range(3):
        try:
            r = requests.post(url, data=src.read_bytes(), headers=headers, timeout=120)
            if r.ok:
                return "uploaded"
            last = f"upload http {r.status_code}: {r.text[:150]}"
        except requests.RequestException as e:
            last = f"upload {type(e).__name__}"
        time.sleep(1 + attempt)
    return f"error: {last}"


def migrate_images(urls: Iterable[str], concurrency: int = 3, limit: Optional[int] = None,
                   retry_errors: bool = True, log_every: int = 50) -> dict:
    """Download + upload each URL not yet uploaded. Returns counters."""
    manifest = load_manifest()
    todo: list[str] = []
    seen: set[str] = set()
    for u in urls:
        if not is_upload(u):
            continue
        n = normalize(u)
        if n in seen:
            continue
        seen.add(n)
        e = manifest.get(n)
        if e and (e["status"] in ("uploaded", "404") or (e["status"].startswith("error") and not retry_errors)):
            continue
        todo.append(n)
    if limit is not None:
        todo = todo[:limit]
    stats = {"requested": len(seen), "todo": len(todo), "uploaded": 0, "404": 0, "error": 0}
    if not todo:
        return stats
    concurrency = min(concurrency, 3)  # politeness cap for the live site
    started = time.time()

    def work(n: str) -> tuple[str, dict]:
        key = storage_key(n)
        dest = images_dir() / key
        status, size = _download(n, dest)
        if status in ("downloaded", "cached"):
            status = _upload(key, dest)
            size = dest.stat().st_size
        return n, {"key": key, "status": status, "bytes": size}

    done = 0
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futs = [ex.submit(work, n) for n in todo]
        for f in as_completed(futs):
            n, entry = f.result()
            with _lock:
                manifest[n] = entry
                done += 1
                k = "uploaded" if entry["status"] == "uploaded" else "404" if entry["status"] == "404" else "error"
                stats[k] += 1
                if done % log_every == 0 or done == len(todo):
                    save_manifest(manifest)
                    rate = done / max(time.time() - started, 0.001)
                    print(f"  images {done}/{len(todo)}  up={stats['uploaded']} 404={stats['404']} "
                          f"err={stats['error']}  {rate:.1f}/s", flush=True)
    save_manifest(manifest)
    stats["seconds"] = round(time.time() - started, 1)
    return stats
