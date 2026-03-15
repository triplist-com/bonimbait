"""
Summarize video transcripts using Claude API.

Reads transcripts from data/processed/transcripts/ and saves structured
summaries to data/processed/summaries/{youtube_id}.json.

Features:
  - Async batch processing with configurable concurrency
  - Rate limiting via asyncio semaphore
  - Checkpoint/resume (skips already-processed videos)
  - Exponential backoff retries with JSON repair fallback
  - Cost estimation and --dry-run mode
  - tqdm progress bar

Usage:
  python scripts/summarize/run.py                    # Process all (resume)
  python scripts/summarize/run.py --batch-size 50    # Process up to 50
  python scripts/summarize/run.py --dry-run           # Show cost estimate only
  python scripts/summarize/run.py --no-resume         # Re-process all
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

from scripts.summarize.prompts import (
    CATEGORIES,
    DIFFICULTY_LEVELS,
    JSON_REPAIR_SYSTEM_PROMPT,
    JSON_REPAIR_USER_PROMPT,
    VALID_CATEGORY_SLUGS,
    VIDEO_SUMMARY_SYSTEM_PROMPT,
    VIDEO_SUMMARY_USER_PROMPT,
    get_prompts,
)
from scripts.config import get_summarize_pricing

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
TRANSCRIPT_DIR = DATA_DIR / "processed" / "transcripts"
SUMMARY_DIR = DATA_DIR / "processed" / "summaries"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_MODEL = "claude-haiku-4-5-20251001"  # Haiku by default (20x cheaper)
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0  # seconds
MAX_CONCURRENT = 10  # Haiku handles higher concurrency
DEFAULT_BATCH_SIZE = 0  # 0 = all

# Token estimation: ~1 token per 3.5 Hebrew characters (conservative)
CHARS_PER_TOKEN = 3.5
EST_OUTPUT_TOKENS = 500  # average per summary

# Max input tokens for Claude — leave room for system prompt + output
MAX_TRANSCRIPT_CHARS = 350_000  # ~100K tokens, well within context window

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("summarize")


def _ensure_dirs() -> None:
    SUMMARY_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Token / cost estimation
# ---------------------------------------------------------------------------
def _estimate_tokens(text: str) -> int:
    """Rough token count for Hebrew text."""
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def _estimate_cost_usd(
    transcript_files: list[Path],
    model: str = DEFAULT_MODEL,
) -> tuple[float, int]:
    """Return (estimated_cost_usd, total_input_tokens)."""
    input_cost_per_mtok, output_cost_per_mtok = get_summarize_pricing(model)

    total_input_tokens = 0
    for tf in transcript_files:
        try:
            data = json.loads(tf.read_text(encoding="utf-8"))
            text = data.get("full_text", "")
            total_input_tokens += _estimate_tokens(text)
        except (json.JSONDecodeError, OSError):
            total_input_tokens += 2000  # fallback estimate
    # Add system prompt overhead (~500 tokens per call)
    total_input_tokens += len(transcript_files) * 500
    total_output_tokens = len(transcript_files) * EST_OUTPUT_TOKENS
    cost = (
        (total_input_tokens / 1_000_000) * input_cost_per_mtok
        + (total_output_tokens / 1_000_000) * output_cost_per_mtok
    )
    return cost, total_input_tokens


# ---------------------------------------------------------------------------
# JSON extraction / validation
# ---------------------------------------------------------------------------
def _extract_json(text: str) -> dict | None:
    """Try to extract a JSON object from Claude's response text."""
    # Try direct parse first
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to find a JSON object in the text
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _validate_summary(data: dict) -> list[str]:
    """Return list of validation issues (empty = valid)."""
    issues = []
    required_fields = {
        "title_summary": str,
        "key_points": list,
        "costs": list,
        "rules": list,
        "tips": list,
        "materials": list,
        "warnings": list,
        "category_slug": str,
        "secondary_categories": list,
        "difficulty_level": str,
    }
    for field, expected_type in required_fields.items():
        if field not in data:
            issues.append(f"missing field: {field}")
        elif not isinstance(data[field], expected_type):
            issues.append(f"wrong type for {field}: expected {expected_type.__name__}")

    if not issues:
        kp = data["key_points"]
        if not (3 <= len(kp) <= 8):
            issues.append(f"key_points has {len(kp)} items (expected 3-8)")

        if data["category_slug"] not in VALID_CATEGORY_SLUGS:
            issues.append(f"invalid category_slug: {data['category_slug']}")

        for sc in data.get("secondary_categories", []):
            if sc not in VALID_CATEGORY_SLUGS:
                issues.append(f"invalid secondary category: {sc}")

        if data["difficulty_level"] not in DIFFICULTY_LEVELS:
            issues.append(f"invalid difficulty_level: {data['difficulty_level']}")

        ts = data.get("title_summary", "")
        if len(ts) < 10 or len(ts) > 500:
            issues.append(f"title_summary length {len(ts)} outside range 10-500")

        for cost in data.get("costs", []):
            for cf in ("item", "price", "unit", "context", "approximate"):
                if cf not in cost:
                    issues.append(f"cost missing field: {cf}")
                    break

    return issues


