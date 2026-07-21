"""Feature flag service (demo for `aido summarize`).

Several small pieces (loading, evaluation, percentage rollout, overrides) so a
summary has real scope to describe intent, risks, and impact.
"""

import hashlib


class FeatureFlags:
    def __init__(self, config):
        self.config = config or {}
        self.overrides = {}

    def set_override(self, flag, value):
        self.overrides[flag] = value

    def _bucket(self, flag, user_id):
        h = hashlib.sha256(f"{flag}:{user_id}".encode()).hexdigest()
        return int(h[:8], 16) % 100

    def is_enabled(self, flag, user_id=None):
        if flag in self.overrides:
            return self.overrides[flag]
        spec = self.config.get(flag)
        if not spec or not spec.get("enabled"):
            return False
        rollout = spec.get("rollout_percent", 100)
        if user_id is None:
            return rollout >= 100
        return self._bucket(flag, user_id) < rollout
