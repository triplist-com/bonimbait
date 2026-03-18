"""
Update videos.json thumbnail_url fields to point to Supabase Storage.

For each video, replaces the YouTube default thumbnail URL with the
Supabase-hosted pre-generated thumbnail (frame at t=0 of the video).
Videos without a generated thumbnail keep their YouTube URL.

Usage:
    python scripts/extract/update_video_thumbnails.py
    python scripts/extract/update_video_thumbnails.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("update_thumbnails")


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    import os
    supabase_url = os.getenv("SUPABASE_URL", "")

    parser = argparse.ArgumentParser(description="Update videos.json with Supabase thumbnail URLs")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    videos_json = PROJECT_ROOT / "apps" / "web" / "data" / "videos.json"
    thumbs_dir = PROJECT_ROOT / "data" / "thumbnails"
    upload_status_file = thumbs_dir / "upload_status.json"

    if not videos_json.exists():
        logger.error("videos.json not found at %s", videos_json)
        return

    data = json.loads(videos_json.read_text(encoding="utf-8"))
    logger.info("Loaded %d videos from videos.json", len(data["videos"]))

    # Load upload status to get confirmed Supabase URLs
    uploaded: dict[str, str] = {}
    if upload_status_file.exists():
        uploaded = json.loads(upload_status_file.read_text(encoding="utf-8"))
        logger.info("Upload status has %d entries", len(uploaded))

    updated = 0
    kept = 0

    for video in data["videos"]:
        yt_id = video["youtube_id"]
        # Use t=0 thumbnail as the default
        filename = f"{yt_id}_0.jpg"

        if filename in uploaded:
            new_url = uploaded[filename]
            if video["thumbnail_url"] != new_url:
                if args.dry_run:
                    logger.info("  Would update %s: %s -> %s", yt_id, video["thumbnail_url"][:50], new_url[:60])
                video["thumbnail_url"] = new_url
                updated += 1
            else:
                kept += 1
        else:
            # No uploaded thumbnail — construct URL if local file exists
            local_thumb = thumbs_dir / filename
            if local_thumb.exists() and supabase_url:
                new_url = f"{supabase_url}/storage/v1/object/public/thumbnails/{filename}"
                video["thumbnail_url"] = new_url
                updated += 1
            else:
                kept += 1

    logger.info("Updated: %d | Unchanged: %d", updated, kept)

    if not args.dry_run and updated > 0:
        videos_json.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("Saved updated videos.json")
    elif args.dry_run:
        logger.info("(dry run — no changes written)")


if __name__ == "__main__":
    main()