# ---------------------------------------------------------------------------
# Core summarization
# ---------------------------------------------------------------------------
async def _summarize_one(
    client,
    transcript_path: Path,
    semaphore: asyncio.Semaphore,
    pbar: tqdm,
    running_cost: list[float],
    model: str = DEFAULT_MODEL,
    prompts: dict | None = None,
) -> tuple[str, dict | None]:
    """Summarize a single transcript. Returns (youtube_id, summary_dict_or_None)."""
    youtube_id = transcript_path.stem
    input_cost_per_mtok, output_cost_per_mtok = get_summarize_pricing(model)

    if prompts is None:
        prompts = get_prompts(model)

    try:
        data = json.loads(transcript_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Cannot read transcript %s: %s", youtube_id, exc)
        pbar.update(1)
        return youtube_id, None

    full_text = data.get("full_text", "")
    if not full_text:
        logger.warning("Empty transcript for %s", youtube_id)
        pbar.update(1)
        return youtube_id, None

    # Truncate very long transcripts
    if len(full_text) > MAX_TRANSCRIPT_CHARS:
        logger.warning(
            "Truncating transcript for %s from %d to %d chars",
            youtube_id, len(full_text), MAX_TRANSCRIPT_CHARS,
        )
        full_text = full_text[:MAX_TRANSCRIPT_CHARS] + "\n\n[הטקסט קוצר בשל אורכו]"

    user_msg = prompts["user"].format(transcript_text=full_text)

    async with semaphore:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await client.messages.create(
                    model=model,
                    max_tokens=2048,
                    system=prompts["system"],
                    messages=[{"role": "user", "content": user_msg}],
                )

                # Track cost from usage
                input_tokens = getattr(response.usage, "input_tokens", 0)
                output_tokens = getattr(response.usage, "output_tokens", 0)
                call_cost = (
                    (input_tokens / 1_000_000) * input_cost_per_mtok
                    + (output_tokens / 1_000_000) * output_cost_per_mtok
                )
                running_cost[0] += call_cost

                response_text = response.content[0].text
                result = _extract_json(response_text)

                if result is None:
                    # Try JSON repair
                    logger.warning("JSON parse failed for %s, attempting repair (attempt %d)", youtube_id, attempt)
                    repair_response = await client.messages.create(
                        model=model,
                        max_tokens=2048,
                        system=prompts["json_repair_system"],
                        messages=[{"role": "user", "content": prompts["json_repair_user"].format(broken_json=response_text)}],
                    )
                    repair_cost = (
                        (getattr(repair_response.usage, "input_tokens", 0) / 1_000_000) * input_cost_per_mtok
                        + (getattr(repair_response.usage, "output_tokens", 0) / 1_000_000) * output_cost_per_mtok
                    )
                    running_cost[0] += repair_cost
                    result = _extract_json(repair_response.content[0].text)

                if result is None:
                    if attempt < MAX_RETRIES:
                        wait = RETRY_BACKOFF_BASE ** attempt
                        logger.warning("Still no valid JSON for %s, retry in %.0fs", youtube_id, wait)
                        await asyncio.sleep(wait)
                        continue
                    else:
                        logger.error("All %d attempts failed to get valid JSON for %s", MAX_RETRIES, youtube_id)
                        pbar.update(1)
                        return youtube_id, None

                # Validate
                validation_issues = _validate_summary(result)
                if validation_issues:
                    logger.warning("Validation issues for %s: %s", youtube_id, "; ".join(validation_issues))
                    # Still save — validation script will catch these

                # Attach metadata
                result["youtube_id"] = youtube_id
                result["model"] = model
                result["input_tokens"] = input_tokens
                result["output_tokens"] = output_tokens

                pbar.update(1)
                pbar.set_postfix(cost=f"${running_cost[0]:.2f}")
                return youtube_id, result

            except Exception as exc:
                wait = RETRY_BACKOFF_BASE ** attempt
                logger.warning(
                    "Attempt %d/%d failed for %s: %s — retrying in %.0fs",
                    attempt, MAX_RETRIES, youtube_id, exc, wait,
                )
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(wait)
                else:
                    logger.error("All %d attempts failed for %s", MAX_RETRIES, youtube_id)

    pbar.update(1)
    return youtube_id, None


async def _run_batch(
    transcript_files: list[Path],
    *,
    max_concurrent: int = MAX_CONCURRENT,
    model: str = DEFAULT_MODEL,
) -> tuple[int, int, float]:
    """Process a batch of transcripts. Returns (success, failed, total_cost)."""
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = anthropic.AsyncAnthropic(api_key=api_key)
    semaphore = asyncio.Semaphore(max_concurrent)
    running_cost = [0.0]  # mutable container for cost tracking
    prompts = get_prompts(model)

    pbar = tqdm(total=len(transcript_files), desc=f"Summarizing ({model})", unit="video")

    tasks = [
        _summarize_one(
            client, tf, semaphore, pbar, running_cost,
            model=model, prompts=prompts,
        )
        for tf in transcript_files
    ]

    results = await asyncio.gather(*tasks)
    pbar.close()

    success = 0
    failed = 0
    for youtube_id, summary in results:
        if summary is not None:
            out_path = SUMMARY_DIR / f"{youtube_id}.json"
            out_path.write_text(
                json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            success += 1
        else:
            failed += 1

    return success, failed, running_cost[0]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def summarize_batch(
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    resume: bool = True,
    dry_run: bool = False,
    max_concurrent: int = MAX_CONCURRENT,
    model: str = DEFAULT_MODEL,
    cost_tracker=None,
) -> tuple[int, float]:
    """
    Summarize transcripts. Returns (count_of_successes, total_cost_usd).

    If *cost_tracker* is provided (a CostTracker instance), costs are recorded
    and budget is checked before starting.
    """
    _ensure_dirs()

    # Discover transcript files
    transcript_files = sorted(TRANSCRIPT_DIR.glob("*.json"))
    if not transcript_files:
        logger.info("No transcripts found in %s", TRANSCRIPT_DIR)
        return 0, 0.0

    total_available = len(transcript_files)

    # Filter already-processed
    if resume:
        done = {p.stem for p in SUMMARY_DIR.glob("*.json") if p.name not in ("validation_report.json", "stats.json")}
        transcript_files = [f for f in transcript_files if f.stem not in done]

    if batch_size > 0:
        transcript_files = transcript_files[:batch_size]

    if not transcript_files:
        logger.info("All transcripts already summarized (%d total)", total_available)
        return 0, 0.0

    # Cost estimate
    estimated_cost, total_input_tokens = _estimate_cost_usd(transcript_files, model=model)
    logger.info(
        "Will summarize %d / %d videos with %s (~%dK input tokens). Estimated cost: $%.2f",
        len(transcript_files),
        total_available,
        model,
        total_input_tokens // 1000,
        estimated_cost,
    )

    # Budget check
    if cost_tracker is not None:
        cost_tracker.check_budget(estimated_cost, category="summarize")

    if dry_run:
        logger.info("Dry run — exiting without processing")
        return 0, 0.0

    # Run async batch
    start = time.monotonic()
    success, failed, total_cost = asyncio.run(
        _run_batch(transcript_files, max_concurrent=max_concurrent, model=model)
    )
    elapsed = time.monotonic() - start

    # Record cost
    if cost_tracker is not None:
        cost_tracker.add_cost("summarize", total_cost, detail=f"{success} videos with {model}")

    logger.info(
        "Summarization complete in %.1fs. Success: %d | Failed: %d | Cost: $%.2f (model: %s)",
        elapsed, success, failed, total_cost, model,
    )
    return success, total_cost


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    # Add project root to sys.path
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(
        description="Summarize video transcripts using Claude API",
    )
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH_SIZE,
        help=f"Max videos per run, 0 = all (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--max-concurrent", type=int, default=MAX_CONCURRENT,
        help=f"Max concurrent API calls (default: {MAX_CONCURRENT})",
    )
    parser.add_argument(
        "--model", type=str, default=DEFAULT_MODEL,
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument("--no-resume", action="store_true", help="Re-summarize all videos")
    parser.add_argument("--dry-run", action="store_true", help="Show cost estimate only")
    args = parser.parse_args()

    summarize_batch(
        batch_size=args.batch_size,
        resume=not args.no_resume,
        dry_run=args.dry_run,
        max_concurrent=args.max_concurrent,
        model=args.model,
    )


if __name__ == "__main__":
    main()
