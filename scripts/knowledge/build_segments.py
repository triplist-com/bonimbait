"""Turn fetched captions into transcripts and search segments.

For every video with status manual_he / auto_he in data/raw/captions_status.json:
  data/raw/subtitles/<id>.json (json3)
    -> data/processed/transcripts/<id>.json   (scripts/transcribe/convert_subs.py)
    -> data/processed/segments/<id>.json      (scripts/transcribe/segment.py)

The parsing and segmentation are the existing pipeline's own functions, so the
new segments have the same format and parameters as the first 178 videos
(2-5 minute windows, 3 minute target, split on pauses and sentence ends).
Existing segment files are left alone unless --force is given.

Usage:
  scripts/.venv/bin/python -m scripts.knowledge.build_segments [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter

from scripts.knowledge.paths import (
    REPO_ROOT,
    captions_status_path,
    segments_dir,
    subtitles_dir,
    transcripts_dir,
)

sys.path.insert(0, str(REPO_ROOT / "scripts" / "transcribe"))
from convert_subs import _convert_sub_file  # noqa: E402
from segment import segment_transcript  # noqa: E402

SOURCE_LABELS = {"manual_he": "subtitle_manual", "auto_he": "subtitle_auto"}
# A caption track this short is a stub (music only, a few words), not a talk.
MIN_TRANSCRIPT_CHARS = 200


def build(force: bool = False) -> Counter:
    status = json.loads(captions_status_path().read_text(encoding="utf-8"))
    transcripts_dir().mkdir(parents=True, exist_ok=True)
    segments_dir().mkdir(parents=True, exist_ok=True)
    counts: Counter = Counter()
    for vid, st in sorted(status.items()):
        label = SOURCE_LABELS.get(st.get("status", ""))
        if not label:
            continue
        seg_path = segments_dir() / f"{vid}.json"
        if seg_path.exists() and not force:
            counts["kept"] += 1
            continue
        sub_path = subtitles_dir() / f"{vid}.json"
        if not sub_path.exists():
            counts["missing_subtitles"] += 1
            continue
        transcript = _convert_sub_file(sub_path, label)
        if transcript is None or len(transcript["full_text"]) < MIN_TRANSCRIPT_CHARS:
            counts["too_short"] += 1
            continue
        segments = segment_transcript(transcript)
        if not segments:
            counts["no_segments"] += 1
            continue
        (transcripts_dir() / f"{vid}.json").write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
        seg_path.write_text(
            json.dumps(
                {"youtube_id": vid, "source": label, "total_segments": len(segments), "segments": segments},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        counts["written"] += 1
        counts["segments"] += len(segments)
    return counts


def main() -> int:
    ap = argparse.ArgumentParser(description="Captions -> transcripts -> segments")
    ap.add_argument("--force", action="store_true", help="rebuild segment files that already exist")
    args = ap.parse_args()
    counts = build(force=args.force)
    print(dict(counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
