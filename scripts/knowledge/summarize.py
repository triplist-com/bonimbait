"""AI summaries + key moments for the most important new videos (Message Batches API).

Selects catalog videos that have a transcript but no AI summary - the newest
and the most viewed, up to --limit - and asks Claude Haiku 5.5 (the cheapest
current model) for a short Hebrew summary, 4-6 key points with the second they
are discussed, and any prices, tips and warnings stated in the video. Output is
schema-constrained JSON (structured outputs), one file per video in
data/processed/ai_summaries/<id>.json; build_catalog.py merges them into
videos.json. The batch runs at 50% of the standard price.

  scripts/.venv/bin/python -m scripts.knowledge.summarize --dry-run    # estimate only
  scripts/.venv/bin/python -m scripts.knowledge.summarize --limit 100 --max-cost 0.40
  scripts/.venv/bin/python -m scripts.knowledge.summarize --collect <batch id>
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

from scripts.knowledge.paths import WEB_DATA, load_env, processed_dir, transcripts_dir

MODEL = "claude-haiku-5-5"
# Batch rates for prompts <= 100K tokens: 50% of $0.10 / $0.50 per MTok.
BATCH_INPUT_PER_MTOK = 0.05
BATCH_OUTPUT_PER_MTOK = 0.25
MAX_TOKENS = 4000  # thinking (low effort) + the JSON answer
MAX_TRANSCRIPT_CHARS = 60_000  # keeps every prompt well under the 100K-token rate card
MARKER_EVERY_SECONDS = 60
OUT_DIR = processed_dir() / "ai_summaries"
BATCH_LOG = processed_dir() / "ai_summary_batches.json"

SYSTEM = """You write the summary block of a video page on bonimbait.com, the knowledge base of "בונים בית", Tomer Chen Rihana's YouTube channel about building a private home in Israel.

You get the video title, its chapters when it has them, and its transcript with [mm:ss] time markers. The transcript is automatic speech recognition: words are often misheard, so infer the intended construction terms from context. Use only facts stated in the transcript; never add numbers, prices, rules or names that are not there.

Write in natural, fluent Israeli Hebrew, the way the host explains things to builders. When giving advice, address the reader in the plural ("בדקו", "שימו לב").

