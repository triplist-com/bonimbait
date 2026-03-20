"""Answer matching service with 3-tier lookup.

Tier 1: Keyword overlap (Jaccard similarity) — instant, no API call.
Tier 2: Embedding similarity (pgvector cosine) — ~500ms, ~$0.001.
Tier 3: Miss — returns None, caller falls back to live Claude streaming.
"""

from __future__ import annotations

import logging
import re
import string

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.openai_client import get_embedding

logger = logging.getLogger(__name__)

# Hebrew sofit (final-form) letter normalization map
_SOFIT_MAP = str.maketrans("םןךףץ", "מנכפצ")

KEYWORD_THRESHOLD = 0.5
EMBEDDING_THRESHOLD = 0.85


class PregeneratedAnswer(BaseModel):
    """A pre-generated answer matched from the database."""

    question: str
    answer: str
    sources: list[dict] = []
    key_points: list[str] = []
    costs_data: list[dict] = []
    tips: list[str] = []
    warnings: list[str] = []
    confidence: float


def _normalize(text_val: str) -> str:
    """Normalize Hebrew text for comparison.

    Lowercases, strips punctuation, and normalizes sofit letters.
    """
    t = text_val.lower()
    t = t.translate(_SOFIT_MAP)
    # Remove punctuation
    t = t.translate(str.maketrans("", "", string.punctuation + '״׳"\''))
    # Collapse whitespace
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _tokenize(text_val: str) -> set[str]:
    """Tokenize normalized text into a set of words."""
    normalized = _normalize(text_val)
    return {w for w in normalized.split() if len(w) > 1}


def _jaccard(a: set[str], b: set[str]) -> float:
    """Compute Jaccard similarity between two token sets."""
    if not a or not b:
        return 0.0
    intersection = a & b
    union = a | b
    return len(intersection) / len(union)


class AnswerMatcher:
    """3-tier answer matching service."""

    async def find_match(
        self, query: str, db: AsyncSession
    ) -> PregeneratedAnswer | None:
        """Try to find a pre-generated answer matching the query.

        Returns PregeneratedAnswer on match, None on miss.
        """
        # Tier 1: Keyword overlap
        match = await self._tier1_keyword(query, db)
        if match is not None:
            logger.info("Tier 1 keyword match for query: %s", query[:80])
            return match

        # Tier 2: Embedding similarity
        match = await self._tier2_embedding(query, db)
        if match is not None:
            logger.info("Tier 2 embedding match for query: %s", query[:80])
            return match

        # Tier 3: Miss
        logger.info("No pre-generated match for query: %s", query[:80])
        return None

    async def _tier1_keyword(
        self, query: str, db: AsyncSession
    ) -> PregeneratedAnswer | None:
        """Tier 1: Jaccard similarity on tokenized questions."""
        try:
            result = await db.execute(
                text("SELECT id, question, answer, sources, key_points, costs_data, tips, warnings FROM pregenerated_answers")
            )
            rows = result.mappings().all()
        except Exception:
            logger.exception("Tier 1: failed to fetch pregenerated_answers")
            await db.rollback()
            return None

        query_tokens = _tokenize(query)
        if not query_tokens:
            return None

        best_score = 0.0
        best_row = None

        for row in rows:
            question_tokens = _tokenize(row["question"])
            score = _jaccard(query_tokens, question_tokens)
            if score > best_score:
                best_score = score
                best_row = row

        if best_score > KEYWORD_THRESHOLD and best_row is not None:
            return self._row_to_answer(best_row, confidence=1.0)

        return None

    async def _tier2_embedding(
        self, query: str, db: AsyncSession
    ) -> PregeneratedAnswer | None:
        """Tier 2: pgvector cosine similarity search."""
        try:
            query_vec = await get_embedding(query)
        except Exception:
            logger.exception("Tier 2: failed to generate query embedding")
            return None

        vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

        try:
            result = await db.execute(
                text("""
                    SELECT id, question, answer, sources, key_points, costs_data, tips, warnings,
                           1 - (embedding <=> CAST(:query_vec AS vector)) AS similarity
                    FROM pregenerated_answers
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:query_vec AS vector)
                    LIMIT 1
                """),
                {"query_vec": vec_str},
            )
            row = result.mappings().first()
        except Exception:
            logger.exception("Tier 2: pgvector query failed")
            await db.rollback()
            return None

        if row is None:
            return None

        similarity = float(row["similarity"])
        if similarity > EMBEDDING_THRESHOLD:
            # Increment hit_count
            try:
                await db.execute(
                    text("UPDATE pregenerated_answers SET hit_count = hit_count + 1 WHERE id = :id"),
                    {"id": row["id"]},
                )
                await db.flush()
            except Exception:
                logger.warning("Failed to increment hit_count for id=%s", row["id"])

            return self._row_to_answer(row, confidence=0.9)

        return None

    @staticmethod
    def _row_to_answer(row, confidence: float) -> PregeneratedAnswer:
        """Convert a database row mapping to a PregeneratedAnswer."""
        sources = row["sources"] if row["sources"] else []
        key_points = row["key_points"] if row["key_points"] else []
        costs_data = row["costs_data"] if row["costs_data"] else []
        tips = row["tips"] if row["tips"] else []
        warnings = row["warnings"] if row["warnings"] else []

        # key_points may be list of dicts with "text" key or list of strings
        if key_points and isinstance(key_points[0], dict):
            key_points = [kp.get("text", str(kp)) for kp in key_points]

        return PregeneratedAnswer(
            question=row["question"],
            answer=row["answer"],
            sources=sources if isinstance(sources, list) else [],
            key_points=key_points if isinstance(key_points, list) else [],
            costs_data=costs_data if isinstance(costs_data, list) else [],
            tips=tips if isinstance(tips, list) else [],
            warnings=warnings if isinstance(warnings, list) else [],
            confidence=confidence,
        )
