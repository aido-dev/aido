"""
Demo module for showcasing the `aido test` command.

Deliberately mixes:
- A simple, easy-to-cover pure function
- A function with several branches and edge cases (good for proposed unit tests)
- A class that touches IO (good for proposed mocking / integration tests)
- A function with subtle off-by-one / floating-point risk (good for gap detection)

The point isn't to be production-quality — it's to give Aido something realistic
to plan tests for.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

logger = logging.getLogger(__name__)


# --- Pure helpers -----------------------------------------------------------

def clamp(value: float, lo: float, hi: float) -> float:
    """Clamp value into [lo, hi]. Assumes lo <= hi."""
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def apply_discount(price: float, percent: float) -> float:
    """
    Apply a percentage discount to a price.

    - `percent` is in 0..100.
    - Negative or > 100 percents are silently clamped.
    - Negative prices are returned unchanged (caller's problem).
    """
    if price < 0:
        return price
    pct = clamp(percent, 0.0, 100.0)
    return round(price * (1 - pct / 100), 2)


# --- Branchy logic ----------------------------------------------------------

@dataclass
class CartItem:
    sku: str
    qty: int
    unit_price: float


def cart_total(items: Iterable[CartItem], coupon: str | None = None) -> float:
    """
    Compute cart total with optional coupon.

    Coupons:
    - "WELCOME10" → 10% off subtotal
    - "FREESHIP"  → no price change (placeholder; handled elsewhere)
    - "VIP25"     → 25% off, but only if subtotal >= 100

    Returns 0.0 for an empty cart.
    """
    subtotal = 0.0
    for item in items:
        if item.qty <= 0:
            continue
        subtotal += item.qty * item.unit_price

    if subtotal == 0:
        return 0.0

    if coupon == "WELCOME10":
        subtotal = apply_discount(subtotal, 10)
    elif coupon == "VIP25" and subtotal >= 100:
        subtotal = apply_discount(subtotal, 25)
    # FREESHIP is intentionally ignored here.

    return round(subtotal, 2)


# --- IO-touching code -------------------------------------------------------

class OrderStore:
    """Tiny JSON-backed order store. Good target for mocked filesystem tests."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text())
        except json.JSONDecodeError:
            logger.warning("Corrupt order store at %s — starting empty", self.path)
            return []

    def append(self, order: dict) -> None:
        orders = self.load()
        orders.append(order)
        self.path.write_text(json.dumps(orders, indent=2))


# --- Subtle math ------------------------------------------------------------

def average_response_ms(samples: list[int]) -> float:
    """
    Mean of a list of response-time samples.

    NOTE: returns 0.0 for an empty list (rather than raising). This is
    convenient at call sites but masks the "no data" case — Aido should
    flag this as a coverage gap.
    """
    if not samples:
        return 0.0
    return sum(samples) / len(samples)
