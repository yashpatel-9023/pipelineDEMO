from __future__ import annotations

import os
import httpx
from typing import Any, Dict, List
from uuid import UUID

from temporalio import activity

from src.core.logging import get_logger
from src.utils.mock_loader import load_mock_response
from src.db.base import SessionLocal
from src.db.models import Annexure
from src.db.repository import (
    create_pipeline_step,
    update_pipeline_step,
    upsert_eligibility_result,
    create_annexure,
    create_filled_annexure_with_tender_company,
    create_bidding_document_with_tender_company,
)

from .human_tasks import build_annexure_selection_notification
from ..services.annexure_listing_service import AnnexureListingService
from ..services.autofill_service import AutofillService
from ..services.base_api_client import ApiServiceError
from ..services.eligibility_service import EligibilityService
from ..services.final_response_service import FinalResponseService
from ..services.summary_service import SummaryService
from ..services.template_generation_service import TemplateGenerationService

logger = get_logger(__name__)

MOCK_MODE = os.getenv("USE_MOCK_AI", "true").lower() == "true"

def _get_service_client(service_class, url_env: str, key_env: str, default_url: str) -> Any:
    base_url = os.getenv(url_env, default_url)
    api_key = os.getenv(key_env)
    return service_class(base_url=base_url, api_key=api_key)

async def safe_call(real_func, activity_name: str):
    if MOCK_MODE:
        return load_mock_response(activity_name)
    try:
        return await real_func()
    except (httpx.HTTPError, ConnectionError, ApiServiceError, Exception) as exc:
        logger.warning(f"Service call failed for {activity_name}, using mock", extra={"error": str(exc)})
        return load_mock_response(activity_name)

# Helper to write step status
async def _record_step_start(pipeline_run_id: str, step_name: str, step_type: str, step_order: int) -> str:
    with SessionLocal() as db:
        step = create_pipeline_step(
            db,
            pipeline_run_id=UUID(pipeline_run_id),
            step_name=step_name,
            step_type=step_type,
            step_order=step_order,
        )
        return str(step.id)

async def _record_step_complete(step_id: str, output: Dict[str, Any]):
    with SessionLocal() as db:
        update_pipeline_step(db, UUID(step_id), status="completed", output=output)

async def _record_step_failed(step_id: str, error: Dict[str, Any]):
    with SessionLocal() as db:
        update_pipeline_step(db, UUID(step_id), status="failed", error=error)

# ─────────────────────────────────────────────────────────────
# Activity 1: Summary
# ─────────────────────────────────────────────────────────────
@activity.defn
async def fetch_tender_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    pipeline_run_id = payload.get("pipeline_run_id")
    step_id = await _record_step_start(pipeline_run_id, "fetch_tender_summary", "ai_call", 1)
    try:
        client = _get_service_client(SummaryService, "SUMMARY_SERVICE_URL", "SUMMARY_SERVICE_API_KEY", "http://localhost:8001")
        async def real_call():
            return await client.summarize(payload)
        result = await safe_call(real_call, "fetch_tender_summary")
        await _record_step_complete(step_id, result)
        return result
    except Exception as e:
        await _record_step_failed(step_id, {"error": str(e)})
        raise

# ─────────────────────────────────────────────────────────────
# Activity 2: Eligibility
# ─────────────────────────────────────────────────────────────
@activity.defn
async def evaluate_eligibility(payload: Dict[str, Any]) -> Dict[str, Any]:
    pipeline_run_id = payload.get("pipeline_run_id")
    tender_id = payload.get("tender_id")
    company_id = payload.get("company_id")
    step_id = await _record_step_start(pipeline_run_id, "evaluate_eligibility", "ai_call", 2)
    try:
        client = _get_service_client(EligibilityService, "ELIGIBILITY_SERVICE_URL", "ELIGIBILITY_SERVICE_API_KEY", "http://localhost:8002")
        async def real_call():
            return await client.evaluate(payload)
        result = await safe_call(real_call, "evaluate_eligibility")
        # Extract score and store eligibility result
        from ..orchestration.workflows import _extract_eligibility_score  # temporary import
        score = _extract_eligibility_score(result)
        passed = score >= 75
        with SessionLocal() as db:
            upsert_eligibility_result(
                db,
                tender_id=tender_id,
                company_id=company_id,
                score=score,
                passed=passed,
                details=result,
                raw_response=result,
            )
        await _record_step_complete(step_id, result)
        return result
    except Exception as e:
        await _record_step_failed(step_id, {"error": str(e)})
        raise

# ─────────────────────────────────────────────────────────────
# Activity 3: List Annexures
# ─────────────────────────────────────────────────────────────
@activity.defn
async def list_annexures(payload: Dict[str, Any]) -> Dict[str, Any]:
    pipeline_run_id = payload.get("pipeline_run_id")
    tender_id = payload.get("tender_id")
    step_id = await _record_step_start(pipeline_run_id, "list_annexures", "ai_call", 3)
    try:
        client = _get_service_client(AnnexureListingService, "ANNEXURE_SERVICE_URL", "ANNEXURE_SERVICE_API_KEY", "http://localhost:8003")
        async def real_call():
            return await client.list_annexures(payload)
        result = await safe_call(real_call, "list_annexures")
        # Store annexures in the database (if not already present)
        # The response has a top-level "results" array, each element has "result.templates"
        items_to_store = []
        for file_result in result.get("results", []):
            templates = file_result.get("result", {}).get("templates", [])
            for template in templates:
                annexure_id = template.get("annexure_id")
                if annexure_id:
                    items_to_store.append({
                        "annexure_id": annexure_id,
                        "title": template.get("title", ""),
                        "type": template.get("type", ""),
                        "file_path": file_result.get("file_path", ""),
                        "start_page": template.get("start_page"),
                        "end_page": template.get("end_page"),
                    })
        with SessionLocal() as db:
            for item in items_to_store:
                existing = db.query(Annexure).filter_by(
                    tender_id=tender_id, 
                    code=item["annexure_id"]
                ).first()
                if not existing:
                    create_annexure(
                        db,
                        tender_id=tender_id,
                        title=item["title"],
                        code=item["annexure_id"],
                        metadata_=item,
                    )
        await _record_step_complete(step_id, result)
        return result
    except Exception as e:
        await _record_step_failed(step_id, {"error": str(e)})
        raise

