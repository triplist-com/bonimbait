from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.category import Category
from models.video import Video
from schemas.video import (
    PaginatedVideosResponse,
    VideoDetail,
    VideoSegmentResponse,
    VideoSummary,
)

router = APIRouter(prefix="/api/videos", tags=["videos"])

SORT_OPTIONS = {
    "newest": Video.published_at.desc(),
    "oldest": Video.published_at.asc(),
    "title": Video.title.asc(),
}


@router.get("", response_model=PaginatedVideosResponse)
async def list_videos(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    category_id: uuid.UUID | None = Query(None, description="Filter by category ID"),
    sort: str = Query("newest", description="Sort order: newest, oldest, title"),
    db: AsyncSession = Depends(get_db),
) -> PaginatedVideosResponse:
    """List videos with pagination, filtering, and sorting."""
    # Base query
    base_filter = select(Video).outerjoin(Category, Video.category_id == Category.id)

    if category_id is not None:
        base_filter = base_filter.where(Video.category_id == category_id)

    # Total count
    count_stmt = select(func.count()).select_from(base_filter.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Sort
    order = SORT_OPTIONS.get(sort)
    if order is None:
        order = Video.published_at.desc()

    # Paginated query with category name
    offset = (page - 1) * limit
    stmt = (
        select(Video, Category.name_he.label("category_name"))
        .outerjoin(Category, Video.category_id == Category.id)
        .order_by(order)
        .offset(offset)
        .limit(limit)
    )

    if category_id is not None:
        stmt = stmt.where(Video.category_id == category_id)

    result = await db.execute(stmt)
    rows = result.all()

    videos = [
        VideoSummary(
            id=video.id,
            youtube_id=video.youtube_id,
            title=video.title,
            description=video.description,
            duration_seconds=video.duration_seconds,
            thumbnail_url=video.thumbnail_url,
            published_at=video.published_at,
            category_id=video.category_id,
            summary=video.summary,
            created_at=video.created_at,
            updated_at=video.updated_at,
            category_name=cat_name,
        )
        for video, cat_name in rows
    ]

    pages = max(1, math.ceil(total / limit))

    return PaginatedVideosResponse(
        videos=videos,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/{video_id}", response_model=VideoDetail)
async def get_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> VideoDetail:
    """Get full video detail including segments, key points, and costs."""
    stmt = (
        select(Video, Category.name_he.label("category_name"))
        .outerjoin(Category, Video.category_id == Category.id)
        .where(Video.id == video_id)
        .options(selectinload(Video.segments))
    )
    result = await db.execute(stmt)
    row = result.first()

    if row is None:
        raise HTTPException(status_code=404, detail="Video not found")

    video, cat_name = row

    # Parse key_points and costs_data from JSONB
    key_points = video.key_points if isinstance(video.key_points, list) else None
    costs_data = video.costs_data if isinstance(video.costs_data, list) else None

    sorted_segments = sorted(video.segments, key=lambda s: s.segment_index)
    segments = [
        VideoSegmentResponse(
            id=seg.id,
            video_id=seg.video_id,
            start_time=seg.start_time,
            end_time=seg.end_time,
            text=seg.text,
            summary=seg.summary,
            segment_index=seg.segment_index,
            created_at=seg.created_at,
        )
        for seg in sorted_segments
    ]

    return VideoDetail(
        id=video.id,
        youtube_id=video.youtube_id,
        title=video.title,
        description=video.description,
        duration_seconds=video.duration_seconds,
        thumbnail_url=video.thumbnail_url,
        published_at=video.published_at,
        category_id=video.category_id,
        summary=video.summary,
        created_at=video.created_at,
        updated_at=video.updated_at,
        transcript_text=video.transcript_text,
        key_points=key_points,
        costs_data=costs_data,
        segments=segments,
        category_name=cat_name,
    )


@router.get("/{video_id}/related", response_model=list[VideoSummary])
async def get_related_videos(
    video_id: uuid.UUID,
    limit: int = Query(6, ge=1, le=20, description="Number of related videos"),
    db: AsyncSession = Depends(get_db),
) -> list[VideoSummary]:
    """Find related videos using embedding similarity or same-category fallback."""
    # First, verify the video exists and get its category
    video_stmt = select(Video).where(Video.id == video_id)
    video_result = await db.execute(video_stmt)
    video = video_result.scalar_one_or_none()

    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    related_ids: list[uuid.UUID] = []

    # Try semantic similarity: find an embedding for this video, then find neighbors
    try:
        embedding_sql = text("""
            SELECT embedding
            FROM embeddings
            WHERE video_id = :video_id
            LIMIT 1
        """)
        emb_result = await db.execute(embedding_sql, {"video_id": video_id})
        emb_row = emb_result.first()

        if emb_row is not None:
            # Use this embedding to find similar videos
            neighbor_sql = text("""
                SELECT DISTINCT e.video_id
                FROM embeddings e
                WHERE e.video_id != :video_id
                ORDER BY e.embedding <=> (
                    SELECT embedding FROM embeddings
                    WHERE video_id = :video_id
                    LIMIT 1
                )
                LIMIT :limit
            """)
            neighbor_result = await db.execute(
                neighbor_sql, {"video_id": video_id, "limit": limit}
            )
            related_ids = [row[0] for row in neighbor_result.fetchall()]
    except Exception:
        pass

    # Fallback: same category
    if len(related_ids) < limit and video.category_id is not None:
        existing = set(related_ids)
        existing.add(video_id)

        fallback_stmt = (
            select(Video.id)
            .where(
                Video.category_id == video.category_id,
                Video.id.notin_(existing),
            )
            .order_by(Video.published_at.desc())
            .limit(limit - len(related_ids))
        )
        fallback_result = await db.execute(fallback_stmt)
        related_ids.extend(row[0] for row in fallback_result.fetchall())

    if not related_ids:
        return []

    # Hydrate related videos
    placeholders = ", ".join(f":id_{i}" for i in range(len(related_ids)))
    params: dict = {f"id_{i}": vid for i, vid in enumerate(related_ids)}

    hydrate_sql = text(f"""
        SELECT v.*, c.name_he AS category_name
        FROM videos v
        LEFT JOIN categories c ON c.id = v.category_id
        WHERE v.id IN ({placeholders})
    """)
    hydrate_result = await db.execute(hydrate_sql, params)
    rows = hydrate_result.mappings().all()

    # Preserve the order from related_ids
    row_map = {row["id"]: row for row in rows}
    output = []
    for vid in related_ids:
        row = row_map.get(vid)
        if row:
            output.append(
                VideoSummary(
                    id=row["id"],
                    youtube_id=row["youtube_id"],
                    title=row["title"],
                    description=row["description"],
                    duration_seconds=row["duration_seconds"],
                    thumbnail_url=row["thumbnail_url"],
                    published_at=row["published_at"],
                    category_id=row["category_id"],
                    summary=row["summary"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    category_name=row["category_name"],
                )
            )

    return output
