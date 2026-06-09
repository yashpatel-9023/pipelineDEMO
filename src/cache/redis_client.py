# src/cache/redis_client.py
"""Redis cache client with JSON serialisation helpers.

Usage::

    from src.cache.redis_client import get_redis_cache

    cache = get_redis_cache()
    await cache.set_json("key", {"foo": "bar"}, ttl=3600)
    data = await cache.get_json("key")
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Dict, Optional

import redis.asyncio as aioredis

from src.core.config import get_settings
from src.core.logging import get_logger

logger = get_logger(__name__)


class RedisCache:
    """Thin async wrapper around ``redis.asyncio``."""

    def __init__(self, url: str, default_ttl: int = 3600) -> None:
        self._url = url
        self._default_ttl = default_ttl
        self._pool: Optional[aioredis.Redis] = None

    async def _get_client(self) -> aioredis.Redis:
        if self._pool is None:
            self._pool = aioredis.from_url(
                self._url,
                decode_responses=True,
                max_connections=20,
            )
        return self._pool

    # ── Read ─────────────────────────────────────────────────────────
    async def get_json(self, key: str) -> Optional[Dict[str, Any]]:
        """Return the cached JSON object, or ``None`` on miss / error."""
        try:
            client = await self._get_client()
            raw = await client.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.warning("Cache GET failed for key=%s", key, exc_info=True)
            return None

    # ── Write ────────────────────────────────────────────────────────
    async def set_json(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
    ) -> bool:
        """Store a JSON-serialisable value.  Returns ``True`` on success."""
        try:
            client = await self._get_client()
            await client.set(
                key,
                json.dumps(value, default=str),
                ex=ttl or self._default_ttl,
            )
            return True
        except Exception:
            logger.warning("Cache SET failed for key=%s", key, exc_info=True)
            return False

    # ── Invalidate ───────────────────────────────────────────────────
    async def invalidate(self, key: str) -> bool:
        """Delete a cache entry.  Returns ``True`` if the key existed."""
        try:
            client = await self._get_client()
            deleted = await client.delete(key)
            return deleted > 0
        except Exception:
            logger.warning("Cache DELETE failed for key=%s", key, exc_info=True)
            return False

    async def invalidate_pattern(self, pattern: str) -> int:
        """Delete all keys matching a glob pattern.  Returns count deleted."""
        try:
            client = await self._get_client()
            keys = []
            async for key in client.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                return await client.delete(*keys)
            return 0
        except Exception:
            logger.warning("Cache pattern DELETE failed for %s", pattern, exc_info=True)
            return 0

    # ── Health ───────────────────────────────────────────────────────
    async def ping(self) -> bool:
        try:
            client = await self._get_client()
            return await client.ping()
        except Exception:
            return False

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None


# ── Singleton accessor ───────────────────────────────────────────────────
_cache_instance: Optional[RedisCache] = None


def get_redis_cache() -> RedisCache:
    """Return a singleton ``RedisCache`` instance."""
    global _cache_instance
    if _cache_instance is None:
        settings = get_settings()
        _cache_instance = RedisCache(
            url=settings.REDIS_URL,
            default_ttl=settings.CACHE_TTL_SECONDS,
        )
    return _cache_instance
