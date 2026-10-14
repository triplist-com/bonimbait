"""
Build the segment-level video search index for the Next.js app.

Reads:
  data/processed/segments/*.json   — timestamped transcript segments per video
  apps/web/data/videos.json        — only videos in the frontend catalog get index rows

Embeddings (OpenAI text-embedding-3-small) are cached by text hash in
data/processed/segment_embeddings.{keys.json,f32} (scripts/knowledge/embeddings.py).
The cache is seeded from the committed index first, so existing rows keep their
exact vectors and a re-run only pays for new or changed segments. Every segment
file is embedded (the catalog builder uses the vectors to pick categories), but
only catalog videos are written.

Writes (row order of the .f32 matrix == order of the .json list):
  apps/web/data/search-index.json — [{youtube_id, segment_index, start_time, end_time, text}, ...]
  apps/web/data/search-index.f32  — packed little-endian Float32 matrix [N * 1536]

Usage (from the repo root or a worktree; data/ is found in the main checkout):
  scripts/.venv/bin/python scripts/build_search_index.py --dry-run     # cost estimate, no API calls
  scripts/.venv/bin/python scripts/build_search_index.py --embed-only  # fill the cache, write nothing
  scripts/.venv/bin/python scripts/build_search_index.py [--max-cost 0.50]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.knowledge.embeddings import (  # noqa: E402
    DIM,
    PRICE_PER_MTOK,
    EmbeddingCache,
    count_tokens,
    embed_missing,
    text_key,
)
from scripts.knowledge.paths import WEB_DATA, load_env, segments_dir  # noqa: E402


def load_segments() -> list[dict]:
    """All segments of all videos, in file-name order."""
    rows: list[dict] = []
    for f in sorted(segments_dir().glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(d, list):  # all_segments.json (legacy combined file)
            continue
        yt = d.get("youtube_id") or f.stem
        for seg in d.get("segments", []):
            rows.append(
                {
                    "youtube_id": yt,
                    "segment_index": seg["segment_index"],
                    "start_time": seg["start_time"],
                    "end_time": seg["end_time"],
                    "text": seg["text"],
                }
            )
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report what would be embedded and the cost; no API calls")
    ap.add_argument("--embed-only", action="store_true", help="embed missing segments, do not write the index")
    ap.add_argument("--max-cost", type=float, default=0.50, help="refuse to embed if the estimate exceeds this (USD)")
    args = ap.parse_args()

    videos = json.loads((WEB_DATA / "videos.json").read_text(encoding="utf-8"))["videos"]
    valid_ids = {v["youtube_id"] for v in videos}
    print(f"Frontend catalog: {len(valid_ids)} videos")

    cache = EmbeddingCache()
    seeded = cache.seed_from_index()
    print(f"Embedding cache: {len(cache)} vectors ({seeded} seeded from the committed index)")

    rows = load_segments()
    missing: dict[str, str] = {}
    for r in rows:
        k = text_key(r["text"])
        if k not in cache:
            missing.setdefault(k, r["text"])
    tokens = count_tokens(list(missing.values()))
    cost = tokens / 1e6 * PRICE_PER_MTOK
    print(
        f"Segment files: {len({r['youtube_id'] for r in rows})} videos, {len(rows)} segments | "
        f"to embed: {len(missing)} ({tokens:,} tokens, ~${cost:.4f})"
    )
    if args.dry_run:
        return 0
    if cost > args.max_cost:
        print(f"Estimate ${cost:.4f} exceeds --max-cost ${args.max_cost:.2f}; aborting.")
        return 2
    if missing:
        load_env()
        used = embed_missing(cache, missing, os.environ["OPENAI_API_KEY"])
        print(f"API usage: {used:,} tokens = ${used / 1e6 * PRICE_PER_MTOK:.4f}")
    if args.embed_only:
        return 0

    out = [r for r in rows if r["youtube_id"] in valid_ids]
    matrix = np.stack([cache.get(text_key(r["text"])) for r in out]).astype("<f4") if out else np.zeros((0, DIM), "<f4")
    (WEB_DATA / "search-index.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    matrix.tofile(WEB_DATA / "search-index.f32")
    print(f"Index: {len(out)} segments across {len({r['youtube_id'] for r in out})} videos")
    for name in ("search-index.json", "search-index.f32"):
        print(f"Wrote {name} ({(WEB_DATA / name).stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
