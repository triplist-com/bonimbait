"""Paths shared by the knowledge pipeline.

data/ is gitignored and lives only in the main checkout, so from a git worktree
it is found through the git common dir (same rule as scripts/migrate/paths.py).
Order: KNOWLEDGE_DATA_DIR env > <repo>/data > <main checkout>/data.
The web bundle (apps/web/data) is always the one of the checkout running the
script, so a worktree writes its own committed files.
"""

from __future__ import annotations

import os
import subprocess
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DATA = REPO_ROOT / "apps" / "web" / "data"

CHANNEL_ID = "UCCehs0A1gUmOUtZIhvkXVJQ"
CHANNEL_URL = "https://www.youtube.com/@TomerChenRihana"
PODCAST_PLAYLIST_ID = "PLJa3K86i-6XenqhecEwRKLvqf5azCGHn-"

# Shorter videos (teasers, shorts) stay out of the AI index.
MIN_INDEX_SECONDS = 90


@lru_cache(maxsize=None)
def main_checkout() -> Path:
    try:
        common = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        return Path(common).parent
    except Exception:  # noqa: BLE001 - not a git checkout
        return REPO_ROOT


@lru_cache(maxsize=None)
def data_dir() -> Path:
    env = os.environ.get("KNOWLEDGE_DATA_DIR")
    if env:
        return Path(env)
    for root in (REPO_ROOT, main_checkout()):
        if (root / "data" / "raw" / "metadata").is_dir():
            return root / "data"
    return REPO_ROOT / "data"


def raw_dir() -> Path:
    return data_dir() / "raw"


def listings_dir() -> Path:
    return raw_dir() / "channel_listings"


def metadata_dir() -> Path:
    return raw_dir() / "metadata"


def subtitles_dir() -> Path:
    return raw_dir() / "subtitles"


def inventory_path() -> Path:
    return raw_dir() / "channel_inventory.json"


def captions_status_path() -> Path:
    return raw_dir() / "captions_status.json"


def processed_dir() -> Path:
    return data_dir() / "processed"


def transcripts_dir() -> Path:
    return processed_dir() / "transcripts"


def segments_dir() -> Path:
    return processed_dir() / "segments"


# Only the paid-API keys are read from env files. Database settings are never
# loaded, so nothing here can reach the hosted project.
_ENV_KEYS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY")


def load_env() -> None:
    """Fill the API keys from apps/web/.env.local, then the repo-root .env."""
    candidates = [REPO_ROOT / "apps" / "web" / ".env.local", REPO_ROOT / ".env", main_checkout() / ".env"]
    for env_path in candidates:
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            k, v = (s.strip() for s in line.split("=", 1))
            if k in _ENV_KEYS and v and not os.environ.get(k):
                os.environ[k] = v
