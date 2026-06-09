# src/utils/http.py
"""Shared async HTTP client factory.

Provides a pre-configured ``httpx.AsyncClient`` with consistent timeout,
headers, and retry settings.  Use this instead of creating ad-hoc clients
throughout the codebase.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx

from src.core.config import get_settings


def build_headers(
    api_key: Optional[str] = None,
    extra: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """Build standard HTTP headers."""
    headers: Dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if extra:
        headers.update(extra)
    return headers


def create_async_client(
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: int = 30,
) -> httpx.AsyncClient:
    """Return a fresh ``httpx.AsyncClient`` with sensible defaults.

    The caller is responsible for closing the client (use ``async with``).
    """
    return httpx.AsyncClient(
        base_url=base_url or "",
        headers=build_headers(api_key=api_key),
        timeout=httpx.Timeout(timeout, connect=10),
        follow_redirects=True,
    )


async def async_get(
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    """Fire-and-forget GET request returning parsed JSON."""
    async with create_async_client(api_key=api_key, timeout=timeout) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


async def async_post(
    url: str,
    *,
    json_body: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    """Fire-and-forget POST request returning parsed JSON."""
    async with create_async_client(api_key=api_key, timeout=timeout) as client:
        response = await client.post(url, json=json_body)
        response.raise_for_status()
        return response.json()
