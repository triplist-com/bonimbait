from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.category import Category
from models.video import Video
from schemas.category import CategoriesListResponse, CategoryResponse
from services.cache import category_cache

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=CategoriesListResponse)
async def list_categories(
    db: AsyncSession = Depends(get_db),
) -> CategoriesListResponse:
    """List all categories with video counts, ordered by video count descending."""
    cached = category_cache.get("all_categories")
    if cached is not None:
        return cached

    # Subquery for video counts
    video_count_sq = (
        select(
            Video.category_id,
            func.count(Video.id).label("video_count"),
        )
        .group_by(Video.category_id)
        .subquery()
    )

    stmt = (
        select(
            Category,
            func.coalesce(video_count_sq.c.video_count, 0).label("video_count"),
        )
        .outerjoin(video_count_sq, Category.id == video_count_sq.c.category_id)
        .order_by(func.coalesce(video_count_sq.c.video_count, 0).desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    categories = [
        CategoryResponse(
            id=cat.id,
            name_he=cat.name_he,
            slug=cat.slug,
            description_he=cat.description_he,
            icon=cat.icon,
            video_count=count,
            created_at=cat.created_at,
        )
        for cat, count in rows
    ]

    response = CategoriesListResponse(categories=categories, total=len(categories))
    category_cache.set("all_categories", response)
    return response
