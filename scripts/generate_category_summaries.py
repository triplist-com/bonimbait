#!/usr/bin/env python3
"""Generate AI summaries for each category using Claude.

Reads all video summaries, key_points, and costs_data per category,
sends them to Claude for aggregation, and stores the result in the
categories table.

Usage:
    ANTHROPIC_API_KEY=sk-... python scripts/generate_category_summaries.py

Cost target: under $1 total for all ~10 categories.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone

import anthropic
import asyncpg


DATABASE_URL = (
    "postgresql://postgres.nfbasjadvakbsusupcoy:"
    "IdyiIEdiJwG1rNu9@aws-1-eu-north-1.pooler.supabase.com:6543/postgres"
)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-6"


PROMPT_TEMPLATE = """\
You are a construction knowledge expert for private home building in Israel.
You will receive aggregated data from multiple YouTube videos in the category "{category_name}".

Your task is to create a comprehensive category summary in Hebrew.

Here is the aggregated data from all videos in this category:

--- VIDEO SUMMARIES ---
{summaries}

--- KEY POINTS ---
{key_points}

--- COST DATA ---
{costs_data}

Please generate a comprehensive category summary as a JSON object with the following fields:
- "summary": A 2-4 paragraph overview of the category in Hebrew, covering the main themes and insights.
- "key_points": An array of 5-10 of the most important takeaways (strings, in Hebrew).
- "costs": An array of the most relevant cost items, each as {{"item": "...", "price": "...", "unit": "..."}}.  \
Consolidate similar items and show typical price ranges. All in Hebrew.
- "tips": An array of 5-10 practical tips (strings, in Hebrew).
- "warnings": An array of 3-5 important warnings or common mistakes (strings, in Hebrew).

Respond ONLY with valid JSON. No markdown, no code fences.
"""


async def fetch_categories(conn: asyncpg.Connection) -> list[dict]:
    """Fetch all categories."""
    rows = await conn.fetch(
        "SELECT id, name_he, slug FROM categories ORDER BY name_he"
    )
    return [dict(r) for r in rows]


async def fetch_category_videos(
    conn: asyncpg.Connection, category_id: str
) -> list[dict]:
    """Fetch video summaries, key_points, and costs_data for a category."""
    rows = await conn.fetch(
        """
        SELECT title, summary, key_points, costs_data
        FROM videos
        WHERE category_id = $1 AND summary IS NOT NULL
        """,
        category_id,
    )
    return [dict(r) for r in rows]


def build_prompt(category_name: str, videos: list[dict]) -> str:
    """Build the Claude prompt from aggregated video data."""
    summaries_parts: list[str] = []
    key_points_parts: list[str] = []
    costs_parts: list[str] = []

    for v in videos:
        if v.get("summary"):
            summaries_parts.append(f"- [{v['title']}]: {v['summary']}")
        if v.get("key_points"):
            kps = v["key_points"]
            if isinstance(kps, str):
                kps = json.loads(kps)
            if isinstance(kps, list):
                for kp in kps:
                    if isinstance(kp, dict):
                        key_points_parts.append(f"- {kp.get('text', str(kp))}")
                    else:
                        key_points_parts.append(f"- {kp}")
        if v.get("costs_data"):
            costs = v["costs_data"]
            if isinstance(costs, str):
                costs = json.loads(costs)
            if isinstance(costs, list):
                for c in costs:
                    if isinstance(c, dict):
                        costs_parts.append(
                            f"- {c.get('item', '?')}: {c.get('price', '?')} / {c.get('unit', '?')}"
                        )

    return PROMPT_TEMPLATE.format(
        category_name=category_name,
        summaries="\n".join(summaries_parts) or "(no summaries available)",
        key_points="\n".join(key_points_parts) or "(no key points available)",
        costs_data="\n".join(costs_parts) or "(no cost data available)",
    )


async def generate_summary(client: anthropic.Anthropic, prompt: str) -> dict:
    """Call Claude to generate a category summary."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()

    return json.loads(text)


async def update_category(
    conn: asyncpg.Connection,
    category_id: str,
    data: dict,
) -> None:
    """Write the generated summary data back to the categories table."""
    await conn.execute(
        """
        UPDATE categories
        SET ai_summary = $1,
            ai_key_points = $2,
            ai_costs_data = $3,
            ai_tips = $4,
            ai_warnings = $5,
            ai_generated_at = $6
        WHERE id = $7
        """,
        data.get("summary", ""),
        json.dumps(data.get("key_points", []), ensure_ascii=False),
        json.dumps(data.get("costs", []), ensure_ascii=False),
        json.dumps(data.get("tips", []), ensure_ascii=False),
        json.dumps(data.get("warnings", []), ensure_ascii=False),
        datetime.now(timezone.utc),
        category_id,
    )


async def main() -> None:
    if not ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY environment variable is required.")
        return

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
    try:
        categories = await fetch_categories(conn)
        print(f"Found {len(categories)} categories.\n")

        for cat in categories:
            cat_id = cat["id"]
            cat_name = cat["name_he"]
            print(f"Processing: {cat_name} ({cat['slug']})...")

            videos = await fetch_category_videos(conn, cat_id)
            if not videos:
                print(f"  No videos with summaries, skipping.\n")
                continue

            print(f"  {len(videos)} videos with summaries")

            prompt = build_prompt(cat_name, videos)
            try:
                result = generate_summary(client, prompt)
                # generate_summary is not async, await the coroutine wrapper
                if asyncio.iscoroutine(result):
                    result = await result
                elif asyncio.isfuture(result):
                    result = await result

                await update_category(conn, cat_id, result)
                print(f"  Saved AI summary for {cat_name}")
                print(
                    f"  Summary preview: {result.get('summary', '')[:100]}...\n"
                )
            except json.JSONDecodeError as e:
                print(f"  ERROR: Failed to parse Claude response as JSON: {e}\n")
            except Exception as e:
                print(f"  ERROR: {e}\n")

        print("Done!")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
