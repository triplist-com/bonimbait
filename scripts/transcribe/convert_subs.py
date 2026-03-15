"""
Convert downloaded subtitle files to the unified transcript JSON format.

Reads raw subtitle files (VTT, SRT, or json3) from data/raw/subtitles/
and writes normalised transcripts to data/processed/transcripts/.
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
SUBS_DIR = DATA_DIR / "raw" / "subtitles"
TRANSCRIPT_DIR = DATA_DIR / "processed" / "transcripts"
STATUS_FILE = SUBS_DIR / "subtitle_status.json"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("convert_subs")


def _ensure_dirs() -> None:
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def _ts_to_seconds(ts: str) -> float:
    """Convert 'HH:MM:SS.mmm' or 'HH:MM:SS,mmm' to float seconds."""
    ts = ts.replace(",", ".")
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    if len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


def _parse_vtt(content: str) -> list[dict]:
    """Parse WebVTT content into segments."""
    segments: list[dict] = []
    # Match timestamp lines: 00:00:01.000 --> 00:00:05.000
    pattern = re.compile(
        r"(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})"
    )

    lines = content.split("\n")
    i = 0
    while i < len(lines):
        m = pattern.match(lines[i].strip())
        if m:
            start = _ts_to_seconds(m.group(1))
            end = _ts_to_seconds(m.group(2))
            i += 1
            text_lines = []
            while i < len(lines) and lines[i].strip():
                # Strip VTT positioning tags
                line = re.sub(r"<[^>]+>", "", lines[i].strip())
                if line:
                    text_lines.append(line)
                i += 1
            text = " ".join(text_lines).strip()
            if text:
                segments.append({"start": start, "end": end, "text": text})
        else:
            i += 1

    return segments


def _parse_srt(content: str) -> list[dict]:
    """Parse SRT content into segments."""
    segments: list[dict] = []
    blocks = re.split(r"\n\s*\n", content.strip())
    ts_pattern = re.compile(
        r"(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})"
    )

    for block in blocks:
        lines = block.strip().split("\n")
        for idx, line in enumerate(lines):
            m = ts_pattern.match(line.strip())
            if m:
                start = _ts_to_seconds(m.group(1))
                end = _ts_to_seconds(m.group(2))
                text = " ".join(l.strip() for l in lines[idx + 1:] if l.strip())
                text = re.sub(r"<[^>]+>", "", text)
                if text:
                    segments.append({"start": start, "end": end, "text": text})
                break

    return segments


def _parse_json3(data: dict | list) -> list[dict]:
    """Parse yt-dlp json3 subtitle format."""
    segments: list[dict] = []

    # json3 format: {"events": [{"tStartMs": ..., "dDurationMs": ..., "segs": [{"utf8": "..."}]}]}
    events = data if isinstance(data, list) else data.get("events", [])

    for event in events:
        if not isinstance(event, dict):
            continue
        start_ms = event.get("tStartMs", 0)
        duration_ms = event.get("dDurationMs", 0)
        segs = event.get("segs", [])
        text = "".join(s.get("utf8", "") for s in segs if isinstance(s, dict)).strip()
        # Skip empty or whitespace-only entries
        if not text or text == "\n":
            continue
        segments.append(
            {
                "start": start_ms / 1000.0,
                "end": (start_ms + duration_ms) / 1000.0,
                "text": text,
            }
        )

    return segments


def _convert_sub_file(sub_path: Path, source_label: str) -> dict | None:
    """Convert a single subtitle file to transcript format."""
    youtube_id = sub_path.stem

    try:
        raw = json.loads(sub_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.warning("Cannot read %s: %s", sub_path, exc)
        return None

    segments: list[dict] = []

    if isinstance(raw, dict) and "format" in raw and "content" in raw:
        # Wrapped VTT/SRT content
        fmt = raw["format"]
        content = raw["content"]
        if fmt == "vtt":
            segments = _parse_vtt(content)
        elif fmt == "srt":
            segments = _parse_srt(content)
        else:
            logger.warning("Unknown wrapped format '%s' in %s", fmt, sub_path)
            return None
    elif isinstance(raw, dict) and "events" in raw:
        segments = _parse_json3(raw)
    elif isinstance(raw, list):
        segments = _parse_json3(raw)
    else:
        # Try treating as json3
        segments = _parse_json3(raw)

    if not segments:
        logger.warning("No segments extracted from %s", sub_path)
        return None

    full_text = " ".join(s["text"] for s in segments)

    return {
        "youtube_id": youtube_id,
        "source": source_label,
        "language": "he",
        "segments": segments,
        "full_text": full_text,
    }


def convert_all_subs(*, resume: bool = True) -> int:
    """Convert all subtitle files. Returns count of successful conversions."""
    _ensure_dirs()

    # Load status to know which videos have subs
    if not STATUS_FILE.exists():
        logger.error("subtitle_status.json not found. Run download_subs first.")
        sys.exit(1)

    status: dict[str, str] = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    # Only convert videos that have subtitles
    to_convert = {vid: st for vid, st in status.items() if st in ("manual_he", "auto_he")}

    if resume:
        done = {p.stem for p in TRANSCRIPT_DIR.glob("*.json")}
        to_convert = {vid: st for vid, st in to_convert.items() if vid not in done}

    logger.info("Converting %d subtitle files to transcript format", len(to_convert))

    success = 0
    for vid, st in tqdm(to_convert.items(), desc="Converting subtitles", unit="file"):
        sub_path = SUBS_DIR / f"{vid}.json"
        if not sub_path.exists():
            logger.warning("Subtitle file missing for %s", vid)
            continue

        source_label = "subtitle_manual" if st == "manual_he" else "subtitle_auto"
        result = _convert_sub_file(sub_path, source_label)
        if result is not None:
            out_path = TRANSCRIPT_DIR / f"{vid}.json"
            out_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            success += 1

    logger.info("Conversion complete. Success: %d / %d", success, len(to_convert))
    return success


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Convert subtitle files to transcript format")
    parser.add_argument("--no-resume", action="store_true", help="Re-convert all subtitle files")
    args = parser.parse_args()

    convert_all_subs(resume=not args.no_resume)


if __name__ == "__main__":
    main()
