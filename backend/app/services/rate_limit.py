from __future__ import annotations

import ipaddress
import math
import threading
import time
from collections import deque

from fastapi import Request


class SlidingWindowRateLimiter:
    """Small in-memory per-client limiter suitable for a single public demo instance."""

    def __init__(self, limit: int, window_seconds: int, max_clients: int = 10_000) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_clients = max_clients
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def retry_after(self, client_id: str) -> int | None:
        now = time.monotonic()
        with self._lock:
            events = self._events.setdefault(client_id, deque())
            cutoff = now - self.window_seconds
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                return max(1, math.ceil(self.window_seconds - (now - events[0])))
            events.append(now)
            if len(self._events) > self.max_clients:
                oldest = min(self._events, key=lambda item: self._events[item][-1] if self._events[item] else now)
                self._events.pop(oldest, None)
            return None


def client_identifier(request: Request) -> str:
    """Use the connection peer; forwarded headers are client-spoofable without trusted-proxy configuration."""
    candidate = request.client.host if request.client else ""
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        pass
    return "unknown"
