from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class CostDataItem(BaseModel):
    """A single cost data entry."""

    item: str
    price: str
    unit: str


class CategoryResponse(BaseModel):
    """Category with video count and optional AI summary."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_he: str
    slug: str
    description_he: str | None = None
    icon: str | None = None
    video_count: int = 0
    created_at: datetime

    # AI-generated fields
    ai_summary: str | None = None
    ai_key_points: list[str] | None = None
    ai_costs_data: list[CostDataItem] | None = None
    ai_tips: list[str] | None = None
    ai_warnings: list[str] | None = None


class CategoriesListResponse(BaseModel):
    """List of categories."""

    categories: list[CategoryResponse]
    total: int


# Keep backwards compat aliases
CategoryRead = CategoryResponse


class CategoryCreate(BaseModel):
    name_he: str
    slug: str
    description_he: str | None = None
    icon: str | None = None
