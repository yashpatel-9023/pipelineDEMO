# src/utils/retries.py
"""Generic retry decorator with exponential backoff.

Usage::

    @with_retries(max_attempts=3, backoff_base=1.0)
    async def flaky_operation():
        ...
"""

from __future__ import annotations

import asyncio
import functools
import logging
from typing import Any, Callable, Tuple, Type

logger = logging.getLogger(__name__)


def with_retries(
    max_attempts: int = 3,
    backoff_base: float = 1.0,
    backoff_max: float = 30.0,
    retryable_exceptions: Tuple[Type[BaseException], ...] = (Exception,),
) -> Callable:
    """Decorator that retries an async function on transient failures.

    Parameters
    ----------
    max_attempts:
        Total number of attempts (including the first call).
    backoff_base:
        Initial sleep duration in seconds between retries.
    backoff_max:
        Maximum sleep duration in seconds.
    retryable_exceptions:
        Tuple of exception types that should trigger a retry.
    """

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            delay = backoff_base
            last_exception: BaseException | None = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return await fn(*args, **kwargs)
                except retryable_exceptions as exc:
                    last_exception = exc
                    if attempt == max_attempts:
                        logger.error(
                            "All %d attempts exhausted for %s: %s",
                            max_attempts,
                            fn.__qualname__,
                            exc,
                        )
                        raise
                    logger.warning(
                        "Attempt %d/%d for %s failed (%s), retrying in %.1fs",
                        attempt,
                        max_attempts,
                        fn.__qualname__,
                        exc,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, backoff_max)

            # Should never reach here, but just in case:
            raise last_exception  # type: ignore[misc]

        return wrapper

    return decorator
