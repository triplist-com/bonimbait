"""Create the analytics_events table on Supabase.

Run with: python scripts/setup_analytics.py
"""

from __future__ import annotations

import asyncio

import asyncpg


DATABASE_URL = (
    "postgresql://postgres.nfbasjadvakbsusupcoy:"
    "IdyiIEdiJwG1rNu9@aws-1-eu-north-1.pooler.supabase.com:6543/postgres"
)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
"""


async def main() -> None:
    print("Connecting to Supabase...")
    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    try:
        await conn.execute(CREATE_TABLE_SQL)
        print("analytics_events table created successfully.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
