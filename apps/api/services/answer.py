"""RAG answer-generation service.

Retrieves relevant video segments via vector + full-text search, builds a
structured context window, and generates a Hebrew answer using Claude.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass

import anthropic
import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.embedding import Embedding
from models.video import Video, VideoSegment
from schemas.answer import AnswerResponse, AnswerSource, StreamChunk
from services.answer_cache import AnswerCache
from services.answer_prompts import (
    SYSTEM_PROMPT,
    build_segment_context,
    build_user_prompt,
)

logger = logging.getLogger(__name__)

settings = get_settings()

# ---------------------------------------------------------------------------
# Internal data structure for retrieved segments
# ---------------------------------------------------------------------------


@dataclass
class _RetrievedSegment:
    segment_id: str
    video_id: str
    youtube_id: str
    video_title: str
    text: str
    start_time: float
    end_time: float
    score: float  # higher is better


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

_EMBEDDING_MODEL = "text-embedding-3-small"
_EMBEDDING_DIM = 1536
_CLAUDE_MODEL = "claude-sonnet-4-6"
_MAX_CONTEXT_CHARS = 200_000  # ~50K tokens at ~4 chars/token


class AnswerService:
    """Orchestrates retrieval and generation for the RAG pipeline."""

    def __init__(self, cache: AnswerCache | None = None) -> None:
        self._anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._cache = cache or AnswerCache()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_answer(
        self,
        query: str,
        db: AsyncSession,
    ) -> AnswerResponse:
        """Generate a full (non-streaming) answer."""
        # Check cache first
        cached = self._cache.get(query)
        if cached is not None:
            return cached

        segments = await self._retrieve_segments(query, db)
        context = self._build_context(segments)
        confidence = self._estimate_confidence(query, segments)

        if not segments:
            answer_text = (
                "לא מצאתי מידע רלוונטי בסרטונים שלנו לגבי השאלה הזו. "
                "נסה לנסח את השאלה בצורה אחרת או לחפש נושא קרוב."
            )
            response = AnswerResponse(
                answer=answer_text,
                sources=[],
                confidence=0.0,
                query=query,
            )
            return response

        user_prompt = build_user_prompt(query, context)

        message = await self._anthropic.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        answer_text = message.content[0].text

        sources = self._extract_sources(segments)

        response = AnswerResponse(
            answer=answer_text,
            sources=sources,
            confidence=confidence,
            query=query,
        )

        # Store in cache
        self._cache.put(query, response)
        return response

    async def generate_answer_stream(
        self,
        query: str,
        db: AsyncSession,
    ) -> AsyncGenerator[str, None]:
        """Yield Server-Sent-Event formatted chunks for a streaming answer."""
        segments = await self._retrieve_segments(query, db)
        context = self._build_context(segments)
        confidence = self._estimate_confidence(query, segments)

        if not segments:
            no_result = StreamChunk(
                type="chunk",
                content=(
                    "לא מצאתי מידע רלוונטי בסרטונים שלנו לגבי השאלה הזו. "
                    "נסה לנסח את השאלה בצורה אחרת או לחפש נושא קרוב."
                ),
            )
            yield f"data: {no_result.model_dump_json()}\n\n"
            done = StreamChunk(type="done", sources=[], confidence=0.0)
            yield f"data: {done.model_dump_json()}\n\n"
            return

        user_prompt = build_user_prompt(query, context)
        sources = self._extract_sources(segments)

        async with self._anthropic.messages.stream(
            model=_CLAUDE_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            collected_answer = ""
            async for text_chunk in stream.text_stream:
                collected_answer += text_chunk
                chunk = StreamChunk(type="chunk", content=text_chunk)
                yield f"data: {chunk.model_dump_json()}\n\n"

        # Final event with metadata
        done_event = StreamChunk(
            type="done",
            sources=sources,
            confidence=confidence,
        )
        yield f"data: {done_event.model_dump_json()}\n\n"

        # Cache the complete answer
        full_response = AnswerResponse(
            answer=collected_answer,
            sources=sources,
            confidence=confidence,
            query=query,
        )
        self._cache.put(query, full_response)

    @property
    def cache(self) -> AnswerCache:
        return self._cache

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    async def _retrieve_segments(
        self,
        query: str,
        db: AsyncSession,
        top_k: int = 10,
    ) -> list[_RetrievedSegment]:
        """Combine vector similarity search and full-text search."""
        query_embedding = await self._get_query_embedding(query)

        # Run both searches concurrently via gather-style sequential awaits
        # (SQLAlchemy async sessions are NOT safe to use concurrently on the
        # same session, so we run them sequentially on one session.)
        vector_results = await self._vector_search(db, query_embedding, top_k)
        fts_results = await self._fulltext_search(db, query, top_k)

        # Merge and deduplicate by segment id
        seen: dict[str, _RetrievedSegment] = {}
        for seg in vector_results:
            seen[seg.segment_id] = seg
        for seg in fts_results:
            existing = seen.get(seg.segment_id)
            if existing is None:
                seen[seg.segment_id] = seg
            else:
                # Boost score when segment appears in both result sets
                existing.score = max(existing.score, seg.score) + 0.1

        merged = sorted(seen.values(), key=lambda s: s.score, reverse=True)
        return merged[:8]

    async def _get_query_embedding(self, query: str) -> list[float]:
        """Call OpenAI embeddings API to vectorise the query string."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _EMBEDDING_MODEL,
                    "input": query,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["data"][0]["embedding"]

    async def _vector_search(
        self,
        db: AsyncSession,
        query_embedding: list[float],
        top_k: int,
    ) -> list[_RetrievedSegment]:
        """pgvector cosine-distance search over the embeddings table."""
        embedding_literal = f"[{','.join(str(v) for v in query_embedding)}]"

        stmt = (
            select(
                VideoSegment.id.label("segment_id"),
                Video.id.label("video_id"),
                Video.youtube_id,
                Video.title.label("video_title"),
                VideoSegment.text,
                VideoSegment.start_time,
                VideoSegment.end_time,
                (
                    1
                    - Embedding.embedding.cosine_distance(
                        func.cast(embedding_literal, Embedding.embedding.type)
                    )
                ).label("score"),
            )
            .join(Embedding, Embedding.video_segment_id == VideoSegment.id)
            .join(Video, Video.id == VideoSegment.video_id)
            .order_by(
                Embedding.embedding.cosine_distance(
                    func.cast(embedding_literal, Embedding.embedding.type)
                )
            )
            .limit(top_k)
        )

        result = await db.execute(stmt)
        rows = result.all()
        return [
            _RetrievedSegment(
                segment_id=str(row.segment_id),
                video_id=str(row.video_id),
                youtube_id=row.youtube_id,
                video_title=row.video_title,
                text=row.text,
                start_time=row.start_time,
                end_time=row.end_time,
                score=float(row.score),
            )
            for row in rows
        ]

    async def _fulltext_search(
        self,
        db: AsyncSession,
        query: str,
        top_k: int,
    ) -> list[_RetrievedSegment]:
        """PostgreSQL full-text search across video segment text."""
        # Use plainto_tsquery for safe handling of arbitrary user input.
        stmt = (
            select(
                VideoSegment.id.label("segment_id"),
                Video.id.label("video_id"),
                Video.youtube_id,
                Video.title.label("video_title"),
                VideoSegment.text,
                VideoSegment.start_time,
                VideoSegment.end_time,
                func.ts_rank(
                    func.to_tsvector("simple", VideoSegment.text),
                    func.plainto_tsquery("simple", query),
                ).label("score"),
            )
            .join(Video, Video.id == VideoSegment.video_id)
            .where(
                func.to_tsvector("simple", VideoSegment.text).op("@@")(
                    func.plainto_tsquery("simple", query)
                )
            )
            .order_by(
                func.ts_rank(
                    func.to_tsvector("simple", VideoSegment.text),
                    func.plainto_tsquery("simple", query),
                ).desc()
            )
            .limit(top_k)
        )

        result = await db.execute(stmt)
        rows = result.all()
        return [
            _RetrievedSegment(
                segment_id=str(row.segment_id),
                video_id=str(row.video_id),
                youtube_id=row.youtube_id,
                video_title=row.video_title,
                text=row.text,
                start_time=row.start_time,
                end_time=row.end_time,
                score=float(row.score),
            )
            for row in rows
        ]

    # ------------------------------------------------------------------
    # Context building
    # ------------------------------------------------------------------

    def _build_context(
        self,
        segments: list[_RetrievedSegment],
        max_chars: int = _MAX_CONTEXT_CHARS,
    ) -> str:
        """Assemble retrieved segments into a single context string."""
        parts: list[str] = []
        total_len = 0
        for seg in segments:
            block = build_segment_context(
                video_title=seg.video_title,
                segment_text=seg.text,
                start_time=seg.start_time,
                end_time=seg.end_time,
            )
            if total_len + len(block) > max_chars:
                break
            parts.append(block)
            total_len += len(block)
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Source extraction & confidence
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_sources(segments: list[_RetrievedSegment]) -> list[AnswerSource]:
        """Convert retrieved segments to AnswerSource DTOs."""
        return [
            AnswerSource(
                video_id=seg.video_id,
                youtube_id=seg.youtube_id,
                title=seg.video_title,
                timestamp=seg.start_time,
                relevance_score=round(min(max(seg.score, 0.0), 1.0), 4),
            )
            for seg in segments
        ]

    @staticmethod
    def _estimate_confidence(
        query: str,
        segments: list[_RetrievedSegment],
    ) -> float:
        """Heuristic confidence score based on retrieval quality.

        Returns a value between 0 and 1.  Higher is better.
        """
        if not segments:
            return 0.0

        top_score = segments[0].score
        avg_score = sum(s.score for s in segments) / len(segments)

        # Weighted combination: top result matters most
        raw = 0.6 * top_score + 0.3 * avg_score + 0.1 * min(len(segments) / 8.0, 1.0)
        return round(min(max(raw, 0.0), 1.0), 4)
