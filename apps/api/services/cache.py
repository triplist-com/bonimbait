"""Simple in-memory TTL cache.

Provides a lightweight caching layer that can be swapped for Redis later.
Each cache entry stores its creation timestamp and is evicted on access
if it exceeds its TTL.
"""

from __future__ import annotations

import time
from typing import Any


class TTLCache:
    """Thread-safe (async-safe) in-memory cache with per-key TTL."""

    def __init__(self, default_ttl: float = 300.0) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Any | None:
        """Return cached value or None if missing / expired."""
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        """Store a value with an optional custom TTL (seconds)."""
        ttl = ttl if ttl is not None else self._default_ttl
        self._store[key] = (time.monotonic() + ttl, value)

    def delete(self, key: str) -> None:
        """Remove a key from the cache."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Remove all entries."""
        self._store.clear()

    def cleanup(self) -> int:
        """Remove all expired entries. Returns number of entries removed."""
        now = time.monotonic()
        expired = [k for k, (exp, _) in self._store.items() if now > exp]
        for k in expired:
            del self._store[k]
        return len(expired)


# Singleton caches for different data types
embedding_cache = TTLCache(default_ttl=3600.0)      # 1 hour
search_cache = TTLCache(default_ttl=300.0)           # 5 minutes
category_cache = TTLCache(default_ttl=600.0)         # 10 minutes
