"""
Seed script for Bonimbait database.

Inserts initial categories and sample mock videos for development.
Usage: python scripts/seed.py
"""

import asyncio
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/bonimbait",
)

# 10 Hebrew construction categories
CATEGORIES = [
    {"slug": "planning-permits", "name_he": "תכנון ורישוי", "name_en": "Planning & Permits"},
    {"slug": "costs-prices", "name_he": "עלויות ומחירים", "name_en": "Costs & Prices"},
    {"slug": "structure-construction", "name_he": "שלד ובנייה", "name_en": "Structure & Construction"},
    {"slug": "electrical-plumbing", "name_he": "חשמל ואינסטלציה", "name_en": "Electrical & Plumbing"},
    {"slug": "finishes-design", "name_he": "גמרים ועיצוב", "name_en": "Finishes & Design"},
    {"slug": "contractors-labor", "name_he": "קבלנים ועבודה", "name_en": "Contractors & Labor"},
    {"slug": "laws-regulations", "name_he": "חוקים ותקנות", "name_en": "Laws & Regulations"},
    {"slug": "general-tips", "name_he": "טיפים כלליים", "name_en": "General Tips"},
    {"slug": "insulation-waterproofing", "name_he": "בידוד ואיטום", "name_en": "Insulation & Waterproofing"},
    {"slug": "landscaping-yard", "name_he": "גינון וחצר", "name_en": "Landscaping & Yard"},
]

# 6 sample mock videos with Hebrew titles
MOCK_VIDEOS = [
    {
        "youtube_id": "mock_vid_001",
        "title": "איך לבחור קבלן שלד לבית פרטי",
        "description": "מדריך מקיף לבחירת קבלן שלד - מה לבדוק, איך להשוות הצעות מחיר, ומה חשוב לדעת לפני שחותמים חוזה",
        "channel_name": "בונים בית",
        "duration_seconds": 1200,
        "category_slug": "contractors-labor",
    },
    {
        "youtube_id": "mock_vid_002",
        "title": "עלויות בנייה 2024 - כמה עולה לבנות בית פרטי",
        "description": "פירוט מלא של עלויות בנייה למ\"ר, כולל שלד, גמרים, מערכות ופיתוח חוץ",
        "channel_name": "בונים בית",
        "duration_seconds": 900,
        "category_slug": "costs-prices",
    },
    {
        "youtube_id": "mock_vid_003",
        "title": "טעויות נפוצות בבידוד תרמי של בתים פרטיים",
        "description": "חמש טעויות שכיחות בבידוד תרמי וכיצד להימנע מהן. כולל דגשים על תקן 1045",
        "channel_name": "הבנאי החכם",
        "duration_seconds": 750,
        "category_slug": "insulation-waterproofing",
    },
    {
        "youtube_id": "mock_vid_004",
        "title": "היתר בנייה - כל מה שצריך לדעת",
        "description": "תהליך הוצאת היתר בנייה מא' עד ת': תכניות, ועדות, אגרות ולוחות זמנים",
        "channel_name": "בונים בית",
        "duration_seconds": 1500,
        "category_slug": "planning-permits",
    },
    {
        "youtube_id": "mock_vid_005",
        "title": "חשמל בבית פרטי - תכנון נכון מההתחלה",
        "description": "כיצד לתכנן את מערכת החשמל בבית פרטי: לוחות, מעגלים, שקעים, תאורה ובית חכם",
        "channel_name": "החשמלאי שלך",
        "duration_seconds": 1100,
        "category_slug": "electrical-plumbing",
    },
    {
        "youtube_id": "mock_vid_006",
        "title": "ריצוף וחיפוי - בחירת אריחים לבית חדש",
        "description": "סוגי אריחים, יתרונות וחסרונות, עלויות, ואיך לבחור את הריצוף המתאים לכל חדר",
        "channel_name": "עיצוב ובנייה",
        "duration_seconds": 850,
        "category_slug": "finishes-design",
    },
]


async def seed() -> None:
    """Insert categories and mock videos into the database."""
    engine = create_async_engine(DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        # Insert categories
        for cat in CATEGORIES:
            cat_id = str(uuid.uuid4())
            await conn.execute(
                text(
                    """
                    INSERT INTO categories (id, slug, name_he, name_en, created_at)
                    VALUES (:id, :slug, :name_he, :name_en, :created_at)
                    ON CONFLICT (slug) DO NOTHING
                    """
                ),
                {
                    "id": cat_id,
                    "slug": cat["slug"],
                    "name_he": cat["name_he"],
                    "name_en": cat["name_en"],
                    "created_at": datetime.now(timezone.utc),
                },
            )
        print(f"Inserted {len(CATEGORIES)} categories")

        # Insert mock videos
        for vid in MOCK_VIDEOS:
            vid_id = str(uuid.uuid4())
            await conn.execute(
                text(
                    """
                    INSERT INTO videos (id, youtube_id, title, description, channel_name,
                                        duration_seconds, category_slug, created_at, updated_at)
                    VALUES (:id, :youtube_id, :title, :description, :channel_name,
                            :duration_seconds, :category_slug, :created_at, :updated_at)
                    ON CONFLICT (youtube_id) DO NOTHING
                    """
                ),
                {
                    "id": vid_id,
                    "youtube_id": vid["youtube_id"],
                    "title": vid["title"],
                    "description": vid["description"],
                    "channel_name": vid["channel_name"],
                    "duration_seconds": vid["duration_seconds"],
                    "category_slug": vid["category_slug"],
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                },
            )
        print(f"Inserted {len(MOCK_VIDEOS)} mock videos")

    await engine.dispose()
    print("Seed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
