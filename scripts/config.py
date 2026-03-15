"""
Central configuration for the Bonimbait data pipeline.

All tunable parameters in one place. Override via environment variables
or CLI flags on the optimized pipeline runner.
"""
from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Pipeline configuration
# ---------------------------------------------------------------------------
PIPELINE_CONFIG = {
    # Channel
    "channel_url": "https://www.youtube.com/@TomerChenRihana",
    "max_videos": 200,
    "sort_by": "newest",  # newest first

    # Cost optimization
    "prefer_youtube_subs": True,   # Always try YouTube captions first (FREE)
    "whisper_only_fallback": True,  # Only use Whisper when no subs available
    "whisper_model": "whisper-1",

    # Summarization
    "summarize_model": "claude-haiku-4-5-20251001",  # Haiku instead of Sonnet
    "summarize_max_concurrent": 10,  # Haiku can handle more concurrency
    "summarize_batch_size": 0,       # 0 = all

    # Embeddings
    "embedding_model": "text-embedding-3-small",
    "embedding_dimensions": 1536,

    # Budget tracking
    "max_budget_usd": 50.0,
}


def get_config() -> dict:
    """Return pipeline config with environment variable overrides applied."""
    cfg = dict(PIPELINE_CONFIG)

    # Allow env var overrides
    if os.getenv("YOUTUBE_CHANNEL_URL"):
        cfg["channel_url"] = os.getenv("YOUTUBE_CHANNEL_URL")
    if os.getenv("PIPELINE_MAX_VIDEOS"):
        cfg["max_videos"] = int(os.getenv("PIPELINE_MAX_VIDEOS"))
    if os.getenv("PIPELINE_MAX_BUDGET"):
        cfg["max_budget_usd"] = float(os.getenv("PIPELINE_MAX_BUDGET"))
    if os.getenv("SUMMARIZE_MODEL"):
        cfg["summarize_model"] = os.getenv("SUMMARIZE_MODEL")

    return cfg


# ---------------------------------------------------------------------------
# Pricing constants (used by cost tracker and estimator)
# ---------------------------------------------------------------------------
PRICING = {
    # Whisper
    "whisper_per_minute_usd": 0.006,

    # Claude Haiku (claude-haiku-4-5-20251001)
    "haiku_input_per_mtok_usd": 0.80,
    "haiku_output_per_mtok_usd": 4.00,

    # Claude Sonnet (claude-sonnet-4-6)
    "sonnet_input_per_mtok_usd": 3.00,
    "sonnet_output_per_mtok_usd": 15.00,

    # OpenAI text-embedding-3-small
    "embedding_per_mtok_usd": 0.02,
}


def get_summarize_pricing(model: str) -> tuple[float, float]:
    """Return (input_cost_per_mtok, output_cost_per_mtok) for the given model."""
    if "haiku" in model.lower():
        return PRICING["haiku_input_per_mtok_usd"], PRICING["haiku_output_per_mtok_usd"]
    elif "sonnet" in model.lower():
        return PRICING["sonnet_input_per_mtok_usd"], PRICING["sonnet_output_per_mtok_usd"]
    else:
        # Default to Sonnet pricing (conservative)
        return PRICING["sonnet_input_per_mtok_usd"], PRICING["sonnet_output_per_mtok_usd"]
