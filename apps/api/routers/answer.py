"""Router for AI answer generation endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas.answer import AnswerRequest, AnswerResponse
from services.answer import AnswerService
from services.answer_cache import AnswerCache
from services.budget_tracker import BudgetTracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/answer", tags=["answer"])

# Shared singleton instances so cache and budget are preserved across requests.
_answer_cache = AnswerCache()
_budget_tracker = BudgetTracker()
_answer_service = AnswerService(cache=_answer_cache, budget_tracker=_budget_tracker)


def get_answer_service() -> AnswerService:
    return _answer_service


# ------------------------------------------------------------------
# POST /api/answer  — full (non-streaming) answer
# ------------------------------------------------------------------


@router.post("", response_model=AnswerResponse)
async def generate_answer(
    request: AnswerRequest,
    db: AsyncSession = Depends(get_db),
    service: AnswerService = Depends(get_answer_service),
) -> AnswerResponse:
    """Generate an AI answer based on relevant video segments."""
    try:
        return await service.generate_answer(query=request.query, db=db)
    except Exception:
        logger.exception("Answer generation failed for query: %s", request.query)
        raise HTTPException(
            status_code=502,
            detail="Failed to generate answer. Please try again later.",
        )


# ------------------------------------------------------------------
# POST /api/answer/stream  — SSE streaming answer
# ------------------------------------------------------------------


@router.post("/stream")
async def generate_answer_stream(
    request: AnswerRequest,
    db: AsyncSession = Depends(get_db),
    service: AnswerService = Depends(get_answer_service),
) -> StreamingResponse:
    """Stream an AI answer as Server-Sent Events."""
    return StreamingResponse(
        service.generate_answer_stream(query=request.query, db=db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ------------------------------------------------------------------
# GET /api/answer/cached  — check cache
# ------------------------------------------------------------------


@router.get("/cached", response_model=AnswerResponse)
async def get_cached_answer(
    q: str = Query(..., min_length=3, max_length=500, description="Query to look up"),
    service: AnswerService = Depends(get_answer_service),
) -> AnswerResponse:
    """Return a cached answer if one exists for this query."""
    cached = service.cache.get(q)
    if cached is None:
        raise HTTPException(status_code=404, detail="No cached answer found for this query.")
    return cached


# ------------------------------------------------------------------
# GET /api/answer/budget  — budget stats (admin use)
# ------------------------------------------------------------------


@router.get("/budget")
async def get_budget_stats() -> dict:
    """Return current daily budget statistics."""
    return _budget_tracker.daily_stats
