# src/cache/service.py
"""Centralized cache service for consistent cache management."""

from __future__ import annotations

from typing import Any, Optional

from src.cache.redis_client import get_redis_client
from src.core.logging import get_logger

logger = get_logger(__name__)

class CacheService:
    def __init__(self):
        self.redis = get_redis_client()

    async def get(self, key: str) -> Optional[Any]:
        """Retrieve data from cache."""
        try:
            return await self.redis.get_json(key)
        except Exception as exc:
            logger.warning("Cache read failed", extra={"key": key, "error": str(exc)})
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Store data in cache."""
        try:
            await self.redis.set_json(key, value, ttl=ttl)
            return True
        except Exception as exc:
            logger.warning("Cache write failed", extra={"key": key, "error": str(exc)})
            return False

    async def invalidate(self, key: str) -> bool:
        """Remove a specific key from cache."""
        try:
            await self.redis.delete(key)
            logger.info("Cache invalidated", extra={"key": key})
            return True
        except Exception as exc:
            logger.warning("Cache invalidation failed", extra={"key": key, "error": str(exc)})
            return False

    async def invalidate_pattern(self, pattern: str) -> bool:
        """Invalidate keys matching a pattern."""
        try:
            keys = await self.redis.client.keys(pattern)
            if keys:
                await self.redis.client.delete(*keys)
                logger.info("Cache pattern invalidated", extra={"pattern": pattern, "keys_count": len(keys)})
            return True
        except Exception as exc:
            logger.warning("Cache pattern invalidation failed", extra={"pattern": pattern, "error": str(exc)})
            return False

_cache_service: Optional[CacheService] = None

def get_cache_service() -> CacheService:
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service
