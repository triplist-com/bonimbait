"""
Standalone batch re-categorization of video summaries.

Uses a lightweight Claude call (title + key_points only) to re-assign
categories. Useful when the taxonomy changes.

Usage:
  python scripts/summarize/categorize.py                 # Re-categorize all
  python scripts/summarize/categorize.py --dry-run       # Show current distribution only
  python scripts/summarize/categorize.py --batch-size 50 # Process up to 50
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
    CATEGORY_CLASSIFICATION_SYSTEM_PROMPT,
    CATEGORY_CLASSIFICATION_USER_PROMPT,
    VALID_CATEGORY_SLUGS,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
SUMMARY_DIR = DATA_DIR / "processed" / "summaries"

SKIP_FILES = {"validation_report.json", "stats.json"}

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MODEL = "claude-sonnet-4-6"
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0
MAX_CONCURRENT = 10  # lightweight calls, can do more concurrency

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("categorize")


def _extract_json(text: str) -> dict | None:
    """Try to extract JSON object from response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _print_distribution(summary_files: list[Path]) -> dict[str, int]:
    """Print and return category distribution."""
    distribution: dict[str, int] = {cat["slug"]: 0 for cat in CATEGORIES}
    unknown = 0

    for sf in summary_files:
        try:
            data = json.loads(sf.read_text(encoding="utf-8"))
            slug = data.get("category_slug", "")
            if slug in distribution:
                distribution[slug] += 1
            else:
                unknown += 1
        except (json.JSONDecodeError, OSError):
            unknown += 1

    logger.info("=" * 60)
    logger.info("CATEGORY DISTRIBUTION")
    logger.info("=" * 60)
    total = sum(distribution.values()) + unknown
    for cat in CATEGORIES:
        count = distribution[cat["slug"]]
        pct = count / total * 100 if total else 0
        bar = "#" * int(pct / 2)
        logger.info("  %-30s %4d (%5.1f%%) %s", cat["name_he"], count, pct, bar)
    if unknown:
        logger.info("  %-30s %4d", "Unknown/Invalid", unknown)
    logger.info("  %-30s %4d", "TOTAL", total)

    return distribution


async def _categorize_one(
    client,
    summary_path: Path,
    semaphore: asyncio.Semaphore,
    pbar: tqdm,
) -> tuple[str, dict | None]:
    """Re-categorize a single video. Returns (youtube_id, new_categories_or_None)."""
    youtube_id = summary_path.stem

    try:
        data = json.loads(summary_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Cannot read %s: %s", youtube_id, exc)
        pbar.update(1)
        return youtube_id, None

    title_summary = data.get("title_summary", "")
    key_points = data.get("key_points", [])
    if not title_summary and not key_points:
        logger.warning("No title/key_points for %s, skipping", youtube_id)
        pbar.update(1)
        return youtube_id, None

    kp_text = "\n".join(f"- {kp}" for kp in key_points)
    user_msg = CATEGORY_CLASSIFICATION_USER_PROMPT.format(
        title_summary=title_summary,
        key_points=kp_text,
    )

    async with semaphore:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await client.messages.create(
                    model=MODEL,
                    max_tokens=256,
                    system=CATEGORY_CLASSIFICATION_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_msg}],
                )
                result = _extract_json(response.content[0].text)
                if result and "category_slug" in result:
                    # Validate
                    slug = result["category_slug"]
                    secondaries = result.get("secondary_categories", [])
                    if slug not in VALID_CATEGORY_SLUGS:
                        logger.warning("Invalid category from API for %s: %s", youtube_id, slug)
                        result = None
                    else:
                        secondaries = [s for s in secondaries if s in VALID_CATEGORY_SLUGS and s != slug][:2]
                        result["secondary_categories"] = secondaries
                        pbar.update(1)
                        return youtube_id, result

                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BACKOFF_BASE ** attempt)
                else:
                    logger.error("Failed to categorize %s after %d attempts", youtube_id, MAX_RETRIES)

            except Exception as exc:
                if attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF_BASE ** attempt
                    logger.warning("Attempt %d/%d for %s: %s", attempt, MAX_RETRIES, youtube_id, exc)
                    await asyncio.sleep(wait)
                else:
                    logger.error("Failed to categorize %s: %s", youtube_id, exc)

    pbar.update(1)
    return youtube_id, None


async def _run_categorize(
    summary_files: list[Path],
    *,
    max_concurrent: int = MAX_CONCURRENT,
) -> tuple[int, int]:
    """Run categorization batch. Returns (updated, failed)."""
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = anthropic.AsyncAnthropic(api_key=api_key)
    semaphore = asyncio.Semaphore(max_concurrent)

    pbar = tqdm(total=len(summary_files), desc="Categorizing", unit="video")

    tasks = [
        _categorize_one(client, sf, semaphore, pbar)
        for sf in summary_files
    ]
    results = await asyncio.gather(*tasks)
    pbar.close()

    updated = 0
    failed = 0
    for youtube_id, new_cats in results:
        if new_cats is None:
            failed += 1
            continue

        sf = SUMMARY_DIR / f"{youtube_id}.json"
        try:
            data = json.loads(sf.read_text(encoding="utf-8"))
            old_slug = data.get("category_slug", "")
            data["category_slug"] = new_cats["category_slug"]
            data["secondary_categories"] = new_cats["secondary_categories"]
            sf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            if old_slug != new_cats["category_slug"]:
                logger.debug("Updated %s: %s -> %s", youtube_id, old_slug, new_cats["category_slug"])
            updated += 1
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Failed to update %s: %s", youtube_id, exc)
            failed += 1

    return updated, failed


def categorize_all(
    *,
    batch_size: int = 0,
    dry_run: bool = False,
    max_concurrent: int = MAX_CONCURRENT,
) -> None:
    """Re-categorize all summaries."""
    summary_files = sorted(
        p for p in SUMMARY_DIR.glob("*.json")
        if p.name not in SKIP_FILES
    )

    if not summary_files:
        logger.info("No summary files found in %s", SUMMARY_DIR)
        return

    # Show current distribution
    logger.info("Current distribution (%d summaries):", len(summary_files))
    _print_distribution(summary_files)

    if dry_run:
        logger.info("Dry run — exiting")
        return

    if batch_size > 0:
        summary_files = summary_files[:batch_size]

    logger.info("Re-categorizing %d summaries...", len(summary_files))
    start = time.monotonic()
    updated, failed = asyncio.run(
        _run_categorize(summary_files, max_concurrent=max_concurrent)
    )
    elapsed = time.monotonic() - start

    logger.info(
        "Categorization complete in %.1fs. Updated: %d | Failed: %d",
        elapsed, updated, failed,
    )

    # Show new distribution
    all_files = sorted(
        p for p in SUMMARY_DIR.glob("*.json")
        if p.name not in SKIP_FILES
    )
    logger.info("New distribution:")
    _print_distribution(all_files)


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(description="Re-categorize video summaries using Claude")
    parser.add_argument("--batch-size", type=int, default=0, help="Max videos to process (0 = all)")
    parser.add_argument("--max-concurrent", type=int, default=MAX_CONCURRENT, help="Max concurrent API calls")
    parser.add_argument("--dry-run", action="store_true", help="Show current distribution only")
    args = parser.parse_args()

    categorize_all(
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        max_concurrent=args.max_concurrent,
    )


if __name__ == "__main__":
    main()
