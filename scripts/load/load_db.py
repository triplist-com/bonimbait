"""
Bulk load all processed data into PostgreSQL.

Loads categories, videos, segments, and embeddings in order, respecting
foreign key constraints. Uses async SQLAlchemy with asyncpg for performance.

Features:
  - Bulk inserts in batches of 100 videos
  - Upsert categories by slug
  - --clear flag to truncate all tables before loading
  - --videos-only, --segments-only, --embeddings-only for partial loads
  - Progress tracking with counts
  - Referential integrity validation after loading

Usage:
  python scripts/load/load_db.py                   # Load everything
  python scripts/load/load_db.py --clear            # Truncate + reload
  python scripts/load/load_db.py --videos-only      # Load only videos
  python scripts/load/load_db.py --embeddings-only  # Load only embeddings
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
METADATA_FILE = DATA_DIR / "raw" / "metadata" / "channel_videos.json"
TRANSCRIPT_DIR = DATA_DIR / "processed" / "transcripts"
SEGMENT_DIR = DATA_DIR / "processed" / "segments"
SUMMARY_DIR = DATA_DIR / "processed" / "summaries"
EMBEDDING_DIR = DATA_DIR / "processed" / "embeddings"

# Add api directory to sys.path for model imports
API_DIR = PROJECT_ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BATCH_SIZE = 100

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("load_db")


# ---------------------------------------------------------------------------
# Category taxonomy (imported from summarize prompts)
# ---------------------------------------------------------------------------
def _get_categories() -> list[dict]:
    """Load category taxonomy from summarize prompts."""
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    from scripts.summarize.prompts import CATEGORIES
    return CATEGORIES


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
async def _get_engine():
    """Create async SQLAlchemy engine from DATABASE_URL."""
    from sqlalchemy.ext.asyncio import create_async_engine

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)

    return create_async_engine(database_url, echo=False)


async def _clear_tables(engine) -> None:
    """Truncate all tables in reverse FK order."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():
            # Truncate in reverse FK order
            await session.execute(text("TRUNCATE TABLE embeddings CASCADE"))
            await session.execute(text("TRUNCATE TABLE video_segments CASCADE"))
            await session.execute(text("TRUNCATE TABLE videos CASCADE"))
            await session.execute(text("TRUNCATE TABLE categories CASCADE"))
    logger.info("All tables truncated")


