"""Simple in-memory LRU cache for AI-generated answers.

Can be replaced with Redis for production multi-process deployments.
"""

from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from dataclasses import dataclass, field

from schemas.answer import AnswerResponse


@dataclass
class _CacheEntry:
    response: AnswerResponse
    created_at: float = field(default_factory=time.monotonic)


class AnswerCache:
    """Thread-safe, TTL-based, LRU answer cache."""

    def __init__(
        self,
        max_size: int = 1000,
        ttl_seconds: float = 3600.0,
    ) -> None:
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._store: OrderedDict[str, _CacheEntry] = OrderedDict()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(self, query: str) -> AnswerResponse | None:
        """Return a cached answer or ``None`` if not found / expired."""
        key = self._make_key(query)
        entry = self._store.get(key)
        if entry is None:
            return None
        if self._is_expired(entry):
            self._store.pop(key, None)
            return None
        # Move to end (most recently used)
        self._store.move_to_end(key)
        response = entry.response.model_copy()
        response.cached = True
        return response

    def put(self, query: str, response: AnswerResponse) -> None:
        """Store an answer in the cache, evicting oldest if necessary."""
        key = self._make_key(query)
        # Remove if already present so it moves to the end
        self._store.pop(key, None)
        self._store[key] = _CacheEntry(response=response)
        # Evict oldest entries if over capacity
        while len(self._store) > self._max_size:
            self._store.popitem(last=False)

    def clear(self) -> None:
        """Remove all cached entries."""
        self._store.clear()

    @property
    def size(self) -> int:
        return len(self._store)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _make_key(query: str) -> str:
        """Deterministic hash of the normalised query."""
        normalised = query.strip().lower()
        return hashlib.sha256(normalised.encode()).hexdigest()

    def _is_expired(self, entry: _CacheEntry) -> bool:
        return (time.monotonic() - entry.created_at) > self._ttl
