#!/usr/bin/env python3
"""
Standalone cost estimator for the Bonimbait pipeline.

Reads current pipeline state and estimates remaining costs for each step.
Prints a formatted table and compares against the budget.

Usage:
    python scripts/estimate_costs.py
    python scripts/estimate_costs.py --budget 50
    python scripts/estimate_costs.py --model claude-haiku-4-5-20251001
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
METADATA_DIR = DATA_DIR / "raw" / "metadata"
SUBS_DIR = DATA_DIR / "raw" / "subtitles"
AUDIO_DIR = DATA_DIR / "raw" / "audio"
TRANSCRIPT_DIR = DATA_DIR / "processed" / "transcripts"
SEGMENT_DIR = DATA_DIR / "processed" / "segments"
SUMMARY_DIR = DATA_DIR / "processed" / "summaries"
EMBEDDING_DIR = DATA_DIR / "processed" / "embeddings"
COMBINED_FILE = METADATA_DIR / "channel_videos.json"
STATUS_FILE = SUBS_DIR / "subtitle_status.json"
COST_TRACKER_FILE = DATA_DIR / "cost_tracker.json"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("estimate_costs")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
WHISPER_COST_PER_MINUTE = 0.006
CHARS_PER_TOKEN = 3.5
EMBEDDING_COST_PER_MTOK = 0.02
AVG_VIDEO_DURATION_MINUTES = 30  # fallback assumption
EST_OUTPUT_TOKENS_PER_SUMMARY = 500


def _count_files(directory: Path, pattern: str = "*.json", exclude: set[str] | None = None) -> int:
    if not directory.exists():
        return 0
    exclude = exclude or set()
    return sum(1 for f in directory.glob(pattern) if f.name not in exclude)


def estimate(budget: float = 50.0, model: str = "claude-haiku-4-5-20251001") -> None:
    """Estimate remaining pipeline costs and print a report."""
    from scripts.config import get_summarize_pricing, PRICING

    input_cost_per_mtok, output_cost_per_mtok = get_summarize_pricing(model)

    # -----------------------------------------------------------------------
    # Step 1: Fetch metadata
    # -----------------------------------------------------------------------
    total_videos = 0
    if COMBINED_FILE.exists():
        try:
            total_videos = len(json.loads(COMBINED_FILE.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, TypeError):
            pass
    fetch_status = "Done" if total_videos > 0 else "Pending"
    fetch_note = f"{total_videos} videos fetched" if total_videos > 0 else "Not started"

    # -----------------------------------------------------------------------
    # Step 2: Download subtitles
    # -----------------------------------------------------------------------
    sub_manual = 0
    sub_auto = 0
    sub_none = 0
    if STATUS_FILE.exists():
        try:
            status = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
            for v in status.values():
                if v == "manual_he":
                    sub_manual += 1
                elif v == "auto_he":
                    sub_auto += 1
                else:
                    sub_none += 1
        except (json.JSONDecodeError, TypeError):
            pass
    sub_total = sub_manual + sub_auto + sub_none
    sub_has = sub_manual + sub_auto
    subs_status = "Done" if sub_total > 0 else "Pending"
    subs_note = f"{sub_has} manual/auto, {sub_none} none" if sub_total > 0 else "Not started"

    # -----------------------------------------------------------------------
    # Step 3: Whisper transcription (only for videos with no subs)
    # -----------------------------------------------------------------------
    audio_count = _count_files(AUDIO_DIR, "*.mp3")
    transcript_count = _count_files(TRANSCRIPT_DIR)
    # Videos needing whisper = those with "none" status minus already-transcribed audio
    whisper_done = set()
    if TRANSCRIPT_DIR.exists():
        for f in TRANSCRIPT_DIR.glob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                if data.get("source") == "whisper":
                    whisper_done.add(f.stem)
            except (json.JSONDecodeError, OSError):
                pass

    # Estimate how many whisper jobs remain
    videos_needing_whisper = sub_none
    whisper_already_done = len(whisper_done)
    whisper_remaining = max(0, videos_needing_whisper - whisper_already_done)

    # Estimate duration for remaining whisper jobs
    video_map = {}
    if COMBINED_FILE.exists():
        try:
            for v in json.loads(COMBINED_FILE.read_text(encoding="utf-8")):
                video_map[v["youtube_id"]] = v
        except (json.JSONDecodeError, TypeError):
            pass

    whisper_minutes = 0
    if STATUS_FILE.exists():
        try:
            status = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
            for vid, st in status.items():
                if st == "none" and vid not in whisper_done:
                    dur = video_map.get(vid, {}).get("duration", 0)
                    whisper_minutes += (dur or AVG_VIDEO_DURATION_MINUTES * 60) / 60
        except (json.JSONDecodeError, TypeError):
            pass

    if whisper_remaining == 0 and whisper_minutes == 0 and sub_none > 0:
        # Fallback estimate
        whisper_minutes = sub_none * AVG_VIDEO_DURATION_MINUTES

    whisper_cost = whisper_minutes * WHISPER_COST_PER_MINUTE
    whisper_status = "Done" if whisper_remaining == 0 and sub_total > 0 else "Pending"
    whisper_note = f"{whisper_remaining} videos x {whisper_minutes:.0f}min avg"

    # -----------------------------------------------------------------------
    # Step 4: Summarization
    # -----------------------------------------------------------------------
    summary_count = _count_files(SUMMARY_DIR, exclude={"validation_report.json", "stats.json"})
    summaries_remaining = max(0, transcript_count - summary_count)

    # Estimate tokens for remaining transcripts
    summarize_tokens = 0
    done_summaries = {p.stem for p in SUMMARY_DIR.glob("*.json") if p.name not in ("validation_report.json", "stats.json")} if SUMMARY_DIR.exists() else set()
    if TRANSCRIPT_DIR.exists():
        for f in TRANSCRIPT_DIR.glob("*.json"):
            if f.stem not in done_summaries:
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    text = data.get("full_text", "")
                    summarize_tokens += max(1, int(len(text) / CHARS_PER_TOKEN))
                except (json.JSONDecodeError, OSError):
                    summarize_tokens += 2000

    # Add system prompt overhead
    summarize_tokens += summaries_remaining * 500
    output_tokens = summaries_remaining * EST_OUTPUT_TOKENS_PER_SUMMARY
    summarize_cost = (
        (summarize_tokens / 1_000_000) * input_cost_per_mtok
        + (output_tokens / 1_000_000) * output_cost_per_mtok
    )
    summarize_status = "Done" if summaries_remaining == 0 and summary_count > 0 else "Pending"
    summarize_note = f"{summaries_remaining} videos with {model.split('-')[1] if '-' in model else model}"

    # -----------------------------------------------------------------------
    # Step 5: Embeddings
    # -----------------------------------------------------------------------
    embedding_count = _count_files(EMBEDDING_DIR)
    segment_video_count = _count_files(SEGMENT_DIR, exclude={"all_segments.json"})
    embeddings_remaining = max(0, segment_video_count - embedding_count)

    # Estimate embedding tokens
    embed_tokens = 0
    done_embeds = {p.stem for p in EMBEDDING_DIR.glob("*.json")} if EMBEDDING_DIR.exists() else set()
    if SEGMENT_DIR.exists():
        for f in SEGMENT_DIR.glob("*.json"):
            if f.name == "all_segments.json":
                continue
            if f.stem not in done_embeds:
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    for seg in data.get("segments", []):
                        text = seg.get("text", "")
                        embed_tokens += max(1, int(len(text) / CHARS_PER_TOKEN))
                except (json.JSONDecodeError, OSError):
                    embed_tokens += 1000

    embed_cost = (embed_tokens / 1_000_000) * EMBEDDING_COST_PER_MTOK
    embed_status = "Done" if embeddings_remaining == 0 and embedding_count > 0 else "Pending"

    # Count total segments for note
    total_segments = 0
    if SEGMENT_DIR.exists():
        all_seg_file = SEGMENT_DIR / "all_segments.json"
        if all_seg_file.exists():
            try:
                total_segments = len(json.loads(all_seg_file.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, TypeError):
                pass
    embed_note = f"~{embed_tokens // 1000}K tokens" if embed_tokens > 0 else f"{embedding_count} done"

    # -----------------------------------------------------------------------
    # Load existing cost tracker
    # -----------------------------------------------------------------------
    already_spent = 0.0
    if COST_TRACKER_FILE.exists():
        try:
            ct_data = json.loads(COST_TRACKER_FILE.read_text(encoding="utf-8"))
            already_spent = ct_data.get("total", 0.0)
        except (json.JSONDecodeError, TypeError):
            pass

    total_estimated = whisper_cost + summarize_cost + embed_cost

    # -----------------------------------------------------------------------
    # Print report
    # -----------------------------------------------------------------------
    print()
    print("=" * 78)
    print("  BONIMBAIT PIPELINE COST ESTIMATE")
    print("=" * 78)
    print(f"  {'Step':<25} | {'Status':<10} | {'Est. Cost':>10} | Notes")
    print("  " + "-" * 73)
    print(f"  {'Fetch metadata':<25} | {fetch_status:<10} | {'$0.00':>10} | {fetch_note}")
    print(f"  {'Download subtitles':<25} | {subs_status:<10} | {'$0.00':>10} | {subs_note}")
    print(f"  {'Download audio':<25} | {'Done' if audio_count > 0 else 'Pending':<10} | {'$0.00':>10} | {audio_count} files, only for no-subs videos")
    print(f"  {'Whisper transcription':<25} | {whisper_status:<10} | ${whisper_cost:>9.2f} | {whisper_note}")
    print(f"  {'Convert subtitles':<25} | {'Done' if transcript_count > 0 else 'Pending':<10} | {'$0.00':>10} | FREE local conversion")
    print(f"  {'Segment transcripts':<25} | {'Done' if segment_video_count > 0 else 'Pending':<10} | {'$0.00':>10} | {total_segments} total segments")
    print(f"  {'Summarization':<25} | {summarize_status:<10} | ${summarize_cost:>9.2f} | {summarize_note}")
    print(f"  {'Embeddings':<25} | {embed_status:<10} | ${embed_cost:>9.4f} | {embed_note}")
    print("  " + "-" * 73)
    print(f"  {'TOTAL ESTIMATED':25} |            | ${total_estimated:>9.2f} |")
    if already_spent > 0:
        print(f"  {'ALREADY SPENT':25} |            | ${already_spent:>9.2f} |")
    print(f"  {'BUDGET':25} |            | ${budget:>9.2f} |")
    print(f"  {'REMAINING':25} |            | ${budget - already_spent - total_estimated:>9.2f} |")
    print("=" * 78)

    if total_estimated + already_spent > budget:
        print(f"\n  WARNING: Estimated costs (${total_estimated + already_spent:.2f}) exceed budget (${budget:.2f})!")
    else:
        print(f"\n  OK: Well within budget. Estimated total ${total_estimated + already_spent:.2f} / ${budget:.2f}")
    print()


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(description="Estimate remaining pipeline costs")
    parser.add_argument("--budget", type=float, default=50.0, help="Budget in USD (default: 50)")
    parser.add_argument(
        "--model", type=str, default="claude-haiku-4-5-20251001",
        help="Summarization model (default: claude-haiku-4-5-20251001)",
    )
    args = parser.parse_args()

    estimate(budget=args.budget, model=args.model)


if __name__ == "__main__":
    main()
