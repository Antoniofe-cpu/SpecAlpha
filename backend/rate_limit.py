"""
Lightweight in-memory IP rate limiter for FastAPI.

Single-process only — fine for a single uvicorn replica. For multi-replica
deployments swap the store for Redis. Token-bucket per IP.
"""
from __future__ import annotations

import time
import asyncio
from collections import deque
from typing import Deque, Dict, Tuple, Iterable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class IPRateLimiter(BaseHTTPMiddleware):
    """Sliding-window rate limiter keyed by client IP.

    Default: 120 requests / 60s on /api/* — generous for a dashboard with bulk
    fetches, restrictive enough to block scraping bursts.
    """

    def __init__(
        self,
        app,
        max_requests: int = 120,
        window_seconds: int = 60,
        path_prefix: str = "/api",
        bypass_prefixes: Iterable[str] = ("/api/health",),
    ) -> None:
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.path_prefix = path_prefix
        self.bypass_prefixes = tuple(bypass_prefixes)
        self._buckets: Dict[str, Deque[float]] = {}
        self._lock = asyncio.Lock()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith(self.path_prefix):
            return await call_next(request)
        if any(path.startswith(p) for p in self.bypass_prefixes):
            return await call_next(request)

        ip = self._client_ip(request)
        now = time.time()
        async with self._lock:
            dq = self._buckets.setdefault(ip, deque())
            cutoff = now - self.window_seconds
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self.max_requests:
                retry_after = max(1, int(dq[0] + self.window_seconds - now))
                return JSONResponse(
                    {"detail": "Too many requests"},
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                )
            dq.append(now)
            # Garbage-collect rarely-used buckets to bound memory
            if len(self._buckets) > 5000:
                self._buckets = {k: v for k, v in self._buckets.items() if v and v[-1] > cutoff}

        return await call_next(request)

    @staticmethod
    def _client_ip(request: Request) -> str:
        # Trust X-Forwarded-For (set by the platform proxy) first
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
        return request.client.host if request.client else "anon"
