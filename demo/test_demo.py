"""Shipping-cost calculator (demo for `aido test`).

Branchy validation + tiered logic with several edge cases — a good target
for a structured test plan (functional, negative, boundary).
"""


def shipping_cost(weight_kg, distance_km, express=False):
    if weight_kg <= 0 or distance_km <= 0:
        raise ValueError("weight and distance must be positive")

    if weight_kg <= 1:
        base = 5
    elif weight_kg <= 5:
        base = 10
    elif weight_kg <= 20:
        base = 25
    else:
        base = 25 + (weight_kg - 20) * 2

    per_km = 0.05 if distance_km <= 100 else 0.03
    cost = base + distance_km * per_km

    if express:
        cost *= 1.5
    return round(cost, 2)
