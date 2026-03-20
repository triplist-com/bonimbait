from __future__ import annotations

import json
from datetime import datetime, timezone

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.category import Category
from models.video import Video

router = APIRouter(prefix="/api/admin", tags=["admin"])

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


class RegenerateResponse(BaseModel):
    """Response for the regeneration endpoint."""

    message: str
    categories_processed: int
    categories_skipped: int


def _build_prompt(category_name: str, videos: list[dict]) -> str:
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


@router.post(
    "/regenerate-category-summaries",
    response_model=RegenerateResponse,
)
async def regenerate_category_summaries(
    db: AsyncSession = Depends(get_db),
) -> RegenerateResponse:
    """Regenerate AI summaries for all categories using Claude."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY is not configured",
        )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Fetch all categories
    result = await db.execute(select(Category).order_by(Category.name_he))
    categories = list(result.scalars().all())

    processed = 0
    skipped = 0

    for cat in categories:
        # Fetch videos for this category
        video_result = await db.execute(
            select(Video.title, Video.summary, Video.key_points, Video.costs_data)
            .where(Video.category_id == cat.id)
            .where(Video.summary.isnot(None))
        )
        video_rows = video_result.all()

        if not video_rows:
            skipped += 1
            continue

        videos = [
            {
                "title": row.title,
                "summary": row.summary,
                "key_points": row.key_points,
                "costs_data": row.costs_data,
            }
            for row in video_rows
        ]

        prompt = _build_prompt(cat.name_he, videos)

        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            text_content = response.content[0].text.strip()

            # Strip markdown code fences if present
            if text_content.startswith("```"):
                text_content = (
                    text_content.split("\n", 1)[1]
                    if "\n" in text_content
                    else text_content[3:]
                )
                if text_content.endswith("```"):
                    text_content = text_content[:-3].strip()

            data = json.loads(text_content)

            cat.ai_summary = data.get("summary", "")
            cat.ai_key_points = data.get("key_points", [])
            cat.ai_costs_data = data.get("costs", [])
            cat.ai_tips = data.get("tips", [])
            cat.ai_warnings = data.get("warnings", [])
            cat.ai_generated_at = datetime.now(timezone.utc)

            processed += 1

        except (json.JSONDecodeError, Exception):
            skipped += 1
            continue

    # The session will be committed by the get_db dependency

    return RegenerateResponse(
        message="Category summaries regenerated",
        categories_processed=processed,
        categories_skipped=skipped,
    )
