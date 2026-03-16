"""
Generate timestamp-specific thumbnails for video segments.

For each video, generates thumbnail frames at regular intervals (default: every
120 seconds) using yt-dlp + ffmpeg. These can be uploaded to Supabase Storage
or served via the API so the frontend can show the frame closest to a search
result's matching_segment_time.

Usage:
    python scripts/extract/generate_thumbnails.py                  # Process all videos
    python scripts/extract/generate_thumbnails.py --video-id XYZ   # Process one video
    python scripts/extract/generate_thumbnails.py --interval 60    # Frame every 60s
    python scripts/extract/generate_thumbnails.py --limit 10       # Process only 10 videos
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
METADATA_FILE = DATA_DIR / "raw" / "metadata" / "channel_videos.json"
THUMBNAIL_STATUS_FILE = THUMBNAILS_DIR / "thumbnail_status.json"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DEFAULT_INTERVAL = 120  # seconds between frames
THUMB_WIDTH = 480       # pixels

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("generate_thumbnails")


def _ensure_dirs() -> None:
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)


def _load_status() -> dict[str, list[str]]:
    """Load status: {youtube_id: [list of generated timestamp filenames]}."""
    if THUMBNAIL_STATUS_FILE.exists():
        try:
            return json.loads(THUMBNAIL_STATUS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def _save_status(status: dict[str, list[str]]) -> None:
    THUMBNAIL_STATUS_FILE.write_text(
        json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _compute_timestamps(duration: int, interval: int) -> list[int]:
    """Generate timestamps at regular intervals throughout the video."""
    if duration <= 0:
        return []
    timestamps = list(range(0, duration, interval))
    # Always include a point near the end if the last interval doesn't cover it
    if timestamps and timestamps[-1] < duration - interval // 2:
        timestamps.append(min(duration - 5, duration))
    return timestamps


def extract_frame(
    youtube_id: str,
    timestamp_seconds: int,
    output_path: Path,
    width: int = THUMB_WIDTH,
) -> bool:
    """
    Download and extract a single frame from a YouTube video at the given
    timestamp. Returns True on success.
    """
    url = f"https://www.youtube.com/watch?v={youtube_id}"

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "video.mp4")

        # Download just a few seconds around the timestamp using yt-dlp
        start = max(0, timestamp_seconds - 1)
        end = timestamp_seconds + 3
        try:
            result = subprocess.run(
                [
                    "yt-dlp",
                    "--quiet",
                    "--no-warnings",
                    "-f", "bestvideo[height<=720][ext=mp4]/best[height<=720][ext=mp4]/best",
                    "--download-sections", f"*{start}-{end}",
                    "-o", video_path,
                    url,
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                logger.warning(
                    "yt-dlp failed for %s@%ds: %s",
                    youtube_id, timestamp_seconds, result.stderr[:200],
                )
                return False
        except subprocess.TimeoutExpired:
            logger.warning("yt-dlp timed out for %s@%ds", youtube_id, timestamp_seconds)
            return False
        except FileNotFoundError:
            logger.error("yt-dlp not found. Install with: brew install yt-dlp")
            return False

        # Find the downloaded file (yt-dlp may add suffixes)
        video_files = list(Path(tmpdir).glob("video*"))
        if not video_files:
            logger.warning("No video file downloaded for %s@%ds", youtube_id, timestamp_seconds)
            return False

        actual_video = video_files[0]

        # Extract frame using ffmpeg — seek 1s into the clip
        seek = min(1, end - start - 1)
        try:
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-ss", str(seek),
                    "-i", str(actual_video),
                    "-vframes", "1",
                    "-vf", f"scale={width}:-1",
                    "-q:v", "2",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode != 0:
                logger.warning(
                    "ffmpeg failed for %s@%ds: %s",
                    youtube_id, timestamp_seconds, result.stderr[:200],
                )
                return False
        except FileNotFoundError:
            logger.error("ffmpeg not found. Install with: brew install ffmpeg")
            return False

    return output_path.exists()


def process_video(
    youtube_id: str,
    duration: int,
    interval: int = DEFAULT_INTERVAL,
) -> list[str]:
    """
    Generate thumbnails for a single video at regular intervals.
    Returns list of generated filenames.
    """
    timestamps = _compute_timestamps(duration, interval)
    if not timestamps:
        return []

    generated: list[str] = []
    for ts in timestamps:
        filename = f"{youtube_id}_{ts}.jpg"
        output_path = THUMBNAILS_DIR / filename

        if output_path.exists():
            generated.append(filename)
            continue

        if extract_frame(youtube_id, ts, output_path):
            generated.append(filename)
        else:
            logger.warning("Failed: %s @ %ds", youtube_id, ts)

    return generated


def generate_all(
    *,
    resume: bool = True,
    video_id: str | None = None,
    interval: int = DEFAULT_INTERVAL,
    limit: int | None = None,
) -> None:
    """Generate thumbnails for all videos or a specific video."""
    _ensure_dirs()
    status = _load_status() if resume else {}

    # Load metadata
    if not METADATA_FILE.exists():
        logger.error("channel_videos.json not found. Run fetch_channel first.")
        sys.exit(1)

    videos = json.loads(METADATA_FILE.read_text(encoding="utf-8"))
    video_map = {v["youtube_id"]: v for v in videos}

    if video_id:
        meta = video_map.get(video_id)
        duration = meta["duration"] if meta else 600  # default 10min
        generated = process_video(video_id, duration, interval)
        status[video_id] = generated
        _save_status(status)
        logger.info("Generated %d thumbnails for %s", len(generated), video_id)
        return

    to_process = [v for v in videos if v["youtube_id"] not in status]
    if limit:
        to_process = to_process[:limit]

    logger.info(
        "Videos total: %d | Already processed: %d | To process: %d",
        len(videos), len(status), len(to_process),
    )

    total_generated = 0
    for video in tqdm(to_process, desc="Generating thumbnails", unit="video"):
        vid = video["youtube_id"]
        duration = video.get("duration", 0)
        try:
            generated = process_video(vid, duration, interval)
            status[vid] = generated
            total_generated += len(generated)
        except Exception as exc:
            logger.warning("Error processing %s: %s", vid, exc)
            status[vid] = []

        _save_status(status)

    logger.info("Done. Generated %d total thumbnails.", total_generated)


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(
        description="Generate timestamp-specific thumbnails for video segments"
    )
    parser.add_argument("--video-id", help="Process a specific video by YouTube ID")
    parser.add_argument("--no-resume", action="store_true", help="Re-process all videos")
    parser.add_argument(
        "--interval", type=int, default=DEFAULT_INTERVAL,
        help=f"Seconds between frames (default: {DEFAULT_INTERVAL})",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Max number of videos to process",
    )
    args = parser.parse_args()

    generate_all(
        resume=not args.no_resume,
        video_id=args.video_id,
        interval=args.interval,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
