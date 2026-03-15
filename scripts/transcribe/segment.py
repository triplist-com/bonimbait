"""
Split transcripts into topic-based segments of ~2-5 minutes.

Reads from data/processed/transcripts/ and writes to data/processed/segments/.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
TRANSCRIPT_DIR = DATA_DIR / "processed" / "transcripts"
SEGMENT_DIR = DATA_DIR / "processed" / "segments"
ALL_SEGMENTS_FILE = SEGMENT_DIR / "all_segments.json"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MIN_SEGMENT_SECS = 120  # 2 minutes
MAX_SEGMENT_SECS = 300  # 5 minutes
TARGET_SEGMENT_SECS = 180  # 3 minutes — ideal midpoint

# Sentence-ending characters (including Hebrew)
SENTENCE_ENDS = {".", "!", "?", "׃", ":", "…"}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("segment")


def _ensure_dirs() -> None:
    SEGMENT_DIR.mkdir(parents=True, exist_ok=True)


def _is_sentence_end(text: str) -> bool:
    """Check if text ends at a sentence boundary."""
    stripped = text.rstrip()
    return bool(stripped) and stripped[-1] in SENTENCE_ENDS


def _find_pause_score(seg_a: dict, seg_b: dict) -> float:
    """
    Score how good a split point is between two consecutive transcript segments.
    Higher = better split point.
    """
    score = 0.0
    # Gap between segments (pause)
    gap = seg_b["start"] - seg_a["end"]
    score += min(gap, 5.0) * 2.0  # up to 10 points for pauses

    # Sentence boundary
    if _is_sentence_end(seg_a["text"]):
        score += 5.0

    return score


def segment_transcript(transcript: dict) -> list[dict]:
    """
    Split a transcript into logical chunks of ~2-5 minutes.

    Returns a list of segment dicts with start_time, end_time, text, segment_index.
    """
    src_segments = transcript.get("segments", [])
    if not src_segments:
        return []

    result_segments: list[dict] = []
    current_start_idx = 0
    segment_index = 0

    i = 0
    while i < len(src_segments):
        current_start_time = src_segments[current_start_idx]["start"]
        current_end_time = src_segments[i]["end"]
        elapsed = current_end_time - current_start_time

        # If we haven't reached minimum, keep accumulating
        if elapsed < MIN_SEGMENT_SECS:
            i += 1
            continue

        # Past max — force split at best point in recent range
        if elapsed >= MAX_SEGMENT_SECS or i == len(src_segments) - 1:
            # Find best split in the window [look_back .. i]
            look_back = max(current_start_idx + 1, i - 10)
            best_j = i
            best_score = -1.0

            for j in range(look_back, i + 1):
                if j + 1 < len(src_segments):
                    candidate_elapsed = src_segments[j]["end"] - current_start_time
                    if candidate_elapsed < MIN_SEGMENT_SECS:
                        continue
                    sc = _find_pause_score(src_segments[j], src_segments[j + 1])
                    if sc > best_score:
                        best_score = sc
                        best_j = j

            # Create segment
            chunk_texts = [
                src_segments[k]["text"]
                for k in range(current_start_idx, best_j + 1)
            ]
            result_segments.append(
                {
                    "segment_index": segment_index,
                    "start_time": src_segments[current_start_idx]["start"],
                    "end_time": src_segments[best_j]["end"],
                    "text": " ".join(chunk_texts),
                }
            )
            segment_index += 1
            current_start_idx = best_j + 1
            i = current_start_idx
            continue

        # Between min and max — look for a good split point
        if i + 1 < len(src_segments):
            score = _find_pause_score(src_segments[i], src_segments[i + 1])
            # Good enough split point?
            if score >= 5.0 or elapsed >= TARGET_SEGMENT_SECS:
                chunk_texts = [
                    src_segments[k]["text"]
                    for k in range(current_start_idx, i + 1)
                ]
                result_segments.append(
                    {
                        "segment_index": segment_index,
                        "start_time": src_segments[current_start_idx]["start"],
                        "end_time": src_segments[i]["end"],
                        "text": " ".join(chunk_texts),
                    }
                )
                segment_index += 1
                current_start_idx = i + 1
                i = current_start_idx
                continue

        i += 1

    # Flush remaining segments
    if current_start_idx < len(src_segments):
        chunk_texts = [
            src_segments[k]["text"]
            for k in range(current_start_idx, len(src_segments))
        ]
        # If the remainder is very short and we have previous segments, merge it
        remainder_duration = (
            src_segments[-1]["end"] - src_segments[current_start_idx]["start"]
        )
        if result_segments and remainder_duration < MIN_SEGMENT_SECS:
            # Merge into last segment
            last = result_segments[-1]
            last["end_time"] = src_segments[-1]["end"]
            last["text"] += " " + " ".join(chunk_texts)
        else:
            result_segments.append(
                {
                    "segment_index": segment_index,
                    "start_time": src_segments[current_start_idx]["start"],
                    "end_time": src_segments[-1]["end"],
                    "text": " ".join(chunk_texts),
                }
            )

    return result_segments


def segment_all(*, resume: bool = True) -> int:
    """Segment all transcripts. Returns count of segmented transcripts."""
    _ensure_dirs()

    transcript_files = sorted(TRANSCRIPT_DIR.glob("*.json"))
    if not transcript_files:
        logger.info("No transcripts found in %s", TRANSCRIPT_DIR)
        return 0

    if resume:
        done = {p.stem for p in SEGMENT_DIR.glob("*.json") if p.name != "all_segments.json"}
        transcript_files = [f for f in transcript_files if f.stem not in done]

    logger.info("Segmenting %d transcripts", len(transcript_files))

    all_segments: list[dict] = []
    success = 0

    for tf in tqdm(transcript_files, desc="Segmenting", unit="file"):
        try:
            transcript = json.loads(tf.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            logger.warning("Cannot read %s: %s", tf, exc)
            continue

        youtube_id = transcript.get("youtube_id", tf.stem)
        segments = segment_transcript(transcript)

        if not segments:
            logger.warning("No segments produced for %s", youtube_id)
            continue

        output = {
            "youtube_id": youtube_id,
            "source": transcript.get("source", "unknown"),
            "total_segments": len(segments),
            "segments": segments,
        }

        out_path = SEGMENT_DIR / f"{youtube_id}.json"
        out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

        # Add to combined list
        for seg in segments:
            all_segments.append(
                {
                    "youtube_id": youtube_id,
                    **seg,
                }
            )

        success += 1

    # If resume, merge with existing all_segments
    if resume and ALL_SEGMENTS_FILE.exists():
        try:
            existing = json.loads(ALL_SEGMENTS_FILE.read_text(encoding="utf-8"))
            # Remove entries for videos we just re-processed
            processed_ids = {tf.stem for tf in transcript_files}
            existing = [s for s in existing if s.get("youtube_id") not in processed_ids]
            all_segments = existing + all_segments
        except (json.JSONDecodeError, KeyError):
            pass

    ALL_SEGMENTS_FILE.write_text(
        json.dumps(all_segments, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    total_segs = len(all_segments)
    logger.info(
        "Segmentation complete. Transcripts processed: %d | Total segments: %d",
        success,
        total_segs,
    )
    return success


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Segment transcripts into topic chunks")
    parser.add_argument("--no-resume", action="store_true", help="Re-segment all transcripts")
    args = parser.parse_args()

    segment_all(resume=not args.no_resume)


if __name__ == "__main__":
    main()
