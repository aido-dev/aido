# Retry helper (demo for `aido docs`) — deliberately undocumented so Aido
# can draft docstrings and usage notes.

import time


def retry(fn, attempts=3, base_delay=0.5, backoff=2.0, exceptions=(Exception,)):
    delay = base_delay
    last = None
    for i in range(attempts):
        try:
            return fn()
        except exceptions as e:
            last = e
            if i == attempts - 1:
                break
            time.sleep(delay)
            delay *= backoff
    raise last


class Cache:
    def __init__(self, max_size=128):
        self.max_size = max_size
        self._store = {}
        self._order = []

    def get(self, key):
        return self._store.get(key)

    def put(self, key, value):
        if key not in self._store and len(self._store) >= self.max_size:
            oldest = self._order.pop(0)
            del self._store[oldest]
        self._store[key] = value
        self._order.append(key)
