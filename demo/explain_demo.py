"""Token-bucket rate limiter (demo for `aido explain`).

A small but non-obvious algorithm: tokens refill continuously over time and
requests consume them. Good material for a step-by-step explanation.
"""

import time


class RateLimiter:
    def __init__(self, capacity, refill_per_sec):
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.tokens = capacity
        self.updated = time.monotonic()

    def allow(self, cost=1):
        now = time.monotonic()
        elapsed = now - self.updated
        self.updated = now
        # continuously refill, capped at capacity
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_sec)
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False
