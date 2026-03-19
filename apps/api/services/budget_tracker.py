"""Daily API budget tracker.

Tracks Anthropic API spend per day. When the daily budget is exceeded,
the answer service should gracefully degrade to video-only results.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from threading import Lock

logger = logging.getLogger(__name__)

# Default daily budget in USD
DEFAULT_DAILY_BUDGET = 20.0

# Approximate cost per 1K tokens for Claude Sonnet 4.6
# Input: $3/1M tokens = $0.003/1K tokens
# Output: $15/1M tokens = $0.015/1K tokens
INPUT_COST_PER_1K = 0.003
OUTPUT_COST_PER_1K = 0.015


class BudgetTracker:
    """Thread-safe daily API spend tracker."""

    def __init__(self, daily_budget: float = DEFAULT_DAILY_BUDGET) -> None:
        self._daily_budget = daily_budget
        self._lock = Lock()
        self._current_date: date = date.today()
        self._total_spend: float = 0.0
        self._request_count: int = 0

    def _reset_if_new_day(self) -> None:
        """Reset counters if a new day has started."""
        today = date.today()
        if today != self._current_date:
            logger.info(
                "Budget reset: previous day %s spent $%.4f across %d requests",
                self._current_date, self._total_spend, self._request_count,
            )
            self._current_date = today
            self._total_spend = 0.0
            self._request_count = 0

    def record_usage(self, input_tokens: int, output_tokens: int) -> None:
        """Record token usage from a Claude API call."""
        cost = (input_tokens / 1000) * INPUT_COST_PER_1K + (output_tokens / 1000) * OUTPUT_COST_PER_1K
        with self._lock:
            self._reset_if_new_day()
            self._total_spend += cost
            self._request_count += 1
            logger.info(
                "Budget: $%.4f spent (this call: $%.4f, %d in/%d out tokens). "
                "Remaining: $%.4f",
                self._total_spend, cost, input_tokens, output_tokens,
                max(0, self._daily_budget - self._total_spend),
            )

    @property
    def is_budget_exceeded(self) -> bool:
        """Check if daily budget has been exceeded."""
        with self._lock:
            self._reset_if_new_day()
            return self._total_spend >= self._daily_budget

    @property
    def remaining_budget(self) -> float:
        """Return remaining budget for today in USD."""
        with self._lock:
            self._reset_if_new_day()
            return max(0, self._daily_budget - self._total_spend)

    @property
    def daily_stats(self) -> dict:
        """Return current day stats."""
        with self._lock:
            self._reset_if_new_day()
            return {
                "date": self._current_date.isoformat(),
                "total_spend": round(self._total_spend, 4),
                "remaining": round(max(0, self._daily_budget - self._total_spend), 4),
                "budget": self._daily_budget,
                "request_count": self._request_count,
            }
