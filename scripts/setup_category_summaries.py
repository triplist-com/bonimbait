#!/usr/bin/env python3
"""Add AI summary columns to the categories table on Supabase.

Usage:
    python scripts/setup_category_summaries.py
"""
from __future__ import annotations

import asyncio

import asyncpg


DATABASE_URL = (
    "postgresql://postgres.nfbasjadvakbsusupcoy:"
    "IdyiIEdiJwG1rNu9@aws-1-eu-north-1.pooler.supabase.com:6543/postgres"
)


ALTER_STATEMENTS = [
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS ai_summary TEXT",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS ai_key_points JSONB",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS ai_costs_data JSONB",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS ai_tips JSONB",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS ai_warnings JSONB",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP",
]


async def main() -> None:
    conn = await asyncpg.connect(
        DATABASE_URL,
        statement_cache_size=0,
    )
    try:
        for stmt in ALTER_STATEMENTS:
            print(f"Running: {stmt}")
            await conn.execute(stmt)
            print("  OK")
        print("\nAll columns added successfully.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
