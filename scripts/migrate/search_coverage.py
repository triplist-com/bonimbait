#!/usr/bin/env python
"""Analysis only (no paid API calls): AI-search coverage of legacy content.

1. Legacy /video/ pages whose YouTube ids are not in apps/web/data/search-index.json:
   do they have Hebrew subtitles (manual / auto) or would they need Whisper?
   Uses data/raw/subtitles/subtitle_status.json first, then yt-dlp metadata
   (extract_info, skip_download: no media is fetched). Concurrency 3.
2. Token count of the 804 posts (text-embedding-3-small uses cl100k_base).

Writes data/migration/search_coverage.json; docs/SEARCH_COVERAGE.md summarizes it.
"""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import REPO_ROOT, data_dir, main_checkout, migration_dir  # noqa: E402
from sanitize import html_to_text, sanitize_html  # noqa: E402

EMBED_PRICE_PER_M = 0.02      # text-embedding-3-small, USD / 1M tokens
WHISPER_PRICE_PER_MIN = 0.006  # whisper-1 API, USD / minute
MINI_TRANSCRIBE_PER_MIN = 0.003  # gpt-4o-mini-transcribe, USD / minute


def search_index_ids() -> set[str]:
    for root in (REPO_ROOT, main_checkout()):
        p = root / "apps" / "web" / "data" / "search-index.json"
        if p.exists():
            return {row["youtube_id"] for row in json.loads(p.read_text(encoding="utf-8"))}
    return set()


def ytdlp_probe(yid: str) -> dict:
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={yid}", download=False)
    except Exception as e:  # private / removed / age-gated
        return {"id": yid, "status": "unavailable", "error": str(e)[:160]}
    he = ("he", "iw", "iw-orig", "he-orig")
    manual = any(k in (info.get("subtitles") or {}) for k in he)
    auto = any(k in (info.get("automatic_captions") or {}) for k in he)
    return {"id": yid, "status": "manual_he" if manual else "auto_he" if auto else "none",
            "duration": info.get("duration") or 0, "title": info.get("title")}


def main() -> int:
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")

    indexed = search_index_ids()
    vids = json.loads((migration_dir() / "videos.json").read_text(encoding="utf-8"))["videos"]
    legacy = [v for v in vids if not any(y in indexed for y in (v.get("youtube_ids") or []))]
    # Primary id per page (the page's own video; one page lists 10 ids, one lists 2).
    ids = list(dict.fromkeys(v.get("youtube_id") or (v.get("youtube_ids") or [None])[0] for v in legacy))
    ids = [i for i in ids if i]

    status_file = data_dir() / "raw" / "subtitles" / "subtitle_status.json"
    known = json.loads(status_file.read_text()) if status_file.exists() else {}
    meta_dir = data_dir() / "raw" / "metadata"
    results: dict[str, dict] = {}
    to_probe = []
    for i in ids:
        if i in known:
            m = meta_dir / f"{i}.json"
            dur = json.loads(m.read_text()).get("duration", 0) if m.exists() else 0
            results[i] = {"id": i, "status": known[i], "duration": dur, "source": "subtitle_status.json"}
        else:
            to_probe.append(i)
    print(f"legacy pages not in index: {len(legacy)}; unique ids: {len(ids)}; "
          f"known locally: {len(results)}; probing yt-dlp: {len(to_probe)}", flush=True)
    with ThreadPoolExecutor(max_workers=3) as ex:
        for r in ex.map(ytdlp_probe, to_probe):
            r["source"] = "yt-dlp"
            results[r["id"]] = r

    by = {}
    for r in results.values():
        b = by.setdefault(r["status"], {"videos": 0, "minutes": 0.0})
        b["videos"] += 1
        b["minutes"] += (r.get("duration") or 0) / 60
    need_whisper_min = sum(b["minutes"] for k, b in by.items() if k == "none")

    # Tokens per spoken minute, measured on our existing transcripts.
    tdir = data_dir() / "processed" / "transcripts"
    tok = mins = 0.0
    for f in list(tdir.glob("*.json"))[:60]:
        d = json.loads(f.read_text(encoding="utf-8"))
        m = meta_dir / f"{d['youtube_id']}.json"
        if not m.exists():
            continue
        dur = json.loads(m.read_text()).get("duration") or 0
        if dur:
            tok += len(enc.encode(d.get("full_text") or ""))
            mins += dur / 60
    tok_per_min = tok / mins if mins else 0
    video_minutes = sum(b["minutes"] for k, b in by.items() if k != "unavailable")
    video_tokens = video_minutes * tok_per_min

    # Posts: tokens of the sanitized text (what we'd embed), plus title.
    posts = json.loads((migration_dir() / "posts.json").read_text(encoding="utf-8"))
    post_tokens = []
    chars = 0
    for p in posts:
        text = html_to_text(p["title"]) + "\n" + html_to_text(sanitize_html(p.get("content_html")))
        chars += len(text)
        post_tokens.append(len(enc.encode(text)))
    total_post_tokens = sum(post_tokens)

    out = {
        "legacy_pages_not_indexed": len(legacy),
        "unique_youtube_ids": len(ids),
        "subtitle_status": {k: {"videos": v["videos"], "minutes": round(v["minutes"], 1)} for k, v in by.items()},
        "whisper_minutes_needed": round(need_whisper_min, 1),
        "whisper_cost_usd": round(need_whisper_min * WHISPER_PRICE_PER_MIN, 2),
        "mini_transcribe_cost_usd": round(need_whisper_min * MINI_TRANSCRIBE_PER_MIN, 2),
        "transcript_tokens_per_minute": round(tok_per_min, 1),
        "video_transcript_tokens_est": int(video_tokens),
        "video_embedding_cost_usd": round(video_tokens / 1e6 * EMBED_PRICE_PER_M, 4),
        "posts": {
            "count": len(posts), "tokens": total_post_tokens, "chars": chars,
            "chars_div_4": chars // 4,
            "avg_tokens": round(total_post_tokens / len(posts)),
            "max_tokens": max(post_tokens),
            "posts_over_8191_tokens": sum(1 for t in post_tokens if t > 8191),
            "embedding_cost_usd": round(total_post_tokens / 1e6 * EMBED_PRICE_PER_M, 4),
            "embedding_cost_usd_with_20pct_chunk_overlap": round(total_post_tokens * 1.2 / 1e6 * EMBED_PRICE_PER_M, 4),
        },
        "unavailable": [r for r in results.values() if r["status"] == "unavailable"],
        "per_video": sorted(results.values(), key=lambda r: r["id"]),
    }
    (migration_dir() / "search_coverage.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k not in ("per_video",)}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
