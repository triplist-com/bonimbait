#!/usr/bin/env python3
"""
Export processed data as a single optimized JSON file for the Next.js frontend.

Reads:
  - data/raw/metadata/channel_videos.json  (200 videos)
  - data/processed/summaries/{youtube_id}.json  (125 AI summaries)
  - data/processed/transcripts/  (presence check only)
  - data/processed/segments/  (count only)

Writes:
  - apps/web/data/videos.json
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

# Resolve project root (parent of scripts/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

METADATA_FILE = PROJECT_ROOT / "data" / "raw" / "metadata" / "channel_videos.json"
SUMMARIES_DIR = PROJECT_ROOT / "data" / "processed" / "summaries"
TRANSCRIPTS_DIR = PROJECT_ROOT / "data" / "processed" / "transcripts"
SEGMENTS_DIR = PROJECT_ROOT / "data" / "processed" / "segments"
OUTPUT_FILE = PROJECT_ROOT / "apps" / "web" / "data" / "videos.json"

# ---- Category definitions ----
# Map slug -> Hebrew name + description.
# Some summaries already have category_slug; for those without, we auto-assign.
CATEGORY_DEFS = {
    "structure-construction": {
        "name_he": "שלד ובנייה",
        "description_he": "כל מה שצריך לדעת על שלד הבניין, יסודות, בטון ועבודות בנייה",
    },
    "planning-permits": {
        "name_he": "תכנון ורישוי",
        "description_he": "מידע על תהליכי תכנון, היתרי בנייה ורישוי",
    },
    "costs-pricing": {
        "name_he": "עלויות ומחירים",
        "description_he": "פירוט עלויות בנייה, מחירונים והשוואות",
    },
    "electrical-plumbing": {
        "name_he": "חשמל ואינסטלציה",
        "description_he": "מדריכים לחשמל, אינסטלציה ותשתיות",
    },
    "finishes-design": {
        "name_he": "גמרים ועיצוב",
        "description_he": "ריצוף, חיפוי, צבע ועיצוב פנים",
    },
    "contractors-labor": {
        "name_he": "קבלנים ועבודה",
        "description_he": "בחירת קבלנים, חוזים ופיקוח",
    },
    "landscaping-yard": {
        "name_he": "חצר ופיתוח",
        "description_he": "גינון, פיתוח חוץ, בריכות וגדרות",
    },
    "general-tips": {
        "name_he": "טיפים כלליים",
        "description_he": "טיפים ועצות כלליות לבונים ומשפצים",
    },
}

# Keywords for auto-categorisation when summary lacks category_slug
CATEGORY_KEYWORDS = {
    "structure-construction": ["שלד", "בטון", "יסוד", "יציק", "טפסנ", "ברזל", "עמוד", "קורה", "תקרה", "בלוק", "ICF", "בנייה", "חפירה"],
    "planning-permits": ["תכנון", "היתר", "רישוי", "אדריכל", "תב\"ע", "ועדה", "מהנדס"],
    "costs-pricing": ["עלות", "מחיר", "תקציב", "כמה עולה", "עוגת", "₪"],
    "electrical-plumbing": ["חשמל", "אינסטלציה", "צנרת", "מיזוג", "חימום"],
    "finishes-design": ["ריצוף", "טיח", "צבע", "חיפוי", "גמר", "שיש", "אריח", "קרמיקה", "פרקט"],
    "contractors-labor": ["קבלן", "חוזה", "פיקוח", "מפקח", "בעל מקצוע"],
    "landscaping-yard": ["חצר", "גינה", "גדר", "פרגולה", "בריכה", "פיתוח"],
    "general-tips": ["טיפ", "עצה", "טעות", "מדריך"],
}


def guess_category(title: str, description: str, summary_text: str) -> str:
    """Guess a category slug from text content using keyword matching."""
    combined = f"{title} {description} {summary_text}".lower()
    scores = {}
    for slug, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in combined)
        if score > 0:
            scores[slug] = score
    if scores:
        return max(scores, key=scores.get)
    return "general-tips"


def parse_upload_date(date_str: str) -> str:
    """Convert YYYYMMDD to ISO date string."""
    try:
        dt = datetime.strptime(date_str, "%Y%m%d")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return date_str


def main():
    # Load metadata
    print(f"Reading metadata from {METADATA_FILE}")
    with open(METADATA_FILE) as f:
        all_videos = json.load(f)
    print(f"  Found {len(all_videos)} videos")

    # Load summaries
    summaries = {}
    if SUMMARIES_DIR.exists():
        for fname in SUMMARIES_DIR.iterdir():
            if fname.suffix != ".json" or fname.name == ".gitkeep":
                continue
            try:
                with open(fname) as f:
                    data = json.load(f)
                yt_id = fname.stem
                summaries[yt_id] = data
            except Exception as e:
                print(f"  Warning: could not read {fname.name}: {e}")
    print(f"  Loaded {len(summaries)} summaries")

    # Check transcript existence
    transcript_ids = set()
    if TRANSCRIPTS_DIR.exists():
        for fname in TRANSCRIPTS_DIR.iterdir():
            if fname.suffix == ".json" and fname.name != ".gitkeep":
                transcript_ids.add(fname.stem)
    print(f"  Found {len(transcript_ids)} transcripts")

    # Count segments per video
    segment_counts = {}
    if SEGMENTS_DIR.exists():
        for fname in SEGMENTS_DIR.iterdir():
            if fname.suffix != ".json" or fname.name == ".gitkeep":
                continue
            try:
                with open(fname) as f:
                    data = json.load(f)
                yt_id = fname.stem
                segs = data.get("segments", [])
                segment_counts[yt_id] = len(segs)
            except Exception:
                pass
    print(f"  Found segments for {len(segment_counts)} videos")

    # Build video records
    videos = []
    category_video_counts = {}

    for v in all_videos:
        yt_id = v["youtube_id"]
        summary = summaries.get(yt_id, {})

        # Determine category
        cat_slug = summary.get("category_slug", "")
        if not cat_slug:
            cat_slug = guess_category(
                v.get("title", ""),
                v.get("description", ""),
                summary.get("title_summary", ""),
            )

        # Ensure category exists in definitions
        if cat_slug not in CATEGORY_DEFS:
            cat_slug = "general-tips"

        cat_info = CATEGORY_DEFS[cat_slug]
        category_video_counts[cat_slug] = category_video_counts.get(cat_slug, 0) + 1

        # Parse costs into simpler format
        costs = []
        for c in summary.get("costs", []):
            if isinstance(c, dict):
                costs.append({
                    "item": c.get("item", ""),
                    "price": c.get("price", ""),
                    "unit": c.get("unit", ""),
                    "context": c.get("context", ""),
                })
            elif isinstance(c, str):
                costs.append({"item": c, "price": "", "unit": "", "context": ""})

        # Key points as strings
        key_points = []
        for kp in summary.get("key_points", []):
            if isinstance(kp, str):
                key_points.append(kp)
            elif isinstance(kp, dict):
                key_points.append(kp.get("text", str(kp)))

        video_record = {
            "id": yt_id,
            "youtube_id": yt_id,
            "title": v.get("title", ""),
            "description": (v.get("description", "") or "")[:300],  # truncate
            "duration_seconds": v.get("duration", 0),
            "thumbnail_url": f"https://img.youtube.com/vi/{yt_id}/mqdefault.jpg",
            "published_at": parse_upload_date(v.get("upload_date", "")),
            "view_count": v.get("view_count", 0),
            "category_slug": cat_slug,
            "category_name_he": cat_info["name_he"],
            "summary": summary.get("title_summary", ""),
            "key_points": key_points,
            "costs": costs,
            "tips": summary.get("tips", []),
            "rules": summary.get("rules", []),
            "warnings": summary.get("warnings", []),
            "materials": summary.get("materials", []),
            "difficulty_level": summary.get("difficulty_level", ""),
            "has_transcript": yt_id in transcript_ids,
            "segment_count": segment_counts.get(yt_id, 0),
        }
        videos.append(video_record)

    # Sort by published_at descending (newest first)
    videos.sort(key=lambda x: x["published_at"], reverse=True)

    # Build categories array
    categories = []
    for slug, info in CATEGORY_DEFS.items():
        count = category_video_counts.get(slug, 0)
        if count > 0:
            categories.append({
                "slug": slug,
                "name_he": info["name_he"],
                "description_he": info["description_he"],
                "video_count": count,
            })
    # Sort categories by video count descending
    categories.sort(key=lambda x: x["video_count"], reverse=True)

    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_videos": len(videos),
        "categories": categories,
        "videos": videos,
    }

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=None, separators=(",", ":"))

    file_size = OUTPUT_FILE.stat().st_size
    print(f"\nWrote {OUTPUT_FILE}")
    print(f"  {len(videos)} videos, {len(categories)} categories")
    print(f"  File size: {file_size / 1024:.1f} KB ({file_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
