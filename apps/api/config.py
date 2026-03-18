from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _normalize_database_url(url: str) -> str:
    """Ensure the DATABASE_URL uses the asyncpg driver.

    Supabase and Render provide ``postgresql://`` URLs but SQLAlchemy's async
    engine requires the ``postgresql+asyncpg://`` scheme.
    """
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


class Settings:
    """Application settings loaded from environment variables."""

    APP_NAME: str = "Bonimbait API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    DATABASE_URL: str = _normalize_database_url(
        os.getenv(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/bonimbait",
        )
    )

    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # CORS — comma-separated origins from env, defaults to allow all
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "*").split(",")
        if o.strip()
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
