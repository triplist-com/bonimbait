from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CategoryResponse(BaseModel):
    """Category with video count."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_he: str
    slug: str
    description_he: str | None = None
    icon: str | None = None
    video_count: int = 0
    created_at: datetime


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
