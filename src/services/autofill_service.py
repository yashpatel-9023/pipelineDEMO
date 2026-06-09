# src/services/autofill_service.py
from typing import Any, Dict

from .base_api_client import BaseApiClient


class AutofillService(BaseApiClient):
    async def autofill(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/annexures/autofill", json=payload)