# ─────────────────────────────────────────────────────────────
# Activity 4: Generate Templates (no DB write needed except step)
# ─────────────────────────────────────────────────────────────
@activity.defn
async def generate_templates(payload: Dict[str, Any]) -> Dict[str, Any]:
    pipeline_run_id = payload.get("pipeline_run_id")
    step_id = await _record_step_start(pipeline_run_id, "generate_templates", "ai_call", 4)
    try:
        client = _get_service_client(TemplateGenerationService, "TEMPLATE_SERVICE_URL", "TEMPLATE_SERVICE_API_KEY", "http://localhost:8004")
        async def real_call():
            return await client.generate_template(payload)
        result = await safe_call(real_call, "generate_templates")
        await _record_step_complete(step_id, result)
        return result
    except Exception as e:
        await _record_step_failed(step_id, {"error": str(e)})
        raise

# ─────────────────────────────────────────────────────────────
# Activity 5: Autofill Template (writes to filled_annexures)
# ─────────────────────────────────────────────────────────────
@activity.defn
async def autofill_template(payload: Dict[str, Any]) -> Dict[str, Any]:
    pipeline_run_id = payload.get("pipeline_run_id")
    tender_id = payload.get("tender_id")
    company_id = payload.get("company_id")
    step_id = await _record_step_start(pipeline_run_id, "autofill_template", "ai_call", 5)
    try:
        client = _get_service_client(AutofillService, "AUTOFILL_SERVICE_URL", "AUTOFILL_SERVICE_API_KEY", "http://localhost:8005")
        async def real_call():
            return await client.autofill(payload)
        result = await safe_call(real_call, "autofill_template")
        # Find annexure_id from template metadata (if provided)
        template_info = payload.get("template", {})
        annexure_code = template_info.get("annexure_id") or template_info.get("id")
        if annexure_code:
            with SessionLocal() as db:
                # find annexure record by tender_id and code
                annexure = db.query(Annexure).filter_by(tender_id=tender_id, code=annexure_code).first()
                if annexure:
                    create_filled_annexure_with_tender_company(
                        db,
                        annexure_id=annexure.id,
                        tender_id=tender_id,
                        company_id=company_id,
                        filled_data=result,
                        raw_response=result,
                    )
        await _record_step_complete(step_id, result)
        return result
    except Exception as e:
        await _record_step_failed(step_id, {"error": str(e)})
        raise

# ─────────────────────────────────────────────────────────────
# Activity 6: Final Response (writes to bidding_documents)
# ─────────────────────────────────────────────────────────────
@activity.defn
async def generate_final_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    pipeline_run_id = payload.get("pipeline_run_id")
    tender_id = payload.get("tender_id")
    company_id = payload.get("company_id")
    step_id = await _record_step_start(pipeline_run_id, "generate_final_response", "ai_call", 6)
    try:
        client = _get_service_client(FinalResponseService, "FINAL_RESPONSE_SERVICE_URL", "FINAL_RESPONSE_SERVICE_API_KEY", "http://localhost:8006")
        async def real_call():
            return await client.generate_final_response(payload)
        result = await safe_call(real_call, "generate_final_response")
        # Store final bid document
        with SessionLocal() as db:
            create_bidding_document_with_tender_company(
                db,
                tender_id=tender_id,
                company_id=company_id,
                document_type="final_bid",
                title=f"Bid Response for Tender {tender_id}",
                content_json=result,
                metadata_={"generated_by": "Temporal workflow"},
            )
        await _record_step_complete(step_id, result)
        return result
    except Exception as e:
        await _record_step_failed(step_id, {"error": str(e)})
        raise

# ─────────────────────────────────────────────────────────────
# Activity 7: Notify Human (no DB write)
# ─────────────────────────────────────────────────────────────
@activity.defn
async def notify_human_for_annexure_selection(tender_id: str, company_id: str, annexure_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    return build_annexure_selection_notification(tender_id, company_id, annexure_list)

# ─────────────────────────────────────────────────────────────
# Activity 8: Update pipeline run status (final step)
# ─────────────────────────────────────────────────────────────
@activity.defn
async def update_final_pipeline_status(params: Dict[str, Any]) -> None:
    """Update pipeline run status to completed or failed.
    
    Expects a dict with keys:
        - pipeline_run_id: str (UUID of the pipeline run)
        - status: str ("completed" or "failed")
        - result_payload: dict
    """
    from src.db.base import SessionLocal
    from src.db.repository import update_pipeline_run_completed, update_pipeline_run_failed

    pipeline_run_id = params.get("pipeline_run_id")
    status = params.get("status")
    result_payload = params.get("result_payload", {})

    if not pipeline_run_id:
        logger.warning("update_final_pipeline_status called without pipeline_run_id")
        return

    with SessionLocal() as db:
        if status == "completed":
            update_pipeline_run_completed(db, UUID(pipeline_run_id), result_payload)
        elif status == "failed":
            update_pipeline_run_failed(db, UUID(pipeline_run_id), result_payload)
        else:
            logger.warning(f"Unknown status {status} for pipeline run {pipeline_run_id}")