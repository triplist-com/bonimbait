"""
Statistics and reporting for video summaries.

Reads all summaries and generates aggregate statistics:
  - Category distribution
  - Costs extracted
  - Key points per video
  - Difficulty levels
  - Most common materials and tips

Usage:
  python scripts/summarize/stats.py
  python scripts/summarize/stats.py --save   # also save to stats.json
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

from scripts.summarize.prompts import CATEGORIES

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
SUMMARY_DIR = DATA_DIR / "processed" / "summaries"
STATS_FILE = SUMMARY_DIR / "stats.json"

SKIP_FILES = {"validation_report.json", "stats.json"}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("stats")


def _load_summaries() -> list[dict]:
    """Load all summary JSON files."""
    summaries = []
    if not SUMMARY_DIR.exists():
        return summaries

    for sf in sorted(SUMMARY_DIR.glob("*.json")):
        if sf.name in SKIP_FILES:
            continue
        try:
            data = json.loads(sf.read_text(encoding="utf-8"))
            summaries.append(data)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cannot read %s: %s", sf, exc)

    return summaries


def generate_stats(*, save: bool = True) -> dict:
    """Generate and print summary statistics. Returns stats dict."""
    summaries = _load_summaries()

    if not summaries:
        logger.info("No summaries found in %s", SUMMARY_DIR)
        return {"total_videos": 0}

    total = len(summaries)

    # --- Category distribution ---
    cat_slug_to_name = {c["slug"]: c["name_he"] for c in CATEGORIES}
    category_counts: Counter = Counter()
    for s in summaries:
        slug = s.get("category_slug", "unknown")
        category_counts[slug] += 1

    # --- Difficulty distribution ---
    difficulty_counts: Counter = Counter()
    for s in summaries:
        difficulty_counts[s.get("difficulty_level", "unknown")] += 1

    # --- Key points stats ---
    kp_lengths = [len(s.get("key_points", [])) for s in summaries]
    avg_key_points = sum(kp_lengths) / total if total else 0

    # --- Costs ---
    total_costs_extracted = sum(len(s.get("costs", [])) for s in summaries)
    videos_with_costs = sum(1 for s in summaries if s.get("costs"))

    # --- Materials ---
    material_counter: Counter = Counter()
    for s in summaries:
        for mat in s.get("materials", []):
            material_counter[mat.strip()] += 1

    # --- Tips ---
    tip_counter: Counter = Counter()
    for s in summaries:
        for tip in s.get("tips", []):
            # Use first 80 chars as key to group similar tips
            key = tip.strip()[:80]
            tip_counter[key] += 1

    # --- Warnings ---
    total_warnings = sum(len(s.get("warnings", [])) for s in summaries)

    # --- Rules ---
    total_rules = sum(len(s.get("rules", [])) for s in summaries)

    # --- Token usage (if tracked) ---
    total_input_tokens = sum(s.get("input_tokens", 0) for s in summaries)
    total_output_tokens = sum(s.get("output_tokens", 0) for s in summaries)

    # --- Relevance years ---
    year_counter: Counter = Counter()
    for s in summaries:
        yr = s.get("estimated_relevance_year")
        if yr is not None:
            year_counter[yr] += 1

    # Build stats dict
    stats = {
        "total_videos": total,
        "category_distribution": {
            slug: {
                "count": category_counts.get(slug, 0),
                "name_he": cat_slug_to_name.get(slug, slug),
                "pct": round(category_counts.get(slug, 0) / total * 100, 1),
            }
            for slug in [c["slug"] for c in CATEGORIES]
        },
        "difficulty_distribution": dict(difficulty_counts.most_common()),
        "key_points": {
            "average_per_video": round(avg_key_points, 1),
            "min": min(kp_lengths) if kp_lengths else 0,
            "max": max(kp_lengths) if kp_lengths else 0,
        },
        "costs": {
            "total_extracted": total_costs_extracted,
            "videos_with_costs": videos_with_costs,
            "avg_per_video_with_costs": round(
                total_costs_extracted / videos_with_costs, 1
            ) if videos_with_costs else 0,
        },
        "total_warnings": total_warnings,
        "total_rules": total_rules,
        "top_materials": dict(material_counter.most_common(30)),
        "top_tips": dict(tip_counter.most_common(20)),
        "relevance_years": dict(sorted(year_counter.items())),
        "token_usage": {
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "estimated_cost_usd": round(
                (total_input_tokens / 1_000_000) * 3.0
                + (total_output_tokens / 1_000_000) * 15.0,
                2,
            ),
        },
    }

    # Print report
    print()
    print("=" * 70)
    print("  BONIMBAIT SUMMARY STATISTICS")
    print("=" * 70)
    print(f"\n  Total videos summarized: {total}")

    print(f"\n  {'CATEGORY DISTRIBUTION':^66}")
    print("  " + "-" * 66)
    for cat in CATEGORIES:
        slug = cat["slug"]
        count = category_counts.get(slug, 0)
        pct = count / total * 100 if total else 0
        bar = "#" * int(pct / 2)
        print(f"  {cat['name_he']:<25} {count:>4} ({pct:>5.1f}%)  {bar}")

    print(f"\n  {'DIFFICULTY LEVELS':^66}")
    print("  " + "-" * 66)
    for level in ("beginner", "intermediate", "advanced"):
        count = difficulty_counts.get(level, 0)
        pct = count / total * 100 if total else 0
        print(f"  {level:<25} {count:>4} ({pct:>5.1f}%)")

    print(f"\n  {'KEY POINTS':^66}")
    print("  " + "-" * 66)
    print(f"  Average per video: {avg_key_points:.1f}")
    print(f"  Range: {min(kp_lengths) if kp_lengths else 0} - {max(kp_lengths) if kp_lengths else 0}")

    print(f"\n  {'COSTS':^66}")
    print("  " + "-" * 66)
    print(f"  Total cost items extracted: {total_costs_extracted}")
    print(f"  Videos mentioning costs:    {videos_with_costs} ({videos_with_costs / total * 100:.1f}%)" if total else "")

    print(f"\n  {'TOP 15 MATERIALS':^66}")
    print("  " + "-" * 66)
    for mat, count in material_counter.most_common(15):
        print(f"  {mat:<40} {count:>4}")

    print(f"\n  {'WARNINGS & RULES':^66}")
    print("  " + "-" * 66)
    print(f"  Total warnings: {total_warnings}")
    print(f"  Total rules:    {total_rules}")

    if total_input_tokens:
        print(f"\n  {'API USAGE':^66}")
        print("  " + "-" * 66)
        print(f"  Input tokens:  {total_input_tokens:>12,}")
        print(f"  Output tokens: {total_output_tokens:>12,}")
        print(f"  Est. cost:     ${stats['token_usage']['estimated_cost_usd']:.2f}")

    print()
    print("=" * 70)

    # Save
    if save:
        SUMMARY_DIR.mkdir(parents=True, exist_ok=True)
        STATS_FILE.write_text(
            json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.info("Stats saved to %s", STATS_FILE)

    return stats


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(description="Generate summary statistics")
    parser.add_argument(
        "--no-save", action="store_true",
        help="Print stats without saving to file",
    )
    args = parser.parse_args()

    generate_stats(save=not args.no_save)


if __name__ == "__main__":
    main()
