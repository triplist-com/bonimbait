"""Cost Estimation Wizard endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas.wizard import (
    WizardCalculateRequest,
    WizardCalculateResponse,
    WizardPrefillResponse,
    WizardQuestionsResponse,
)
from services.wizard import WizardService

router = APIRouter(prefix="/api/wizard", tags=["wizard"])


def _get_wizard_service(db: AsyncSession = Depends(get_db)) -> WizardService:
    """Dependency that provides a WizardService with a DB session."""
    return WizardService(db=db)


@router.get("/questions", response_model=WizardQuestionsResponse)
async def get_questions() -> WizardQuestionsResponse:
    """Return the wizard question configuration."""
    service = WizardService()
    return service.get_questions()


@router.post("/calculate", response_model=WizardCalculateResponse)
async def calculate(
    body: WizardCalculateRequest,
    service: WizardService = Depends(_get_wizard_service),
) -> WizardCalculateResponse:
    """Calculate a cost estimate based on the user's answers."""
    return await service.calculate(body.answers)


@router.get("/prefill", response_model=WizardPrefillResponse)
async def prefill(
    q: str = Query(..., min_length=1, description="Free-text query to extract fields from"),
) -> WizardPrefillResponse:
    """Extract wizard field values from a free-text search query."""
    service = WizardService()
    return service.prefill(q)
