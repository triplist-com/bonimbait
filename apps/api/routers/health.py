from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    """Health check endpoint with database connectivity and extension status."""
    db_status = "healthy"
    pgvector_loaded = False
    video_count = 0
    segment_count = 0
    embedding_count = 0
    pregenerated_answers_count = 0
    categories_with_ai_summary_count = 0

    try:
        # Basic connectivity
        await db.execute(text("SELECT 1"))

        # Check pgvector extension
        ext_result = await db.execute(
            text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        )
        pgvector_loaded = ext_result.scalar_one_or_none() is not None

        # Counts
        vc = await db.execute(text("SELECT COUNT(*) FROM videos"))
        video_count = vc.scalar_one()

        sc = await db.execute(text("SELECT COUNT(*) FROM video_segments"))
        segment_count = sc.scalar_one()

        ec = await db.execute(text("SELECT COUNT(*) FROM embeddings"))
        embedding_count = ec.scalar_one()

        # Pregenerated answers count
        try:
            pac = await db.execute(text("SELECT COUNT(*) FROM pregenerated_answers"))
            pregenerated_answers_count = pac.scalar_one()
        except Exception:
            pass  # Table may not exist yet

        # Categories with AI summaries
        try:
            cac = await db.execute(
                text("SELECT COUNT(*) FROM categories WHERE ai_summary IS NOT NULL AND ai_summary != ''")
            )
            categories_with_ai_summary_count = cac.scalar_one()
        except Exception:
            pass  # Table or column may not exist yet

    except Exception as exc:
        db_status = f"unhealthy: {exc}"

    ready = db_status == "healthy" and video_count > 0 and embedding_count > 0

    return {
        "status": "ok" if db_status == "healthy" else "degraded",
        "ready": ready,
        "version": settings.APP_VERSION,
        "database": db_status,
        "pgvector": pgvector_loaded,
        "counts": {
            "videos": video_count,
            "segments": segment_count,
            "embeddings": embedding_count,
            "pregenerated_answers": pregenerated_answers_count,
            "categories_with_ai_summary": categories_with_ai_summary_count,
        },
    }
