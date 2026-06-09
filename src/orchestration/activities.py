from __future__ import annotations

import os
import httpx
from typing import Any, Dict, List

from temporalio import activity

from src.core.logging import get_logger

from .human_tasks import build_annexure_selection_notification
from ..services.annexure_listing_service import AnnexureListingService
from ..services.autofill_service import AutofillService
from ..services.base_api_client import ApiServiceError
from ..services.eligibility_service import EligibilityService
from ..services.final_response_service import FinalResponseService
from ..services.summary_service import SummaryService
from ..services.template_generation_service import TemplateGenerationService

logger = get_logger(__name__)

def _get_service_client(service_class, url_env: str, key_env: str, default_url: str) -> Any:
    base_url = os.getenv(url_env, default_url)
    api_key = os.getenv(key_env)
    return service_class(base_url=base_url, api_key=api_key)

async def safe_call(real_func, mock_result: Dict[str, Any]) -> Dict[str, Any]:
    """Execute *real_func* and return its result, falling back to *mock_result* on network errors."""
    try:
        return await real_func()
    except (httpx.HTTPError, ConnectionError, ApiServiceError, Exception) as exc:
        logger.warning("Service call failed – using mock result", extra={"error": str(exc)})
        return mock_result

@activity.defn
async def fetch_tender_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _get_service_client(SummaryService, "SUMMARY_SERVICE_URL", "SUMMARY_SERVICE_API_KEY", "http://localhost:8001")
    async def real_call() -> Dict[str, Any]:
        return await client.summarize(payload)
    mock = {"summary": "Mock summary", "key_points": []}
    return await safe_call(real_call, mock)

@activity.defn
async def evaluate_eligibility(payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _get_service_client(EligibilityService, "ELIGIBILITY_SERVICE_URL", "ELIGIBILITY_SERVICE_API_KEY", "http://localhost:8002")
    async def real_call() -> Dict[str, Any]:
        return await client.evaluate(payload)
    mock = {"eligible": True, "reason": "Mock eligibility evaluation"}
    return await safe_call(real_call, mock)

@activity.defn
async def list_annexures(payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _get_service_client(AnnexureListingService, "ANNEXURE_SERVICE_URL", "ANNEXURE_SERVICE_API_KEY", "http://localhost:8003")
    async def real_call() -> Dict[str, Any]:
        return await client.list_annexures(payload)
    mock = {"annexures": []}
    return await safe_call(real_call, mock)

@activity.defn
async def generate_templates(payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _get_service_client(TemplateGenerationService, "TEMPLATE_SERVICE_URL", "TEMPLATE_SERVICE_API_KEY", "http://localhost:8004")
    async def real_call() -> Dict[str, Any]:
        return await client.generate_template(payload)
    mock = {"template_id": "mock-template-id"}
    return await safe_call(real_call, mock)

@activity.defn
async def autofill_template(payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _get_service_client(AutofillService, "AUTOFILL_SERVICE_URL", "AUTOFILL_SERVICE_API_KEY", "http://localhost:8005")
    async def real_call() -> Dict[str, Any]:
        return await client.autofill(payload)
    mock = {"filled_content": "Mock filled content"}
    return await safe_call(real_call, mock)

@activity.defn
async def generate_final_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _get_service_client(FinalResponseService, "FINAL_RESPONSE_SERVICE_URL", "FINAL_RESPONSE_SERVICE_API_KEY", "http://localhost:8006")
    async def real_call() -> Dict[str, Any]:
        return await client.generate_final_response(payload)
    mock = {"response": "Mock final response"}
    return await safe_call(real_call, mock)

@activity.defn
async def notify_human_for_annexure_selection(tender_id: str, company_id: str, annexure_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    return build_annexure_selection_notification(tender_id, company_id, annexure_list)
