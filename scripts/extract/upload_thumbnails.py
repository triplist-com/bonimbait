"""
Upload generated thumbnails to Supabase Storage.

Reads thumbnails from data/thumbnails/ and uploads them to a Supabase Storage
bucket called 'thumbnails'. The resulting public URLs can then be stored in the
database or used directly by the frontend.

Prerequisites:
  pip install supabase
  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env

Usage:
    python scripts/extract/upload_thumbnails.py              # Upload all
    python scripts/extract/upload_thumbnails.py --video-id X # Upload for one video
    python scripts/extract/upload_thumbnails.py --dry-run    # Preview without uploading
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
UPLOAD_STATUS_FILE = THUMBNAILS_DIR / "upload_status.json"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("upload_thumbnails")

BUCKET_NAME = "thumbnails"


def _load_upload_status() -> dict[str, str]:
    """Load upload status: {filename: public_url}."""
    if UPLOAD_STATUS_FILE.exists():
        try:
            return json.loads(UPLOAD_STATUS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def _save_upload_status(status: dict[str, str]) -> None:
    UPLOAD_STATUS_FILE.write_text(
        json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _get_supabase_client():
    """Create a Supabase client using service role key."""
    try:
        from supabase import create_client
    except ImportError:
        logger.error("supabase package not installed. Run: pip install supabase")
        sys.exit(1)

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key or url == "https://xxx.supabase.co" or key == "eyJ...":
        logger.error(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env "
            "(with real values, not placeholders)"
        )
        sys.exit(1)

    return create_client(url, key)


def _ensure_bucket(client) -> None:
    """Create the thumbnails bucket if it doesn't exist."""
    try:
        client.storage.get_bucket(BUCKET_NAME)
    except Exception:
        logger.info("Creating storage bucket: %s", BUCKET_NAME)
        client.storage.create_bucket(
            BUCKET_NAME,
            options={"public": True, "file_size_limit": 1024 * 1024},  # 1MB max
        )


def upload_thumbnails(
    *,
    video_id: str | None = None,
    dry_run: bool = False,
    resume: bool = True,
) -> dict[str, str]:
    """Upload thumbnails to Supabase Storage. Returns {filename: public_url}."""
    if not THUMBNAILS_DIR.is_dir():
        logger.error("Thumbnails directory not found: %s", THUMBNAILS_DIR)
        sys.exit(1)

    # Collect files to upload
    if video_id:
        files = sorted(THUMBNAILS_DIR.glob(f"{video_id}_*.jpg"))
    else:
        files = sorted(THUMBNAILS_DIR.glob("*.jpg"))

    if not files:
        logger.info("No thumbnail files found")
        return {}

    status = _load_upload_status() if resume else {}
    to_upload = [f for f in files if f.name not in status]

    logger.info(
        "Thumbnails total: %d | Already uploaded: %d | To upload: %d",
        len(files), len(files) - len(to_upload), len(to_upload),
    )

    if dry_run:
        for f in to_upload[:10]:
            logger.info("  Would upload: %s", f.name)
        if len(to_upload) > 10:
            logger.info("  ... and %d more", len(to_upload) - 10)
        return status

    client = _get_supabase_client()
    _ensure_bucket(client)

    supabase_url = os.getenv("SUPABASE_URL", "")

    for f in tqdm(to_upload, desc="Uploading thumbnails", unit="file"):
        try:
            storage_path = f.name
            with open(f, "rb") as fp:
                client.storage.from_(BUCKET_NAME).upload(
                    storage_path,
                    fp,
                    file_options={"content-type": "image/jpeg", "upsert": "true"},
                )
            public_url = f"{supabase_url}/storage/v1/object/public/{BUCKET_NAME}/{storage_path}"
            status[f.name] = public_url
        except Exception as exc:
            logger.warning("Failed to upload %s: %s", f.name, exc)

        # Checkpoint periodically
        if len(status) % 50 == 0:
            _save_upload_status(status)

    _save_upload_status(status)
    logger.info("Upload complete. %d files uploaded.", len(to_upload))
    return status


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    parser = argparse.ArgumentParser(
        description="Upload thumbnails to Supabase Storage"
    )
    parser.add_argument("--video-id", help="Upload thumbnails for a specific video")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    parser.add_argument("--no-resume", action="store_true", help="Re-upload all files")
    args = parser.parse_args()

    upload_thumbnails(
        video_id=args.video_id,
        dry_run=args.dry_run,
        resume=not args.no_resume,
    )


if __name__ == "__main__":
    main()