# ---------------------------------------------------------------------------
# Load categories
# ---------------------------------------------------------------------------
async def _load_categories(engine) -> dict[str, uuid.UUID]:
    """
    Insert/upsert all categories. Returns mapping of slug -> category UUID.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    categories = _get_categories()
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    slug_to_id: dict[str, uuid.UUID] = {}

    async with async_session() as session:
        async with session.begin():
            for cat in categories:
                cat_id = uuid.uuid4()
                # Upsert: insert or update on conflict
                await session.execute(
                    text("""
                        INSERT INTO categories (id, name_he, slug, description_he)
                        VALUES (:id, :name_he, :slug, :description_he)
                        ON CONFLICT (slug) DO UPDATE SET
                            name_he = EXCLUDED.name_he,
                            description_he = EXCLUDED.description_he
                        RETURNING id
                    """),
                    {
                        "id": cat_id,
                        "name_he": cat["name_he"],
                        "slug": cat["slug"],
                        "description_he": cat.get("description_he", ""),
                    },
                )

            # Fetch all category IDs
            result = await session.execute(text("SELECT id, slug FROM categories"))
            for row in result:
                slug_to_id[row[1]] = row[0]

    logger.info("Loaded %d categories", len(slug_to_id))
    return slug_to_id


# ---------------------------------------------------------------------------
# Load videos
# ---------------------------------------------------------------------------
def _load_metadata() -> dict[str, dict]:
    """Load video metadata from channel_videos.json. Returns dict keyed by youtube_id."""
    if not METADATA_FILE.exists():
        logger.warning("Metadata file not found: %s", METADATA_FILE)
        return {}

    try:
        data = json.loads(METADATA_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Cannot read metadata file: %s", exc)
        return {}

    result = {}
    for item in data:
        vid = item.get("youtube_id") or item.get("id") or item.get("video_id")
        if vid:
            result[vid] = item
    return result


def _load_summary(youtube_id: str) -> dict | None:
    """Load summary data for a video."""
    path = SUMMARY_DIR / f"{youtube_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _load_transcript_text(youtube_id: str) -> str | None:
    """Load full transcript text for a video."""
    path = TRANSCRIPT_DIR / f"{youtube_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("full_text", "")
    except (json.JSONDecodeError, OSError):
        return None


async def _load_videos(
    engine,
    slug_to_category_id: dict[str, uuid.UUID],
) -> dict[str, uuid.UUID]:
    """
    Load videos from metadata + summaries + transcripts.
    Returns mapping of youtube_id -> video UUID.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    metadata = _load_metadata()
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Discover all youtube IDs from segments (primary source)
    segment_files = sorted(SEGMENT_DIR.glob("*.json"))
    youtube_ids = [f.stem for f in segment_files if f.name != "all_segments.json"]

    # Also include IDs from metadata that might not have segments
    for vid in metadata:
        if vid not in youtube_ids:
            youtube_ids.append(vid)

    youtube_ids = sorted(set(youtube_ids))
    yt_to_uuid: dict[str, uuid.UUID] = {}

    logger.info("Loading %d videos into database...", len(youtube_ids))

    for batch_start in tqdm(range(0, len(youtube_ids), BATCH_SIZE), desc="Videos", unit="batch"):
        batch_ids = youtube_ids[batch_start : batch_start + BATCH_SIZE]
        rows = []

        for vid in batch_ids:
            meta = metadata.get(vid, {})
            summary = _load_summary(vid)
            transcript_text = _load_transcript_text(vid)
            video_uuid = uuid.uuid4()
            yt_to_uuid[vid] = video_uuid

            # Determine category
            category_id = None
            if summary:
                cat_slug = summary.get("category_slug")
                if cat_slug and cat_slug in slug_to_category_id:
                    category_id = slug_to_category_id[cat_slug]

            # Parse published_at
            published_at = None
            pub_str = meta.get("published_at") or meta.get("publishedAt") or meta.get("upload_date")
            if pub_str:
                try:
                    if "T" in str(pub_str):
                        published_at = datetime.fromisoformat(str(pub_str).replace("Z", "+00:00"))
                    elif len(str(pub_str)) == 8:
                        published_at = datetime.strptime(str(pub_str), "%Y%m%d").replace(tzinfo=timezone.utc)
                    else:
                        published_at = datetime.fromisoformat(str(pub_str))
                except (ValueError, TypeError):
                    pass

            rows.append({
                "id": video_uuid,
                "youtube_id": vid,
                "title": meta.get("title", vid),
                "description": meta.get("description"),
                "duration_seconds": int(meta.get("duration_seconds", 0) or meta.get("duration", 0) or 0),
                "thumbnail_url": meta.get("thumbnail_url") or meta.get("thumbnail"),
                "published_at": published_at,
                "category_id": category_id,
                "transcript_text": transcript_text,
                "summary": summary.get("title_summary") if summary else None,
                "key_points": json.dumps(summary.get("key_points", [])) if summary else None,
                "costs_data": json.dumps(summary.get("costs", [])) if summary else None,
            })

        if rows:
            async with async_session() as session:
                async with session.begin():
                    for row in rows:
                        await session.execute(
                            text("""
                                INSERT INTO videos (
                                    id, youtube_id, title, description, duration_seconds,
                                    thumbnail_url, published_at, category_id,
                                    transcript_text, summary, key_points, costs_data
                                ) VALUES (
                                    :id, :youtube_id, :title, :description, :duration_seconds,
                                    :thumbnail_url, :published_at, :category_id,
                                    :transcript_text, :summary, :key_points::jsonb, :costs_data::jsonb
                                )
                                ON CONFLICT (youtube_id) DO UPDATE SET
                                    title = EXCLUDED.title,
                                    description = EXCLUDED.description,
                                    duration_seconds = EXCLUDED.duration_seconds,
                                    thumbnail_url = EXCLUDED.thumbnail_url,
                                    published_at = EXCLUDED.published_at,
                                    category_id = EXCLUDED.category_id,
                                    transcript_text = EXCLUDED.transcript_text,
                                    summary = EXCLUDED.summary,
                                    key_points = EXCLUDED.key_points,
                                    costs_data = EXCLUDED.costs_data
                                RETURNING id
                            """),
                            row,
                        )

    logger.info("Loaded %d videos", len(yt_to_uuid))
    return yt_to_uuid


