"""OnlyQR web API — FastAPI wrapper around the pure qr.build_svg() core.

In production the same app also serves the built React frontend (single
self-contained container). In dev the frontend is served by Vite, so the
static mount is skipped.
"""

import datetime
import os
from functools import lru_cache
from pathlib import Path

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from qr import HOLE_RATIOS, build_svg, make_filename

def _rate_limit_client_ip(request: Request) -> str:
    """Rate-limit key: the real client IP, never a client-forgeable one.

    In production the app is reachable only through Traefik (host port bound
    to 127.0.0.1; container on the traefik-public network). Traefik appends
    the connecting socket's IP as the LAST X-Forwarded-For entry whether or
    not it trusts incoming forwarded headers, so the rightmost entry is
    authoritative — leftmost entries can be forged by the client and must not
    be used. Without the header (dev, localhost debugging) fall back to the
    direct socket address.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.rsplit(",", 1)[-1].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=_rate_limit_client_ip,
    storage_uri=os.getenv("REDIS_URL", "redis://localhost:6379"),
)

_is_prod = os.getenv("ENV") == "production"
app = FastAPI(
    title="OnlyQR",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if _is_prod else ["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_redis = aioredis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379"),
    decode_responses=True,
    socket_connect_timeout=1,
)

_GITHUB_REPO = "dragosidle/onlyqr-codes"
_GH_STARS_KEY = "gh:stars:count"
_GH_STARS_FALLBACK_KEY = "gh:stars:count:last"
_GH_STARS_TTL = 900  # 15 min — GitHub's unauthenticated limit is 60/hour per IP,
# so this endpoint is the only thing that ever calls it, no matter how many
# visitors hit the site.
_GH_VERSION_KEY = "gh:version:latest"
_GH_VERSION_FALLBACK_KEY = "gh:version:latest:last"
_GH_VERSION_TTL = 900
_http_client = httpx.AsyncClient(timeout=5.0)


# Generations are tallied per UTC hour, not per calendar day. This lets each
# viewer's "this week" total be reconstructed for their own timezone at read
# time (sum the hourly buckets since their local week start) without one shared
# bucket leaking counts between timezones.
# A week is 168 hours; add a day of slack for any offset (UTC-12..+14).
_HOUR_BUCKET_TTL = 8 * 24 * 3600


def _hour_bucket(dt: datetime.datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H")


async def _increment_daily_counter() -> None:
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    key = f"qr:count:h:{_hour_bucket(utc_now)}"
    try:
        pipe = _redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, _HOUR_BUCKET_TTL)
        await pipe.execute()
    except Exception:
        pass  # non-critical — counter silently skipped if Valkey is down


async def _count_since_local_week_start(tz_offset: int) -> int:
    """Sum hourly buckets from the start of the viewer's local week (Monday
    midnight in their own timezone) through the current UTC hour.

    tz_offset is JS getTimezoneOffset(): minutes UTC is ahead of local time,
    so local = utc - tz_offset minutes, and utc = local + tz_offset minutes.
    """
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    local_now = utc_now - datetime.timedelta(minutes=tz_offset)
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    # weekday(): Monday is 0, so back up to the most recent Monday.
    local_week_start = local_midnight - datetime.timedelta(days=local_now.weekday())
    start_utc = local_week_start + datetime.timedelta(minutes=tz_offset)

    start_hour = start_utc.replace(minute=0, second=0, microsecond=0)
    end_hour = utc_now.replace(minute=0, second=0, microsecond=0)
    hours = int((end_hour - start_hour).total_seconds() // 3600) + 1
    keys = [
        f"qr:count:h:{_hour_bucket(start_hour + datetime.timedelta(hours=i))}"
        for i in range(hours)
    ]

    try:
        values = await _redis.mget(keys)
        return sum(int(v) for v in values if v is not None)
    except Exception:
        return 0


@lru_cache(maxsize=512)
def build_svg_cached(text: str, hole: str | None, shape: str) -> str:
    """QR generation is deterministic, so cache on the raw request inputs."""
    ratio = HOLE_RATIOS[hole] if hole else None
    return build_svg(text, ratio, shape)


# The WiFi QR convention (ZXing / WPA3 spec) requires backslash-escaping
# these characters in SSID and password values, otherwise scanners misparse
# the URI at the first stray semicolon.
_WIFI_ESCAPE = str.maketrans({c: f"\\{c}" for c in '\\;,":'})


def _escape_wifi_value(value: str) -> str:
    return value.translate(_WIFI_ESCAPE)


# 802.11 caps SSIDs at 32 bytes; WPA-personal passphrases at 63 characters.
class WifiQrRequest(BaseModel):
    ssid: str = Field(..., min_length=1, max_length=32)
    password: str = Field(default="", max_length=63)
    hole: str | None = Field(default=None, pattern="^(small|medium|large)$")
    shape: str = Field(default="square", pattern="^(square|circle)$")


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


@app.post("/api/qr/wifi")
@limiter.limit("30/minute")
async def generate_wifi_qr(request: Request, body: WifiQrRequest):
    security = "WPA" if body.password else "nopass"
    ssid = _escape_wifi_value(body.ssid)
    password = _escape_wifi_value(body.password)
    wifi_uri = f"WIFI:T:{security};S:{ssid};P:{password};;"
    svg = build_svg_cached(wifi_uri, body.hole, body.shape)
    await _increment_daily_counter()
    return Response(content=svg, media_type="image/svg+xml")


@app.get("/api/stats/week")
@limiter.limit("60/minute")
async def stats_week(request: Request, tz_offset: int = Query(0, ge=-840, le=720)):
    count = await _count_since_local_week_start(tz_offset)
    return JSONResponse({"count": count})


@app.get("/api/github/stars")
@limiter.limit("60/minute")
async def github_stars(request: Request):
    """Repo star count, cached in Redis. Refreshed at most once per
    _GH_STARS_TTL by whichever request happens to find the cache cold — if
    that GitHub call fails, fall back to the last known count instead of
    surfacing an error to the visitor.
    """
    try:
        cached = await _redis.get(_GH_STARS_KEY)
        if cached is not None:
            return JSONResponse({"count": int(cached)})
    except Exception:
        pass

    try:
        resp = await _http_client.get(f"https://api.github.com/repos/{_GITHUB_REPO}")
        resp.raise_for_status()
        count = resp.json()["stargazers_count"]
        try:
            pipe = _redis.pipeline()
            pipe.set(_GH_STARS_KEY, count, ex=_GH_STARS_TTL)
            pipe.set(_GH_STARS_FALLBACK_KEY, count)
            await pipe.execute()
        except Exception:
            pass
        return JSONResponse({"count": count})
    except Exception:
        pass

    try:
        fallback = await _redis.get(_GH_STARS_FALLBACK_KEY)
        if fallback is not None:
            return JSONResponse({"count": int(fallback)})
    except Exception:
        pass

    return JSONResponse({"count": None})


@app.get("/api/github/version")
@limiter.limit("60/minute")
async def github_version(request: Request):
    """Latest repo tag name, cached in Redis. Refreshed at most once per
    _GH_VERSION_TTL by whichever request happens to find the cache cold — if
    that GitHub call fails, fall back to the last known tag instead of
    surfacing an error to the visitor.
    """
    try:
        cached = await _redis.get(_GH_VERSION_KEY)
        if cached is not None:
            return JSONResponse({"version": cached})
    except Exception:
        pass

    try:
        resp = await _http_client.get(
            f"https://api.github.com/repos/{_GITHUB_REPO}/tags", params={"per_page": 1}
        )
        resp.raise_for_status()
        tags = resp.json()
        version = tags[0]["name"] if tags else None
        if version:
            try:
                pipe = _redis.pipeline()
                pipe.set(_GH_VERSION_KEY, version, ex=_GH_VERSION_TTL)
                pipe.set(_GH_VERSION_FALLBACK_KEY, version)
                await pipe.execute()
            except Exception:
                pass
        return JSONResponse({"version": version})
    except Exception:
        pass

    try:
        fallback = await _redis.get(_GH_VERSION_FALLBACK_KEY)
        if fallback is not None:
            return JSONResponse({"version": fallback})
    except Exception:
        pass

    return JSONResponse({"version": None})


# Production: serve the built React app from this same process (same origin, so
# no CORS needed). Mounted at "/" AFTER the API routes so /api/qr, /docs, and
# /openapi.json still take precedence. Skipped in dev, where Vite serves the UI.
_DIST = Path(__file__).parent / "frontend" / "dist"
if os.getenv("ENV") == "production" and _DIST.is_dir():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
