"""Loading and applying configurable per-token pricing."""

from __future__ import annotations

import json
from pathlib import Path

from .models import PricingModel

DEFAULT_PRICING: dict[str, dict[str, float]] = {
    "GPT-5.6 Sol": {"input": 5.0, "output": 30.0},
    "GPT-5.6 Terra": {"input": 2.5, "output": 15.0},
    "GPT-5.6 Luna": {"input": 1.0, "output": 6.0},
    "GPT-5.5": {"input": 5.0, "output": 30.0},
    "GPT-5.4 Mini": {"input": 0.75, "output": 4.5},
}


def load_pricing(path: Path | None = None) -> list[PricingModel]:
    """Load pricing JSON, or use bundled illustrative defaults."""
    raw: object = DEFAULT_PRICING
    if path:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"Could not load pricing file {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ValueError("Pricing configuration must be a JSON object")
    models: list[PricingModel] = []
    for name, rates in raw.items():
        if not isinstance(rates, dict):
            raise ValueError(f"Pricing for {name!r} must be an object")
        try:
            models.append(PricingModel(str(name), float(rates["input"]), float(rates["output"])))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Pricing for {name!r} needs numeric input and output rates") from exc
    return models


def estimate_cost(input_tokens: int, output_tokens: int, model: PricingModel) -> float:
    """Estimate US dollars from token totals and per-million-token rates."""
    return (input_tokens * model.input_per_million + output_tokens * model.output_per_million) / 1_000_000