# ---------------------------------------------------------------------------
# Load segments
# ---------------------------------------------------------------------------
async def _load_segments(
    engine,
    yt_to_video_id: dict[str, uuid.UUID],
) -> dict[tuple[str, int], uuid.UUID]:
    """
    Load video segments. Returns mapping of (youtube_id, segment_index) -> segment UUID.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    segment_files = sorted(SEGMENT_DIR.glob("*.json"))
    segment_files = [f for f in segment_files if f.name != "all_segments.json"]

    seg_key_to_uuid: dict[tuple[str, int], uuid.UUID] = {}
    total_segments = 0

    logger.info("Loading segments for %d videos...", len(segment_files))

    for batch_start in tqdm(range(0, len(segment_files), BATCH_SIZE), desc="Segments", unit="batch"):
        batch_files = segment_files[batch_start : batch_start + BATCH_SIZE]
        rows = []

        for sf in batch_files:
            youtube_id = sf.stem
            video_id = yt_to_video_id.get(youtube_id)
            if not video_id:
                logger.warning("No video record for %s, skipping segments", youtube_id)
                continue

            try:
                data = json.loads(sf.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Cannot read segment file %s: %s", sf, exc)
                continue

            for seg in data.get("segments", []):
                seg_uuid = uuid.uuid4()
                seg_index = seg.get("segment_index", 0)
                seg_key_to_uuid[(youtube_id, seg_index)] = seg_uuid

                rows.append({
                    "id": seg_uuid,
                    "video_id": video_id,
                    "start_time": seg.get("start_time", 0.0),
                    "end_time": seg.get("end_time", 0.0),
                    "text": seg.get("text", ""),
                    "segment_index": seg_index,
                })

        if rows:
            async with async_session() as session:
                async with session.begin():
                    # Use batch insert
                    for row in rows:
                        await session.execute(
                            text("""
                                INSERT INTO video_segments (id, video_id, start_time, end_time, text, segment_index)
                                VALUES (:id, :video_id, :start_time, :end_time, :text, :segment_index)
                                ON CONFLICT DO NOTHING
                            """),
                            row,
                        )
            total_segments += len(rows)

    logger.info("Loaded %d segments", total_segments)
    return seg_key_to_uuid


# ---------------------------------------------------------------------------
# Load embeddings
# ---------------------------------------------------------------------------
async def _load_embeddings(
    engine,
    yt_to_video_id: dict[str, uuid.UUID],
    seg_key_to_uuid: dict[tuple[str, int], uuid.UUID],
) -> int:
    """Load embeddings from embedding files. Returns count of embeddings loaded."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    embedding_files = sorted(EMBEDDING_DIR.glob("*.json"))
    if not embedding_files:
        logger.info("No embedding files found")
        return 0

    total_embeddings = 0

    logger.info("Loading embeddings for %d videos...", len(embedding_files))

    for batch_start in tqdm(range(0, len(embedding_files), BATCH_SIZE), desc="Embeddings", unit="batch"):
        batch_files = embedding_files[batch_start : batch_start + BATCH_SIZE]
        rows = []

        for ef in batch_files:
            youtube_id = ef.stem
            video_id = yt_to_video_id.get(youtube_id)
            if not video_id:
                logger.warning("No video record for %s, skipping embeddings", youtube_id)
                continue

            try:
                data = json.loads(ef.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Cannot read embedding file %s: %s", ef, exc)
                continue

            for emb in data.get("embeddings", []):
                content_type = emb.get("content_type", "segment")
                segment_index = emb.get("segment_index")
                embedding_vector = emb.get("embedding", [])

                if not embedding_vector:
                    continue

                # Find the segment UUID
                if content_type == "segment" and segment_index is not None:
                    seg_uuid = seg_key_to_uuid.get((youtube_id, segment_index))
                    if not seg_uuid:
                        logger.debug(
                            "No segment record for %s idx %s", youtube_id, segment_index
                        )
                        continue
                elif content_type == "summary":
                    # For summary embeddings, link to the first segment of the video
                    seg_uuid = seg_key_to_uuid.get((youtube_id, 0))
                    if not seg_uuid:
                        logger.debug("No segment 0 for summary embedding %s", youtube_id)
                        continue
                else:
                    continue

                emb_uuid = uuid.uuid4()
                # Convert embedding list to pgvector format string
                vec_str = "[" + ",".join(str(v) for v in embedding_vector) + "]"

                rows.append({
                    "id": emb_uuid,
                    "video_segment_id": seg_uuid,
                    "video_id": video_id,
                    "content_type": content_type,
                    "embedding": vec_str,
                })

        if rows:
            async with async_session() as session:
                async with session.begin():
                    for row in rows:
                        await session.execute(
                            text("""
                                INSERT INTO embeddings (id, video_segment_id, video_id, content_type, embedding)
                                VALUES (:id, :video_segment_id, :video_id, :content_type, :embedding::vector)
                                ON CONFLICT DO NOTHING
                            """),
                            row,
                        )
            total_embeddings += len(rows)

    logger.info("Loaded %d embeddings", total_embeddings)
    return total_embeddings


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
async def _validate_integrity(engine) -> None:
    """Run basic referential integrity checks."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Count records
        cats = (await session.execute(text("SELECT COUNT(*) FROM categories"))).scalar()
        vids = (await session.execute(text("SELECT COUNT(*) FROM videos"))).scalar()
        segs = (await session.execute(text("SELECT COUNT(*) FROM video_segments"))).scalar()
        embs = (await session.execute(text("SELECT COUNT(*) FROM embeddings"))).scalar()

        # Check orphaned segments
        orphan_segs = (await session.execute(text("""
            SELECT COUNT(*) FROM video_segments vs
            LEFT JOIN videos v ON vs.video_id = v.id
            WHERE v.id IS NULL
        """))).scalar()

        # Check orphaned embeddings
        orphan_embs = (await session.execute(text("""
            SELECT COUNT(*) FROM embeddings e
            LEFT JOIN video_segments vs ON e.video_segment_id = vs.id
            WHERE vs.id IS NULL
        """))).scalar()

        # Null categories
        null_cats = (await session.execute(text(
            "SELECT COUNT(*) FROM videos WHERE category_id IS NULL"
        ))).scalar()

    logger.info("=" * 60)
    logger.info("LOAD SUMMARY")
    logger.info("=" * 60)
    logger.info("  Categories:        %d", cats)
    logger.info("  Videos:            %d", vids)
    logger.info("  Segments:          %d", segs)
    logger.info("  Embeddings:        %d", embs)
    logger.info("  Orphaned segments: %d", orphan_segs)
    logger.info("  Orphaned embeds:   %d", orphan_embs)
    logger.info("  NULL category_id:  %d", null_cats)


# ---------------------------------------------------------------------------
# Main loading orchestrator
# ---------------------------------------------------------------------------
async def _load_all(
    *,
    clear: bool = False,
    videos_only: bool = False,
    segments_only: bool = False,
    embeddings_only: bool = False,
) -> None:
    """Run the full data loading pipeline."""
    engine = await _get_engine()

    try:
        if clear:
            await _clear_tables(engine)

        load_all = not (videos_only or segments_only or embeddings_only)

        slug_to_category_id: dict[str, uuid.UUID] = {}
        yt_to_video_id: dict[str, uuid.UUID] = {}
        seg_key_to_uuid: dict[tuple[str, int], uuid.UUID] = {}

        # Step 1: Categories
        if load_all or videos_only:
            slug_to_category_id = await _load_categories(engine)

        # Step 2: Videos
        if load_all or videos_only:
            if not slug_to_category_id:
                slug_to_category_id = await _load_categories(engine)
            yt_to_video_id = await _load_videos(engine, slug_to_category_id)

        # For partial loads, we need to fetch existing mappings from DB
        if segments_only or embeddings_only:
            from sqlalchemy import text
            from sqlalchemy.ext.asyncio import AsyncSession
            from sqlalchemy.orm import sessionmaker

            async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            async with async_session() as session:
                result = await session.execute(text("SELECT youtube_id, id FROM videos"))
                yt_to_video_id = {row[0]: row[1] for row in result}

        # Step 3: Segments
        if load_all or segments_only:
            seg_key_to_uuid = await _load_segments(engine, yt_to_video_id)

        # For embeddings-only, fetch existing segment mappings
        if embeddings_only:
            from sqlalchemy import text
            from sqlalchemy.ext.asyncio import AsyncSession
            from sqlalchemy.orm import sessionmaker

            async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            async with async_session() as session:
                result = await session.execute(text("""
                    SELECT v.youtube_id, vs.segment_index, vs.id
                    FROM video_segments vs
                    JOIN videos v ON vs.video_id = v.id
                """))
                seg_key_to_uuid = {(row[0], row[1]): row[2] for row in result}

        # Step 4: Embeddings
        if load_all or embeddings_only:
            await _load_embeddings(engine, yt_to_video_id, seg_key_to_uuid)

        # Validate
        await _validate_integrity(engine)

    finally:
        await engine.dispose()


def load_db(
    *,
    clear: bool = False,
    videos_only: bool = False,
    segments_only: bool = False,
    embeddings_only: bool = False,
) -> None:
    """Public entry point for database loading."""
    asyncio.run(_load_all(
        clear=clear,
        videos_only=videos_only,
        segments_only=segments_only,
        embeddings_only=embeddings_only,
    ))


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    # Add project root to sys.path
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(
        description="Bulk load processed data into PostgreSQL",
    )
    parser.add_argument(
        "--clear", action="store_true",
        help="Truncate all tables before loading (will ask for confirmation)",
    )
    parser.add_argument("--videos-only", action="store_true", help="Load only categories + videos")
    parser.add_argument("--segments-only", action="store_true", help="Load only segments")
    parser.add_argument("--embeddings-only", action="store_true", help="Load only embeddings")
    args = parser.parse_args()

    if args.clear:
        confirm = input("This will DELETE all data from the database. Type 'yes' to confirm: ")
        if confirm.strip().lower() != "yes":
            logger.info("Aborted.")
            return

    load_db(
        clear=args.clear,
        videos_only=args.videos_only,
        segments_only=args.segments_only,
        embeddings_only=args.embeddings_only,
    )


if __name__ == "__main__":
    main()
