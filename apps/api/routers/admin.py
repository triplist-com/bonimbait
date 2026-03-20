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


@router.post("/regenerate-category-summaries")
async def regenerate_category_summaries(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Regenerate AI summaries for all categories using Claude."""
    import json

    import anthropic
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from config import get_settings
    from models.category import Category
    from models.video import Video

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    cats_result = await db.execute(select(Category))
    categories = cats_result.scalars().all()

    processed = 0
    skipped = 0

    for cat in categories:
        video_result = await db.execute(
            select(Video.title, Video.summary, Video.key_points, Video.costs_data)
            .where(Video.category_id == cat.id)
            .where(Video.summary.isnot(None))
        )
        video_rows = video_result.all()
        if not video_rows:
            skipped += 1
            continue

        context_parts = []
        for row in video_rows:
            part = f"[{row.title}]\n{row.summary}"
            if row.key_points and isinstance(row.key_points, list):
                part += "\n" + "\n".join(f"- {kp}" if isinstance(kp, str) else f"- {kp.get('text', '')}" for kp in row.key_points[:5])
            if row.costs_data and isinstance(row.costs_data, list):
                for c in row.costs_data[:3]:
                    if isinstance(c, dict):
                        part += f"\n- עלות: {c.get('item', '')}: {c.get('price', '')} {c.get('unit', '')}"
            context_parts.append(part)

        context = "\n---\n".join(context_parts[:20])

        prompt = f"""אתה מומחה בנייה. סכם את הקטגוריה "{cat.name_he}" על בסיס {len(video_rows)} סרטונים.

{context}

החזר JSON בלבד:
{{"summary": "סיכום כולל...", "key_points": ["נקודה 1", ...], "costs": [{{"item": "פריט", "price": "טווח", "unit": "יחידה"}}], "tips": ["טיפ 1", ...], "warnings": ["אזהרה 1", ...]}}"""

        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            text_content = response.content[0].text.strip()
            if text_content.startswith("```"):
                text_content = text_content.split("\n", 1)[1] if "\n" in text_content else text_content[3:]
                if text_content.endswith("```"):
                    text_content = text_content[:-3].strip()

            data = json.loads(text_content)
            cat.ai_summary = data.get("summary", "")
            cat.ai_key_points = data.get("key_points", [])
            cat.ai_costs_data = data.get("costs", [])
            cat.ai_tips = data.get("tips", [])
            cat.ai_warnings = data.get("warnings", [])
            cat.ai_generated_at = datetime.now(timezone.utc)
            processed += 1
        except Exception:
            logger.exception("Failed to generate summary for category %s", cat.slug)
            skipped += 1

    return {"message": "Category summaries regenerated", "processed": processed, "skipped": skipped}
