"""
Transcribe audio files using OpenAI Whisper API (whisper-1).

Processes audio from data/raw/audio/ and saves structured transcripts
to data/processed/transcripts/.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
AUDIO_DIR = DATA_DIR / "raw" / "audio"
TRANSCRIPT_DIR = DATA_DIR / "processed" / "transcripts"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
WHISPER_MODEL = "whisper-1"
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0  # seconds
# OpenAI Whisper pricing: $0.006 per minute of audio
WHISPER_COST_PER_MINUTE = 0.006

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("transcribe")


def _ensure_dirs() -> None:
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)


def _get_audio_duration_seconds(audio_path: Path) -> float:
    """Estimate duration from file size (128 kbps MP3 ~ 16 KB/s)."""
    size_bytes = audio_path.stat().st_size
    return size_bytes / (128 * 1000 / 8)


def _estimate_cost(audio_files: list[Path]) -> float:
    """Return estimated USD cost for Whisper transcription."""
    total_minutes = sum(_get_audio_duration_seconds(f) / 60 for f in audio_files)
    return total_minutes * WHISPER_COST_PER_MINUTE


def _transcribe_single(client, audio_path: Path) -> dict | None:
    """Transcribe a single audio file with retries."""
    youtube_id = audio_path.stem

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with open(audio_path, "rb") as f:
                response = client.audio.transcriptions.create(
                    model=WHISPER_MODEL,
                    file=f,
                    language="he",
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )

            # response is a Transcription object with segments
            segments = []
            for seg in getattr(response, "segments", []):
                segments.append(
                    {
                        "start": seg.get("start", seg.start) if hasattr(seg, "start") else seg["start"],
                        "end": seg.get("end", seg.end) if hasattr(seg, "end") else seg["end"],
                        "text": seg.get("text", seg.text).strip() if hasattr(seg, "text") else seg["text"].strip(),
                    }
                )

            full_text = response.text if hasattr(response, "text") else " ".join(s["text"] for s in segments)

            return {
                "youtube_id": youtube_id,
                "source": "whisper",
                "language": "he",
                "segments": segments,
                "full_text": full_text,
            }

        except Exception as exc:
            wait = RETRY_BACKOFF_BASE ** attempt
            logger.warning(
                "Attempt %d/%d failed for %s: %s — retrying in %.0fs",
                attempt,
                MAX_RETRIES,
                youtube_id,
                exc,
                wait,
            )
            if attempt < MAX_RETRIES:
                time.sleep(wait)

    logger.error("All %d attempts failed for %s", MAX_RETRIES, youtube_id)
    return None


def transcribe_batch(*, batch_size: int = 10, resume: bool = True, dry_run: bool = False) -> int:
    """Transcribe audio files. Returns count of successful transcriptions."""
    from openai import OpenAI

    _ensure_dirs()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not set")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # Discover audio files
    audio_files = sorted(AUDIO_DIR.glob("*.mp3"))
    if not audio_files:
        logger.info("No audio files found in %s", AUDIO_DIR)
        return 0

    # Filter already-transcribed
    if resume:
        done = {p.stem for p in TRANSCRIPT_DIR.glob("*.json")}
        audio_files = [f for f in audio_files if f.stem not in done]

    if batch_size > 0:
        audio_files = audio_files[:batch_size]

    if not audio_files:
        logger.info("All audio files already transcribed")
        return 0

    # Cost estimate
    estimated_cost = _estimate_cost(audio_files)
    total_minutes = sum(_get_audio_duration_seconds(f) / 60 for f in audio_files)
    logger.info(
        "Will transcribe %d files (~%.0f minutes). Estimated cost: $%.2f",
        len(audio_files),
        total_minutes,
        estimated_cost,
    )

    if dry_run:
        logger.info("Dry run — exiting without transcribing")
        return 0

    success = 0
    for audio_path in tqdm(audio_files, desc="Transcribing", unit="file"):
        result = _transcribe_single(client, audio_path)
        if result is not None:
            out_path = TRANSCRIPT_DIR / f"{audio_path.stem}.json"
            out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            success += 1

    logger.info("Transcription complete. Success: %d / %d", success, len(audio_files))
    return success


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Transcribe audio with OpenAI Whisper API")
    parser.add_argument("--batch-size", type=int, default=10, help="Max files per run (0 = all)")
    parser.add_argument("--no-resume", action="store_true", help="Re-transcribe all files")
    parser.add_argument("--dry-run", action="store_true", help="Show cost estimate only")
    args = parser.parse_args()

    transcribe_batch(
        batch_size=args.batch_size,
        resume=not args.no_resume,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
