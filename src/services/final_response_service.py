# src/services/final_response_service.py
from typing import Any, Dict

from .base_api_client import BaseApiClient


class FinalResponseService(BaseApiClient):
    async def generate_final_response(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/final-response", json=payload)