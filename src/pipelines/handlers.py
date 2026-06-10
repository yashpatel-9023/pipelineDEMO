# src/pipelines/handlers.py
"""Per-step handler functions.

Each handler wraps the raw service call with:
  • structured logging (start / success / failure)
  • optional cache read-through and write-through
  • returning a normalised ``Dict[str, Any]`` result

The handlers are registered in the step registry on import so that the
orchestration layer can look them up by ``PipelineStepType``.
"""

from __future__ import annotations

import time
from typing import Any, Dict

from src.cache.cache_keys import (
    annexure_listing_key,
    eligibility_key,
    summary_key,
)
from src.cache.service import get_cache_service
from src.core.logging import get_logger
from src.orchestration.activities import (
    autofill_template,
    evaluate_eligibility,
    fetch_tender_summary,
    generate_final_response,
    generate_templates,
    list_annexures,
)
from src.pipelines.step_definitions import PipelineStepType, register_handler

logger = get_logger(__name__)


async def handle_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch tender summary with cache read-through."""
    tender_id = payload.get("tender_id", "unknown")
    cache_service = get_cache_service()
    cache_key = summary_key(tender_id)

    cached = await cache_service.get(cache_key)
    if cached:
        logger.info("Cache HIT for summary", extra={"tender_id": tender_id})
        return cached

    start = time.monotonic()
    result = await fetch_tender_summary(payload)
    duration = int((time.monotonic() - start) * 1000)
    logger.info("Summary fetched", extra={"tender_id": tender_id, "duration_ms": duration})

    await cache_service.set(cache_key, result)
    return result


async def handle_eligibility(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate eligibility with cache read-through."""
    tender_id = payload.get("tender_id", "unknown")
    company_id = payload.get("company_id", "unknown")
    cache_service = get_cache_service()
    cache_key = eligibility_key(tender_id, company_id)

    cached = await cache_service.get(cache_key)
    if cached:
        logger.info("Cache HIT for eligibility", extra={"tender_id": tender_id, "company_id": company_id})
        return cached

    start = time.monotonic()
    result = await evaluate_eligibility(payload)
    duration = int((time.monotonic() - start) * 1000)
    logger.info("Eligibility evaluated", extra={"tender_id": tender_id, "duration_ms": duration})

    await cache_service.set(cache_key, result, ttl=7200)  # 2-hour cache for eligibility
    return result


async def handle_annexure_listing(payload: Dict[str, Any]) -> Dict[str, Any]:
    """List annexures with cache read-through."""
    tender_id = payload.get("tender_id", "unknown")
    cache_service = get_cache_service()
    cache_key = annexure_listing_key(tender_id)

    cached = await cache_service.get(cache_key)
    if cached:
        logger.info("Cache HIT for annexure listing", extra={"tender_id": tender_id})
        return cached

    start = time.monotonic()
    result = await list_annexures(payload)
    duration = int((time.monotonic() - start) * 1000)
    logger.info("Annexures listed", extra={"tender_id": tender_id, "duration_ms": duration})

    await cache_service.set(cache_key, result)
    return result


async def handle_template_generation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate templates — no caching (payload varies per selection)."""
    tender_id = payload.get("tender_id", "unknown")
    start = time.monotonic()
    result = await generate_templates(payload)
    duration = int((time.monotonic() - start) * 1000)
    logger.info("Templates generated", extra={"tender_id": tender_id, "duration_ms": duration})
    return result


async def handle_autofill(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Autofill a template — no caching (payload varies per template)."""
    tender_id = payload.get("tender_id", "unknown")
    start = time.monotonic()
    result = await autofill_template(payload)
    duration = int((time.monotonic() - start) * 1000)
    logger.info("Template autofilled", extra={"tender_id": tender_id, "duration_ms": duration})
    return result


async def handle_final_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate final bid response — no caching."""
    tender_id = payload.get("tender_id", "unknown")
    start = time.monotonic()
    result = await generate_final_response(payload)
    duration = int((time.monotonic() - start) * 1000)
    logger.info("Final response generated", extra={"tender_id": tender_id, "duration_ms": duration})
    return result


# ── Register handlers ────────────────────────────────────────────────────
register_handler(PipelineStepType.SUMMARY, handle_summary)
register_handler(PipelineStepType.ELIGIBILITY, handle_eligibility)
register_handler(PipelineStepType.ANNEXURE_LISTING, handle_annexure_listing)
register_handler(PipelineStepType.TEMPLATE_GENERATION, handle_template_generation)
register_handler(PipelineStepType.AUTOFILL, handle_autofill)
register_handler(PipelineStepType.FINAL_RESPONSE, handle_final_response)
