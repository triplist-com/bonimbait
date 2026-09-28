"""Locate data/migration/ and the local Supabase settings for the loader scripts.

data/ is gitignored, so from a git worktree it lives in the main checkout. Order:
MIGRATION_DATA_DIR env > <repo>/data > <main checkout>/data (via git common dir).
"""

from __future__ import annotations

import os
import subprocess
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=None)
def main_checkout() -> Path:
    try:
        common = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return Path(common).parent
    except Exception:
        return REPO_ROOT


@lru_cache(maxsize=None)
def data_dir() -> Path:
    env = os.environ.get("MIGRATION_DATA_DIR")
    if env:
        return Path(env)
    for root in (REPO_ROOT, main_checkout()):
        if (root / "data" / "migration").is_dir():
            return root / "data"
    return REPO_ROOT / "data"


def migration_dir() -> Path:
    return data_dir() / "migration"


def images_dir() -> Path:
    return migration_dir() / "raw" / "images"


def database_url() -> str:
    # Deliberately NOT DATABASE_URL: that one points at the hosted project.
    return os.environ.get("MIGRATION_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")


@lru_cache(maxsize=None)
def supabase_env() -> dict[str, str]:
    """API_URL / SERVICE_ROLE_KEY from env, else from `supabase status -o env`."""
    out = {
        "API_URL": os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "",
        "SERVICE_ROLE_KEY": os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "",
    }
    if out["API_URL"] and out["SERVICE_ROLE_KEY"]:
        return out
    for cwd in (main_checkout(), REPO_ROOT):
        try:
            res = subprocess.run(["supabase", "status", "-o", "env"], cwd=cwd,
                                 capture_output=True, text=True, timeout=60)
        except Exception:
            continue
        for line in res.stdout.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                v = v.strip().strip('"')
                if k == "API_URL" and not out["API_URL"]:
                    out["API_URL"] = v
                if k == "SERVICE_ROLE_KEY" and not out["SERVICE_ROLE_KEY"]:
                    out["SERVICE_ROLE_KEY"] = v
        if out["API_URL"] and out["SERVICE_ROLE_KEY"]:
            break
    return out


def media_base_url() -> str:
    """Public base for migrated media. Swap to the production Storage URL at cutover."""
    env = os.environ.get("MEDIA_BASE_URL")
    if env:
        return env.rstrip("/")
    api = supabase_env().get("API_URL") or "http://127.0.0.1:54321"
    return f"{api.rstrip('/')}/storage/v1/object/public/media"
