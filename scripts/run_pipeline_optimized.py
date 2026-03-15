#!/usr/bin/env python3
"""
Optimized pipeline orchestrator for the Bonimbait data pipeline.

Key optimizations over the original run_pipeline.py:
  - Tracks budget at every step; stops if budget would be exceeded
  - Defaults to 200 most-recent videos
  - Uses Claude Haiku instead of Sonnet (20x cheaper)
  - Prioritises free YouTube captions; Whisper only as last resort
  - Reorders steps: all free work first, paid work last
  - Prints cost report after each step

Steps (in optimized order):
  1.  fetch        — Fetch latest N video metadata (FREE)
  2.  subs         — Download Hebrew subtitles (FREE)
  3.  convert      — Convert subtitles to transcript format (FREE)
  4.  audio        — Download audio ONLY for videos without any subs (FREE)
  5.  transcribe   — Whisper ONLY for videos without subs (CHEAP)
  6.  segment      — Segment all transcripts (FREE)
  7.  summarize    — Summarize with Claude Haiku (CHEAP)
  8.  validate     — Validate summaries (FREE)
  9.  embed        — Generate embeddings (CHEAP)
  10. load         — Load into PostgreSQL (FREE)
  11. index        — Build search indexes (FREE)
  12. validate_db  — Validate database (FREE)

Usage:
  python scripts/run_pipeline_optimized.py --limit 200 --budget 50
  python scripts/run_pipeline_optimized.py --step fetch --limit 200
  python scripts/run_pipeline_optimized.py --dry-run
  python scripts/run_pipeline_optimized.py --cost-report
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

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
STATE_FILE = DATA_DIR / "pipeline_optimized_state.json"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pipeline_optimized")

# ---------------------------------------------------------------------------
# Step order (optimized: free steps first)
# ---------------------------------------------------------------------------
STEP_ORDER = [
    "fetch", "subs", "convert", "audio", "transcribe",
    "segment", "summarize", "validate", "embed",
    "load", "index", "validate_db",
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
    """Gather current pipeline statistics from data directories."""
    metadata_dir = DATA_DIR / "raw" / "metadata"
    subs_dir = DATA_DIR / "raw" / "subtitles"
    audio_dir = DATA_DIR / "raw" / "audio"
    transcript_dir = DATA_DIR / "processed" / "transcripts"
    segment_dir = DATA_DIR / "processed" / "segments"
    summary_dir = DATA_DIR / "processed" / "summaries"
    embedding_dir = DATA_DIR / "processed" / "embeddings"

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
# Step implementations
# ---------------------------------------------------------------------------

def _run_fetch(limit: int = 200, **_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 1: Fetch latest %d videos metadata (FREE)", limit)
    logger.info("=" * 60)
    from scripts.extract.fetch_channel import fetch_channel
    from scripts.config import get_config

    cfg = get_config()
    channel_url = cfg["channel_url"]

    # Allow env var override
    env_url = os.getenv("YOUTUBE_CHANNEL_URL")
    if env_url:
        channel_url = env_url
    else:
        channel_id = os.getenv("YOUTUBE_CHANNEL_ID")
        if channel_id:
            channel_url = f"https://www.youtube.com/channel/{channel_id}/videos"

    fetch_channel(channel_url, limit=limit, sort="newest")


def _run_subs(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 2: Download Hebrew subtitles (FREE)")
    logger.info("=" * 60)
    from scripts.extract.download_subs import download_subs

    download_subs()


def _run_convert(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 3: Convert subtitles to transcript format (FREE)")
    logger.info("=" * 60)
    from scripts.transcribe.convert_subs import convert_all_subs

    convert_all_subs()


def _run_audio(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 4: Download audio ONLY for videos without any subs (FREE)")
    logger.info("=" * 60)
    from scripts.extract.download_audio import download_audio

    download_audio()


def _run_transcribe(cost_tracker=None, **_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 5: Transcribe audio with Whisper (only no-subs videos)")
    logger.info("=" * 60)
    from scripts.transcribe.run import transcribe_batch

    transcribe_batch(batch_size=0, cost_tracker=cost_tracker)


def _run_segment(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 6: Segment transcripts (FREE)")
    logger.info("=" * 60)
    from scripts.transcribe.segment import segment_all

    segment_all()


def _run_summarize(model: str = "claude-haiku-4-5-20251001", cost_tracker=None, **_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 7: Summarize transcripts with %s", model)
    logger.info("=" * 60)
    from scripts.summarize.run import summarize_batch

    summarize_batch(
        batch_size=0,
        model=model,
        max_concurrent=10,
        cost_tracker=cost_tracker,
    )


def _run_validate(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 8: Validate summaries (FREE)")
    logger.info("=" * 60)
    from scripts.summarize.validate import validate_all

    validate_all()


def _run_embed(cost_tracker=None, **_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 9: Generate vector embeddings")
    logger.info("=" * 60)
    from scripts.embed.run import embed_batch

    embed_batch(batch_size=0, cost_tracker=cost_tracker)


def _run_load(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 10: Load data into PostgreSQL (FREE)")
    logger.info("=" * 60)
    from scripts.load.load_db import load_db

    load_db()


def _run_index(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 11: Build search indexes (FREE)")
    logger.info("=" * 60)
    from scripts.load.build_indexes import build_indexes

    build_indexes()


def _run_validate_db(**_kw) -> None:
    logger.info("=" * 60)
    logger.info("STEP 12: Validate database integrity (FREE)")
    logger.info("=" * 60)
    from scripts.load.validate_db import validate_db

    validate_db()


STEP_FUNCS = {
    "fetch": _run_fetch,
    "subs": _run_subs,
    "convert": _run_convert,
    "audio": _run_audio,
    "transcribe": _run_transcribe,
    "segment": _run_segment,
    "summarize": _run_summarize,
    "validate": _run_validate,
    "embed": _run_embed,
    "load": _run_load,
    "index": _run_index,
    "validate_db": _run_validate_db,
}


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

def run_pipeline(
    *,
    step: str | None = None,
    force: bool = False,
    limit: int = 200,
    budget: float = 50.0,
    model: str = "claude-haiku-4-5-20251001",
    dry_run: bool = False,
) -> None:
    """Execute the optimized pipeline with budget tracking."""
    from scripts.cost_tracker import CostTracker, BudgetExceededError

    # Initialize cost tracker
    tracker = CostTracker(max_budget=budget)
    tracker.load()

    if dry_run:
        logger.info("DRY RUN MODE — estimating costs only")
        from scripts.estimate_costs import estimate
        estimate(budget=budget, model=model)
        return

    state = _load_state()

    # Shared kwargs passed to every step function
    step_kwargs = {
        "limit": limit,
        "cost_tracker": tracker,
        "model": model,
    }

    if step:
        # Run a single step
        if step not in STEP_FUNCS:
            logger.error("Unknown step '%s'. Choose from: %s", step, ", ".join(STEP_ORDER))
            sys.exit(1)
        logger.info("Running single step: %s (budget: $%.2f, remaining: $%.2f)",
                     step, budget, tracker.get_remaining())
        start = time.monotonic()
        try:
            STEP_FUNCS[step](**step_kwargs)
        except BudgetExceededError as exc:
            logger.error("BUDGET EXCEEDED: %s", exc)
            tracker.save()
            print(tracker.report())
            sys.exit(1)
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
            steps_to_run = STEP_ORDER

        logger.info("Running optimized pipeline: %s", " -> ".join(steps_to_run))
        logger.info("Budget: $%.2f | Already spent: $%.2f | Remaining: $%.2f",
                     budget, tracker.get_total(), tracker.get_remaining())
        logger.info("Limit: %d videos | Model: %s", limit, model)

        pipeline_start = time.monotonic()

        for s in steps_to_run:
            start = time.monotonic()
            try:
                STEP_FUNCS[s](**step_kwargs)
            except BudgetExceededError as exc:
                logger.error("BUDGET EXCEEDED at step '%s': %s", s, exc)
                tracker.save()
                print(tracker.report())
                state["last_run"] = datetime.now(timezone.utc).isoformat()
                state["stats"] = _collect_stats()
                _save_state(state)
                sys.exit(1)
            except Exception:
                logger.exception("Step '%s' failed", s)
                tracker.save()
                state["last_run"] = datetime.now(timezone.utc).isoformat()
                state["stats"] = _collect_stats()
                _save_state(state)
                print(tracker.report())
                sys.exit(1)

            elapsed = time.monotonic() - start
            logger.info("Step '%s' completed in %.1f seconds", s, elapsed)

            if s not in state["steps_completed"]:
                state["steps_completed"].append(s)

            # Checkpoint after each step
            state["last_run"] = datetime.now(timezone.utc).isoformat()
            state["stats"] = _collect_stats()
            _save_state(state)
            tracker.save()

            # Print running cost
            logger.info("Running cost: $%.2f / $%.2f (remaining: $%.2f)",
                         tracker.get_total(), budget, tracker.get_remaining())

        total_elapsed = time.monotonic() - pipeline_start
        logger.info("Full pipeline completed in %.1f seconds", total_elapsed)

    # Final save
    tracker.save()
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    state["stats"] = _collect_stats()
    _save_state(state)

    # Print final reports
    print(tracker.report())

    logger.info("=" * 60)
    logger.info("PIPELINE SUMMARY")
    logger.info("=" * 60)
    for k, v in state["stats"].items():
        logger.info("  %-25s %s", k, v)


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    # Add project root to sys.path
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(
        description="Optimized Bonimbait data pipeline (budget-aware)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Steps (optimized order — free work first):\n"
            "  fetch        Fetch latest N video metadata (FREE)\n"
            "  subs         Download Hebrew subtitles (FREE)\n"
            "  convert      Convert subtitles to transcript format (FREE)\n"
            "  audio        Download audio for no-subs videos (FREE)\n"
            "  transcribe   Whisper transcription for no-subs videos (PAID)\n"
            "  segment      Segment all transcripts (FREE)\n"
            "  summarize    Summarize with Claude Haiku (PAID)\n"
            "  validate     Validate summaries (FREE)\n"
            "  embed        Generate embeddings (PAID)\n"
            "  load         Load into PostgreSQL (FREE)\n"
            "  index        Build search indexes (FREE)\n"
            "  validate_db  Validate database (FREE)\n"
            "\n"
            "Examples:\n"
            "  python scripts/run_pipeline_optimized.py --limit 200 --budget 50\n"
            "  python scripts/run_pipeline_optimized.py --step fetch --limit 200\n"
            "  python scripts/run_pipeline_optimized.py --dry-run\n"
            "  python scripts/run_pipeline_optimized.py --cost-report\n"
        ),
    )
    parser.add_argument(
        "--step", choices=STEP_ORDER,
        help="Run a single step instead of the full pipeline",
    )
    parser.add_argument(
        "--limit", type=int, default=200,
        help="Max videos to process (default: 200)",
    )
    parser.add_argument(
        "--budget", type=float, default=50.0,
        help="Max budget in USD (default: 50.0)",
    )
    parser.add_argument(
        "--model", type=str, default="claude-haiku-4-5-20251001",
        help="Claude model for summarization (default: claude-haiku-4-5-20251001)",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Ignore checkpoint — re-run all steps",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Estimate costs only, do not process",
    )
    parser.add_argument(
        "--cost-report", action="store_true",
        help="Show current cost report and exit",
    )
    args = parser.parse_args()

    if args.cost_report:
        from scripts.cost_tracker import CostTracker
        tracker = CostTracker(max_budget=args.budget)
        tracker.load()
        print(tracker.report())
        return

    run_pipeline(
        step=args.step,
        force=args.force,
        limit=args.limit,
        budget=args.budget,
        model=args.model,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
