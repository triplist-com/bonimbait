"""OpenAI client for embedding generation.

Provides a singleton async client with retry logic and batch support.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from openai import AsyncOpenAI

from config import get_settings
from services.cache import embedding_cache

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
MAX_BATCH_SIZE = 100
MAX_RETRIES = 3

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    """Return a singleton async OpenAI client."""
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.OPENAI_API_KEY:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. Cannot generate embeddings."
            )
        _client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            max_retries=MAX_RETRIES,
            timeout=30.0,
        )
    return _client


async def get_embedding(text: str) -> list[float]:
    """Generate an embedding for a single text string.

    Results are cached in the embedding_cache with a 1-hour TTL.
    """
    cache_key = f"emb:{text[:200]}"
    cached = embedding_cache.get(cache_key)
    if cached is not None:
        return cached

    client = get_openai_client()
    response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
        dimensions=EMBEDDING_DIMENSIONS,
    )
    vector = response.data[0].embedding
    embedding_cache.set(cache_key, vector)
    return vector


async def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts.

    Splits into chunks of MAX_BATCH_SIZE if needed.
    """
    if not texts:
        return []

    client = get_openai_client()
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[i : i + MAX_BATCH_SIZE]
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=batch,
            dimensions=EMBEDDING_DIMENSIONS,
        )
        # Sort by index to preserve order
        sorted_data = sorted(response.data, key=lambda d: d.index)
        all_embeddings.extend([d.embedding for d in sorted_data])

    return all_embeddings
