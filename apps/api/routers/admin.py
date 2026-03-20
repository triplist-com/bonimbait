"""Admin API endpoints for analytics and system management."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.answer_cache import AnswerCache
from services.cache import category_cache, search_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get_budget_tracker():
    """Import the budget tracker singleton from the answer router."""
    from routers.answer import _budget_tracker

    return _budget_tracker


def _get_answer_cache() -> AnswerCache:
    """Import the answer cache singleton from the answer router."""
    from routers.answer import _answer_cache

    return _answer_cache


@router.get("/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return admin dashboard statistics.

    Includes today's event counts, top queries, and system health.
    """
    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    # Today's event counts
    today_counts = {}
    event_map = {
        "queries": "search_query",
        "ai_answers": "ai_answer_generated",
        "wizard_starts": "wizard_started",
        "wizard_completions": "wizard_completed",
        "upsell_clicks": "upsell_clicked",
    }
    for key, event_type in event_map.items():
        try:
            result = await db.execute(
                text(
                    "SELECT COUNT(*) FROM analytics_events "
                    "WHERE event_type = :et AND created_at >= :ts"
                ),
                {"et": event_type, "ts": today_start},
            )
            today_counts[key] = result.scalar_one()
        except Exception:
            today_counts[key] = 0

    # Top queries today
    top_queries = []
    try:
        result = await db.execute(
            text(
                "SELECT metadata->>'query' AS query, COUNT(*) AS cnt "
                "FROM analytics_events "
                "WHERE event_type = 'search_query' AND created_at >= :ts "
                "AND metadata->>'query' IS NOT NULL "
                "GROUP BY metadata->>'query' "
                "ORDER BY cnt DESC LIMIT 10"
            ),
            {"ts": today_start},
        )
        top_queries = [
            {"query": row[0], "count": row[1]} for row in result.fetchall()
        ]
    except Exception:
        logger.exception("Failed to fetch top queries")

    # System stats
    system = {"api_status": "healthy"}

    count_queries = {
        "video_count": "SELECT COUNT(*) FROM videos",
        "segment_count": "SELECT COUNT(*) FROM video_segments",
        "embedding_count": "SELECT COUNT(*) FROM embeddings",
    }
    for key, sql in count_queries.items():
        try:
            result = await db.execute(text(sql))
            system[key] = result.scalar_one()
        except Exception:
            system[key] = 0

    # Pregenerated answers count
    try:
        result = await db.execute(
            text("SELECT COUNT(*) FROM pregenerated_answers")
        )
        system["pregenerated_answers"] = result.scalar_one()
    except Exception:
        system["pregenerated_answers"] = 0

    # Budget remaining
    budget_tracker = _get_budget_tracker()
    system["budget_remaining"] = round(budget_tracker.remaining_budget, 2)

    return {
        "today": today_counts,
        "top_queries": top_queries,
        "system": system,
    }


@router.post("/cache/invalidate")
async def invalidate_caches() -> dict:
    """Clear all in-memory caches."""
    answer_cache = _get_answer_cache()
    answer_cache.clear()
    search_cache.clear()
    category_cache.clear()

    logger.info("All caches invalidated by admin")
    return {"status": "ok", "message": "All caches cleared"}
