"""Analytics event tracking service.

Inserts analytics events into the analytics_events table for
admin dashboard reporting.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Valid event types
VALID_EVENT_TYPES = {
    "search_query",
    "ai_answer_generated",
    "wizard_started",
    "wizard_completed",
    "upsell_clicked",
    "whatsapp_clicked",
}


async def track_event(
    db: AsyncSession,
    event_type: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Insert an analytics event into the analytics_events table.

    Args:
        db: Async database session.
        event_type: One of the VALID_EVENT_TYPES.
        metadata: Optional JSON-serialisable metadata dict.
    """
    if event_type not in VALID_EVENT_TYPES:
        logger.warning("Unknown analytics event type: %s", event_type)
        return

    try:
        await db.execute(
            text(
                "INSERT INTO analytics_events (event_type, metadata) "
                "VALUES (:event_type, :metadata)"
            ),
            {
                "event_type": event_type,
                "metadata": metadata if metadata else {},
            },
        )
        logger.debug("Tracked event: %s", event_type)
    except Exception:
        logger.exception("Failed to track analytics event: %s", event_type)
