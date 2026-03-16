from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.category import Category
from schemas.search import (
    AnswerRequest,
    AnswerResponse,
    SearchResponse,
    SearchResultItem,
    SuggestResponse,
)
from services.search import SearchService

router = APIRouter(prefix="/api", tags=["search"])


def get_search_service(db: AsyncSession = Depends(get_db)) -> SearchService:
    """Dependency that provides a SearchService with a DB session."""
    return SearchService(db=db)


@router.get("/search", response_model=SearchResponse)
async def search_videos(
    q: str = Query(..., min_length=1, description="Search query"),
    category: str | None = Query(None, description="Category slug filter"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    db: AsyncSession = Depends(get_db),
    service: SearchService = Depends(get_search_service),
) -> SearchResponse:
    """Search videos using hybrid semantic + full-text search."""
    # Resolve category slug to ID if provided
    category_id: uuid.UUID | None = None
    if category:
        cat_stmt = select(Category).where(Category.slug == category)
        cat_result = await db.execute(cat_stmt)
        cat = cat_result.scalar_one_or_none()
        if cat is None:
            raise HTTPException(
                status_code=400, detail=f"Unknown category slug: {category}"
            )
        category_id = cat.id

    offset = (page - 1) * limit
    results, total = await service.hybrid_search(
        q, category_id=category_id, limit=limit, offset=offset
    )

    if not results:
        return SearchResponse(
            results=[],
            total=0,
            query=q,
            page=page,
            limit=limit,
            pages=0,
        )

    # Hydrate results with video metadata
    video_ids = [r.video_id for r in results]
    placeholders = ", ".join(f":id_{i}" for i in range(len(video_ids)))
    params: dict = {f"id_{i}": vid for i, vid in enumerate(video_ids)}

    sql = text(f"""
        SELECT v.id, v.youtube_id, v.title, v.description, v.summary,
               v.thumbnail_url, v.duration_seconds, v.published_at,
               v.category_id, c.name_he AS category_name
        FROM videos v
        LEFT JOIN categories c ON c.id = v.category_id
        WHERE v.id IN ({placeholders})
    """)
    db_result = await db.execute(sql, params)
    video_map = {row[0]: row for row in db_result.fetchall()}

    items = []
    for r in results:
        row = video_map.get(r.video_id)
        if row is None:
            continue

        # Build segment thumbnail URL when a matching timestamp is available
        segment_thumb_url = None
        if r.segment_time is not None:
            segment_thumb_url = (
                f"/api/thumbnails/{row[1]}/{int(r.segment_time)}"
            )

        items.append(
            SearchResultItem(
                video_id=row[0],
                youtube_id=row[1],
                title=row[2],
                description=row[3],
                summary=row[4],
                thumbnail_url=row[5],
                duration_seconds=row[6] or 0,
                published_at=row[7],
                category_id=row[8],
                category_name=row[9],
                score=r.score,
                snippet=r.snippet,
                matching_segment_time=r.segment_time,
                segment_thumbnail_url=segment_thumb_url,
            )
        )

    pages = max(1, math.ceil(total / limit))

    return SearchResponse(
        results=items,
        total=total,
        query=q,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/search/suggest", response_model=SuggestResponse)
async def search_suggest(
    q: str = Query(..., min_length=2, description="Autocomplete query"),
    service: SearchService = Depends(get_search_service),
) -> SuggestResponse:
    """Get autocomplete suggestions for search queries."""
    suggestions = await service.suggest(q, limit=5)
    return SuggestResponse(suggestions=suggestions, query=q)


@router.post("/answer", response_model=AnswerResponse)
async def answer_question(
    request: AnswerRequest,
    service: SearchService = Depends(get_search_service),
) -> AnswerResponse:
    """Generate an AI answer based on video content (placeholder)."""
    return await service.answer(
        question=request.question,
        category_id=request.category_id,
    )
