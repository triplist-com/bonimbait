"""Add newly indexed videos to apps/web/data/videos.json (the frontend catalog).

videos.json is the source of truth for /video/<youtube-id>/ pages, the video
grid, category pages and AI-answer citations. Existing records are kept as they
are; this script

  * appends a record for every video that has segments but no record yet,
  * appends a title-level record (has_transcript: false) for every long-form
    video without captions, so it is findable, listed and offered as a related
    video, without moments,
  * refreshes has_transcript / segment_count on existing records that gained
    segments, and adds chapters to any record whose metadata has them,
  * merges AI summaries from data/processed/ai_summaries/<id>.json when present,
  * recounts the categories.

New records:
  title, duration, date, views     data/raw/metadata/<id>.json (yt-dlp, Hebrew)
  description                      the description minus the channel's CTA template
  chapters                         yt-dlp chapters, else "0:00 title" description lines
  thumbnail_url                    i.ytimg.com maxresdefault.jpg (hqdefault.jpg when absent)
  category                         topical playlist -> title keywords -> nearest
                                   category centroid of segment embeddings (free)
  summary                          AI summary if generated, else the cleaned description
  kind                             video | podcast | live (channel inventory)

Run after build_search_index.py --embed-only (the centroids need the vectors):
  scripts/.venv/bin/python -m scripts.knowledge.build_catalog --base 095a3d5 [--dry-run]   (095a3d5: the 2026-03 catalog of 200)
"""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import Counter
from datetime import datetime, timezone

import numpy as np

from scripts.knowledge.catalog import (
    CATEGORY_NAMES,
    boilerplate_lines,
    candidate_categories,
    chapters_for,
    clean_description,
    rule_category,
    summary_from_description,
    title_row_text,
)
from scripts.knowledge.embeddings import EmbeddingCache, row_text, text_key, uncaptioned_videos, unit, video_titles
from scripts.knowledge.paths import (
    MIN_INDEX_SECONDS,
    REPO_ROOT,
    WEB_DATA,
    inventory_path,
    metadata_dir,
    processed_dir,
    segments_dir,
)

AI_SUMMARY_DIR = processed_dir() / "ai_summaries"
REPORT_PATH = processed_dir() / "catalog_report.json"
# Below this cosine to the nearest centroid a video is filed under general tips.
MIN_CENTROID_COS = 0.30


def iso_date(yyyymmdd: str | None) -> str:
    if yyyymmdd and len(yyyymmdd) == 8 and yyyymmdd.isdigit():
        return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}"
    return yyyymmdd or ""


def thumbnail(vid: str, meta_thumb: str | None) -> str:
    # next.config allows i.ytimg.com/vi/** (not /vi_webp/), so always use the jpg path.
    size = "maxresdefault" if meta_thumb and "maxresdefault" in meta_thumb else "hqdefault"
    return f"https://i.ytimg.com/vi/{vid}/{size}.jpg"


def load_segments() -> dict[str, list[dict]]:
    out = {}
    for f in segments_dir().glob("*.json"):
        d = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(d, dict) and d.get("segments"):
            out[d.get("youtube_id") or f.stem] = d["segments"]
    return out


def video_vectors(segments: dict[str, list[dict]], cache: EmbeddingCache, titles: dict[str, str]) -> dict[str, np.ndarray]:
    """Unit mean of each video's segment vectors (videos with any cached segment).

    Uses the index row text ("title + segment", see build_search_index.py); falls back
    to bare-text vectors for videos embedded the 2026-03 way.
    """
    out = {}
    for vid, segs in segments.items():
        keys = [text_key(row_text(titles.get(vid), s["text"])) for s in segs]
        if not any(k in cache for k in keys):
            keys = [text_key(s["text"]) for s in segs]
        vecs = [cache.get(k) for k in keys if k in cache]
        if vecs:
            out[vid] = unit(np.mean(np.stack(vecs), axis=0))
    return out


