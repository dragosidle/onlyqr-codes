"""OnlyQR web API — FastAPI wrapper around the pure qr.build_svg() core.

In production the same app also serves the built React frontend (single
self-contained container). In dev the frontend is served by Vite, so the
static mount is skipped.
"""

import datetime
import os
from functools import lru_cache
from pathlib import Path

import redis.asyncio as aioredis
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from qr import HOLE_RATIOS, build_svg, make_filename

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="OnlyQR")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if os.getenv("ENV") == "production" else ["http://localhost:5173"],
    allow_methods=["GET"],
)

_redis = aioredis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379"),
    decode_responses=True,
    socket_connect_timeout=1,
)


def _next_utc_midnight() -> int:
    """Unix timestamp of the next UTC midnight (daily key expiry)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    tomorrow = (now + datetime.timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return int(tomorrow.timestamp())


async def _increment_daily_counter() -> None:
    key = f"qr:count:{datetime.date.today().isoformat()}"
    try:
        pipe = _redis.pipeline()
        pipe.incr(key)
        pipe.expireat(key, _next_utc_midnight())
        await pipe.execute()
    except Exception:
        pass  # non-critical — counter silently skipped if Valkey is down


@lru_cache(maxsize=512)
def build_svg_cached(text: str, hole: str | None, shape: str) -> str:
    """QR generation is deterministic, so cache on the raw request inputs."""
    ratio = HOLE_RATIOS[hole] if hole else None
    return build_svg(text, ratio, shape)


@app.get("/api/qr")
@limiter.limit("30/minute")
async def generate_qr(
    request: Request,
    url: str = Query(..., min_length=1, max_length=500),
    hole: str | None = Query(None, pattern="^(small|medium|large)$"),
    shape: str = Query("square", pattern="^(square|circle)$"),
):
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    svg = build_svg_cached(url, hole, shape)
    await _increment_daily_counter()
    headers = {
        "Content-Disposition": f'inline; filename="qr-{make_filename(url)}.svg"'
    }
    return Response(content=svg, media_type="image/svg+xml", headers=headers)


@app.get("/api/stats/today")
async def stats_today():
    key = f"qr:count:{datetime.date.today().isoformat()}"
    try:
        val = await _redis.get(key)
        return JSONResponse({"count": int(val or 0)})
    except Exception:
        return JSONResponse({"count": 0})


# Production: serve the built React app from this same process (same origin, so
# no CORS needed). Mounted at "/" AFTER the API routes so /api/qr, /docs, and
# /openapi.json still take precedence. Skipped in dev, where Vite serves the UI.
_DIST = Path(__file__).parent / "frontend" / "dist"
if os.getenv("ENV") == "production" and _DIST.is_dir():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
