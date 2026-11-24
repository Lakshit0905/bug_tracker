"""Small in-process sliding-window rate limiter for brute-force protection on auth endpoints.

Scope: single backend process (the Docker deployment runs one). For horizontal scaling this would move to
Redis; the interface stays the same.
"""

import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float = 60.0) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, now: float | None = None) -> tuple[bool, int]:
        """Record a request. Returns (allowed, retry_after_seconds)."""
        current = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[key]
            while hits and current - hits[0] >= self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry_after = int(self.window_seconds - (current - hits[0])) + 1
                return False, retry_after
            hits.append(current)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
