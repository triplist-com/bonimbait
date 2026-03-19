"""Hybrid search service combining semantic (pgvector) and full-text (tsvector) search.

Uses Reciprocal Rank Fusion (RRF) to merge results from both backends.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.cache import search_cache

logger = logging.getLogger(__name__)

RRF_K = 60  # Reciprocal Rank Fusion constant


@dataclass
class _RawResult:
    """Intermediate search result before hydration."""

    video_id: uuid.UUID
    score: float = 0.0
    snippet: str | None = None
    segment_time: float | None = None


@dataclass
class HybridSearchResult:
    """Final merged search result."""

    video_id: uuid.UUID
    score: float = 0.0
    snippet: str | None = None
    segment_time: float | None = None


class SearchService:
    """Hybrid search combining pgvector cosine similarity and PostgreSQL FTS."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def hybrid_search(
        self,
        query: str,
        *,
        category_id: uuid.UUID | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[HybridSearchResult], int]:
        """Run hybrid search and return (results, total_count).

        1. Run semantic + FTS in parallel
        2. Merge with RRF
        3. Apply category filter if given
        4. Return paginated slice
        """
        cache_key = f"search:{query}:{category_id}:{limit}:{offset}"
        cached = search_cache.get(cache_key)
        if cached is not None:
            return cached

        # Run searches sequentially — asyncio.gather on the same
        # SQLAlchemy AsyncSession is unsafe, especially with pgbouncer.
        try:
            semantic_results = await self._semantic_search(query, top_k=50)
        except Exception as exc:
            logger.warning("Semantic search failed: %s", exc)
            semantic_results = []

        try:
            fts_results = await self._fulltext_search(query, top_k=50)
        except Exception as exc:
            logger.warning("Full-text search failed: %s", exc)
            fts_results = []

        # Merge with RRF
        merged = self._reciprocal_rank_fusion(semantic_results, fts_results)

        # Category filter
        if category_id is not None:
            merged = await self._filter_by_category(merged, category_id)

        total = len(merged)
        page_results = merged[offset : offset + limit]

        result = (page_results, total)
        # Only cache non-empty results to avoid caching transient failures
        if total > 0:
            search_cache.set(cache_key, result)
        return result

    async def suggest(self, query: str, limit: int = 5) -> list[str]:
        """Return autocomplete suggestions using trigram similarity on titles."""
        if len(query) < 2:
            return []

        sql = text("""
            SELECT title,
                   similarity(title, :query) AS sim
            FROM videos
            WHERE similarity(title, :query) > 0.1
            ORDER BY sim DESC
            LIMIT :limit
        """)
        try:
            result = await self._db.execute(sql, {"query": query, "limit": limit})
            return [row[0] for row in result.fetchall()]
        except Exception:
            # pg_trgm extension may not be available; fall back to ILIKE
            logger.warning("Trigram similarity failed, falling back to ILIKE")
            sql_fallback = text("""
                SELECT title
                FROM videos
                WHERE title ILIKE :pattern
                ORDER BY title
                LIMIT :limit
            """)
            result = await self._db.execute(
                sql_fallback, {"pattern": f"%{query}%", "limit": limit}
            )
            return [row[0] for row in result.fetchall()]

    # ------------------------------------------------------------------
    # Backwards-compatible API (used by old router)
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        category_id: uuid.UUID | None = None,
        limit: int = 10,
    ) -> list[dict]:
        """Legacy search method for backwards compatibility."""
        from schemas.search import SearchResult

        results, _ = await self.hybrid_search(
            query, category_id=category_id, limit=limit
        )
        # Hydrate with video info
        if not results:
            return []

        video_ids = [r.video_id for r in results]
        placeholders = ", ".join(f":id_{i}" for i in range(len(video_ids)))
        params = {f"id_{i}": vid for i, vid in enumerate(video_ids)}

        sql = text(f"""
            SELECT v.id, v.youtube_id, v.title
            FROM videos v
            WHERE v.id IN ({placeholders})
        """)
        db_result = await self._db.execute(sql, params)
        video_map = {row[0]: row for row in db_result.fetchall()}

        output = []
        for r in results:
            row = video_map.get(r.video_id)
            if row:
                output.append(
                    SearchResult(
                        video_id=row[0],
                        youtube_id=row[1],
                        title=row[2],
                        segment_text=r.snippet,
                        start_time=r.segment_time,
                        score=r.score,
                    )
                )
        return output

    async def answer(
        self,
        question: str,
        category_id: uuid.UUID | None = None,
    ):
        """Placeholder for RAG answer generation."""
        from schemas.search import AnswerResponse

        return AnswerResponse(
            answer="Answer generation is not yet implemented.",
            sources=[],
        )

    # ------------------------------------------------------------------
    # Private: Semantic search via pgvector
    # ------------------------------------------------------------------

    async def _semantic_search(
        self, query: str, *, top_k: int = 50
    ) -> list[_RawResult]:
        """Generate query embedding and search embeddings table."""
        try:
            from services.openai_client import get_embedding

            query_vector = await get_embedding(query)
        except Exception as exc:
            logger.warning("Could not generate query embedding: %s", exc)
            return []

        vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"

        sql = text("""
            SELECT
                e.video_id,
                1 - (e.embedding <=> :query_vector::vector) AS score,
                vs.text AS snippet,
                vs.start_time
            FROM embeddings e
            JOIN video_segments vs ON vs.id = e.video_segment_id
            ORDER BY e.embedding <=> :query_vector::vector
            LIMIT :top_k
        """)

        result = await self._db.execute(
            sql, {"query_vector": vector_literal, "top_k": top_k}
        )
        rows = result.fetchall()

        return [
            _RawResult(
                video_id=row[0],
                score=float(row[1]),
                snippet=row[2][:200] if row[2] else None,
                segment_time=float(row[3]) if row[3] is not None else None,
            )
            for row in rows
        ]

    # ------------------------------------------------------------------
    # Private: Full-text search via tsvector
    # ------------------------------------------------------------------

    async def _fulltext_search(
        self, query: str, *, top_k: int = 50
    ) -> list[_RawResult]:
        """Search using PostgreSQL full-text search on both videos and segments."""
        # Search video_segments first (more granular)
        sql = text("""
            WITH segment_matches AS (
                SELECT
                    vs.video_id,
                    ts_rank(vs.search_vector, plainto_tsquery('simple', :query)) AS rank,
                    vs.text AS snippet,
                    vs.start_time,
                    ROW_NUMBER() OVER (
                        PARTITION BY vs.video_id
                        ORDER BY ts_rank(vs.search_vector, plainto_tsquery('simple', :query)) DESC
                    ) AS rn
                FROM video_segments vs
                WHERE vs.search_vector @@ plainto_tsquery('simple', :query)
            ),
            video_matches AS (
                SELECT
                    v.id AS video_id,
                    ts_rank(v.search_vector, plainto_tsquery('simple', :query)) AS rank,
                    COALESCE(v.summary, LEFT(v.description, 200)) AS snippet,
                    NULL::float AS start_time
                FROM videos v
                WHERE v.search_vector @@ plainto_tsquery('simple', :query)
            ),
            combined AS (
                SELECT video_id, rank, snippet, start_time
                FROM segment_matches
                WHERE rn = 1
                UNION ALL
                SELECT video_id, rank, snippet, start_time
                FROM video_matches
            )
            SELECT
                video_id,
                MAX(rank) AS score,
                (ARRAY_AGG(snippet ORDER BY rank DESC))[1] AS best_snippet,
                (ARRAY_AGG(start_time ORDER BY rank DESC))[1] AS segment_time
            FROM combined
            GROUP BY video_id
            ORDER BY score DESC
            LIMIT :top_k
        """)

        result = await self._db.execute(sql, {"query": query, "top_k": top_k})
        rows = result.fetchall()

        return [
            _RawResult(
                video_id=row[0],
                score=float(row[1]) if row[1] else 0.0,
                snippet=row[2][:200] if row[2] else None,
                segment_time=float(row[3]) if row[3] is not None else None,
            )
            for row in rows
        ]

    # ------------------------------------------------------------------
    # Private: Reciprocal Rank Fusion
    # ------------------------------------------------------------------

    @staticmethod
    def _reciprocal_rank_fusion(
        *result_lists: list[_RawResult],
    ) -> list[HybridSearchResult]:
        """Merge multiple ranked lists using RRF.

        score = sum(1 / (k + rank_i)) for each list
        """
        scores: dict[uuid.UUID, float] = {}
        snippets: dict[uuid.UUID, str | None] = {}
        times: dict[uuid.UUID, float | None] = {}

        for result_list in result_lists:
            for rank, item in enumerate(result_list, start=1):
                rrf_score = 1.0 / (RRF_K + rank)
                scores[item.video_id] = scores.get(item.video_id, 0.0) + rrf_score

                # Keep the best snippet (first seen)
                if item.video_id not in snippets and item.snippet:
                    snippets[item.video_id] = item.snippet
                    times[item.video_id] = item.segment_time

        # Sort by fused score descending
        sorted_ids = sorted(scores.keys(), key=lambda vid: scores[vid], reverse=True)

        return [
            HybridSearchResult(
                video_id=vid,
                score=scores[vid],
                snippet=snippets.get(vid),
                segment_time=times.get(vid),
            )
            for vid in sorted_ids
        ]

    # ------------------------------------------------------------------
    # Private: Category filter
    # ------------------------------------------------------------------

    async def _filter_by_category(
        self,
        results: list[HybridSearchResult],
        category_id: uuid.UUID,
    ) -> list[HybridSearchResult]:
        """Filter results to only include videos in the given category."""
        if not results:
            return results

        video_ids = [r.video_id for r in results]
        placeholders = ", ".join(f":id_{i}" for i in range(len(video_ids)))
        params: dict = {f"id_{i}": vid for i, vid in enumerate(video_ids)}
        params["cat_id"] = category_id

        sql = text(f"""
            SELECT id FROM videos
            WHERE id IN ({placeholders})
              AND category_id = :cat_id
        """)
        result = await self._db.execute(sql, params)
        valid_ids = {row[0] for row in result.fetchall()}

        return [r for r in results if r.video_id in valid_ids]
