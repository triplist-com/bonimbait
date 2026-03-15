#!/usr/bin/env python3
"""
Master pipeline orchestrator for the Bonimbait data pipeline.

Steps:
  1.  fetch        — Fetch channel video metadata
  2.  subs         — Download Hebrew subtitles
  3.  audio        — Download audio for videos without subs
  4.  convert      — Convert subtitles to transcript format
  5.  transcribe   — Transcribe audio with OpenAI Whisper
  6.  segment      — Segment all transcripts into chunks
  7.  summarize    — Summarize transcripts with Claude API
  8.  validate     — Validate summary quality
  9.  embed        — Generate vector embeddings with OpenAI
  10. load         — Bulk load data into PostgreSQL
  11. index        — Build search indexes (vector + FTS)
  12. validate_db  — Validate database integrity

Usage:
  python scripts/run_pipeline.py              # Run full pipeline (resume from last step)
  python scripts/run_pipeline.py --step subs  # Run a single step
  python scripts/run_pipeline.py --force      # Re-run from scratch
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
STATE_FILE = DATA_DIR / "pipeline_state.json"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pipeline")

# ---------------------------------------------------------------------------
# Step registry
# ---------------------------------------------------------------------------
STEP_ORDER = [
    "fetch", "subs", "audio", "convert", "transcribe", "segment",
    "summarize", "validate", "embed", "load", "index", "validate_db",
]


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"last_run": None, "steps_completed": [], "stats": {}}


def _save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _collect_stats() -> dict:
    """Gather current pipeline statistics from the data directories."""
    metadata_dir = DATA_DIR / "raw" / "metadata"
    subs_dir = DATA_DIR / "raw" / "subtitles"
    audio_dir = DATA_DIR / "raw" / "audio"
    transcript_dir = DATA_DIR / "processed" / "transcripts"
    segment_dir = DATA_DIR / "processed" / "segments"

    combined = metadata_dir / "channel_videos.json"
    total_videos = 0
    if combined.exists():
        try:
            total_videos = len(json.loads(combined.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, TypeError):
            pass

    status_file = subs_dir / "subtitle_status.json"
    videos_with_subs = 0
    videos_without_subs = 0
    if status_file.exists():
        try:
            status = json.loads(status_file.read_text(encoding="utf-8"))
            for v in status.values():
                if v in ("manual_he", "auto_he"):
                    videos_with_subs += 1
                else:
                    videos_without_subs += 1
        except (json.JSONDecodeError, TypeError):
            pass

    summary_dir = DATA_DIR / "processed" / "summaries"
    embedding_dir = DATA_DIR / "processed" / "embeddings"

    audio_count = len(list(audio_dir.glob("*.mp3"))) if audio_dir.exists() else 0
    transcript_count = len(list(transcript_dir.glob("*.json"))) if transcript_dir.exists() else 0
    segment_count = len(
        [p for p in segment_dir.glob("*.json") if p.name != "all_segments.json"]
    ) if segment_dir.exists() else 0
    summary_count = len(
        [p for p in summary_dir.glob("*.json") if p.name not in ("validation_report.json", "stats.json")]
    ) if summary_dir.exists() else 0
    embedding_count = len(list(embedding_dir.glob("*.json"))) if embedding_dir.exists() else 0

    return {
        "total_videos": total_videos,
        "videos_with_subs": videos_with_subs,
        "videos_without_subs": videos_without_subs,
        "audio_downloaded": audio_count,
        "videos_transcribed": transcript_count,
        "videos_segmented": segment_count,
        "videos_summarized": summary_count,
        "videos_embedded": embedding_count,
    }


# ---------------------------------------------------------------------------
# Step implementations — each imports and calls the relevant module
# ---------------------------------------------------------------------------

def _run_fetch() -> None:
    logger.info("=" * 60)
    logger.info("STEP 1: Fetch channel metadata")
    logger.info("=" * 60)
    from scripts.extract.fetch_channel import fetch_channel
    import os

    channel_url = os.getenv("YOUTUBE_CHANNEL_URL")
    if not channel_url:
        channel_id = os.getenv("YOUTUBE_CHANNEL_ID")
        if channel_id:
            channel_url = f"https://www.youtube.com/channel/{channel_id}/videos"
        else:
            logger.error("No channel URL/ID configured")
            sys.exit(1)

    fetch_channel(channel_url)


def _run_subs() -> None:
    logger.info("=" * 60)
    logger.info("STEP 2: Download Hebrew subtitles")
    logger.info("=" * 60)
    from scripts.extract.download_subs import download_subs

    download_subs()


def _run_audio() -> None:
    logger.info("=" * 60)
    logger.info("STEP 3: Download audio for videos without subs")
    logger.info("=" * 60)
    from scripts.extract.download_audio import download_audio

    download_audio()


def _run_convert() -> None:
    logger.info("=" * 60)
    logger.info("STEP 4: Convert subtitles to transcript format")
    logger.info("=" * 60)
    from scripts.transcribe.convert_subs import convert_all_subs

    convert_all_subs()


def _run_transcribe() -> None:
    logger.info("=" * 60)
    logger.info("STEP 5: Transcribe audio with Whisper")
    logger.info("=" * 60)
    from scripts.transcribe.run import transcribe_batch

    transcribe_batch(batch_size=0)


def _run_segment() -> None:
    logger.info("=" * 60)
    logger.info("STEP 6: Segment transcripts")
    logger.info("=" * 60)
    from scripts.transcribe.segment import segment_all

    segment_all()


def _run_summarize() -> None:
    logger.info("=" * 60)
    logger.info("STEP 7: Summarize transcripts with Claude")
    logger.info("=" * 60)
    from scripts.summarize.run import summarize_batch

    summarize_batch(batch_size=0)


def _run_validate() -> None:
    logger.info("=" * 60)
    logger.info("STEP 8: Validate summaries")
    logger.info("=" * 60)
    from scripts.summarize.validate import validate_all

    validate_all()


def _run_embed() -> None:
    logger.info("=" * 60)
    logger.info("STEP 9: Generate vector embeddings")
    logger.info("=" * 60)
    from scripts.embed.run import embed_batch

    embed_batch(batch_size=0)


def _run_load() -> None:
    logger.info("=" * 60)
    logger.info("STEP 10: Load data into PostgreSQL")
    logger.info("=" * 60)
    from scripts.load.load_db import load_db

    load_db()


def _run_index() -> None:
    logger.info("=" * 60)
    logger.info("STEP 11: Build search indexes")
    logger.info("=" * 60)
    from scripts.load.build_indexes import build_indexes

    build_indexes()


def _run_validate_db() -> None:
    logger.info("=" * 60)
    logger.info("STEP 12: Validate database integrity")
    logger.info("=" * 60)
    from scripts.load.validate_db import validate_db

    validate_db()


STEP_FUNCS = {
    "fetch": _run_fetch,
    "subs": _run_subs,
    "audio": _run_audio,
    "convert": _run_convert,
    "transcribe": _run_transcribe,
    "segment": _run_segment,
    "summarize": _run_summarize,
    "validate": _run_validate,
    "embed": _run_embed,
    "load": _run_load,
    "index": _run_index,
    "validate_db": _run_validate_db,
}


def run_pipeline(
    *,
    step: str | None = None,
    force: bool = False,
) -> None:
    """Execute the pipeline."""
    state = _load_state()

    if step:
        # Run a single step
        if step not in STEP_FUNCS:
            logger.error("Unknown step '%s'. Choose from: %s", step, ", ".join(STEP_ORDER))
            sys.exit(1)
        logger.info("Running single step: %s", step)
        start = time.monotonic()
        STEP_FUNCS[step]()
        elapsed = time.monotonic() - start
        logger.info("Step '%s' completed in %.1f seconds", step, elapsed)

        if step not in state["steps_completed"]:
            state["steps_completed"].append(step)
    else:
        # Run full pipeline
        completed = set(state["steps_completed"]) if not force else set()
        steps_to_run = [s for s in STEP_ORDER if s not in completed]

        if not steps_to_run:
            logger.info("All steps already completed. Use --force to re-run.")
            steps_to_run = STEP_ORDER  # re-run all (they handle their own resume)

        logger.info("Running pipeline steps: %s", " -> ".join(steps_to_run))
        pipeline_start = time.monotonic()

        for s in steps_to_run:
            start = time.monotonic()
            try:
                STEP_FUNCS[s]()
            except Exception:
                logger.exception("Step '%s' failed", s)
                state["last_run"] = datetime.now(timezone.utc).isoformat()
                state["stats"] = _collect_stats()
                _save_state(state)
                sys.exit(1)

            elapsed = time.monotonic() - start
            logger.info("Step '%s' completed in %.1f seconds", s, elapsed)

            if s not in state["steps_completed"]:
                state["steps_completed"].append(s)
            # Checkpoint state after each step
            state["last_run"] = datetime.now(timezone.utc).isoformat()
            state["stats"] = _collect_stats()
            _save_state(state)

        total_elapsed = time.monotonic() - pipeline_start
        logger.info("Full pipeline completed in %.1f seconds", total_elapsed)

    # Final state save
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    state["stats"] = _collect_stats()
    _save_state(state)

    # Print summary
    logger.info("=" * 60)
    logger.info("PIPELINE SUMMARY")
    logger.info("=" * 60)
    for k, v in state["stats"].items():
        logger.info("  %-25s %s", k, v)


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    # Add project root to sys.path so `from scripts.xxx import ...` works
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(
        description="Bonimbait data pipeline orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Steps (in order):\n"
            "  fetch        Fetch channel video metadata\n"
            "  subs         Download Hebrew subtitles\n"
            "  audio        Download audio for videos without subs\n"
            "  convert      Convert subtitles to transcript format\n"
            "  transcribe   Transcribe audio with Whisper\n"
            "  segment      Segment all transcripts into chunks\n"
            "  summarize    Summarize transcripts with Claude API\n"
            "  validate     Validate summary quality\n"
            "  embed        Generate vector embeddings with OpenAI\n"
            "  load         Bulk load data into PostgreSQL\n"
            "  index        Build search indexes (vector + FTS)\n"
            "  validate_db  Validate database integrity\n"
        ),
    )
    parser.add_argument(
        "--step",
        choices=STEP_ORDER,
        help="Run a single step instead of the full pipeline",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore checkpoint — re-run all steps",
    )
    args = parser.parse_args()

    run_pipeline(step=args.step, force=args.force)


if __name__ == "__main__":
    main()
