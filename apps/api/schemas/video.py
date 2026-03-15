from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class VideoSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    video_id: uuid.UUID
    start_time: float
    end_time: float
    text: str
    summary: str | None = None
    segment_index: int
    created_at: datetime


class CostItem(BaseModel):
    """A single cost/expense item extracted from video content."""

    description: str
    amount: float | None = None
    currency: str = "ILS"
    notes: str | None = None


class KeyPoint(BaseModel):
    """A key point extracted from video content."""

    text: str
    timestamp: float | None = None


class VideoBase(BaseModel):
    """Base video fields shared across response types."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    youtube_id: str
    title: str
    description: str | None = None
    duration_seconds: int
    thumbnail_url: str | None = None
    published_at: datetime | None = None
    category_id: uuid.UUID | None = None
    summary: str | None = None
    created_at: datetime
    updated_at: datetime


class VideoSummary(VideoBase):
    """Video summary for list views -- lightweight, no segments."""

    category_name: str | None = None


class VideoDetail(VideoBase):
    """Full video detail including segments, key points, and costs."""

    transcript_text: str | None = None
    key_points: list[KeyPoint] | None = None
    costs_data: list[CostItem] | None = None
    segments: list[VideoSegmentResponse] = []
    category_name: str | None = None


class PaginatedVideosResponse(BaseModel):
    """Paginated list of videos with total count."""

    videos: list[VideoSummary]
    total: int
    page: int
    limit: int
    pages: int = Field(description="Total number of pages")


# Keep backwards compat aliases used by existing code
VideoRead = VideoBase
VideoSegmentRead = VideoSegmentResponse


class VideoCreate(BaseModel):
    youtube_id: str
    title: str
    description: str | None = None
    duration_seconds: int
    thumbnail_url: str | None = None
    published_at: datetime | None = None
    category_id: uuid.UUID | None = None
