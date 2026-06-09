# src/services/annexure_listing_service.py
from typing import Any, Dict

from .base_api_client import BaseApiClient


class AnnexureListingService(BaseApiClient):
    async def list_annexures(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/annexures/list", json=payload)