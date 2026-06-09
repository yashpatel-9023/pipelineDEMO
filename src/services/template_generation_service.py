# src/services/template_generation_service.py
from typing import Any, Dict

from .base_api_client import BaseApiClient


class TemplateGenerationService(BaseApiClient):
    async def generate_template(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/annexures/template", json=payload)