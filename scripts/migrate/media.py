"""Migrate bonimbayit.co.il/wp-content/uploads images to Supabase Storage.

* Local cache: data/migration/raw/images/<storage key>
* Manifest:    data/migration/raw/images/manifest.json
      { "<normalized live url>": {"key": "uploads/2023/10/x.png",
                                  "status": "uploaded"|"replaced"|"404"|"gone"|"error: ...", ...} }
  "gone" = the live site redirects the file to its homepage (deleted upload).
  "replaced" = dead, but the media library has a re-upload of the same file
  (same name, ignoring -N / -WxH suffixes); "key" then points at that file.
* Any file type is migrated (images, pdf, doc(x), xls(x), zip, mp4, ...); the
  Storage content type comes from the extension.
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
import unicodedata
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


DEAD = ("404", "gone")  # not served by the live site (404, or a redirect to the homepage)

# Manifest entries from before per-target tracking were uploaded to the local stack.
LEGACY_TARGET = "127.0.0.1:54321"


def upload_target() -> str:
    """host:port of the Storage API uploads go to (local stack or the hosted project)."""
    return urlsplit(supabase_env().get("API_URL") or f"http://{LEGACY_TARGET}").netloc


def uploaded_to(entry: Optional[dict]) -> list[str]:
    if not entry or entry.get("status") != "uploaded":
        return []
    return entry.get("uploaded_to", [LEGACY_TARGET])


def _record(manifest: dict, n: str, entry: dict, target: str) -> None:
    """Store a work() result, accumulating the Storage targets the file is in."""
    if entry["status"] == "uploaded":
        entry["uploaded_to"] = sorted(set(uploaded_to(manifest.get(n))) | {target})
    manifest[n] = entry


class Rewriter:
    """Callable used by the loader: live uploads URL -> Storage URL.

    * uploaded / replaced -> Storage public URL
    * 404 / gone (dead on the live site too, no replacement) -> None: the caller
      drops the reference (sanitize_html removes the <img>, unwraps the <a>)
    * not migrated yet -> the live URL, unchanged (verify_load.py flags these)
    """

    def __init__(self) -> None:
        self.manifest = load_manifest()
        self.seen: set[str] = set()
        self.rewritten = 0
        self.pending = 0
        self.dropped = 0

    def __call__(self, url: str) -> Optional[str]:
        if not is_upload(url):
            return url
        n = normalize(url)
        self.seen.add(n)
        entry = self.manifest.get(n)
        status = (entry or {}).get("status")
        if status in ("uploaded", "replaced"):
            self.rewritten += 1
            return public_url(entry["key"])
        if status in DEAD:
            self.dropped += 1
            return None
        self.pending += 1
        return url

    def maybe(self, url: Optional[str]) -> Optional[str]:
        return self(url) if url else url

    def many(self, urls: Iterable[str]) -> list[str]:
        return [u for u in (self(x) for x in urls or []) if u]


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


def looks_like_html(path: Path) -> bool:
    """The live site answers missing uploads with a 301 to "/", i.e. the homepage HTML."""
    if not path.exists() or path.suffix.lower() in (".html", ".htm"):
        return False
    head = path.read_bytes()[:512].lstrip().lower()
    return head.startswith(b"<!doctype") or head.startswith(b"<html") or b"<html" in head[:200]


def _download(url: str, dest: Path) -> tuple[str, int]:
    if dest.exists() and dest.stat().st_size > 0 and not looks_like_html(dest):
        return "cached", dest.stat().st_size
    if dest.exists():
        dest.unlink()  # a cached homepage from an earlier redirect-following run
    # Request the percent-encoded form of the decoded path.
    path = urlsplit(normalize(url)).path
    fetch_url = "https://bonimbayit.co.il" + quote(path)
    last = "error"
    for attempt in range(4):
        try:
            # Never follow redirects: a moved/deleted upload 301s to the homepage.
            r = _session().get(fetch_url, timeout=60, allow_redirects=False)
            if r.status_code in (404, 410):
                return "404", 0
            if 300 <= r.status_code < 400:
                return "gone", 0
            if r.status_code in (429, 500, 502, 503, 504):
                last = f"http {r.status_code}"
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
            if ctype == "text/html" and dest.suffix.lower() not in (".html", ".htm"):
                return "gone", 0
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


def _delete(key: str) -> None:
    """Remove a Storage object (e.g. a homepage HTML uploaded under an image key)."""
    env = supabase_env()
    try:
        requests.delete(f"{env['API_URL'].rstrip('/')}/storage/v1/object/media/{quote(key)}",
                        headers={"Authorization": f"Bearer {env['SERVICE_ROLE_KEY']}",
                                 "apikey": env["SERVICE_ROLE_KEY"]}, timeout=60)
    except requests.RequestException:
        pass


# ---------------------------------------------------------------------------
# Replacements for dead uploads
# ---------------------------------------------------------------------------
_SIZE_RE = re.compile(r"-\d+x\d+$")
_DUP_RE = re.compile(r"-(?:\d{1,2}|scaled)$")


def _stem_key(url: str) -> tuple[str, str]:
    """('gant-bonimbayit', '.pdf') for .../2023/11/gant-bonimbayit-1.pdf (size/dup suffixes dropped)."""
    name = urlsplit(normalize(url)).path.rsplit("/", 1)[-1]
    stem, ext = os.path.splitext(name)
    stem = unicodedata.normalize("NFC", stem.lower())
    stem = _SIZE_RE.sub("", stem)
    while _DUP_RE.search(stem):
        stem = _DUP_RE.sub("", stem)
    return stem, ext.lower()


def _media_library_index() -> dict[tuple[str, str], list[dict]]:
    """WP media library (media.json) grouped by normalized stem + extension, newest first."""
    from paths import migration_dir
    p = migration_dir() / "media.json"
    idx: dict[tuple[str, str], list[dict]] = {}
    if not p.exists():
        return idx
    for m in json.loads(p.read_text(encoding="utf-8")):
        if m.get("url") and is_upload(m["url"]):
            idx.setdefault(_stem_key(m["url"]), []).append(m)
    for v in idx.values():
        v.sort(key=lambda m: m.get("date") or "", reverse=True)
    return idx


def find_replacement(dead_url: str, idx: dict) -> Optional[str]:
    """Newest media-library file with the same name (ignoring folder, -N and -WxH suffixes).
    Stems shorter than 6 chars are too generic to match safely."""
    stem, ext = _stem_key(dead_url)
    if len(stem) < 6:
        return None
    for m in idx.get((stem, ext), []):
        if normalize(m["url"]) != normalize(dead_url):
            return m["url"]
    return None


# ---------------------------------------------------------------------------
def migrate_images(urls: Iterable[str], concurrency: int = 3, limit: Optional[int] = None,
                   retry_errors: bool = True, log_every: int = 50) -> dict:
    """Download + upload each URL not yet migrated; resolve dead ones. Returns counters.

    Idempotent per Storage target: entries already uploaded to the current
    target (see upload_target) and dead entries are skipped, except that an
    "uploaded" entry whose cached file turns out to be HTML (the live site's
    redirect-to-homepage for a missing file) is re-checked and its bad Storage
    object deleted.
    """
    manifest = load_manifest()
    target = upload_target()
    todo: list[str] = []
    seen: list[str] = []
    for u in urls:
        if not is_upload(u):
            continue
        n = normalize(u)
        if n in seen:
            continue
        seen.append(n)
        e = manifest.get(n)
        if e and e["status"] == "uploaded" and looks_like_html(images_dir() / e["key"]):
            _delete(e["key"])
            todo.append(n)
            continue
        if e and e["status"] == "uploaded" and target not in uploaded_to(e):
            todo.append(n)  # cached locally, but not in this Storage yet
            continue
        if e and e["status"] == "replaced":
            r = e.get("replacement")
            if r and r not in seen and target not in uploaded_to(manifest.get(r)):
                seen.append(r)
                todo.append(r)
            continue
        if e and (e["status"] in ("uploaded", *DEAD)
                  or (e["status"].startswith("error") and not retry_errors)):
            continue
        todo.append(n)
    if limit is not None:
        todo = todo[:limit]
    stats = {"requested": len(seen), "todo": len(todo), "uploaded": 0, "dead": 0, "replaced": 0, "error": 0}

    def work(n: str) -> tuple[str, dict]:
        key = storage_key(n)
        dest = images_dir() / key
        status, size = _download(n, dest)
        if status in ("downloaded", "cached"):
            status = _upload(key, dest)
            size = dest.stat().st_size
        return n, {"key": key, "status": status, "bytes": size}

    started = time.time()
    done = 0
    if todo:
        with ThreadPoolExecutor(max_workers=min(concurrency, 3)) as ex:  # politeness cap
            futs = [ex.submit(work, n) for n in todo]
            for f in as_completed(futs):
                n, entry = f.result()
                with _lock:
                    _record(manifest, n, entry, target)
                    done += 1
                    s = entry["status"]
                    stats["uploaded" if s == "uploaded" else "dead" if s in DEAD else "error"] += 1
                    if done % log_every == 0 or done == len(todo):
                        save_manifest(manifest)
                        rate = done / max(time.time() - started, 0.001)
                        print(f"  images {done}/{len(todo)}  up={stats['uploaded']} dead={stats['dead']} "
                              f"err={stats['error']}  {rate:.1f}/s", flush=True)

    # Dead on the live site: substitute a re-upload of the same file, if the media library has one.
    dead = [n for n in seen if manifest.get(n, {}).get("status") in DEAD and "replacement" not in manifest[n]]
    if dead:
        idx = _media_library_index()
        for n in dead:
            cand = find_replacement(n, idx)
            if not cand:
                manifest[n]["replacement"] = None
                continue
            c = normalize(cand)
            if target not in uploaded_to(manifest.get(c)):
                c, entry = work(c)
                _record(manifest, c, entry, target)
            if manifest[c]["status"] == "uploaded":
                manifest[n] = {**manifest[n], "status": "replaced", "replacement": c, "key": manifest[c]["key"]}
                stats["replaced"] += 1
                stats["dead"] = max(0, stats["dead"] - 1)
                print(f"  replaced {n}\n        -> {c}", flush=True)
            else:
                manifest[n]["replacement"] = None
    save_manifest(manifest)
    stats["still_dead"] = sum(1 for n in seen if manifest.get(n, {}).get("status") in DEAD)
    stats["seconds"] = round(time.time() - started, 1)
    return stats
