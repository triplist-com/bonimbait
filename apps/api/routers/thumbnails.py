"""
Serve timestamp-specific thumbnails for videos.

GET /api/thumbnails/{youtube_id}/{timestamp}
  Returns the closest available pre-generated thumbnail as a JPEG image.

GET /api/thumbnails/{youtube_id}
  Returns the default (t=0) thumbnail or the video's YouTube thumbnail.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter(prefix="/api/thumbnails", tags=["thumbnails"])

# Thumbnails directory — configurable via env var
THUMBNAILS_DIR = Path(
    os.getenv(
        "THUMBNAILS_DIR",
        str(Path(__file__).resolve().parents[2] / ".." / "data" / "thumbnails"),
    )
).resolve()


def _find_closest_thumbnail(youtube_id: str, target_seconds: int) -> Path | None:
    """Find the thumbnail file closest to the requested timestamp."""
    if not THUMBNAILS_DIR.is_dir():
        return None

    # List all thumbnails for this video
    candidates: list[tuple[int, Path]] = []
    for f in THUMBNAILS_DIR.glob(f"{youtube_id}_*.jpg"):
        try:
            ts = int(f.stem.split("_", 1)[1])
            candidates.append((ts, f))
        except (ValueError, IndexError):
            continue

    if not candidates:
        return None

    # Pick the closest timestamp
    candidates.sort(key=lambda c: abs(c[0] - target_seconds))
    return candidates[0][1]


@router.get("/{youtube_id}/{timestamp}")
async def get_thumbnail(youtube_id: str, timestamp: int = 0):
    """Serve the closest pre-generated thumbnail for a video at a timestamp."""
    thumb = _find_closest_thumbnail(youtube_id, timestamp)

    if thumb and thumb.exists():
        return FileResponse(
            thumb,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # Fallback: redirect to YouTube's default thumbnail
    return RedirectResponse(
        url=f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg",
        status_code=302,
    )


@router.get("/{youtube_id}")
async def get_default_thumbnail(youtube_id: str):
    """Serve the default (t=0) thumbnail or fallback to YouTube."""
    return await get_thumbnail(youtube_id, 0)
