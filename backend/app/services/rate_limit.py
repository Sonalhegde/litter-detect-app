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


KNOWN_TRUSTED_PROXIES = {
    "127.0.0.1",
    "::1",
}


def _is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_loopback or ip.is_private
    except ValueError:
        return False


def client_identifier(request: Request, trust_proxy_headers: bool | None = None) -> str:
    """
    Safely resolve client IP.
    When running behind a trusted reverse proxy (e.g. Render), extract the client IP
    from X-Forwarded-For or X-Real-IP. Spoofed headers on untrusted direct connections are ignored.
    """
    direct_peer = request.client.host if request.client else ""

    if trust_proxy_headers is None:
        settings = getattr(request.app.state, "settings", None)
        trust_proxy_headers = (
            getattr(settings, "trust_proxy_headers", False) if settings is not None else False
        )

    # Only trust forwarded headers if enabled AND the direct peer is a trusted proxy
    # (loopback). Private-range peers are deliberately not trusted: ipaddress treats
    # documentation ranges (198.51.100.0/24, 203.0.113.0/24) as private, which would
    # let test/doc-range spoofed peers through.
    is_trusted = trust_proxy_headers and direct_peer in KNOWN_TRUSTED_PROXIES

    if is_trusted:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            client_candidate = forwarded_for.split(",")[0].strip()
            try:
                return str(ipaddress.ip_address(client_candidate))
            except ValueError:
                pass
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            try:
                return str(ipaddress.ip_address(real_ip.strip()))
            except ValueError:
                pass

    try:
        return str(ipaddress.ip_address(direct_peer))
    except ValueError:
        pass

    return "unknown"

