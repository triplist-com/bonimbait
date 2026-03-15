from __future__ import annotations

from pydantic import BaseModel, Field


class AnswerRequest(BaseModel):
    """Request body for AI answer generation."""

    query: str = Field(..., min_length=3, max_length=500, description="User question")
    stream: bool = Field(False, description="Whether to stream the response")


class AnswerSource(BaseModel):
    """A source citation in the generated answer."""

    video_id: str
    youtube_id: str
    title: str
    timestamp: float = Field(description="Start time of segment in seconds")
    relevance_score: float = Field(ge=0.0, le=1.0)


class AnswerResponse(BaseModel):
    """Full answer response returned by the AI."""

    answer: str
    sources: list[AnswerSource]
    confidence: float = Field(ge=0.0, le=1.0)
    query: str
    cached: bool = False


class StreamChunk(BaseModel):
    """A single chunk in a streaming answer response."""

    type: str = Field(description="Event type: 'chunk' or 'done'")
    content: str | None = None
    sources: list[AnswerSource] | None = None
    confidence: float | None = None