def assign_categories(candidates: dict[str, dict], all_rows: dict[str, dict], vectors: dict[str, np.ndarray]) -> dict[str, dict]:
    """{id: {category, rule, cos}} for the candidates.

    Seeds are every video (old or new) that a playlist/title rule labels; their
    unit-mean vectors give one centroid per category. Rule labels win; the rest
    go to the nearest centroid.
    """
    seeds: dict[str, list[np.ndarray]] = {}
    for vid, row in all_rows.items():
        cat, _ = rule_category(row.get("title") or "", row.get("playlists") or [])
        if cat and vid in vectors:
            seeds.setdefault(cat, []).append(vectors[vid])
    centroids = {cat: unit(np.mean(np.stack(v), axis=0)) for cat, v in seeds.items()}
    names = sorted(centroids)
    matrix = np.stack([centroids[c] for c in names]) if names else None

    out = {}
    for vid, row in candidates.items():
        title = row.get("title") or ""
        cat, rule = rule_category(title, row.get("playlists") or [])
        cos = None
        if not cat and matrix is not None and vid in vectors:
            # Nearest centroid among the categories the title is torn between (else all).
            # With title evidence the best of the tied categories wins outright; without
            # it, a video far from every centroid is filed under general tips.
            candidates = candidate_categories(title)
            tied = candidates != set(CATEGORY_NAMES)
            allowed = [i for i, c in enumerate(names) if c in candidates] or list(range(len(names)))
            sims = matrix[allowed] @ vectors[vid]
            best = allowed[int(np.argmax(sims))]
            cos = float(sims.max())
            cat, rule = (names[best], "centroid") if tied or cos >= MIN_CENTROID_COS else ("general-tips", "fallback")
        out[vid] = {"category": cat or "general-tips", "rule": rule or "fallback", "cos": cos}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Add newly indexed videos to videos.json")
    ap.add_argument("--dry-run", action="store_true", help="report, write nothing")
    ap.add_argument(
        "--base",
        default="",
        help="start from videos.json at this git revision (e.g. feature/platform) instead of the working file, "
        "so a rebuild re-decides every added record",
    )
    args = ap.parse_args()

    catalog_path = WEB_DATA / "videos.json"
    if args.base:
        raw = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "show", f"{args.base}:apps/web/data/videos.json"],
            capture_output=True,
            check=True,
        ).stdout
        catalog = json.loads(raw)
    else:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    records = catalog["videos"]
    by_id = {v["youtube_id"]: v for v in records}

    inventory = {r["id"]: r for r in json.loads(inventory_path().read_text(encoding="utf-8"))["videos"]}
    segments = load_segments()
    uncaptioned = uncaptioned_videos(set(segments))
    metas = dict(uncaptioned)
    for vid in set(segments) | set(by_id):
        p = metadata_dir() / f"{vid}.json"
        if p.exists():
            metas[vid] = json.loads(p.read_text(encoding="utf-8"))
    boilerplate = boilerplate_lines(m.get("description") or "" for m in metas.values())

    new_ids = sorted(
        vid
        for vid in segments
        if vid not in by_id
        and vid in metas
        and (metas[vid].get("duration") or 0) >= MIN_INDEX_SECONDS
        # Shorts, unavailable videos and unlisted copies a public video replaces stay out.
        and inventory.get(vid, {}).get("index_scope", True)
    )
    # Videos without captions: title-level records (findable, related videos; no moments).
    title_only_ids = sorted(vid for vid in uncaptioned if vid not in by_id)
    print(
        f"catalog: {len(records)} records | segment files: {len(segments)} | "
        f"new with transcript: {len(new_ids)} | new title-only: {len(title_only_ids)}"
    )

    cache = EmbeddingCache()
    titles = video_titles(records)
    vectors = video_vectors(segments, cache, titles)
    for vid, meta in uncaptioned.items():  # title-level rows (build_search_index.py)
        key = text_key(title_row_text(titles.get(vid) or meta["title"], chapters_for(meta)))
        if key in cache:
            vectors[vid] = unit(cache.get(key))
    rows_for_rules = {
        vid: {"title": (metas.get(vid) or {}).get("title") or inv.get("title"), "playlists": inv.get("playlists", [])}
        for vid, inv in inventory.items()
    }
    candidates = new_ids + title_only_ids
    categories = assign_categories(
        {vid: rows_for_rules.get(vid, {"title": metas[vid].get("title")}) for vid in candidates}, rows_for_rules, vectors
    )
    missing_vec = [vid for vid in candidates if vid not in vectors]
    if missing_vec:
        print(f"warning: {len(missing_vec)} new videos have no cached vectors (run build_search_index.py --embed-only)")

    added, updated = [], []
    for vid in candidates:
        m = metas[vid]
        inv = inventory.get(vid, {})
        cleaned = clean_description(m.get("description") or "", boilerplate)
        chapters = chapters_for(m)
        cat = categories[vid]["category"]
        transcribed = vid in segments
        record = {
            "id": vid,
            "youtube_id": vid,
            "title": (m.get("title") or inv.get("title") or "").strip(),
            "description": cleaned[:1000],
            "duration_seconds": int(m.get("duration") or 0),
            "thumbnail_url": thumbnail(vid, m.get("thumbnail_url")),
            "published_at": iso_date(m.get("upload_date")),
            "view_count": int(m.get("view_count") or 0),
            "category_slug": cat,
            "category_name_he": CATEGORY_NAMES[cat],
            "summary": summary_from_description(cleaned),
            "key_points": [],
            "costs": [],
            "tips": [],
            "rules": [],
            "warnings": [],
            "materials": [],
            "difficulty_level": "",
            "has_transcript": transcribed,
            "segment_count": len(segments[vid]) if transcribed else 0,
            "kind": inv.get("type") if inv.get("type") in ("video", "podcast", "live") else "video",
        }
        if record["summary"]:
            record["summary_source"] = "description"
        if chapters:
            record["chapters"] = chapters
        records.append(record)
        by_id[vid] = record
        added.append(vid)

    for vid, rec in by_id.items():
        if vid in added:
            continue
        changed = False
        if vid in segments and (not rec.get("has_transcript") or rec.get("segment_count") != len(segments[vid])):
            rec["has_transcript"] = True
            rec["segment_count"] = len(segments[vid])
            changed = True
        m = metas.get(vid) or {}
        chapters = chapters_for(m)
        if chapters and not rec.get("chapters"):
            rec["chapters"] = chapters
            changed = True
        if changed:
            updated.append(vid)

    # AI summaries (scripts/knowledge/summarize.py) replace empty or description-derived
    # summaries only; the 2026-03 pipeline's summaries (no summary_source) are kept.
    merged = 0
    for vid, rec in by_id.items():
        p = AI_SUMMARY_DIR / f"{vid}.json"
        if not p.exists():
            continue
        ai = json.loads(p.read_text(encoding="utf-8"))
        if rec.get("summary_source") in ("ai", "description") or not rec.get("summary"):
            rec["summary"] = ai.get("summary") or rec.get("summary", "")
            rec["key_points"] = ai.get("key_points") or rec.get("key_points", [])
            if ai.get("key_point_times"):
                rec["key_point_times"] = ai["key_point_times"]
            for field in ("tips", "warnings"):
                if ai.get(field) and not rec.get(field):
                    rec[field] = ai[field]
            if ai.get("costs") and not rec.get("costs"):
                rec["costs"] = ai["costs"]
            rec["summary_source"] = "ai"
            merged += 1

    records.sort(key=lambda v: v.get("published_at") or "", reverse=True)
    counts = Counter(v["category_slug"] for v in records)
    for c in catalog["categories"]:
        c["video_count"] = counts.get(c["slug"], 0)
    known = {c["slug"] for c in catalog["categories"]}
    for slug, n in counts.items():
        if slug not in known:
            catalog["categories"].append({"slug": slug, "name_he": CATEGORY_NAMES[slug], "description_he": "", "video_count": n})
    catalog["total_videos"] = len(records)
    catalog["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    rule_counts = Counter(categories[v]["rule"] for v in added)
    cat_counts = Counter(categories[v]["category"] for v in added)
    report = {
        "added": len(added),
        "added_title_only": sum(1 for v in added if not by_id[v]["has_transcript"]),
        "updated": len(updated),
        "ai_summaries_merged": merged,
        "category_rule": dict(rule_counts),
        "new_by_category": dict(cat_counts),
        "with_chapters": sum(1 for v in records if v.get("chapters")),
        "new_with_description_summary": sum(1 for v in added if by_id[v]["summary"] and by_id[v].get("summary_source") != "ai"),
        "decisions": {v: categories[v] for v in added},
    }
    print(json.dumps({k: v for k, v in report.items() if k != "decisions"}, ensure_ascii=False, indent=1))
    if args.dry_run:
        return 0
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {catalog_path} ({catalog_path.stat().st_size / 1e6:.2f} MB, {len(records)} videos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
