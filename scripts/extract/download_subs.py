"""
Download Hebrew subtitles for all channel videos using yt-dlp.

Prefers manual Hebrew subs; falls back to auto-generated.
Tracks status in subtitle_status.json for downstream pipeline steps.
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
logger = logging.getLogger("download_subs")


def _ensure_dirs() -> None:
    SUBS_DIR.mkdir(parents=True, exist_ok=True)


def _load_video_list() -> list[dict]:
    if not COMBINED_FILE.exists():
        logger.error("channel_videos.json not found. Run fetch_channel first.")
        sys.exit(1)
    return json.loads(COMBINED_FILE.read_text(encoding="utf-8"))


def _load_status() -> dict[str, str]:
    if STATUS_FILE.exists():
        try:
            return json.loads(STATUS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def _save_status(status: dict[str, str]) -> None:
    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")


def _download_subs_for_video(youtube_id: str) -> tuple[str, dict | None]:
    """
    Attempt to download Hebrew subtitles for a single video.

    Returns (status_label, subtitle_data_or_none).
    status_label is one of: "manual_he", "auto_he", "none".
    """
    import yt_dlp

    url = f"https://www.youtube.com/watch?v={youtube_id}"

    # First pass: try manual Hebrew subs
    for sub_type, label in [
        ({"writesubtitles": True, "writeautomaticsub": False}, "manual_he"),
        ({"writesubtitles": False, "writeautomaticsub": True}, "auto_he"),
    ]:
        opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "subtitleslangs": ["he", "iw", "iw-orig"],
            "subtitlesformat": "json3",  # JSON with timestamps
            **sub_type,
        }

        # We use a temporary directory to capture the written file, then read it.
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            opts["outtmpl"] = os.path.join(tmpdir, "%(id)s.%(ext)s")
            opts["paths"] = {"subtitle": tmpdir}

            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info is None:
                        continue

                    # Check if requested subs are available
                    available_subs = info.get("subtitles", {}) if label == "manual_he" else info.get("automatic_captions", {})
                    if not any(lang in available_subs for lang in ("he", "iw", "iw-orig")):
                        continue

                    # Download subs
                    ydl.download([url])

                # Find the subtitle file yt-dlp wrote
                # yt-dlp may use he, iw, or iw-orig as the language code
                sub_files = []
                for lang_code in ("he", "iw", "iw-orig"):
                    sub_files.extend(Path(tmpdir).glob(f"{youtube_id}*.{lang_code}.*"))
                if not sub_files:
                    sub_files = list(Path(tmpdir).glob(f"*{youtube_id}*"))

                for sf in sub_files:
                    if sf.suffix in (".json", ".json3"):
                        raw = json.loads(sf.read_text(encoding="utf-8"))
                        return label, raw
                    elif sf.suffix in (".vtt", ".srt"):
                        # Store as text; convert_subs.py will parse later
                        raw_text = sf.read_text(encoding="utf-8")
                        return label, {"format": sf.suffix.lstrip("."), "content": raw_text}

            except Exception as exc:
                logger.debug("Failed %s for %s: %s", label, youtube_id, exc)
                continue

    return "none", None


def download_subs(*, resume: bool = True) -> dict[str, str]:
    """Download subtitles for all videos. Returns the status dict."""
    _ensure_dirs()
    videos = _load_video_list()
    status = _load_status() if resume else {}

    to_process = [v for v in videos if v["youtube_id"] not in status]
    logger.info(
        "Videos total: %d | Already processed: %d | To process: %d",
        len(videos),
        len(status),
        len(to_process),
    )

    for video in tqdm(to_process, desc="Downloading subtitles", unit="video"):
        vid = video["youtube_id"]
        try:
            label, data = _download_subs_for_video(vid)
        except Exception as exc:
            logger.warning("Error processing %s: %s", vid, exc)
            label, data = "none", None

        status[vid] = label
        if data is not None:
            out_path = SUBS_DIR / f"{vid}.json"
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

        # Checkpoint after every video
        _save_status(status)

    # Final stats
    counts = {"manual_he": 0, "auto_he": 0, "none": 0}
    for v in status.values():
        counts[v] = counts.get(v, 0) + 1

    total = sum(counts.values())
    has_subs = counts["manual_he"] + counts["auto_he"]
    pct = (has_subs / total * 100) if total > 0 else 0

    logger.info(
        "Subtitle download complete. Manual: %d | Auto: %d | None: %d | "
        "Coverage: %d/%d (%.0f%%)",
        counts["manual_he"],
        counts["auto_he"],
        counts["none"],
        has_subs,
        total,
        pct,
    )
    if counts["none"] > 0:
        logger.info(
            "Videos without subs will need Whisper transcription "
            "(est. cost: ~$%.2f assuming 30 min avg)",
            counts["none"] * 30 * 0.006,
        )
    return status


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Download Hebrew subtitles for channel videos")
    parser.add_argument("--no-resume", action="store_true", help="Re-process all videos")
    parser.parse_args()

    args = parser.parse_args()
    download_subs(resume=not args.no_resume)


if __name__ == "__main__":
    main()
