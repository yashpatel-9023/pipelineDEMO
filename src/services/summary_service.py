# src/services/summary_service.py
from typing import Any, Dict

from .base_api_client import BaseApiClient


class SummaryService(BaseApiClient):
    async def summarize(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/summary", json=payload)