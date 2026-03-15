"""
Fetch all video metadata from a YouTube channel using yt-dlp.

Saves per-video JSON files and a combined channel_videos.json.
Supports checkpointing: re-runs skip already-fetched videos.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
METADATA_DIR = DATA_DIR / "raw" / "metadata"
COMBINED_FILE = METADATA_DIR / "channel_videos.json"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fetch_channel")


def _ensure_dirs() -> None:
    METADATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_existing_ids() -> set[str]:
    """Return youtube_ids already present in the combined file."""
    if not COMBINED_FILE.exists():
        return set()
    try:
        data = json.loads(COMBINED_FILE.read_text(encoding="utf-8"))
        return {v["youtube_id"] for v in data if "youtube_id" in v}
    except (json.JSONDecodeError, KeyError):
        return set()


def _extract_video_info(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Normalise a yt-dlp info_dict entry into our schema."""
    vid = entry.get("id")
    if not vid:
        return None
    return {
        "youtube_id": vid,
        "title": entry.get("title", ""),
        "description": entry.get("description", ""),
        "duration": entry.get("duration"),  # seconds
        "thumbnail_url": entry.get("thumbnail") or entry.get("thumbnails", [{}])[-1].get("url", ""),
        "upload_date": entry.get("upload_date", ""),  # YYYYMMDD
        "view_count": entry.get("view_count"),
        "url": f"https://www.youtube.com/watch?v={vid}",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_channel(
    channel_url: str,
    *,
    skip_existing: bool = True,
    limit: int = 0,
    sort: str = "newest",
) -> list[dict]:
    """
    Fetch video list from *channel_url* and persist metadata.

    Args:
        limit: Max number of videos to fetch (0 = all).
        sort: Sort order — "newest" (default) or "oldest".
    """
    import yt_dlp  # imported here so the module can be imported without yt-dlp installed

    _ensure_dirs()

    existing_ids = _load_existing_ids() if skip_existing else set()
    if existing_ids:
        logger.info("Found %d already-fetched videos in checkpoint", len(existing_ids))

    # Load combined file to preserve existing entries when merging later
    all_videos: dict[str, dict] = {}
    if COMBINED_FILE.exists():
        try:
            for v in json.loads(COMBINED_FILE.read_text(encoding="utf-8")):
                all_videos[v["youtube_id"]] = v
        except (json.JSONDecodeError, KeyError):
            pass

    ydl_opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,  # only metadata, don't download
        "ignoreerrors": True,
        "skip_download": True,
    }

    # Use playlist_end to limit how many entries yt-dlp fetches
    if limit > 0:
        ydl_opts["playlistend"] = limit
        logger.info("Limiting to %d most recent videos", limit)

    logger.info("Extracting video list from %s …", channel_url)
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(channel_url, download=False)

    if info is None:
        logger.error("yt-dlp returned nothing for %s", channel_url)
        return list(all_videos.values())

    entries = info.get("entries") or []
    # entries can be nested (playlists inside channel) — flatten
    flat_entries: list[dict] = []
    for e in entries:
        if e is None:
            continue
        if "entries" in e:
            flat_entries.extend(x for x in e["entries"] if x is not None)
        else:
            flat_entries.append(e)

    logger.info("Channel returned %d entries", len(flat_entries))

    # Apply limit after flattening (safety net if playlistend didn't fully limit)
    if limit > 0 and len(flat_entries) > limit:
        flat_entries = flat_entries[:limit]
        logger.info("Trimmed to %d entries after flattening", limit)

    new_count = 0
    skipped = 0

    # Now fetch detailed metadata for each video we haven't seen yet
    detail_opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "skip_download": True,
    }

    for entry in tqdm(flat_entries, desc="Fetching metadata", unit="video"):
        vid = entry.get("id") or entry.get("url", "").split("=")[-1]
        if not vid:
            continue

        if vid in existing_ids:
            skipped += 1
            continue

        # For flat extraction we may only have partial info; fetch full
        try:
            with yt_dlp.YoutubeDL(detail_opts) as ydl2:
                detailed = ydl2.extract_info(
                    f"https://www.youtube.com/watch?v={vid}", download=False
                )
        except Exception:
            # Fallback to the flat entry
            detailed = entry

        if detailed is None:
            detailed = entry

        video_meta = _extract_video_info(detailed)
        if video_meta is None:
            continue

        # Save individual file
        per_file = METADATA_DIR / f"{vid}.json"
        per_file.write_text(json.dumps(video_meta, ensure_ascii=False, indent=2), encoding="utf-8")

        all_videos[vid] = video_meta
        new_count += 1

    # Write combined file — always sorted newest first
    reverse = sort != "oldest"
    combined = sorted(all_videos.values(), key=lambda v: v.get("upload_date", ""), reverse=reverse)

    # Apply limit to the final combined list (keep only the N most recent)
    if limit > 0 and len(combined) > limit:
        combined = combined[:limit]

    COMBINED_FILE.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info(
        "Done. Total videos: %d | New: %d | Skipped (existing): %d",
        len(combined),
        new_count,
        skipped,
    )
    return combined


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Fetch YouTube channel video metadata")
    parser.add_argument(
        "channel_url",
        nargs="?",
        default=os.getenv("YOUTUBE_CHANNEL_URL"),
        help="Channel URL or ID (default: YOUTUBE_CHANNEL_URL env var)",
    )
    parser.add_argument(
        "--no-skip", action="store_true", help="Re-fetch all videos ignoring checkpoint"
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Max number of videos to fetch (0 = all, default: 0)",
    )
    parser.add_argument(
        "--sort", choices=["newest", "oldest"], default="newest",
        help="Sort order (default: newest)",
    )
    args = parser.parse_args()

    if not args.channel_url:
        # Try building from YOUTUBE_CHANNEL_ID
        channel_id = os.getenv("YOUTUBE_CHANNEL_ID")
        if channel_id:
            args.channel_url = f"https://www.youtube.com/channel/{channel_id}/videos"
        else:
            logger.error(
                "No channel URL provided. Set YOUTUBE_CHANNEL_URL or YOUTUBE_CHANNEL_ID in .env"
            )
            sys.exit(1)

    fetch_channel(
        args.channel_url,
        skip_existing=not args.no_skip,
        limit=args.limit,
        sort=args.sort,
    )


if __name__ == "__main__":
    main()
