"""
Download audio (MP3 128 kbps) for videos that lack Hebrew subtitles.

Reads subtitle_status.json to decide which videos need audio for Whisper.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
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
SUBS_DIR = DATA_DIR / "raw" / "subtitles"
AUDIO_DIR = DATA_DIR / "raw" / "audio"
COMBINED_FILE = METADATA_DIR / "channel_videos.json"
STATUS_FILE = SUBS_DIR / "subtitle_status.json"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("download_audio")


def _ensure_dirs() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def _load_status() -> dict[str, str]:
    if not STATUS_FILE.exists():
        logger.error("subtitle_status.json not found. Run download_subs first.")
        sys.exit(1)
    return json.loads(STATUS_FILE.read_text(encoding="utf-8"))


def _load_video_list() -> dict[str, dict]:
    if not COMBINED_FILE.exists():
        logger.error("channel_videos.json not found. Run fetch_channel first.")
        sys.exit(1)
    videos = json.loads(COMBINED_FILE.read_text(encoding="utf-8"))
    return {v["youtube_id"]: v for v in videos}


def _needs_audio(vid: str, status: str, *, include_auto: bool = False) -> bool:
    """Return True if this video needs Whisper transcription."""
    if status == "none":
        return True
    if include_auto and status == "auto_he":
        return True
    return False


def download_audio(
    *,
    batch_size: int = 0,
    include_auto: bool = False,
    resume: bool = True,
) -> int:
    """Download audio for videos needing transcription. Returns count downloaded."""
    import yt_dlp

    _ensure_dirs()
    status = _load_status()
    videos = _load_video_list()

    candidates = [
        vid
        for vid, st in status.items()
        if _needs_audio(vid, st, include_auto=include_auto)
    ]

    # Skip videos whose audio file already exists (resume support)
    if resume:
        already = {p.stem for p in AUDIO_DIR.glob("*.mp3")}
        candidates = [vid for vid in candidates if vid not in already]

    if batch_size > 0:
        candidates = candidates[:batch_size]

    # Estimate total duration for logging
    total_duration_s = sum(
        videos.get(vid, {}).get("duration", 0) or 0 for vid in candidates
    )
    total_hours = total_duration_s / 3600
    logger.info(
        "Downloading audio for %d videos (~%.1f hours of content)", len(candidates), total_hours
    )

    downloaded = 0
    for vid in tqdm(candidates, desc="Downloading audio", unit="video"):
        url = f"https://www.youtube.com/watch?v={vid}"
        out_path = AUDIO_DIR / f"{vid}.mp3"

        ydl_opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestaudio/best",
            "outtmpl": str(out_path.with_suffix(".%(ext)s")),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "128",
                }
            ],
            "ignoreerrors": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            if out_path.exists():
                downloaded += 1
            else:
                logger.warning("Audio file not created for %s", vid)
        except Exception as exc:
            logger.warning("Failed to download audio for %s: %s", vid, exc)

    logger.info("Audio download complete. Downloaded: %d / %d", downloaded, len(candidates))
    return downloaded


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Download audio for videos needing transcription")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=0,
        help="Max videos to download (0 = all)",
    )
    parser.add_argument(
        "--include-auto",
        action="store_true",
        help="Also download audio for videos with auto-generated Hebrew subs",
    )
    parser.add_argument("--no-resume", action="store_true", help="Re-download all audio")
    args = parser.parse_args()

    download_audio(
        batch_size=args.batch_size,
        include_auto=args.include_auto,
        resume=not args.no_resume,
    )


if __name__ == "__main__":
    main()
