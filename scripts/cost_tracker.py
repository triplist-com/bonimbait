"""
Budget and cost tracking utility for the Bonimbait pipeline.

Tracks cumulative costs across pipeline steps, persists to JSON,
and raises BudgetExceededError when the budget would be exceeded.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("cost_tracker")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_COST_FILE = DATA_DIR / "cost_tracker.json"


class BudgetExceededError(Exception):
    """Raised when a cost would push the pipeline over budget."""
    pass


class CostTracker:
    """
    Track cumulative API costs across pipeline steps.

    Usage:
        tracker = CostTracker(max_budget=50.0)
        tracker.load()
        tracker.check_budget(estimated_cost=2.50)   # raises if over
        tracker.add_cost("whisper", 1.80)
        tracker.add_cost("summarize", 0.60)
        tracker.save()
        print(tracker.report())
    """

    def __init__(self, max_budget: float = 50.0, path: Path | None = None):
        self.max_budget = max_budget
        self.path = path or DEFAULT_COST_FILE
        self.costs: dict[str, float] = {}
        self.history: list[dict] = []  # timestamped log entries

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------
    def add_cost(self, category: str, amount: float, *, detail: str = "") -> None:
        """Record a cost under *category*."""
        if amount < 0:
            raise ValueError("Cost amount must be non-negative")
        self.costs[category] = self.costs.get(category, 0.0) + amount
        self.history.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "category": category,
            "amount": round(amount, 6),
            "detail": detail,
            "running_total": round(self.get_total(), 6),
        })
        logger.info(
            "Cost +$%.4f (%s) | Running total: $%.2f / $%.2f",
            amount, category, self.get_total(), self.max_budget,
        )

    def get_total(self) -> float:
        return sum(self.costs.values())

    def get_remaining(self) -> float:
        return max(0.0, self.max_budget - self.get_total())

    def check_budget(self, estimated_cost: float, *, category: str = "") -> bool:
        """
        Check if *estimated_cost* fits within the remaining budget.
        Raises BudgetExceededError if it would push over budget.
        Returns True if within budget.
        """
        remaining = self.get_remaining()
        if estimated_cost > remaining:
            msg = (
                f"Budget exceeded! Estimated cost ${estimated_cost:.2f} "
                f"for '{category}' exceeds remaining budget ${remaining:.2f} "
                f"(total spent: ${self.get_total():.2f} / ${self.max_budget:.2f})"
            )
            logger.error(msg)
            raise BudgetExceededError(msg)
        return True

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def save(self, path: Path | None = None) -> None:
        target = path or self.path
        target.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "max_budget": self.max_budget,
            "costs": {k: round(v, 6) for k, v in self.costs.items()},
            "total": round(self.get_total(), 6),
            "remaining": round(self.get_remaining(), 6),
            "history": self.history[-500:],  # keep last 500 entries
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.debug("Cost tracker saved to %s", target)

    def load(self, path: Path | None = None) -> None:
        target = path or self.path
        if not target.exists():
            logger.debug("No existing cost tracker at %s", target)
            return
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
            self.costs = data.get("costs", {})
            self.history = data.get("history", [])
            # Don't override max_budget from file — use the CLI/config value
            logger.info(
                "Loaded cost tracker: $%.2f spent / $%.2f budget",
                self.get_total(), self.max_budget,
            )
        except (json.JSONDecodeError, KeyError) as exc:
            logger.warning("Failed to load cost tracker: %s", exc)

    def reset(self) -> None:
        """Clear all tracked costs."""
        self.costs = {}
        self.history = []
        logger.info("Cost tracker reset")

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------
    def report(self) -> str:
        """Return a formatted cost report string."""
        lines = []
        lines.append("")
        lines.append("=" * 55)
        lines.append("  COST REPORT")
        lines.append("=" * 55)
        lines.append(f"  {'Category':<25} {'Cost':>10}")
        lines.append("  " + "-" * 37)

        for cat, amount in sorted(self.costs.items()):
            lines.append(f"  {cat:<25} ${amount:>9.4f}")

        lines.append("  " + "-" * 37)
        lines.append(f"  {'TOTAL':<25} ${self.get_total():>9.4f}")
        lines.append(f"  {'BUDGET':<25} ${self.max_budget:>9.2f}")
        lines.append(f"  {'REMAINING':<25} ${self.get_remaining():>9.2f}")
        lines.append("=" * 55)
        return "\n".join(lines)

    def summary_dict(self) -> dict:
        """Return a dict summarizing costs for programmatic use."""
        return {
            "costs": dict(self.costs),
            "total": round(self.get_total(), 4),
            "budget": self.max_budget,
            "remaining": round(self.get_remaining(), 4),
        }
