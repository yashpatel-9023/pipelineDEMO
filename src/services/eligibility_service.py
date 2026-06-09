# src/services/eligibility_service.py
from typing import Any, Dict

from .base_api_client import BaseApiClient


class EligibilityService(BaseApiClient):
    async def evaluate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/eligibility", json=payload)