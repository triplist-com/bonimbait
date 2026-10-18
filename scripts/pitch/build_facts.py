#!/usr/bin/env python3
"""Build the pitch site's measured facts: apps/web/data/pitch/facts.json.

Counts only. The raw inputs stay in the gitignored data/ folder of the main
checkout; this script reduces them to a few numbers the /platform/ page shows:

- URL parity, from data/migration/parity_report.csv (one row per live URL,
  with a `pass` column): total, passed, counts by page type and by response.
- The owner's YouTube channel, from data/raw/channel_inventory.json (built by
  scripts/knowledge/inventory.py): videos, hours, podcast episodes.
- What the migration loaded, from data/migration/load_report.json: rows per
  content type (posts, video pages, businesses, reviews, ...).

No URLs, titles or personal data are written.

Usage:
    python3 scripts/pitch/build_facts.py --data-dir /path/to/main/checkout/data
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "apps" / "web" / "data" / "pitch" / "facts.json"
EPISODE_RE = re.compile(r"פרק\s*(\d+)")
ISRAEL = ZoneInfo("Asia/Jerusalem")


def file_date(path: Path) -> str:
    """Israel date of a file's last modification (when the report was produced)."""
    return datetime.fromtimestamp(path.stat().st_mtime, tz=ISRAEL).date().isoformat()


def parity_summary(csv_path: Path) -> dict:
    with csv_path.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    passed = sum(1 for r in rows if r.get("pass") == "True")
    by_type = Counter(r.get("type") or "other" for r in rows)
    by_result = Counter(r.get("result") or "n/a" for r in rows)
    exceptions = sum(1 for r in rows if r.get("accepted_exception") == "True")
    return {
        "source": "data/migration/parity_report.csv",
        "checkedAt": file_date(csv_path),
        "total": len(rows),
        "passed": passed,
        "byType": dict(by_type.most_common()),
        "byResult": dict(sorted(by_result.items())),
        "acceptedExceptions": exceptions,
    }


def channel_summary(inventory_path: Path) -> dict:
    inv = json.loads(inventory_path.read_text(encoding="utf-8"))
    summary = inv.get("summary", {})
    videos = inv.get("videos", [])
    episodes = [
        int(m.group(1))
        for v in videos
        if v.get("type") == "podcast"
        for m in [EPISODE_RE.search(v.get("title") or "")]
        if m
    ]
    by_type = {
        kind: {"count": int(info.get("count", 0)), "hours": round(float(info.get("hours", 0)), 1)}
        for kind, info in (summary.get("by_type") or {}).items()
    }
    stamp = inv.get("generated_at")
    generated = (
        datetime.fromisoformat(str(stamp)).astimezone(ISRAEL).date().isoformat() if stamp else file_date(inventory_path)
    )
    return {
        "source": "data/raw/channel_inventory.json",
        "inventoriedAt": generated,
        "total": int(summary.get("total", len(videos))),
        "hours": round(float(summary.get("hours", 0))),
        "byType": by_type,
        "answerableScope": int((summary.get("index_scope") or {}).get("count", 0)),
        "podcastLatestEpisode": max(episodes) if episodes else 0,
        "playlists": int(summary.get("playlists", 0)),
    }


MIGRATION_KEYS = ("posts", "video_pages", "businesses", "reviews", "pages", "specialties", "post_categories", "products")


def migration_summary(report_path: Path) -> dict:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    counts = report.get("counts") or {}
    finished = report.get("finished_at")
    loaded = (
        datetime.fromisoformat(str(finished)).astimezone(ISRAEL).date().isoformat() if finished else file_date(report_path)
    )
    return {
        "source": "data/migration/load_report.json",
        "loadedAt": loaded,
        "counts": {k: int(counts[k]) for k in MIGRATION_KEYS if k in counts},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, default=REPO_ROOT / "data", help="the main checkout's data/ folder")
    parser.add_argument("--out", type=Path, default=OUT_PATH)
    args = parser.parse_args()

    facts = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "parity": parity_summary(args.data_dir / "migration" / "parity_report.csv"),
        "channel": channel_summary(args.data_dir / "raw" / "channel_inventory.json"),
        "migration": migration_summary(args.data_dir / "migration" / "load_report.json"),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(facts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    p, c = facts["parity"], facts["channel"]
    print(f"parity {p['passed']}/{p['total']} ({p['checkedAt']}); channel {c['total']} videos, {c['hours']} h, "
          f"latest episode {c['podcastLatestEpisode']} ({c['inventoriedAt']}) -> {args.out}")


if __name__ == "__main__":
    main()
