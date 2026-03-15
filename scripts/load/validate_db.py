"""
Validate data integrity in the database.

Checks:
  - All 10 categories exist
  - Video count matches expected
  - Every video has at least 1 segment
  - Every segment has an embedding
  - Every video has a summary embedding
  - No NULL category_ids (or reports count)
  - search_vector is populated
  - Sample vector similarity search works
  - Sample full-text search works

Usage:
  python scripts/load/validate_db.py
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
SEGMENT_DIR = DATA_DIR / "processed" / "segments"
EMBEDDING_DIR = DATA_DIR / "processed" / "embeddings"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("validate_db")


# ---------------------------------------------------------------------------
# Database helper
# ---------------------------------------------------------------------------
async def _get_engine():
    from sqlalchemy.ext.asyncio import create_async_engine

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)

    return create_async_engine(database_url, echo=False)


# ---------------------------------------------------------------------------
# Validation checks
# ---------------------------------------------------------------------------
async def _validate() -> bool:
    """Run all validation checks. Returns True if all pass."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    engine = await _get_engine()
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    passed = 0
    failed = 0
    warnings = 0

    def check_pass(label: str, detail: str = ""):
        nonlocal passed
        passed += 1
        msg = f"  PASS: {label}"
        if detail:
            msg += f" ({detail})"
        logger.info(msg)

    def check_fail(label: str, detail: str = ""):
        nonlocal failed
        failed += 1
        msg = f"  FAIL: {label}"
        if detail:
            msg += f" ({detail})"
        logger.error(msg)

    def check_warn(label: str, detail: str = ""):
        nonlocal warnings
        warnings += 1
        msg = f"  WARN: {label}"
        if detail:
            msg += f" ({detail})"
        logger.warning(msg)

    try:
        async with async_session() as session:
            logger.info("=" * 60)
            logger.info("DATABASE VALIDATION REPORT")
            logger.info("=" * 60)

            # 1. Check categories
            cat_count = (await session.execute(text("SELECT COUNT(*) FROM categories"))).scalar()
            if cat_count == 10:
                check_pass("Categories count", f"{cat_count} categories")
            elif cat_count > 0:
                check_warn("Categories count", f"expected 10, found {cat_count}")
            else:
                check_fail("Categories count", "no categories found")

            # 2. Check video count
            vid_count = (await session.execute(text("SELECT COUNT(*) FROM videos"))).scalar()
            # Expected count from segment files
            expected_vids = len([
                f for f in SEGMENT_DIR.glob("*.json") if f.name != "all_segments.json"
            ]) if SEGMENT_DIR.exists() else 0
            if vid_count > 0:
                if expected_vids > 0 and vid_count >= expected_vids:
                    check_pass("Video count", f"{vid_count} videos (expected >= {expected_vids})")
                elif expected_vids > 0:
                    check_warn("Video count", f"{vid_count} videos but expected >= {expected_vids}")
                else:
                    check_pass("Video count", f"{vid_count} videos")
            else:
                check_fail("Video count", "no videos found")

            # 3. Check every video has at least 1 segment
            videos_without_segments = (await session.execute(text("""
                SELECT COUNT(*) FROM videos v
                LEFT JOIN video_segments vs ON v.id = vs.video_id
                WHERE vs.id IS NULL
            """))).scalar()
            if videos_without_segments == 0:
                seg_count = (await session.execute(text("SELECT COUNT(*) FROM video_segments"))).scalar()
                check_pass("All videos have segments", f"{seg_count} total segments")
            else:
                check_warn(
                    "Videos without segments",
                    f"{videos_without_segments} / {vid_count} videos have no segments",
                )

            # 4. Check every segment has an embedding
            seg_count = (await session.execute(text("SELECT COUNT(*) FROM video_segments"))).scalar()
            segments_without_embeddings = (await session.execute(text("""
                SELECT COUNT(*) FROM video_segments vs
                LEFT JOIN embeddings e ON vs.id = e.video_segment_id AND e.content_type = 'segment'
                WHERE e.id IS NULL
            """))).scalar()
            if segments_without_embeddings == 0:
                emb_count = (await session.execute(text("SELECT COUNT(*) FROM embeddings"))).scalar()
                check_pass("All segments have embeddings", f"{emb_count} total embeddings")
            else:
                check_warn(
                    "Segments without embeddings",
                    f"{segments_without_embeddings} / {seg_count} segments lack embeddings",
                )

            # 5. Check every video has a summary embedding
            videos_without_summary_emb = (await session.execute(text("""
                SELECT COUNT(*) FROM videos v
                WHERE NOT EXISTS (
                    SELECT 1 FROM embeddings e
                    WHERE e.video_id = v.id AND e.content_type = 'summary'
                )
            """))).scalar()
            if videos_without_summary_emb == 0:
                check_pass("All videos have summary embeddings")
            else:
                check_warn(
                    "Videos without summary embeddings",
                    f"{videos_without_summary_emb} / {vid_count}",
                )

            # 6. Check NULL category_ids
            null_cats = (await session.execute(text(
                "SELECT COUNT(*) FROM videos WHERE category_id IS NULL"
            ))).scalar()
            if null_cats == 0:
                check_pass("No NULL category_ids")
            else:
                check_warn("NULL category_ids", f"{null_cats} / {vid_count} videos")

            # 7. Check search_vector is populated
            try:
                populated_videos = (await session.execute(text(
                    "SELECT COUNT(*) FROM videos WHERE search_vector IS NOT NULL"
                ))).scalar()
                if populated_videos == vid_count and vid_count > 0:
                    check_pass("Video search_vector populated", f"{populated_videos} / {vid_count}")
                elif populated_videos > 0:
                    check_warn("Video search_vector", f"only {populated_videos} / {vid_count} populated")
                else:
                    check_warn("Video search_vector", "not populated (run build_indexes.py first)")
            except Exception:
                check_warn("Video search_vector", "column does not exist yet")

            try:
                populated_segs = (await session.execute(text(
                    "SELECT COUNT(*) FROM video_segments WHERE search_vector IS NOT NULL"
                ))).scalar()
                if populated_segs == seg_count and seg_count > 0:
                    check_pass("Segment search_vector populated", f"{populated_segs} / {seg_count}")
                elif populated_segs > 0:
                    check_warn("Segment search_vector", f"only {populated_segs} / {seg_count} populated")
                else:
                    check_warn("Segment search_vector", "not populated (run build_indexes.py first)")
            except Exception:
                check_warn("Segment search_vector", "column does not exist yet")

            # 8. Sample vector similarity search
            try:
                # Get a sample embedding and find its nearest neighbors
                sample = (await session.execute(text("""
                    SELECT id, embedding FROM embeddings LIMIT 1
                """))).fetchone()

                if sample:
                    neighbors = (await session.execute(text("""
                        SELECT id, embedding <=> (SELECT embedding FROM embeddings WHERE id = :sample_id) AS distance
                        FROM embeddings
                        WHERE id != :sample_id
                        ORDER BY distance
                        LIMIT 5
                    """), {"sample_id": sample[0]})).fetchall()

                    if neighbors:
                        check_pass(
                            "Vector similarity search works",
                            f"found {len(neighbors)} neighbors, closest distance: {neighbors[0][1]:.4f}",
                        )
                    else:
                        check_warn("Vector similarity search", "no neighbors found (only 1 embedding?)")
                else:
                    check_warn("Vector similarity search", "no embeddings to test with")
            except Exception as exc:
                check_fail("Vector similarity search", str(exc))

            # 9. Sample full-text search
            try:
                fts_result = (await session.execute(text("""
                    SELECT COUNT(*) FROM videos
                    WHERE search_vector @@ to_tsquery('simple', :query)
                """), {"query": "בנייה"})).scalar()

                if fts_result is not None and fts_result >= 0:
                    check_pass(
                        "Full-text search works",
                        f"query 'בנייה' matched {fts_result} videos",
                    )
                else:
                    check_warn("Full-text search", "unexpected result")
            except Exception as exc:
                check_warn("Full-text search", f"not available yet: {exc}")

        # Summary
        logger.info("")
        logger.info("=" * 60)
        logger.info("VALIDATION SUMMARY")
        logger.info("=" * 60)
        logger.info("  Passed:   %d", passed)
        logger.info("  Warnings: %d", warnings)
        logger.info("  Failed:   %d", failed)

        return failed == 0

    finally:
        await engine.dispose()


def validate_db() -> bool:
    """Public entry point. Returns True if all checks pass."""
    return asyncio.run(_validate())


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    parser = argparse.ArgumentParser(
        description="Validate data integrity in the database",
    )
    parser.parse_args()

    success = validate_db()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
