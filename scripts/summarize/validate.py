"""
Validate all summaries in data/processed/summaries/.

Checks structural integrity, field constraints, and taxonomy compliance.
Generates a validation report and optionally re-queues failed videos.

Usage:
  python scripts/summarize/validate.py
  python scripts/summarize/validate.py --requeue   # re-process invalid summaries
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

from scripts.summarize.prompts import DIFFICULTY_LEVELS, VALID_CATEGORY_SLUGS

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
SUMMARY_DIR = DATA_DIR / "processed" / "summaries"
REPORT_FILE = SUMMARY_DIR / "validation_report.json"

# Files to skip when scanning summaries
SKIP_FILES = {"validation_report.json", "stats.json"}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("validate")


def _validate_summary(data: dict, youtube_id: str) -> list[str]:
    """Return list of issues found in a summary (empty = valid)."""
    issues: list[str] = []

    # Required fields and their expected types
    required = {
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

    for field, expected_type in required.items():
        if field not in data:
            issues.append(f"missing_field:{field}")
        elif not isinstance(data[field], expected_type):
            issues.append(f"wrong_type:{field}")

    # Stop further checks if basic structure is broken
    if issues:
        return issues

    # title_summary length
    ts_len = len(data["title_summary"])
    if ts_len < 10:
        issues.append("title_too_short")
    elif ts_len > 200:
        issues.append("title_too_long")

    # key_points count
    kp_count = len(data["key_points"])
    if kp_count < 3:
        issues.append(f"too_few_key_points:{kp_count}")
    elif kp_count > 8:
        issues.append(f"too_many_key_points:{kp_count}")

    # Empty key points
    if any(not kp.strip() for kp in data["key_points"]):
        issues.append("empty_key_point")

    # Category validity
    if data["category_slug"] not in VALID_CATEGORY_SLUGS:
        issues.append(f"invalid_category:{data['category_slug']}")

    for sc in data["secondary_categories"]:
        if sc not in VALID_CATEGORY_SLUGS:
            issues.append(f"invalid_secondary_category:{sc}")

    if len(data["secondary_categories"]) > 2:
        issues.append("too_many_secondary_categories")

    if data["category_slug"] in data["secondary_categories"]:
        issues.append("primary_in_secondary")

    # Difficulty level
    if data["difficulty_level"] not in DIFFICULTY_LEVELS:
        issues.append(f"invalid_difficulty:{data['difficulty_level']}")

    # Cost objects validation
    cost_fields = {"item", "price", "unit", "context", "approximate"}
    for i, cost in enumerate(data["costs"]):
        if not isinstance(cost, dict):
            issues.append(f"cost_{i}_not_dict")
            continue
        missing = cost_fields - set(cost.keys())
        if missing:
            issues.append(f"cost_{i}_missing:{','.join(sorted(missing))}")

    # estimated_relevance_year (optional but must be int or null)
    if "estimated_relevance_year" in data:
        val = data["estimated_relevance_year"]
        if val is not None and not isinstance(val, int):
            issues.append("invalid_relevance_year_type")

    return issues


def validate_all(*, requeue: bool = False) -> dict:
    """
    Validate all summaries and generate a report.

    Returns the report dict.
    """
    if not SUMMARY_DIR.exists():
        logger.error("Summary directory does not exist: %s", SUMMARY_DIR)
        return {"total": 0, "valid": 0, "invalid": 0}

    summary_files = sorted(
        p for p in SUMMARY_DIR.glob("*.json")
        if p.name not in SKIP_FILES
    )

    if not summary_files:
        logger.info("No summary files found in %s", SUMMARY_DIR)
        return {"total": 0, "valid": 0, "invalid": 0}

    valid_count = 0
    invalid_count = 0
    issue_counter: Counter = Counter()
    invalid_videos: list[dict] = []

    for sf in summary_files:
        youtube_id = sf.stem
        try:
            data = json.loads(sf.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cannot read %s: %s", sf, exc)
            invalid_count += 1
            issue_counter["unreadable_file"] += 1
            invalid_videos.append({"youtube_id": youtube_id, "issues": ["unreadable_file"]})
            continue

        issues = _validate_summary(data, youtube_id)
        if issues:
            invalid_count += 1
            for issue in issues:
                issue_type = issue.split(":")[0]
                issue_counter[issue_type] += 1
            invalid_videos.append({"youtube_id": youtube_id, "issues": issues})
            logger.warning("Invalid: %s — %s", youtube_id, "; ".join(issues))
        else:
            valid_count += 1

    total = valid_count + invalid_count
    report = {
        "total": total,
        "valid": valid_count,
        "invalid": invalid_count,
        "valid_pct": round(valid_count / total * 100, 1) if total else 0,
        "issues_by_type": dict(issue_counter.most_common()),
        "invalid_videos": invalid_videos,
        "requeue_ids": [v["youtube_id"] for v in invalid_videos],
    }

    # Save report
    SUMMARY_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    logger.info("=" * 60)
    logger.info("VALIDATION REPORT")
    logger.info("=" * 60)
    logger.info("  Total summaries:  %d", total)
    logger.info("  Valid:            %d (%.1f%%)", valid_count, report["valid_pct"])
    logger.info("  Invalid:          %d", invalid_count)
    if issue_counter:
        logger.info("  Issues breakdown:")
        for issue_type, count in issue_counter.most_common():
            logger.info("    %-35s %d", issue_type, count)
    logger.info("Report saved to %s", REPORT_FILE)

    # Requeue: delete invalid summaries so run.py will re-process them
    if requeue and invalid_videos:
        requeue_count = 0
        for entry in invalid_videos:
            vid_path = SUMMARY_DIR / f"{entry['youtube_id']}.json"
            if vid_path.exists():
                vid_path.unlink()
                requeue_count += 1
        logger.info("Requeued %d videos for re-summarization (deleted summary files)", requeue_count)

    return report


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(description="Validate video summaries")
    parser.add_argument(
        "--requeue", action="store_true",
        help="Delete invalid summaries so they get re-processed on next run",
    )
    args = parser.parse_args()

    validate_all(requeue=args.requeue)


if __name__ == "__main__":
    main()
