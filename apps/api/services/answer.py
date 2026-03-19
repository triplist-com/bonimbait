"""Fast answer-generation service.

Uses the existing search results (video summaries) instead of raw segments
to build a compact context for Claude. This is much faster than the full
RAG pipeline since video summaries are already pre-computed.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

import anthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from schemas.answer import AnswerResponse, AnswerSource, StreamChunk
from services.answer_cache import AnswerCache
from services.answer_prompts import SYSTEM_PROMPT
from services.budget_tracker import BudgetTracker

logger = logging.getLogger(__name__)

settings = get_settings()

_CLAUDE_MODEL = "claude-sonnet-4-6"
_MAX_VIDEOS = 8


class AnswerService:
    """Generates answers by summarizing video summaries from search results."""

    def __init__(
        self,
        cache: AnswerCache | None = None,
        budget_tracker: BudgetTracker | None = None,
    ) -> None:
        self._anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._cache = cache or AnswerCache()
        self._budget_tracker = budget_tracker

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_answer(
        self,
        query: str,
        db: AsyncSession,
    ) -> AnswerResponse:
        """Generate a full (non-streaming) answer."""
        cached = self._cache.get(query)
        if cached is not None:
            return cached

        if self._budget_tracker and self._budget_tracker.is_budget_exceeded:
            return AnswerResponse(
                answer="תקציב AI היומי נוצל. בינתיים, ניתן לצפות בסרטונים הרלוונטיים למטה.",
                sources=[], confidence=0.0, query=query,
            )

        videos = await self._get_matching_videos(query, db)
        if not videos:
            return AnswerResponse(
                answer="לא מצאתי מידע רלוונטי בסרטונים שלנו. נסה לנסח את השאלה בצורה אחרת.",
                sources=[], confidence=0.0, query=query,
            )

        context = self._build_context(videos)
        sources = self._build_sources(videos)
        confidence = min(1.0, len(videos) / _MAX_VIDEOS)

        message = await self._anthropic.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"שאלה: {query}\n\nמידע מסרטונים:\n{context}\n\nענה בקצרה ובמדויק."}],
        )

        if self._budget_tracker:
            self._budget_tracker.record_usage(
                message.usage.input_tokens, message.usage.output_tokens,
            )

        response = AnswerResponse(
            answer=message.content[0].text,
            sources=sources,
            confidence=confidence,
            query=query,
        )
        self._cache.put(query, response)
        return response

    async def generate_answer_stream(
        self,
        query: str,
        db: AsyncSession,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE chunks for a streaming answer."""
        if self._budget_tracker and self._budget_tracker.is_budget_exceeded:
            yield self._sse(StreamChunk(type="chunk", content="תקציב AI היומי נוצל. בינתיים, ניתן לצפות בסרטונים הרלוונטיים למטה."))
            yield self._sse(StreamChunk(type="done", sources=[], confidence=0.0))
            return

        videos = await self._get_matching_videos(query, db)
        if not videos:
            yield self._sse(StreamChunk(type="chunk", content="לא מצאתי מידע רלוונטי בסרטונים שלנו. נסה לנסח את השאלה בצורה אחרת."))
            yield self._sse(StreamChunk(type="done", sources=[], confidence=0.0))
            return

        context = self._build_context(videos)
        sources = self._build_sources(videos)
        confidence = min(1.0, len(videos) / _MAX_VIDEOS)

        collected = ""
        async with self._anthropic.messages.stream(
            model=_CLAUDE_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"שאלה: {query}\n\nמידע מסרטונים:\n{context}\n\nענה בקצרה ובמדויק."}],
        ) as stream:
            async for text_chunk in stream.text_stream:
                collected += text_chunk
                yield self._sse(StreamChunk(type="chunk", content=text_chunk))

            final = await stream.get_final_message()
            if self._budget_tracker:
                self._budget_tracker.record_usage(
                    final.usage.input_tokens, final.usage.output_tokens,
                )

        yield self._sse(StreamChunk(type="done", sources=sources, confidence=confidence))

        self._cache.put(query, AnswerResponse(
            answer=collected, sources=sources, confidence=confidence, query=query,
        ))

    @property
    def cache(self) -> AnswerCache:
        return self._cache

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    async def _get_matching_videos(
        self, query: str, db: AsyncSession,
    ) -> list[dict]:
        """Find matching videos using FTS on summaries — no embedding needed."""
        try:
            result = await db.execute(text("""
                SELECT v.id, v.youtube_id, v.title, v.summary,
                       v.key_points, v.costs_data,
                       ts_rank(v.search_vector, plainto_tsquery('simple', :q)) AS rank
                FROM videos v
                WHERE v.search_vector @@ plainto_tsquery('simple', :q)
                   OR v.title ILIKE :pattern
                ORDER BY rank DESC
                LIMIT :lim
            """), {"q": query, "pattern": f"%{query}%", "lim": _MAX_VIDEOS})
            rows = result.mappings().all()
        except Exception:
            await db.rollback()
            # Fallback: simple ILIKE search
            result = await db.execute(text("""
                SELECT v.id, v.youtube_id, v.title, v.summary,
                       v.key_points, v.costs_data, 0.0 AS rank
                FROM videos v
                WHERE v.title ILIKE :pattern OR v.summary ILIKE :pattern
                ORDER BY v.published_at DESC
                LIMIT :lim
            """), {"pattern": f"%{query}%", "lim": _MAX_VIDEOS})
            rows = result.mappings().all()

        return [dict(r) for r in rows]

    @staticmethod
    def _build_context(videos: list[dict]) -> str:
        """Build compact context from video summaries."""
        parts = []
        for v in videos:
            title = v.get("title", "")
            summary = v.get("summary", "")
            key_points = v.get("key_points")
            costs = v.get("costs_data")

            block = f"[{title}]\n{summary}"
            if key_points and isinstance(key_points, list):
                kp_text = "\n".join(f"- {kp}" if isinstance(kp, str) else f"- {kp.get('text', '')}" for kp in key_points[:5])
                block += f"\nנקודות עיקריות:\n{kp_text}"
            if costs and isinstance(costs, list):
                cost_lines = []
                for c in costs[:5]:
                    if isinstance(c, dict):
                        item = c.get("item", c.get("description", ""))
                        price = c.get("price", c.get("amount", ""))
                        unit = c.get("unit", "")
                        cost_lines.append(f"- {item}: {price} {unit}")
                if cost_lines:
                    block += f"\nעלויות:\n" + "\n".join(cost_lines)

            parts.append(block)
        return "\n---\n".join(parts)

    @staticmethod
    def _build_sources(videos: list[dict]) -> list[AnswerSource]:
        return [
            AnswerSource(
                video_id=str(v["id"]),
                youtube_id=v["youtube_id"],
                title=v["title"],
                timestamp=0.0,
                relevance_score=min(1.0, max(0.0, float(v.get("rank", 0)))),
            )
            for v in videos
        ]

    @staticmethod
    def _sse(chunk: StreamChunk) -> str:
        return f"data: {chunk.model_dump_json()}\n\n"
