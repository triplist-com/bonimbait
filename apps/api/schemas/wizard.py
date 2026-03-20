from __future__ import annotations

from pydantic import BaseModel, Field


class WizardOption(BaseModel):
    """A single selectable option within a wizard question."""

    value: str
    label: str


class WizardQuestion(BaseModel):
    """A wizard question with its options."""

    id: str
    title: str
    type: str = Field(description="Question type: single_select or multi_select")
    options: list[WizardOption]


class WizardQuestionsResponse(BaseModel):
    """Full set of wizard questions returned to the client."""

    questions: list[WizardQuestion]


class WizardCalculateRequest(BaseModel):
    """Request body for the cost calculation endpoint."""

    answers: dict[str, str | list[str]] = Field(
        ...,
        description="Map of question id to selected value(s)",
    )


class PhaseBreakdown(BaseModel):
    """Cost breakdown for a single construction phase."""

    phase: str
    min: int
    max: int
    percentage: int


class WizardCalculateResponse(BaseModel):
    """Full cost estimation result."""

    total_min: int
    total_max: int
    breakdown: list[PhaseBreakdown]
    inputs: dict[str, str | int | list[str]]
    sources: list[dict]
    disclaimer: str = "הערכה בלבד, מבוססת על ניתוח סרטונים ונתוני שוק. לא מהווה הצעת מחיר."


class WizardPrefillResponse(BaseModel):
    """Extracted wizard fields from a free-text query."""

    # Only populated fields are returned; all are optional.
    house_size: str | None = None
    floors: str | None = None
    construction_method: str | None = None
    finishing_level: str | None = None
    region: str | None = None
    basement: str | None = None
    special_features: list[str] | None = None
    timeline: str | None = None
