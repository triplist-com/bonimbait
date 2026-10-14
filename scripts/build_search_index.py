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

Row text is "<video title>\\n<segment text>" (like post chunks, which start with
the post title) and is what gets embedded: a 3-minute ASR window rarely names its
topic, the title does. --no-title-context writes the bare 2026-03 format.
Rows also carry "marks": [[char offset in the segment text (after the title
line), second], ...] about every 10 s, from the caption lines, so a matched
passage can be played at its own second (apps/web/lib/knowledge/moments.ts).

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
    row_text,
    text_key,
    video_titles,
)
from scripts.knowledge.paths import WEB_DATA, load_env, segments_dir, transcripts_dir  # noqa: E402


MARK_EVERY_SECONDS = 10


def segment_marks(lines: list[dict], seg: dict, every: float = MARK_EVERY_SECONDS) -> list[list[int]]:
    """[[char offset in the segment text, second], ...] about every `every` seconds.

    A segment's text is its caption lines joined by single spaces
    (scripts/transcribe/segment.py), so line offsets map characters back to the
    moment they were said. Returns [] when the lines don't reproduce the text.
    """
    text = seg["text"]
    first = next((i for i, ln in enumerate(lines) if ln["start"] == seg["start_time"]), None)
    if first is None:
        return []
    marks: list[list[int]] = []
    offset = 0
    last_t: float | None = None
    for ln in lines[first:]:
        if offset >= len(text):
            break
        piece = ln["text"]
        if text[offset : offset + len(piece)] != piece:
            return []
        if last_t is None or ln["start"] - last_t >= every:
            marks.append([offset, int(ln["start"])])
            last_t = ln["start"]
        offset += len(piece) + 1
    return marks if offset >= len(text) else []


def load_segments() -> list[dict]:
    """All segments of all videos, in file-name order, with caption-time marks."""
    rows: list[dict] = []
    for f in sorted(segments_dir().glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(d, list):  # all_segments.json (legacy combined file)
            continue
        yt = d.get("youtube_id") or f.stem
        tp = transcripts_dir() / f"{yt}.json"
        lines = json.loads(tp.read_text(encoding="utf-8")).get("segments", []) if tp.exists() else []
        for seg in d.get("segments", []):
            row = {
                "youtube_id": yt,
                "segment_index": seg["segment_index"],
                "start_time": seg["start_time"],
                "end_time": seg["end_time"],
                "text": seg["text"],
            }
            marks = segment_marks(lines, seg)
            if marks:
                row["marks"] = marks
            rows.append(row)
    return rows


def with_title(row: dict, titles: dict[str, str], title_context: bool) -> dict:
    """The stored (and embedded) row: "<video title>\\n<segment text>", like post chunks.

    The title carries the topic (a 3-minute ASR window often doesn't name it), which
    lifts both the cosine and the keyword match of the right video.
    """
    if not title_context:
        return row
    return {**row, "text": row_text(titles.get(row["youtube_id"]), row["text"])}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report what would be embedded and the cost; no API calls")
    ap.add_argument("--embed-only", action="store_true", help="embed missing segments, do not write the index")
    ap.add_argument("--max-cost", type=float, default=0.50, help="refuse to embed if the estimate exceeds this (USD)")
    ap.add_argument(
        "--no-title-context",
        dest="title_context",
        action="store_false",
        help="store and embed the bare segment text (the 2026-03 format) instead of 'title + text'",
    )
    ap.add_argument("--out-dir", default=str(WEB_DATA), help="where to write search-index.{json,f32}")
    args = ap.parse_args()

    videos = json.loads((WEB_DATA / "videos.json").read_text(encoding="utf-8"))["videos"]
    valid_ids = {v["youtube_id"] for v in videos}
    print(f"Frontend catalog: {len(valid_ids)} videos")
    titles = video_titles(videos)

    cache = EmbeddingCache()
    seeded = cache.seed_from_index()
    print(f"Embedding cache: {len(cache)} vectors ({seeded} seeded from the committed index)")

    rows = [with_title(r, titles, args.title_context) for r in load_segments()]
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
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "search-index.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    matrix.tofile(out_dir / "search-index.f32")
    print(f"Index: {len(out)} segments across {len({r['youtube_id'] for r in out})} videos (title context: {args.title_context})")
    for name in ("search-index.json", "search-index.f32"):
        print(f"Wrote {out_dir / name} ({(out_dir / name).stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
