"""Coverage numbers for docs/platform/KNOWLEDGE_COVERAGE.md (local files only).

Compares the committed "before" index (a git revision of apps/web/data) with the
working tree, against the channel inventory, the caption statuses and the
legacy /video/<slug>/ pages (data/raw/legacy_video_pages.csv, exported read-only
from the local DB's video_pages table).

  scripts/.venv/bin/python -m scripts.knowledge.coverage [--before feature/platform]
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
from collections import Counter, defaultdict

from scripts.knowledge.paths import REPO_ROOT, WEB_DATA, captions_status_path, inventory_path, metadata_dir, raw_dir

WHISPER_PER_MIN = 0.006  # whisper-1
MINI_TRANSCRIBE_PER_MIN = 0.003  # gpt-4o-mini-transcribe


def git_json(rev: str, path: str):
    out = subprocess.run(["git", "-C", str(REPO_ROOT), "show", f"{rev}:{path}"], capture_output=True, check=True).stdout
    return json.loads(out)


def index_stats(rows: list[dict], durations: dict[str, int]) -> dict:
    ids = {r["youtube_id"] for r in rows}
    return {
        "videos": len(ids),
        "segments": len(rows),
        "hours": round(sum(durations.get(i, 0) for i in ids) / 3600, 1),
    }


def legacy_pages() -> list[dict]:
    p = raw_dir() / "legacy_video_pages.csv"
    with p.open(encoding="utf-8") as f:
        return [
            {**row, "ids": [x for x in row["youtube_ids"].strip("{}").split(",") if x]}
            for row in csv.DictReader(f)
        ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", default="feature/platform", help="git revision of the before state")
    args = ap.parse_args()

    inv = json.loads(inventory_path().read_text(encoding="utf-8"))
    rows = inv["videos"]
    durations = {r["id"]: r["duration"] or 0 for r in rows}
    status = json.loads(captions_status_path().read_text(encoding="utf-8")) if captions_status_path().exists() else {}

    before_rows = git_json(args.before, "apps/web/data/search-index.json")
    after_rows = json.loads((WEB_DATA / "search-index.json").read_text(encoding="utf-8"))
    before_posts = git_json(args.before, "apps/web/data/posts-index.json")
    after_posts = json.loads((WEB_DATA / "posts-index.json").read_text(encoding="utf-8"))
    before_ids = {r["youtube_id"] for r in before_rows}
    after_ids = {r["youtube_id"] for r in after_rows}

    def hours(ids) -> float:
        return round(sum(durations.get(i, 0) for i in ids) / 3600, 1)

    scope = [r for r in rows if r["index_scope"]]
    # Caption status for the in-scope videos (the 178 indexed in 2026-03 count as captioned).
    cap = Counter()
    cap_hours: dict[str, float] = defaultdict(float)
    for r in scope:
        st = (status.get(r["id"]) or {}).get("status") or ("indexed_2026_03" if r["id"] in before_ids else "not_fetched")
        cap[st] += 1
        cap_hours[st] += (r["duration"] or 0) / 3600

    by_type = {}
    for kind in ("video", "podcast", "live", "short"):
        k_rows = [r for r in rows if r["type"] == kind]
        by_type[kind] = {
            "count": len(k_rows),
            "hours": hours(r["id"] for r in k_rows),
            "indexed_before": sum(r["id"] in before_ids for r in k_rows),
            "indexed_after": sum(r["id"] in after_ids for r in k_rows),
        }

    by_year: dict[str, Counter] = defaultdict(Counter)
    for r in scope:
        year = (r["upload_date"] or "????")[:4]
        by_year[year]["videos"] += 1
        by_year[year]["indexed"] += r["id"] in after_ids
        st = (status.get(r["id"]) or {}).get("status")
        by_year[year]["no_captions"] += st == "none"

    missing = [r for r in scope if r["id"] not in after_ids]
    missing_none = [r for r in missing if (status.get(r["id"]) or {}).get("status") == "none"]
    minutes_none = sum(r["duration"] or 0 for r in missing_none) / 60

    # Caption status vs the video's language setting (YouTube makes ASR only for a set language).
    language_vs_status: Counter = Counter()
    for vid, st in status.items():
        meta_path = metadata_dir() / f"{vid}.json"
        if meta_path.exists():
            lang = json.loads(meta_path.read_text(encoding="utf-8")).get("language") or "not set"
            language_vs_status[f"{st.get('status')} / language {lang}"] += 1

    pages = legacy_pages()
    published = [p for p in pages if p["status"] == "published"]

    def covered(ids: set[str], subset: list[dict]) -> int:
        return sum(any(i in ids for i in p["ids"]) for p in subset)

    report = {
        "channel": {
            "total": len(rows),
            "hours": hours(r["id"] for r in rows),
            "by_type": by_type,
            "in_scope": {"count": len(scope), "hours": hours(r["id"] for r in scope)},
            "excluded_short": len(rows) - len(scope),
        },
        "captions_in_scope": {k: {"videos": v, "hours": round(cap_hours[k], 1)} for k, v in cap.most_common()},
        "index": {
            "before": index_stats(before_rows, durations),
            "after": index_stats(after_rows, durations),
            "post_chunks_before": len(before_posts),
            "post_chunks_after": len(after_posts),
            "posts": len({p["slug"] for p in after_posts}),
        },
        "legacy_pages": {
            "total": len(pages),
            "published": len(published),
            "covered_before": covered(before_ids, pages),
            "covered_after": covered(after_ids, pages),
            "published_covered_before": covered(before_ids, published),
            "published_covered_after": covered(after_ids, published),
        },
        "by_year": {y: dict(c) for y, c in sorted(by_year.items())},
        "language_vs_status": dict(language_vs_status.most_common()),
        "gap": {
            "in_scope_not_indexed": len(missing),
            "no_captions": len(missing_none),
            "no_captions_hours": round(minutes_none / 60, 1),
            "whisper_1_usd": round(minutes_none * WHISPER_PER_MIN, 2),
            "mini_transcribe_usd": round(minutes_none * MINI_TRANSCRIBE_PER_MIN, 2),
            "embedding_usd": round(minutes_none * 632 / 1e6 * 0.02, 3),
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
