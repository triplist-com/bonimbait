"""
Build search indexes on the loaded database.

Creates:
  - HNSW index on embeddings for vector similarity search
  - Full-text search (tsvector) on videos and video_segments
  - B-tree indexes for common lookups

Usage:
  python scripts/load/build_indexes.py
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("build_indexes")


# ---------------------------------------------------------------------------
# Index definitions
# ---------------------------------------------------------------------------
VECTOR_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
ON embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"""

VIDEO_SEARCH_VECTOR_SQL = [
    """
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS search_vector tsvector;
    """,
    """
    UPDATE videos SET search_vector =
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(transcript_text, '')), 'C');
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_videos_search ON videos USING gin(search_vector);
    """,
]

SEGMENT_SEARCH_VECTOR_SQL = [
    """
    ALTER TABLE video_segments ADD COLUMN IF NOT EXISTS search_vector tsvector;
    """,
    """
    UPDATE video_segments SET search_vector = to_tsvector('simple', coalesce(text, ''));
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_segments_search ON video_segments USING gin(search_vector);
    """,
]

BTREE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category_id);",
    "CREATE INDEX IF NOT EXISTS idx_videos_youtube_id ON videos(youtube_id);",
    "CREATE INDEX IF NOT EXISTS idx_segments_video_id ON video_segments(video_id);",
    "CREATE INDEX IF NOT EXISTS idx_embeddings_video_id ON embeddings(video_id);",
    "CREATE INDEX IF NOT EXISTS idx_embeddings_segment_id ON embeddings(video_segment_id);",
    "CREATE INDEX IF NOT EXISTS idx_embeddings_content_type ON embeddings(content_type);",
]


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
async def _get_engine():
    from sqlalchemy.ext.asyncio import create_async_engine

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)

    return create_async_engine(database_url, echo=False)


async def _execute_sql(engine, label: str, sql: str) -> float:
    """Execute a single SQL statement and return elapsed time."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    start = time.monotonic()
    async with async_session() as session:
        async with session.begin():
            await session.execute(text(sql))
    elapsed = time.monotonic() - start

    logger.info("  [%.1fs] %s", elapsed, label)
    return elapsed


async def _get_index_sizes(engine) -> dict[str, str]:
    """Get sizes of all custom indexes."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    index_names = [
        "idx_embeddings_vector",
        "idx_videos_search",
        "idx_segments_search",
        "idx_videos_category",
        "idx_videos_youtube_id",
        "idx_segments_video_id",
        "idx_embeddings_video_id",
        "idx_embeddings_segment_id",
        "idx_embeddings_content_type",
    ]

    sizes = {}
    async with async_session() as session:
        for name in index_names:
            try:
                result = await session.execute(
                    text("SELECT pg_size_pretty(pg_relation_size(:name))"),
                    {"name": name},
                )
                row = result.fetchone()
                sizes[name] = row[0] if row else "N/A"
            except Exception:
                sizes[name] = "not found"

    return sizes


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def _build_all_indexes() -> None:
    engine = await _get_engine()

    try:
        total_start = time.monotonic()

        # 1. HNSW vector index
        logger.info("Building HNSW vector index (this may take a few minutes)...")
        await _execute_sql(engine, "HNSW index on embeddings", VECTOR_INDEX_SQL)

        # 2. Video full-text search
        logger.info("Building video full-text search...")
        for i, sql in enumerate(VIDEO_SEARCH_VECTOR_SQL):
            labels = ["Add search_vector column to videos", "Populate video search vectors", "GIN index on videos"]
            await _execute_sql(engine, labels[i], sql)

        # 3. Segment full-text search
        logger.info("Building segment full-text search...")
        for i, sql in enumerate(SEGMENT_SEARCH_VECTOR_SQL):
            labels = ["Add search_vector column to segments", "Populate segment search vectors", "GIN index on segments"]
            await _execute_sql(engine, labels[i], sql)

        # 4. B-tree indexes
        logger.info("Building B-tree indexes...")
        for sql in BTREE_INDEXES_SQL:
            # Extract index name from SQL for label
            name = sql.split("IF NOT EXISTS ")[1].split(" ON")[0].strip()
            await _execute_sql(engine, f"B-tree: {name}", sql)

        total_elapsed = time.monotonic() - total_start

        # Print index sizes
        logger.info("")
        logger.info("=" * 60)
        logger.info("INDEX BUILD COMPLETE (%.1fs total)", total_elapsed)
        logger.info("=" * 60)

        sizes = await _get_index_sizes(engine)
        for name, size in sizes.items():
            logger.info("  %-35s %s", name, size)

    finally:
        await engine.dispose()


def build_indexes() -> None:
    """Public entry point."""
    asyncio.run(_build_all_indexes())


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(
        description="Build search indexes on the database",
    )
    parser.parse_args()

    build_indexes()


if __name__ == "__main__":
    main()
