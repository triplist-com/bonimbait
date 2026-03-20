"""Cost estimation wizard service.

Calculates construction cost estimates based on user-supplied parameters
and optionally enriches them with real cost data extracted from videos.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.wizard import (
    PhaseBreakdown,
    WizardCalculateResponse,
    WizardPrefillResponse,
    WizardQuestion,
    WizardQuestionsResponse,
    WizardOption,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Static configuration
# ---------------------------------------------------------------------------

QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "house_size",
        "title": "מה גודל הבית?",
        "type": "single_select",
        "options": [
            {"value": "up_to_100", "label": "עד 100 מ״ר"},
            {"value": "100_150", "label": "100-150 מ״ר"},
            {"value": "150_200", "label": "150-200 מ״ר"},
            {"value": "200_250", "label": "200-250 מ״ר"},
            {"value": "250_plus", "label": "250+ מ״ר"},
        ],
    },
    {
        "id": "floors",
        "title": "כמה קומות?",
        "type": "single_select",
        "options": [
            {"value": "1", "label": "קומה אחת"},
            {"value": "1.5", "label": "קומה וחצי (ספליט)"},
            {"value": "2", "label": "2 קומות"},
            {"value": "2_basement", "label": "2 קומות + מרתף"},
        ],
    },
    {
        "id": "construction_method",
        "title": "שיטת בנייה?",
        "type": "single_select",
        "options": [
            {"value": "blocks", "label": "בלוקים"},
            {"value": "concrete", "label": "בטון יצוק"},
            {"value": "precast", "label": "טרומי"},
            {"value": "steel", "label": "קל (שלד פלדה)"},
        ],
    },
    {
        "id": "finishing_level",
        "title": "רמת גימור?",
        "type": "single_select",
        "options": [
            {"value": "standard", "label": "סטנדרט"},
            {"value": "standard_high", "label": "סטנדרט-גבוה"},
            {"value": "high", "label": "גבוה"},
            {"value": "luxury", "label": "יוקרה"},
        ],
    },
    {
        "id": "region",
        "title": "באיזה אזור?",
        "type": "single_select",
        "options": [
            {"value": "center", "label": "מרכז"},
            {"value": "sharon", "label": "שרון"},
            {"value": "shfela", "label": "שפלה"},
            {"value": "north", "label": "צפון"},
            {"value": "south", "label": "דרום"},
            {"value": "jerusalem", "label": "ירושלים והרים"},
        ],
    },
    {
        "id": "basement",
        "title": "מרתף?",
        "type": "single_select",
        "options": [
            {"value": "yes", "label": "כן"},
            {"value": "no", "label": "לא"},
        ],
    },
    {
        "id": "special_features",
        "title": "תוספות מיוחדות?",
        "type": "multi_select",
        "options": [
            {"value": "pool", "label": "בריכה"},
            {"value": "elevator", "label": "מעלית"},
            {"value": "underground_parking", "label": "חניה תת-קרקעית"},
            {"value": "large_balcony", "label": "מרפסת גדולה"},
            {"value": "solar", "label": "אנרגיה סולארית"},
        ],
    },
    {
        "id": "timeline",
        "title": "לוח זמנים?",
        "type": "single_select",
        "options": [
            {"value": "urgent", "label": "דחוף (עד שנה)"},
            {"value": "normal", "label": "רגיל (1-2 שנים)"},
            {"value": "flexible", "label": "גמיש"},
        ],
    },
]

# Multiplier / add-on lookup tables
SIZE_TO_SQM: dict[str, int] = {
    "up_to_100": 80,
    "100_150": 125,
    "150_200": 175,
    "200_250": 225,
    "250_plus": 300,
}

BASE_COST_PER_SQM = 7000  # NIS, 2024-2025 baseline

FLOOR_MULTIPLIER: dict[str, float] = {
    "1": 1.0,
    "1.5": 1.05,
    "2": 1.1,
    "2_basement": 1.25,
}

CONSTRUCTION_MULTIPLIER: dict[str, float] = {
    "blocks": 1.0,
    "concrete": 1.1,
    "precast": 1.15,
    "steel": 1.2,
}

FINISHING_MULTIPLIER: dict[str, float] = {
    "standard": 1.0,
    "standard_high": 1.15,
    "high": 1.35,
    "luxury": 1.6,
}

REGION_MULTIPLIER: dict[str, float] = {
    "center": 1.0,
    "sharon": 0.95,
    "shfela": 0.9,
    "north": 0.85,
    "south": 0.8,
    "jerusalem": 1.05,
}

TIMELINE_MULTIPLIER: dict[str, float] = {
    "urgent": 1.05,
    "normal": 1.0,
    "flexible": 0.98,
}

FEATURE_ADDON: dict[str, int] = {
    "pool": 150_000,
    "elevator": 200_000,
    "underground_parking": 180_000,
    "large_balcony": 50_000,
    "solar": 60_000,
}

# Phase breakdown percentages (must sum to 100)
PHASES: list[tuple[str, int]] = [
    ("יסודות ושלד", 35),
    ("גמר פנים", 25),
    ("חשמל ואינסטלציה", 12),
    ("גג", 8),
    ("ריצוף", 8),
    ("חלונות ודלתות", 7),
    ("פיתוח חוץ", 5),
]

# Phase-to-category slug mapping for video data enrichment
PHASE_CATEGORY_SLUGS: dict[str, list[str]] = {
    "יסודות ושלד": ["skeleton", "foundation", "structure", "שלד", "יסודות"],
    "גמר פנים": ["finishing", "interior", "גמר"],
    "חשמל ואינסטלציה": ["electrical", "plumbing", "חשמל", "אינסטלציה"],
    "גג": ["roof", "גג"],
    "ריצוף": ["flooring", "tiling", "ריצוף"],
    "חלונות ודלתות": ["windows", "doors", "חלונות", "דלתות"],
    "פיתוח חוץ": ["exterior", "landscape", "פיתוח-חוץ"],
}


class WizardService:
    """Performs cost estimation calculations for the wizard."""

    def __init__(self, db: AsyncSession | None = None) -> None:
        self._db = db

    # ----- public ---------------------------------------------------------

    def get_questions(self) -> WizardQuestionsResponse:
        """Return the full set of wizard questions."""
        return WizardQuestionsResponse(
            questions=[
                WizardQuestion(
                    id=q["id"],
                    title=q["title"],
                    type=q["type"],
                    options=[WizardOption(**o) for o in q["options"]],
                )
                for q in QUESTIONS
            ]
        )

    async def calculate(
        self, answers: dict[str, str | list[str]]
    ) -> WizardCalculateResponse:
        """Run the cost estimation and return a detailed breakdown."""
        # 1. Resolve sqm
        house_size = str(answers.get("house_size", "150_200"))
        sqm = SIZE_TO_SQM.get(house_size, 175)

        # 2. Base cost
        base = sqm * BASE_COST_PER_SQM

        # 3. Multipliers
        floors = str(answers.get("floors", "1"))
        construction = str(answers.get("construction_method", "blocks"))
        finishing = str(answers.get("finishing_level", "standard"))
        region = str(answers.get("region", "center"))
        timeline = str(answers.get("timeline", "normal"))

        multiplied = (
            base
            * FLOOR_MULTIPLIER.get(floors, 1.0)
            * CONSTRUCTION_MULTIPLIER.get(construction, 1.0)
            * FINISHING_MULTIPLIER.get(finishing, 1.0)
            * REGION_MULTIPLIER.get(region, 1.0)
            * TIMELINE_MULTIPLIER.get(timeline, 1.0)
        )

        # 4. Basement add-on
        basement = str(answers.get("basement", "no"))
        if basement == "yes":
            multiplied += 250_000

        # 5. Special features add-ons
        features_raw = answers.get("special_features", [])
        if isinstance(features_raw, str):
            features = [features_raw]
        else:
            features = list(features_raw)
        addons = sum(FEATURE_ADDON.get(f, 0) for f in features)
        total = multiplied + addons

        # 6. Try enriching with real video data
        sources: list[dict] = []
        if self._db is not None:
            try:
                enrichment = await self._enrich_from_videos(total, sqm)
                if enrichment is not None:
                    total, sources = enrichment
            except Exception:
                logger.warning(
                    "Video enrichment failed; falling back to base calculation",
                    exc_info=True,
                )

        # 7. Build phase breakdown with +-15% range
        total_int = int(round(total))
        total_min = int(round(total * 0.85))
        total_max = int(round(total * 1.15))

        breakdown = [
            PhaseBreakdown(
                phase=name,
                min=int(round(total_min * pct / 100)),
                max=int(round(total_max * pct / 100)),
                percentage=pct,
            )
            for name, pct in PHASES
        ]

        inputs: dict[str, str | int | list[str]] = {
            "house_size": house_size,
            "sqm": sqm,
            "floors": floors,
            "construction_method": construction,
            "finishing_level": finishing,
            "region": region,
            "basement": basement,
            "timeline": timeline,
            "special_features": features,
        }

        return WizardCalculateResponse(
            total_min=total_min,
            total_max=total_max,
            breakdown=breakdown,
            inputs=inputs,
            sources=sources,
        )

    def prefill(self, query: str) -> WizardPrefillResponse:
        """Extract wizard field values from a free-text Hebrew query."""
        q = query.strip()
        result: dict[str, Any] = {}

        # --- House size: look for numbers near sqm-related words ---
        sqm_pattern = r'(\d+)\s*(?:מטר|מ"ר|מ״ר|מ\'\'ר|מר|sqm)'
        sqm_match = re.search(sqm_pattern, q)
        if sqm_match:
            sqm_val = int(sqm_match.group(1))
            if sqm_val <= 100:
                result["house_size"] = "up_to_100"
            elif sqm_val <= 150:
                result["house_size"] = "100_150"
            elif sqm_val <= 200:
                result["house_size"] = "150_200"
            elif sqm_val <= 250:
                result["house_size"] = "200_250"
            else:
                result["house_size"] = "250_plus"

        # --- Finishing level ---
        if "יוקרה" in q or "יוקרתי" in q:
            result["finishing_level"] = "luxury"
        elif "גבוה" in q:
            result["finishing_level"] = "high"
        elif "סטנדרט" in q:
            result["finishing_level"] = "standard"

        # --- Construction method ---
        if "בלוקים" in q or "בלוק" in q:
            result["construction_method"] = "blocks"
        elif "בטון" in q:
            result["construction_method"] = "concrete"
        elif "טרומי" in q:
            result["construction_method"] = "precast"
        elif "פלדה" in q or "שלד קל" in q:
            result["construction_method"] = "steel"

        # --- Floors ---
        if "קומה אחת" in q or "קומה 1" in q:
            result["floors"] = "1"
        elif "קומה וחצי" in q or "ספליט" in q:
            result["floors"] = "1.5"
        elif "2 קומות" in q or "שתי קומות" in q:
            result["floors"] = "2"

        # --- Region ---
        region_keywords = {
            "מרכז": "center",
            "שרון": "sharon",
            "שפלה": "shfela",
            "צפון": "north",
            "דרום": "south",
            "ירושלים": "jerusalem",
        }
        for kw, val in region_keywords.items():
            if kw in q:
                result["region"] = val
                break

        # --- Basement ---
        if "מרתף" in q:
            result["basement"] = "yes"

        # --- Special features ---
        feature_keywords = {
            "בריכה": "pool",
            "מעלית": "elevator",
            "חניה תת": "underground_parking",
            "מרפסת": "large_balcony",
            "סולארי": "solar",
            "סולרי": "solar",
        }
        found_features = [v for kw, v in feature_keywords.items() if kw in q]
        if found_features:
            result["special_features"] = found_features

        # --- Timeline ---
        if "דחוף" in q:
            result["timeline"] = "urgent"
        elif "גמיש" in q:
            result["timeline"] = "flexible"

        return WizardPrefillResponse(**result)

    # ----- private --------------------------------------------------------

    async def _enrich_from_videos(
        self, base_total: float, sqm: int
    ) -> tuple[float, list[dict]] | None:
        """Blend base estimate with real cost data from recent videos.

        Looks for videos that have ``costs_data`` JSONB populated and were
        published within the last 2 years.  If relevant cost-per-sqm values
        are found, they are blended with the base calculation (70% base,
        30% video-sourced) to produce a more grounded estimate.
        """
        if self._db is None:
            return None

        two_years_ago = datetime.now(tz=timezone.utc).replace(
            year=datetime.now(tz=timezone.utc).year - 2
        )

        sql = text("""
            SELECT v.youtube_id, v.title, v.costs_data, v.published_at,
                   c.slug AS category_slug
            FROM videos v
            LEFT JOIN categories c ON c.id = v.category_id
            WHERE v.costs_data IS NOT NULL
              AND v.published_at >= :cutoff
            ORDER BY v.published_at DESC
            LIMIT 50
        """)

        try:
            result = await self._db.execute(sql, {"cutoff": two_years_ago})
            rows = result.fetchall()
        except Exception:
            await self._db.rollback()
            logger.warning("Failed to query video cost data", exc_info=True)
            return None

        if not rows:
            return None

        # Collect per-sqm cost figures from the video data
        cost_values: list[float] = []
        sources: list[dict] = []
        for row in rows:
            costs_data = row[2]
            if not isinstance(costs_data, dict):
                continue
            # Look for a cost_per_sqm key or similar in the JSONB
            cost_per_sqm = (
                costs_data.get("cost_per_sqm")
                or costs_data.get("price_per_sqm")
                or costs_data.get("עלות_למטר")
            )
            if cost_per_sqm is not None:
                try:
                    cost_values.append(float(cost_per_sqm))
                    sources.append(
                        {
                            "youtube_id": row[0],
                            "title": row[1],
                            "cost_per_sqm": float(cost_per_sqm),
                        }
                    )
                except (ValueError, TypeError):
                    continue

        if not cost_values:
            return None

        # Compute average video-sourced cost per sqm
        avg_video_cost = sum(cost_values) / len(cost_values)
        video_total = avg_video_cost * sqm

        # Blend: 70% base calculation, 30% video data
        blended = base_total * 0.7 + video_total * 0.3
        return blended, sources
