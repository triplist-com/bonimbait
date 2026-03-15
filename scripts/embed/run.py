"""
Generate vector embeddings for video segments and summaries using OpenAI API.

Reads segments from data/processed/segments/ and summaries from
data/processed/summaries/, generates embeddings with text-embedding-3-small,
and saves them to data/processed/embeddings/{youtube_id}.json.

Features:
  - Async batch processing with configurable concurrency
  - Batches inputs to OpenAI API (up to 2048 per call)
  - Checkpoint/resume (skips videos with existing embedding files)
  - --dry-run for cost estimation
  - tqdm progress bar, retry logic, logging

Usage:
  python scripts/embed/run.py                    # Process all (resume)
  python scripts/embed/run.py --batch-size 50    # Process up to 50 videos
  python scripts/embed/run.py --dry-run          # Show cost estimate only
  python scripts/embed/run.py --no-resume        # Re-process all
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
SEGMENT_DIR = DATA_DIR / "processed" / "segments"
SUMMARY_DIR = DATA_DIR / "processed" / "summaries"
EMBEDDING_DIR = DATA_DIR / "processed" / "embeddings"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MODEL = "text-embedding-3-small"
DIMENSIONS = 1536
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0
MAX_CONCURRENT = 10
DEFAULT_BATCH_SIZE = 50
MAX_INPUTS_PER_CALL = 2048  # OpenAI batch limit
MAX_TOKENS_PER_INPUT = 8191  # OpenAI token limit per input

# Cost: $0.02 per 1M tokens for text-embedding-3-small
COST_PER_MTOK = 0.02
# Hebrew: ~1 token per 3.5 characters (conservative)
CHARS_PER_TOKEN = 3.5

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("embed")


def _ensure_dirs() -> None:
    EMBEDDING_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Token / cost estimation
# ---------------------------------------------------------------------------
def _estimate_tokens(text: str) -> int:
    """Rough token count for Hebrew text."""
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def _truncate_text(text: str, max_tokens: int = MAX_TOKENS_PER_INPUT) -> str:
    """Truncate text to fit within token limit."""
    max_chars = int(max_tokens * CHARS_PER_TOKEN)
    if len(text) <= max_chars:
        return text
    return text[:max_chars]


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------
def _load_video_texts(youtube_id: str) -> list[dict] | None:
    """
    Load segments and summary for a video, return list of embedding inputs.
    Each item: {"content_type": ..., "segment_index": ..., "text": ...}
    Returns None if required data is missing.
    """
    segment_file = SEGMENT_DIR / f"{youtube_id}.json"
    summary_file = SUMMARY_DIR / f"{youtube_id}.json"

    if not segment_file.exists():
        logger.warning("No segment file for %s", youtube_id)
        return None

    try:
        seg_data = json.loads(segment_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Cannot read segment file for %s: %s", youtube_id, exc)
        return None

    inputs: list[dict] = []

    # Add segment texts
    for seg in seg_data.get("segments", []):
        text = seg.get("text", "").strip()
        if text:
            inputs.append({
                "content_type": "segment",
                "segment_index": seg.get("segment_index", 0),
                "text": _truncate_text(text),
            })

    # Add summary text (title_summary + key_points combined)
    if summary_file.exists():
        try:
            sum_data = json.loads(summary_file.read_text(encoding="utf-8"))
            title_summary = sum_data.get("title_summary", "")
            key_points = sum_data.get("key_points", [])
            combined = title_summary
            if key_points:
                combined += "\n" + "\n".join(f"- {kp}" for kp in key_points)
            combined = combined.strip()
            if combined:
                inputs.append({
                    "content_type": "summary",
                    "segment_index": None,
                    "text": _truncate_text(combined),
                })
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cannot read summary for %s: %s", youtube_id, exc)

    return inputs if inputs else None


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------
async def _embed_batch_texts(
    client,
    texts: list[str],
    semaphore: asyncio.Semaphore,
) -> list[list[float]]:
    """
    Call OpenAI embeddings API for a batch of texts.
    Returns list of embedding vectors in same order as input.
    """
    async with semaphore:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await client.embeddings.create(
                    model=MODEL,
                    input=texts,
                    dimensions=DIMENSIONS,
                )
                # Sort by index to preserve order
                sorted_data = sorted(response.data, key=lambda x: x.index)
                return [item.embedding for item in sorted_data]
            except Exception as exc:
                if attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF_BASE ** attempt
                    logger.warning(
                        "Embedding API attempt %d/%d failed: %s — retrying in %.0fs",
                        attempt, MAX_RETRIES, exc, wait,
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error("All %d attempts failed for batch: %s", MAX_RETRIES, exc)
                    raise


async def _process_video(
    client,
    youtube_id: str,
    semaphore: asyncio.Semaphore,
    pbar: tqdm,
    running_cost: list[float],
    running_tokens: list[int],
) -> bool:
    """Process a single video: generate all embeddings and save. Returns True on success."""
    inputs = _load_video_texts(youtube_id)
    if inputs is None:
        pbar.update(1)
        return False

    all_texts = [inp["text"] for inp in inputs]
    total_tokens = sum(_estimate_tokens(t) for t in all_texts)

    try:
        # Split into batches of MAX_INPUTS_PER_CALL
        all_embeddings: list[list[float]] = []
        for i in range(0, len(all_texts), MAX_INPUTS_PER_CALL):
            batch = all_texts[i : i + MAX_INPUTS_PER_CALL]
            batch_embeddings = await _embed_batch_texts(client, batch, semaphore)
            all_embeddings.extend(batch_embeddings)

        # Build output
        embedding_records = []
        for inp, emb in zip(inputs, all_embeddings):
            embedding_records.append({
                "content_type": inp["content_type"],
                "segment_index": inp["segment_index"],
                "text": inp["text"],
                "embedding": emb,
            })

        output = {
            "youtube_id": youtube_id,
            "embeddings": embedding_records,
        }

        out_path = EMBEDDING_DIR / f"{youtube_id}.json"
        out_path.write_text(
            json.dumps(output, ensure_ascii=False), encoding="utf-8"
        )

        cost = (total_tokens / 1_000_000) * COST_PER_MTOK
        running_cost[0] += cost
        running_tokens[0] += total_tokens

        pbar.update(1)
        pbar.set_postfix(cost=f"${running_cost[0]:.4f}")
        return True

    except Exception as exc:
        logger.error("Failed to embed video %s: %s", youtube_id, exc)
        pbar.update(1)
        return False


async def _run_batch(
    youtube_ids: list[str],
    *,
    max_concurrent: int = MAX_CONCURRENT,
) -> tuple[int, int, float, int]:
    """Process a batch of videos. Returns (success, failed, total_cost, total_tokens)."""
    import openai

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not set")
        sys.exit(1)

    client = openai.AsyncOpenAI(api_key=api_key)
    semaphore = asyncio.Semaphore(max_concurrent)
    running_cost = [0.0]
    running_tokens = [0]

    pbar = tqdm(total=len(youtube_ids), desc="Embedding", unit="video")

    tasks = [
        _process_video(client, vid, semaphore, pbar, running_cost, running_tokens)
        for vid in youtube_ids
    ]

    results = await asyncio.gather(*tasks)
    pbar.close()

    success = sum(1 for r in results if r)
    failed = sum(1 for r in results if not r)

    return success, failed, running_cost[0], running_tokens[0]


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------
def _discover_youtube_ids(*, resume: bool = True) -> list[str]:
    """Find all youtube_ids that have segment files, optionally filtering already embedded."""
    segment_files = sorted(SEGMENT_DIR.glob("*.json"))
    # Exclude all_segments.json
    ids = [f.stem for f in segment_files if f.name != "all_segments.json"]

    if resume:
        done = {p.stem for p in EMBEDDING_DIR.glob("*.json")}
        ids = [vid for vid in ids if vid not in done]

    return ids


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def embed_batch(
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    resume: bool = True,
    dry_run: bool = False,
    max_concurrent: int = MAX_CONCURRENT,
) -> int:
    """Generate embeddings for all videos. Returns count of successful videos."""
    _ensure_dirs()

    youtube_ids = _discover_youtube_ids(resume=resume)

    total_available = len(list(SEGMENT_DIR.glob("*.json"))) - (
        1 if (SEGMENT_DIR / "all_segments.json").exists() else 0
    )

    if batch_size > 0:
        youtube_ids = youtube_ids[:batch_size]

    if not youtube_ids:
        logger.info("All videos already embedded (%d total)", total_available)
        return 0

    # Cost estimate
    total_tokens = 0
    total_inputs = 0
    for vid in youtube_ids:
        inputs = _load_video_texts(vid)
        if inputs:
            total_inputs += len(inputs)
            total_tokens += sum(_estimate_tokens(inp["text"]) for inp in inputs)

    estimated_cost = (total_tokens / 1_000_000) * COST_PER_MTOK

    logger.info(
        "Will embed %d / %d videos (%d inputs, ~%dK tokens). Estimated cost: $%.4f",
        len(youtube_ids),
        total_available,
        total_inputs,
        total_tokens // 1000,
        estimated_cost,
    )

    if dry_run:
        logger.info("Dry run — exiting without processing")
        return 0

    # Run async batch
    start = time.monotonic()
    success, failed, total_cost, actual_tokens = asyncio.run(
        _run_batch(youtube_ids, max_concurrent=max_concurrent)
    )
    elapsed = time.monotonic() - start

    logger.info(
        "Embedding complete in %.1fs. Success: %d | Failed: %d | Tokens: %dK | Cost: $%.4f",
        elapsed, success, failed, actual_tokens // 1000, total_cost,
    )
    return success


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    # Add project root to sys.path
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(
        description="Generate vector embeddings using OpenAI text-embedding-3-small",
    )
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH_SIZE,
        help=f"Max videos per run, 0 = all (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--max-concurrent", type=int, default=MAX_CONCURRENT,
        help=f"Max concurrent API calls (default: {MAX_CONCURRENT})",
    )
    parser.add_argument("--no-resume", action="store_true", help="Re-embed all videos")
    parser.add_argument("--dry-run", action="store_true", help="Show cost estimate only")
    args = parser.parse_args()

    embed_batch(
        batch_size=args.batch_size,
        resume=not args.no_resume,
        dry_run=args.dry_run,
        max_concurrent=args.max_concurrent,
    )


if __name__ == "__main__":
    main()
