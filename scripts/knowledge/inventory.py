"""Build data/raw/channel_inventory.json: one record per channel video.

Inputs (all local, no network):
  data/raw/channel_listings/{videos,shorts,streams,podcasts,playlists}.json
  data/raw/channel_listings/playlists/<playlist id>.json
      flat-playlist dumps (`yt-dlp --flat-playlist -J --extractor-args youtube:lang=iw`)
  data/raw/metadata/<id>.json      per-video metadata (exact upload dates)
  data/raw/captions_status.json    caption fetch status (scripts/knowledge/fetch_captions.py)
  apps/web/data/search-index.json  what the AI index holds today

Flat listings carry no upload dates. Exact dates come from per-video metadata;
the rest are interpolated from the newest-first tab order (`upload_date_exact: false`).

Refresh the listings (polite, sequential, Hebrew titles):
  yt-dlp --flat-playlist -J --sleep-requests 1.5 --extractor-args "youtube:lang=iw" \
      https://www.youtube.com/@TomerChenRihana/videos > data/raw/channel_listings/videos.json
  (same for /shorts, /streams, /podcasts, /playlists, and each playlist URL)

Usage:
  scripts/.venv/bin/python -m scripts.knowledge.inventory
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

from scripts.knowledge.paths import (
    CHANNEL_ID,
    MIN_INDEX_SECONDS,
    PODCAST_PLAYLIST_ID,
    WEB_DATA,
    captions_status_path,
    inventory_path,
    listings_dir,
    metadata_dir,
)

TAB_TYPES = (("videos", "video"), ("streams", "live"), ("shorts", "short"))


def _entries(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [e for e in (data.get("entries") or []) if e and e.get("id")]


def _iso(yyyymmdd: str | None) -> str | None:
    if not yyyymmdd or len(yyyymmdd) != 8 or not yyyymmdd.isdigit():
        return None
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}"


def interpolate_dates(ordered_ids: list[str], exact: dict[str, str]) -> dict[str, str]:
    """Approximate dates for ids without one, from a newest-first ordering.

    Each gap gets a linear interpolation between its dated neighbours (the
    newer neighbour's date at the start of the list, the older one at the end).
    """
    out: dict[str, str] = {}
    known = [(i, date.fromisoformat(exact[v])) for i, v in enumerate(ordered_ids) if v in exact]
    if not known:
        return out
    for i, vid in enumerate(ordered_ids):
        if vid in exact:
            continue
        newer = next(((j, d) for j, d in reversed(known) if j < i), None)
        older = next(((j, d) for j, d in known if j > i), None)
        if newer and older:
            span = older[0] - newer[0]
            frac = (i - newer[0]) / span
            ordinal = round(newer[1].toordinal() + (older[1].toordinal() - newer[1].toordinal()) * frac)
            out[vid] = date.fromordinal(ordinal).isoformat()
        else:
            out[vid] = (newer or older)[1].isoformat()  # type: ignore[index]
    return out


def classify(tabs: set[str], playlist_ids: set[str]) -> str:
    if PODCAST_PLAYLIST_ID in playlist_ids:
        return "podcast"
    if "streams" in tabs:
        return "live"
    if "shorts" in tabs:
        return "short"
    return "video"


def in_index_scope(kind: str, duration: float | None) -> bool:
    """Long-form only: shorts and anything under 90 seconds stay out of the AI index."""
    if duration is None:
        return kind != "short"
    return duration >= MIN_INDEX_SECONDS


# The owner's own markers on a replaced upload: "(ישן ...)", a trailing "ישן",
# "לא לפרסום" (not for publication), "ניתן למחוק" (can be deleted).
OWNER_SKIP_MARKERS = re.compile(r"לא\s*לפרסום|ניתן\s*למחוק|למחיקה|\(\s*ישן|\sישן\s*$")


def title_key(title: str | None) -> str:
    """Comparable form of a title: its words only (punctuation and spacing ignored)."""
    return " ".join(re.sub(r"[^\w]+", " ", title or "").split())


def superseded_copies(rows: list[dict]) -> dict[str, str]:
    """Unlisted uploads that a public video replaces: {id: reason}.

    An upload missing from every channel tab (reachable only through a playlist)
    stays out of the index and the catalog when its title carries the owner's
    "old / not for publication / can be deleted" marker, or when a public video
    has the same title (a re-upload that left the first copy unlisted).
    """
    public = {title_key(r["title"]): r["id"] for r in rows if r["tabs"] and r.get("title")}
    out: dict[str, str] = {}
    for r in rows:
        if r["tabs"] or not r.get("title"):
            continue
        if OWNER_SKIP_MARKERS.search(r["title"]):
            out[r["id"]] = "marked old / not for publication"
        elif twin := public.get(title_key(r["title"])):
            out[r["id"]] = f"unlisted copy of {twin}"
    return out


def exclusion_reason(kind: str, duration: int | None, caption_status: str | None, superseded: str | None) -> str | None:
    """Why a video stays out of the AI index and the catalog (None: it is in scope)."""
    if not in_index_scope(kind, duration):
        return "short" if kind == "short" else f"under {MIN_INDEX_SECONDS} seconds"
    if caption_status == "unavailable":
        return "unavailable (private or removed)"
    return superseded


def out_of_scope_ids() -> set[str]:
    """Inventory ids kept out of the AI index and the catalog (see exclusion_reason)."""
    p = inventory_path()
    if not p.exists():
        return set()
    return {r["id"] for r in json.loads(p.read_text(encoding="utf-8"))["videos"] if not r.get("index_scope")}


def build() -> dict:
    L = listings_dir()
    records: dict[str, dict] = {}
    tab_order: dict[str, list[str]] = {}
    for tab, _kind in TAB_TYPES:
        ids = []
        for e in _entries(L / f"{tab}.json"):
            rec = records.setdefault(e["id"], {"id": e["id"], "title": e.get("title"), "duration": e.get("duration"), "tabs": set(), "playlists": {}})
            rec["tabs"].add(tab)
            if rec.get("duration") is None and e.get("duration") is not None:
                rec["duration"] = e["duration"]
            ids.append(e["id"])
        tab_order[tab] = ids

    playlist_titles = {e["id"]: e.get("title") for e in _entries(L / "playlists.json")}
    for e in _entries(L / "podcasts.json"):
        playlist_titles.setdefault(e["id"], e.get("title"))
    for pl_id, pl_title in playlist_titles.items():
        for e in _entries(L / "playlists" / f"{pl_id}.json"):
            rec = records.setdefault(e["id"], {"id": e["id"], "title": e.get("title"), "duration": e.get("duration"), "tabs": set(), "playlists": {}})
            rec["playlists"][pl_id] = pl_title
            if rec.get("duration") is None and e.get("duration") is not None:
                rec["duration"] = e["duration"]

    # Exact metadata (upload date, duration, title) from per-video files.
    exact: dict[str, str] = {}
    meta_dir = metadata_dir()
    for vid, rec in records.items():
        p = meta_dir / f"{vid}.json"
        if not p.exists():
            continue
        m = json.loads(p.read_text(encoding="utf-8"))
        d = _iso(m.get("upload_date"))
        if d:
            exact[vid] = d
        if m.get("duration"):
            rec["duration"] = m["duration"]
        if m.get("title"):
            rec["title"] = m["title"]

    approx: dict[str, str] = {}
    for tab, _ in TAB_TYPES:
        for vid, d in interpolate_dates(tab_order.get(tab, []), exact).items():
            approx.setdefault(vid, d)

    status = json.loads(captions_status_path().read_text(encoding="utf-8")) if captions_status_path().exists() else {}
    index_path = WEB_DATA / "search-index.json"
    indexed = {r["youtube_id"] for r in json.loads(index_path.read_text(encoding="utf-8"))} if index_path.exists() else set()

    out: list[dict] = []
    for vid, rec in records.items():
        kind = classify(rec["tabs"], set(rec["playlists"]))
        duration = rec.get("duration")
        duration = int(round(float(duration))) if duration is not None else None
        out.append(
            {
                "id": vid,
                "title": rec.get("title"),
                "duration": duration,
                "upload_date": exact.get(vid) or approx.get(vid),
                "upload_date_exact": vid in exact,
                "type": kind,
                "tabs": sorted(rec["tabs"]),
                "playlists": sorted(t for t in rec["playlists"].values() if t),
                "index_scope": in_index_scope(kind, duration),
                "caption_status": (status.get(vid) or {}).get("status"),
                "indexed": vid in indexed,
            }
        )
    out.sort(key=lambda r: (r["upload_date"] or "", r["id"]), reverse=True)
    replaced = superseded_copies(out)
    for r in out:
        r["excluded"] = exclusion_reason(r["type"], r["duration"], r["caption_status"], replaced.get(r["id"]))
        r["index_scope"] = r["excluded"] is None

    def hours(rows: list[dict]) -> float:
        return round(sum(r["duration"] or 0 for r in rows) / 3600, 1)

    by_type = {k: [r for r in out if r["type"] == k] for k in ("video", "podcast", "live", "short")}
    scope = [r for r in out if r["index_scope"]]
    summary = {
        "total": len(out),
        "hours": hours(out),
        "by_type": {k: {"count": len(v), "hours": hours(v)} for k, v in by_type.items()},
        "index_scope": {"count": len(scope), "hours": hours(scope)},
        "excluded": dict(Counter(r["excluded"] for r in out if r["excluded"])),
        "indexed": {"count": sum(r["indexed"] for r in out), "hours": hours([r for r in out if r["indexed"]])},
        "caption_status": dict(Counter(r["caption_status"] or "not_fetched" for r in scope)),
        "playlists": len(playlist_titles),
        "exact_dates": sum(r["upload_date_exact"] for r in out),
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "channel_id": CHANNEL_ID,
        "summary": summary,
        "videos": out,
    }


def main() -> int:
    inv = build()
    inventory_path().write_text(json.dumps(inv, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(inv["summary"], ensure_ascii=False, indent=2))
    print(f"Wrote {inventory_path()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