Fields:
- summary: 2-3 sentences, at most 320 characters: what the video covers and the main takeaway for someone building a private home. Do not open with "בסרטון", "הסרטון" or "בפרק".
- key_points: 4 to 6 concrete takeaways in the order they come up, each at most 140 characters, each with "t": the second (from the nearest [mm:ss] marker before it) where it is discussed.
- costs: only prices said explicitly in the video: item, price exactly as stated (with ₪ or ש"ח), unit, short context. Empty when no price is stated.
- tips: up to 3 practical tips stated in the video. Empty when none.
- warnings: up to 3 warnings or common mistakes stated in the video. Empty when none."""

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "key_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"text": {"type": "string"}, "t": {"type": "integer"}},
                "required": ["text", "t"],
                "additionalProperties": False,
            },
        },
        "costs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item": {"type": "string"},
                    "price": {"type": "string"},
                    "unit": {"type": "string"},
                    "context": {"type": "string"},
                },
                "required": ["item", "price", "unit", "context"],
                "additionalProperties": False,
            },
        },
        "tips": {"type": "array", "items": {"type": "string"}},
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "key_points", "costs", "tips", "warnings"],
    "additionalProperties": False,
}


def mmss(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def transcript_with_markers(lines: list[dict], every: int = MARKER_EVERY_SECONDS, max_chars: int = MAX_TRANSCRIPT_CHARS) -> str:
    """Join caption lines, starting a "[mm:ss]" paragraph about every `every` seconds."""
    parts: list[str] = []
    next_marker = 0.0
    size = 0
    for ln in lines:
        text = (ln.get("text") or "").replace("\n", " ").strip()
        if not text:
            continue
        piece = text
        if ln["start"] >= next_marker:
            piece = f"\n[{mmss(ln['start'])}] {text}"
            next_marker = ln["start"] + every
        if size + len(piece) > max_chars:
            break
        parts.append(piece)
        size += len(piece) + 1
    return " ".join(parts).strip()


def user_prompt(video: dict, transcript: str) -> str:
    chapters = video.get("chapters") or []
    chapter_text = "\n".join(f"[{mmss(c['start_time'])}] {c['title']}" for c in chapters)
    return (
        f"Title: {video['title']}\n"
        + (f"\nChapters:\n{chapter_text}\n" if chapter_text else "")
        + f"\nTranscript:\n{transcript}"
    )


def select(videos: list[dict], limit: int, have: set[str]) -> list[dict]:
    """Newest half + most viewed half of the transcribed videos without an AI summary."""
    pool = [
        v
        for v in videos
        if v.get("has_transcript")
        and v["youtube_id"] not in have
        and v.get("summary_source") != "ai"
        and not v.get("key_points")
    ]
    newest = sorted(pool, key=lambda v: v.get("published_at") or "", reverse=True)
    popular = sorted(pool, key=lambda v: v.get("view_count") or 0, reverse=True)
    picked: dict[str, dict] = {}
    for v in newest[: limit // 2]:
        picked[v["youtube_id"]] = v
    for v in popular:
        if len(picked) >= limit:
            break
        picked.setdefault(v["youtube_id"], v)
    return list(picked.values())


def to_record(data: dict, duration: int) -> dict:
    """Validate model JSON into the catalog fields (times clamped into the video)."""
    points = [p for p in data.get("key_points", []) if (p.get("text") or "").strip()][:6]
    times = [int(p["t"]) if isinstance(p.get("t"), int) and 0 <= p["t"] < max(duration, 1) else None for p in points]
    return {
        "summary": (data.get("summary") or "").strip(),
        "key_points": [p["text"].strip() for p in points],
        "key_point_times": times,
        "costs": [c for c in data.get("costs", []) if c.get("item") and c.get("price")][:8],
        "tips": [t.strip() for t in data.get("tips", []) if t.strip()][:3],
        "warnings": [w.strip() for w in data.get("warnings", []) if w.strip()][:3],
    }


def build_requests(chosen: list[dict]) -> list[dict]:
    reqs = []
    for v in chosen:
        tp = transcripts_dir() / f"{v['youtube_id']}.json"
        if not tp.exists():
            continue
        lines = json.loads(tp.read_text(encoding="utf-8")).get("segments", [])
        transcript = transcript_with_markers(lines)
        if len(transcript) < 400:
            continue
        reqs.append(
            {
                "custom_id": v["youtube_id"],
                "params": {
                    "model": MODEL,
                    "max_tokens": MAX_TOKENS,
                    "system": SYSTEM,
                    "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
                    "messages": [{"role": "user", "content": user_prompt(v, transcript)}],
                },
            }
        )
    return reqs


def estimate(client, reqs: list[dict]) -> tuple[int, float]:
    """Input tokens via the free count_tokens endpoint on a sample, scaled by characters."""
    sample = reqs[:: max(1, len(reqs) // 6)][:6]
    counted = chars = 0
    for r in sample:
        p = r["params"]
        res = client.messages.count_tokens(model=p["model"], system=p["system"], messages=p["messages"])
        counted += res.input_tokens
        chars += len(p["system"]) + len(p["messages"][0]["content"])
    per_char = counted / max(chars, 1)
    total_chars = sum(len(r["params"]["system"]) + len(r["params"]["messages"][0]["content"]) for r in reqs)
    in_tokens = int(total_chars * per_char)
    out_tokens = 900 * len(reqs)  # JSON answer + low-effort thinking, generous
    cost = in_tokens / 1e6 * BATCH_INPUT_PER_MTOK + out_tokens / 1e6 * BATCH_OUTPUT_PER_MTOK
    print(f"count_tokens sample: {counted:,} tokens / {chars:,} chars = {per_char:.3f} tokens per char")
    print(f"estimate: {len(reqs)} requests, ~{in_tokens:,} input + ~{out_tokens:,} output tokens = ~${cost:.3f} (batch rates)")
    return in_tokens, cost


def collect(client, batch_id: str, durations: dict[str, int]) -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    usage = {"input_tokens": 0, "output_tokens": 0, "succeeded": 0, "failed": 0}
    for result in client.messages.batches.results(batch_id):
        if result.result.type != "succeeded":
            usage["failed"] += 1
            print(f"  {result.custom_id}: {result.result.type}")
            continue
        msg = result.result.message
        usage["input_tokens"] += msg.usage.input_tokens
        usage["output_tokens"] += msg.usage.output_tokens
        if msg.stop_reason != "end_turn":
            usage["failed"] += 1
            print(f"  {result.custom_id}: stop_reason={msg.stop_reason}")
            continue
        text = next((b.text for b in msg.content if b.type == "text"), "")
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            usage["failed"] += 1
            print(f"  {result.custom_id}: invalid JSON")
            continue
        rec = to_record(data, durations.get(result.custom_id, 0))
        rec.update({"model": MODEL, "batch_id": batch_id, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        (OUT_DIR / f"{result.custom_id}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        usage["succeeded"] += 1
    usage["cost_usd"] = round(usage["input_tokens"] / 1e6 * BATCH_INPUT_PER_MTOK + usage["output_tokens"] / 1e6 * BATCH_OUTPUT_PER_MTOK, 4)
    return usage


def main() -> int:
    ap = argparse.ArgumentParser(description="AI summaries for the most important new videos")
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--max-cost", type=float, default=0.40, help="refuse to submit above this estimate (USD)")
    ap.add_argument("--dry-run", action="store_true", help="select and estimate, submit nothing")
    ap.add_argument("--collect", default="", help="collect the results of an existing batch id")
    args = ap.parse_args()

    load_env()
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    videos = json.loads((WEB_DATA / "videos.json").read_text(encoding="utf-8"))["videos"]
    durations = {v["youtube_id"]: int(v.get("duration_seconds") or 0) for v in videos}

    if args.collect:
        usage = collect(client, args.collect, durations)
        print(json.dumps(usage, indent=1))
        return 0

    have = {p.stem for p in OUT_DIR.glob("*.json")} if OUT_DIR.exists() else set()
    chosen = select(videos, args.limit, have)
    reqs = build_requests(chosen)
    print(f"selected {len(chosen)} videos, {len(reqs)} with usable transcripts")
    _, cost = estimate(client, reqs)
    if args.dry_run or not reqs:
        return 0
    if cost > args.max_cost:
        print(f"estimate ${cost:.3f} exceeds --max-cost ${args.max_cost:.2f}; not submitting")
        return 2

    batch = client.messages.batches.create(requests=reqs)
    log = json.loads(BATCH_LOG.read_text()) if BATCH_LOG.exists() else []
    log.append({"id": batch.id, "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "requests": len(reqs), "estimate_usd": round(cost, 4)})
    BATCH_LOG.write_text(json.dumps(log, indent=1))
    print(f"batch {batch.id} submitted ({len(reqs)} requests)")
    while True:
        b = client.messages.batches.retrieve(batch.id)
        if b.processing_status == "ended":
            break
        print(f"  {b.processing_status}: {b.request_counts.processing} processing, {b.request_counts.succeeded} done")
        time.sleep(30)
    usage = collect(client, batch.id, durations)
    log[-1].update(usage)
    BATCH_LOG.write_text(json.dumps(log, indent=1))
    print(json.dumps(usage, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
