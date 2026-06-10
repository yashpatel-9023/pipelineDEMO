# src/services/base_api_client.py
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

import httpx
from src.core.logging import get_correlation_id


class ApiServiceError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Any] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class BaseApiClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout_seconds: int = 30,
        max_attempts: int = 3,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        self.headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
        
        cid = get_correlation_id()
        if cid:
            self.headers["X-Correlation-ID"] = cid

    async def _request(
        self,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        backoff = 1.0

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for attempt in range(1, self.max_attempts + 1):
                try:
                    response = await client.request(
                        method,
                        url,
                        headers=self.headers,
                        json=json,
                        params=params,
                    )
                    response.raise_for_status()
                    try:
                        return response.json()
                    except ValueError as exc:
                        if attempt == self.max_attempts:
                            raise ApiServiceError(
                                "API response JSON decoding failed",
                                status_code=response.status_code if response is not None else None,
                                details={"text": response.text, "error": str(exc)},
                            )
                        payload = {"status_code": response.status_code, "body": response.text}
                        if attempt == self.max_attempts:
                            raise ApiServiceError("API request failed", status_code=response.status_code, details=payload)
                except httpx.HTTPStatusError as exc:
                    payload = {"status_code": exc.response.status_code, "body": exc.response.text}
                    if attempt == self.max_attempts:
                        raise ApiServiceError("API request failed", status_code=exc.response.status_code, details=payload)
                except httpx.RequestError as exc:
                    if attempt == self.max_attempts:
                        raise ApiServiceError("API request error", details=str(exc))
                await asyncio.sleep(min(backoff, 10))
                backoff *= 2