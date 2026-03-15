from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    """Search request parameters."""

    query: str = Field(..., min_length=1, description="Search query text")
    category: str | None = Field(None, description="Category slug to filter by")
    page: int = Field(1, ge=1, description="Page number")
    limit: int = Field(20, ge=1, le=100, description="Results per page")


class SearchResultItem(BaseModel):
    """A single search result with relevance information."""

    video_id: uuid.UUID
    youtube_id: str
    title: str
    description: str | None = None
    summary: str | None = None
    thumbnail_url: str | None = None
    duration_seconds: int = 0
    published_at: datetime | None = None
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    score: float = 0.0
    snippet: str | None = Field(None, description="Matching text snippet")
    matching_segment_time: float | None = Field(
        None, description="Start time of matching segment in seconds"
    )


class SearchResponse(BaseModel):
    """Search response with results and metadata."""

    results: list[SearchResultItem]
    total: int
    query: str
    page: int
    limit: int
    pages: int


class SuggestResponse(BaseModel):
    """Autocomplete suggestion response."""

    suggestions: list[str]
    query: str


# Keep backwards compat aliases used by existing router
class SearchResult(BaseModel):
    video_id: uuid.UUID
    youtube_id: str
    title: str
    segment_text: str | None = None
    start_time: float | None = None
    score: float = 0.0


class SearchQuery(BaseModel):
    q: str
    category_id: uuid.UUID | None = None
    limit: int = 10


class AnswerRequest(BaseModel):
    question: str
    category_id: uuid.UUID | None = None


class AnswerResponse(BaseModel):
    answer: str
    sources: list[SearchResult] = []
