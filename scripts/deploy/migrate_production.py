#!/usr/bin/env python3
"""Run Alembic migrations on the production database and verify schema."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Ensure the API directory is importable
API_DIR = Path(__file__).resolve().parent.parent.parent / "apps" / "api"
sys.path.insert(0, str(API_DIR))


def get_database_url() -> str:
    """Get the production DATABASE_URL from environment or .env file."""
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    env_file = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL=") and not line.startswith("#"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    print("ERROR: DATABASE_URL is not set.")
    print("  Set it as an environment variable or in the project root .env file.")
    sys.exit(1)


def run_migrations(database_url: str) -> bool:
    """Run Alembic migrations."""
    import subprocess

    env = os.environ.copy()
    env["DATABASE_URL"] = database_url

    print(f"Running migrations against: {database_url[:40]}...")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(API_DIR),
        env=env,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"Migration FAILED:\n{result.stderr}")
        return False

    print(f"Migration output:\n{result.stdout}")
    return True


def verify_schema(database_url: str) -> bool:
    """Verify that key tables exist after migration."""
    # Convert async URL to sync for verification
    sync_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        import sqlalchemy

        engine = sqlalchemy.create_engine(sync_url)
        inspector = sqlalchemy.inspect(engine)
        tables = inspector.get_table_names()
        engine.dispose()

        expected_tables = ["videos", "categories", "video_segments"]
        print(f"\nExisting tables: {tables}")

        missing = [t for t in expected_tables if t not in tables]
        if missing:
            print(f"WARNING: Missing expected tables: {missing}")
            return False

        print("Schema verification: All expected tables present.")
        return True

    except ImportError:
        print("WARNING: sqlalchemy not installed for sync verification. Skipping.")
        return True
    except Exception as e:
        print(f"Schema verification failed: {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Run production database migrations")
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify schema without running migrations",
    )
    parser.add_argument(
        "--database-url",
        help="Override DATABASE_URL",
    )
    args = parser.parse_args()

    database_url = args.database_url or get_database_url()

    if not args.verify_only:
        if not run_migrations(database_url):
            sys.exit(1)

    if not verify_schema(database_url):
        sys.exit(1)

    print("\nDone.")


if __name__ == "__main__":
    main()
