"""Fetch Hebrew captions and full metadata for channel videos, politely.

For every long-form video in data/raw/channel_inventory.json that is not in the
AI index yet, this is the API form of

    yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs iw,he \
           --sub-format json3 --js-runtimes node <url>

  1. one metadata extraction (no media is downloaded),
  2. the Hebrew track: manual subtitles first, then auto-generated (ASR),
     written to data/raw/subtitles/<id>.json (json3, same as the 2026-03 run),
  3. data/raw/metadata/<id>.json (the existing schema plus chapters and tags),
  4. a per-video status in data/raw/captions_status.json, saved after each video.

Statuses: manual_he | auto_he | none (no Hebrew track) | unavailable (private,
removed, members-only, age-gated) are final; blocked | error are retried on the
next run, so the script is resumable.

Pacing: a random 9-13 s pause between videos plus 1 s between requests, about
250 videos an hour, under YouTube's guest limit of ~300. A 429 or "confirm
you're not a bot" answer backs off exponentially (1, 2, 4 ... 30 minutes) and
retries the same video; after --max-blocks consecutive blocks the run stops so
it can be resumed later. Browser cookies are never used.

Needs a recent yt-dlp (2026.08+; older builds truncate playlists and miss
captions) with yt-dlp-ejs, plus node or deno for YouTube's JS challenges:
  python3 -m venv /tmp/ytvenv && /tmp/ytvenv/bin/pip install -U "yt-dlp[default]"
  /tmp/ytvenv/bin/python -m scripts.knowledge.fetch_captions [--limit N] [--ids a,b]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from scripts.knowledge.paths import (
    MIN_INDEX_SECONDS,
    captions_status_path,
    inventory_path,
    metadata_dir,
    raw_dir,
    subtitles_dir,
)

FINAL = {"manual_he", "auto_he", "none", "unavailable"}
MAX_ATTEMPTS = 3  # an "error" this many times in a row is not retried
HEBREW = ("iw", "he")  # YouTube still labels Hebrew "iw"
BLOCK_PATTERNS = re.compile(
    r"HTTP Error 429|Too Many Requests|confirm you.re not a bot|rate.limit|This content isn.t available, try again later",
    re.I,
)
UNAVAILABLE_PATTERNS = re.compile(
    r"Private video|Video unavailable|has been removed|members.only|Join this channel|"
    r"confirm your age|age.restricted|Premieres in|live event will begin|This video is not available|account associated",
    re.I,
)
POT_PATTERN = re.compile(r"PO token was not provided|require a PO Token", re.I)

log = logging.getLogger("fetch_captions")


class CaptureLogger:
    """yt-dlp logger that keeps warnings and errors for status classification."""

    def __init__(self) -> None:
        self.messages: list[str] = []

    def debug(self, msg: str) -> None:
        if POT_PATTERN.search(msg):
            self.messages.append(msg)

    def info(self, msg: str) -> None:
        pass

    def warning(self, msg: str) -> None:
        self.messages.append(msg)

    def error(self, msg: str) -> None:
        self.messages.append(msg)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_status() -> dict[str, dict]:
    p = captions_status_path()
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def save_status(status: dict[str, dict]) -> None:
    p = captions_status_path()
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(status, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    os.replace(tmp, p)


def pick_track(info: dict) -> tuple[str, str] | None:
    """(status, language key) of the best Hebrew track: manual first, then ASR.

    An auto track counts only when the speech recognition itself is Hebrew
    ("iw-orig"); a plain "iw" auto track can be a machine translation of
    another language's ASR.
    """
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    for key in HEBREW:
        if key in manual:
            return "manual_he", key
    for key in HEBREW:
        if f"{key}-orig" in auto:
            return "auto_he", key
    return None


def metadata_record(info: dict) -> dict:
    """The existing data/raw/metadata schema, plus fields the catalog needs."""
    vid = info["id"]
    return {
        "youtube_id": vid,
        "title": info.get("title"),
        "description": info.get("description") or "",
        "duration": info.get("duration"),
        "thumbnail_url": info.get("thumbnail") or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
        "upload_date": info.get("upload_date"),
        "view_count": info.get("view_count"),
        "url": f"https://www.youtube.com/watch?v={vid}",
        "fetched_at": now_iso(),
        "like_count": info.get("like_count"),
        "chapters": [
            {"start_time": c.get("start_time"), "end_time": c.get("end_time"), "title": c.get("title")}
            for c in (info.get("chapters") or [])
        ],
        "tags": info.get("tags") or [],
        "categories": info.get("categories") or [],
        "live_status": info.get("live_status"),
        "availability": info.get("availability"),
        "language": info.get("language"),
        "age_limit": info.get("age_limit"),
        "channel_id": info.get("channel_id"),
    }


def ydl_options(tmpdir: str, capture: CaptureLogger) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": False,
        "logger": capture,
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": list(HEBREW),
        "subtitlesformat": "json3",
        "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
        "noplaylist": True,
        "ignore_no_formats_error": True,
        "sleep_interval_requests": 1.0,
        "sleep_interval_subtitles": 1,
        "retries": 2,
        "extractor_retries": 2,
        "js_runtimes": {"node": {}},
        # Original-language (Hebrew) metadata; skip the HLS/DASH manifests (no media needed).
        "extractor_args": {"youtube": {"lang": ["iw"], "skip": ["hls", "dash"]}},
    }
    assert "cookiesfrombrowser" not in opts and "cookiefile" not in opts  # never browser cookies
    return opts


def fetch_one(vid: str) -> dict:
    """Fetch metadata + the best Hebrew track for one video. Returns a status entry."""
    import yt_dlp

    capture = CaptureLogger()
    url = f"https://www.youtube.com/watch?v={vid}"
    with tempfile.TemporaryDirectory(prefix="captions-") as tmpdir:
        try:
            with yt_dlp.YoutubeDL(ydl_options(tmpdir, capture)) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as exc:  # noqa: BLE001 - yt-dlp raises DownloadError subclasses
            msg = f"{exc} | {' | '.join(capture.messages[-3:])}"
            if BLOCK_PATTERNS.search(msg):
                return {"status": "blocked", "error": msg[:300]}
            if UNAVAILABLE_PATTERNS.search(msg):
                return {"status": "unavailable", "error": msg[:300]}
            return {"status": "error", "error": msg[:300]}
        if not info:
            return {"status": "error", "error": "no info"}

        meta = metadata_record(info)
        (metadata_dir() / f"{vid}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        entry: dict = {"duration": info.get("duration"), "title": info.get("title")}

        picked = pick_track(info)
        if picked is None:
            if any(POT_PATTERN.search(m) for m in capture.messages):
                return {**entry, "status": "blocked", "error": "subtitles need a PO token"}
            asr = sorted(k for k in (info.get("automatic_captions") or {}) if k.endswith("-orig"))
            return {**entry, "status": "none", **({"asr": asr} if asr else {})}
        label, key = picked
        files = sorted(Path(tmpdir).glob(f"{vid}.*.json3"))
        chosen = next((f for f in files if f.name == f"{vid}.{key}.json3"), None)
        if chosen is None:
            msg = " | ".join(capture.messages[-3:])
            status = "blocked" if BLOCK_PATTERNS.search(msg) else "error"
            return {**entry, "status": status, "error": f"track {key} listed but not written: {msg}"[:300]}
        raw = json.loads(chosen.read_text(encoding="utf-8"))
        if not raw.get("events"):
            return {**entry, "status": "error", "error": "empty json3"}
        dest = subtitles_dir() / f"{vid}.json"
        dest.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        return {**entry, "status": label, "track": chosen.name.split(".")[-2]}


COST_WORDS = ("עלות", "עלויות", "תקציב", "מחיר", "כמה עול", "משכנת", "לחסוך", "חיסכון", "כסף")


def priority(row: dict, legacy: set[str]) -> tuple[int, int]:
    """Fetch order (the product priorities, in case YouTube rate-limits the run):
    1. podcasts and cost/budget episodes from 2023 on; 2. other 2025-2026 videos;
    3. older series (old podcasts and cost episodes first, then videos on legacy
    /video/ pages); 4. shorts of unknown length.
    """
    year = (row.get("upload_date") or "")[:4]
    title = row.get("title") or ""
    valuable = row.get("type") == "podcast" or any(w in title for w in COST_WORDS)
    if row.get("type") == "short":
        return (4, 0)
    if valuable and year >= "2023":
        return (1, 0)
    if year >= "2025":
        return (2, 0)
    return (3, 0 if valuable else 1 if row["id"] in legacy else 2)


def build_queue(inventory: dict, status: dict[str, dict], ids: list[str] | None, include_indexed: bool) -> list[str]:
    """Videos still to fetch, in priority() order, newest first within a group."""
    rows = {r["id"]: r for r in inventory["videos"]}
    if ids:
        return [i for i in ids if i in rows]
    legacy = set()
    legacy_csv = raw_dir() / "legacy_video_pages.csv"
    if legacy_csv.exists():
        import csv

        with legacy_csv.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                legacy.update(x for x in row["youtube_ids"].strip("{}").split(",") if x)

    def wanted(r: dict) -> bool:
        st = status.get(r["id"]) or {}
        if st.get("status") in FINAL or (st.get("status") == "error" and int(st.get("attempts", 0)) >= MAX_ATTEMPTS):
            return False
        if r["indexed"] and not include_indexed:
            return False
        if r["duration"] is not None and r["duration"] < MIN_INDEX_SECONDS:
            return False
        return True

    todo = [r for r in rows.values() if wanted(r)]
    # Newest first inside each priority group (stable sorts).
    todo.sort(key=lambda r: r["upload_date"] or "", reverse=True)
    todo.sort(key=lambda r: priority(r, legacy))
    return [r["id"] for r in todo]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, default=0, help="stop after N videos (0 = all)")
    ap.add_argument("--ids", default="", help="comma-separated ids to fetch (ignores the queue rules)")
    ap.add_argument("--min-sleep", type=float, default=9.0)
    ap.add_argument("--max-sleep", type=float, default=13.0)
    ap.add_argument("--max-blocks", type=int, default=6, help="consecutive blocks before the run stops")
    ap.add_argument("--include-indexed", action="store_true", help="also refresh videos already in the index")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    subtitles_dir().mkdir(parents=True, exist_ok=True)
    metadata_dir().mkdir(parents=True, exist_ok=True)

    inventory = json.loads(inventory_path().read_text(encoding="utf-8"))
    status = load_status()
    queue = build_queue(inventory, status, [i for i in args.ids.split(",") if i], args.include_indexed)
    if args.limit:
        queue = queue[: args.limit]
    log.info("queue: %d videos (status file has %d entries)", len(queue), len(status))

    consecutive_blocks = 0
    done = 0
    pause_scale = 1.0
    i = 0
    while i < len(queue):
        vid = queue[i]
        prev = status.get(vid) or {}
        entry = fetch_one(vid)
        entry["attempts"] = int(prev.get("attempts", 0)) + 1
        entry["updated_at"] = now_iso()
        if entry["status"] == "blocked":
            consecutive_blocks += 1
            status[vid] = {**prev, **entry}
            save_status(status)
            if consecutive_blocks >= args.max_blocks:
                log.error("blocked %d times in a row; stopping (resume later)", consecutive_blocks)
                return 3
            wait = min(60 * 2 ** (consecutive_blocks - 1), 1800)
            pause_scale = min(pause_scale * 1.5, 4.0)
            log.warning("%s blocked (%s); backing off %ds, pause scale %.1f", vid, entry.get("error", "")[:120], wait, pause_scale)
            time.sleep(wait)
            continue  # retry the same video
        consecutive_blocks = 0
        if entry["status"] == "error":
            log.warning("%s error #%d (%s)", vid, entry["attempts"], entry.get("error", "")[:160])
        status[vid] = {k: v for k, v in {**prev, **entry}.items() if not (k == "error" and entry["status"] in FINAL - {"unavailable"})}
        save_status(status)
        done += 1
        counts: dict[str, int] = {}
        for s in status.values():
            counts[s["status"]] = counts.get(s["status"], 0) + 1
        log.info("[%d/%d] %s %s %s | totals %s", done, len(queue), vid, entry["status"], entry.get("track", ""), counts)
        i += 1
        if i < len(queue):
            time.sleep(random.uniform(args.min_sleep, args.max_sleep) * pause_scale)
    log.info("finished: %d videos", done)
    return 0


if __name__ == "__main__":
    sys.exit(main())
