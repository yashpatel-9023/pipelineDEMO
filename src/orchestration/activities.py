from __future__ import annotations

import os
import httpx
from typing import Any, Dict, List
from uuid import UUID

from temporalio import activity

from src.core.logging import get_logger
from src.core.config import get_settings
from src.utils.mock_loader import load_mock_response
from src.db.base import SessionLocal
from src.db.models import Annexure, Document, FilledAnnexure
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

async def safe_call(real_func, activity_name: str, payload: Dict[str, Any] = None):
    if MOCK_MODE:
        return load_mock_response(activity_name, payload)
    try:
        return await real_func()
    except (httpx.HTTPError, ConnectionError, ApiServiceError, Exception) as exc:
        logger.warning(f"Service call failed for {activity_name}, using mock", extra={"error": str(exc)})
        return load_mock_response(activity_name, payload)

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
        logger.info(f"Step : {step_id} ||  Activity fetch_tender_summary completed successfully for pipeline_run_id={pipeline_run_id}")
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
        passed = score >= get_settings().ELIGIBILITY_THRESHOLD
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
        logger.info(f"evaluate_eligibility completed, score={score}, passed={passed}", extra={"pipeline_run_id": pipeline_run_id, "tender_id": tender_id, "company_id": company_id})
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
        logger.info(f"list_annexures completed, found {len(items_to_store)} annexure templates", extra={"pipeline_run_id": pipeline_run_id, "tender_id": tender_id})
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
        
        # Group annexure items by file path
        items_by_file = {}
        for item in payload.get("annexure_items", []):
            file_path = item.get("file_path") or item.get("source_file")
            if not file_path:
                continue
            if file_path not in items_by_file:
                items_by_file[file_path] = []
            items_by_file[file_path].append(item)
            
        decorated_results = []
        
        for file_path, items in items_by_file.items():
            # Prepare payload for single file
            file_payload = {
                "filename": os.path.basename(file_path),
                "file_path": file_path,
                "templates": items,
                "pipeline_run_id": pipeline_run_id,
                "tender_id": payload.get("tender_id"),
                "company_id": payload.get("company_id"),
            }
            
            async def real_call(fp=file_payload):
                return await client.generate_template(fp)
                
            response_data = await safe_call(real_call, "generate_templates", file_payload)
            
            results_list = response_data.get("results", [])
            for i, res in enumerate(results_list):
                if i < len(items):
                    res["annexure_id"] = items[i].get("annexure_id")
                    res["file_path"] = file_path
                decorated_results.append(res)
                
        aggregated_result = {
            "status": "success",
            "results": decorated_results
        }
        
        await _record_step_complete(step_id, aggregated_result)
        logger.info(f"generate_templates completed for {len(items_by_file)} files", extra={"pipeline_run_id": pipeline_run_id})
        return aggregated_result
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
        result = await safe_call(real_call, "autofill_template", payload)
        # Find annexure_id from template metadata (if provided)
        template_info = payload.get("template", {})
        annexure_code = payload.get("annexure_id") or template_info.get("annexure_id")
        
        # Decorate result for display in frontend AutofillView
        result["title"] = template_info.get("template_title") or template_info.get("title")
        result["annexure_id"] = annexure_code or template_info.get("annexure_id")
        result["file_path"] = template_info.get("file_path")
        
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
        logger.info(f"autofill_template completed for annexure_code={annexure_code}", extra={"pipeline_run_id": pipeline_run_id, "tender_id": tender_id, "company_id": company_id})
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
        result = await safe_call(real_call, "generate_final_response", payload)
        
        from src.utils.pdf_generator import generate_pdf_from_html
        import re

        with SessionLocal() as db:
            checklist = result.get("Data", [])
            if not checklist and "results" in result:
                checklist = result.get("results", [])
                
            from src.utils.matching import semantic_match
            
            # Fetch all company docs for this tender
            all_company_docs = db.query(Document).filter(
                Document.tender_id == tender_id,
                Document.document_type == 'company_profile'
            ).all()
            company_doc_names = [d.name for d in all_company_docs if d.name]
            company_docs_map = {d.name: d for d in all_company_docs if d.name}
            
            # Fetch all filled annexures
            all_filled_annexures = db.query(FilledAnnexure).filter(
                FilledAnnexure.tender_id == tender_id,
                FilledAnnexure.company_id == company_id
            ).all()
            annexure_titles = [fa.raw_response.get("title", "") for fa in all_filled_annexures if fa.raw_response.get("title")]
            annexures_map = {fa.raw_response.get("title", ""): fa for fa in all_filled_annexures if fa.raw_response.get("title")}
            
            for item in checklist:
                doc_name = item.get("document_name") or item.get("title") or "Unknown Document"
                
                # Check company documents using semantic match
                matched_company_doc_name = semantic_match(doc_name, company_doc_names, threshold=0.3)
                company_doc = company_docs_map.get(matched_company_doc_name) if matched_company_doc_name else None
                
                # Check filled annexures using semantic match
                matched_annexure_title = semantic_match(doc_name, annexure_titles, threshold=0.3)
                matched_annexure = annexures_map.get(matched_annexure_title) if matched_annexure_title else None
                
                status = "missing"
                file_path = None
                source = "none"
                
                if company_doc and company_doc.storage_path:
                    status = "mapped"
                    file_path = company_doc.storage_path
                    source = "company_document"
                elif matched_annexure:
                    status = "mapped"
                    source = "filled_annexure"
                    html_content = matched_annexure.raw_response.get("filled_template", "")
                    if html_content:
                        safe_name = re.sub(r'[^A-Za-z0-9_\-\.]', '_', doc_name)
                        pdf_filename = f"{tender_id}_{safe_name}.pdf"
                        try:
                            file_path = generate_pdf_from_html(html_content, pdf_filename)
                        except Exception as e:
                            logger.error(f"Failed to generate PDF for {doc_name}: {e}")
                            file_path = None
                            status = "missing"

                # Import dynamically to avoid circular issues
                from src.db.repository import create_bidding_document_with_tender_company
                doc = create_bidding_document_with_tender_company(
                    db,
                    tender_id=tender_id,
                    company_id=company_id,
                    document_type="checklist_item",
                    title=doc_name,
                    file_path=file_path,
                    content_json=item,
                    metadata_={"source": source, "generated_by": "Temporal workflow", "workflow_id": activity.info().workflow_id},
                )
                doc.status = status
                db.commit()

        await _record_step_complete(step_id, result)
        logger.info(f"generate_final_response completed", extra={"pipeline_run_id": pipeline_run_id, "tender_id": tender_id, "company_id": company_id})
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
            logger.info(f"Pipeline run {pipeline_run_id} marked as completed")
        elif status == "failed":
            update_pipeline_run_failed(db, UUID(pipeline_run_id), result_payload)
            logger.info(f"Pipeline run {pipeline_run_id} marked as failed")
        elif status in ("waiting_for_retry", "running"):
            from src.db.repository import update_pipeline_run_status
            update_pipeline_run_status(
                db, 
                UUID(pipeline_run_id), 
                status=status, 
                current_step="evaluate_eligibility", 
                result_payload=result_payload
            )
            logger.info(f"Pipeline run {pipeline_run_id} updated to {status}")
        else:
            logger.warning(f"Unknown status {status} for pipeline run {pipeline_run_id}")