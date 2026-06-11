# src/db/repository.py
"""Database repository layer.

Provides CRUD helpers for the main ORM models.  Each repository method
accepts a ``Session`` so that the caller (typically a FastAPI route) controls
the transaction boundary.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.logging import get_logger
from src.db.models import (
    Annexure,
    BiddingDocument,
    Company,
    Document,
    EligibilityResult,
    FilledAnnexure,
    PipelineApproval,
    PipelineRun,
    PipelineStep,
    Tender,
)

logger = get_logger(__name__)


# ── Pipeline Run ─────────────────────────────────────────────────────────

def create_pipeline_run(
    db: Session,
    *,
    tender_id: str,
    company_id: str,
    workflow_id: str,
    input_payload: Dict[str, Any],
    metadata_: Optional[Dict[str, Any]] = None,
) -> PipelineRun:
    run = PipelineRun(
        tender_id=tender_id,
        company_id=company_id,
        workflow_id=workflow_id,
        status="running",
        current_step="started",
        input_payload=input_payload,
        metadata_=metadata_ or {},
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    logger.info(
        "Pipeline run created",
        extra={"pipeline_run_id": str(run.id), "tender_id": tender_id},
    )
    return run


def get_pipeline_run_by_workflow_id(db: Session, workflow_id: str) -> Optional[PipelineRun]:
    return (
        db.execute(select(PipelineRun).where(PipelineRun.workflow_id == workflow_id))
        .scalars()
        .first()
    )


def get_pipeline_run(db: Session, run_id: UUID) -> Optional[PipelineRun]:
    return db.get(PipelineRun, run_id)


def update_pipeline_run_status(
    db: Session,
    run_id: UUID,
    *,
    status: str,
    current_step: Optional[str] = None,
    result_payload: Optional[Dict[str, Any]] = None,
) -> Optional[PipelineRun]:
    run = db.get(PipelineRun, run_id)
    if not run:
        return None
    run.status = status
    if current_step is not None:
        run.current_step = current_step
    if result_payload is not None:
        run.result_payload = result_payload
    if status in ("completed", "failed"):
        run.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(run)
    return run


def list_pipeline_runs_for_tender(db: Session, tender_id: str) -> List[PipelineRun]:
    return (
        db.execute(
            select(PipelineRun)
            .where(PipelineRun.tender_id == tender_id)
            .order_by(PipelineRun.created_at.desc())
        )
        .scalars()
        .all()
    )


# ── Pipeline Step ────────────────────────────────────────────────────────

def create_pipeline_step(
    db: Session,
    *,
    pipeline_run_id: UUID,
    step_name: str,
    step_type: str,
    step_order: int,
) -> PipelineStep:
    step = PipelineStep(
        pipeline_run_id=pipeline_run_id,
        step_name=step_name,
        step_type=step_type,
        step_order=step_order,
        status="pending",
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


def update_pipeline_step(
    db: Session,
    step_id: UUID,
    *,
    status: str,
    output: Optional[Dict[str, Any]] = None,
    error: Optional[Dict[str, Any]] = None,
) -> Optional[PipelineStep]:
    step = db.get(PipelineStep, step_id)
    if not step:
        return None
    step.status = status
    step.attempts += 1
    if status == "in_progress" and step.started_at is None:
        step.started_at = datetime.now(timezone.utc)
    if status in ("completed", "failed"):
        step.completed_at = datetime.now(timezone.utc)
    if output is not None:
        step.output = output
    if error is not None:
        step.error = error
    db.commit()
    db.refresh(step)
    return step


# ── Document ─────────────────────────────────────────────────────────────

def create_document(
    db: Session,
    *,
    tender_id: str,
    name: str,
    document_type: str,
    source: str = "upload",
    document_source: str = "company",
    storage_path: Optional[str] = None,
    encrypted_path: Optional[str] = None,
    content_hash: Optional[str] = None,
    metadata_: Optional[Dict[str, Any]] = None,
    uploaded_by: Optional[str] = None,
) -> Document:
    doc = Document(
        tender_id=tender_id,
        name=name,
        document_type=document_type,
        source=source,
        document_source=document_source,
        storage_path=storage_path,
        encrypted_path=encrypted_path,
        content_hash=content_hash,
        metadata_=metadata_ or {},
        uploaded_by=uploaded_by,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def list_documents_for_tender(db: Session, tender_id: str) -> List[Document]:
    return (
        db.execute(
            select(Document)
            .where(Document.tender_id == tender_id)
            .order_by(Document.uploaded_at.desc())
        )
        .scalars()
        .all()
    )


# ── Eligibility ──────────────────────────────────────────────────────────

def upsert_eligibility_result(
    db: Session,
    *,
    tender_id: str,
    company_id: str,
    score: int,
    passed: bool,
    details: Dict[str, Any],
    raw_response: Optional[Dict[str, Any]] = None,
    expires_at: Optional[datetime] = None,
) -> EligibilityResult:
    existing = (
        db.execute(
            select(EligibilityResult)
            .where(EligibilityResult.tender_id == tender_id)
            .where(EligibilityResult.company_id == company_id)
        )
        .scalars()
        .first()
    )
    if existing:
        existing.score = score
        existing.passed = passed
        existing.details = details
        existing.raw_response = raw_response or {}
        existing.evaluated_at = datetime.now(timezone.utc)
        existing.expires_at = expires_at
        db.commit()
        db.refresh(existing)
        return existing

    result = EligibilityResult(
        tender_id=tender_id,
        company_id=company_id,
        score=score,
        passed=passed,
        details=details,
        raw_response=raw_response or {},
        expires_at=expires_at,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


# ── Company ──────────────────────────────────────────────────────────────

def get_company(db: Session, company_id: UUID) -> Optional[Company]:
    return db.get(Company, company_id)


def create_company(
    db: Session,
    *,
    name: str,
    registration_number: Optional[str] = None,
    industry: Optional[str] = None,
    country: Optional[str] = None,
    profile: Optional[Dict[str, Any]] = None,
) -> Company:
    company = Company(
        name=name,
        registration_number=registration_number,
        industry=industry,
        country=country,
        profile=profile or {},
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


# ── Tender ───────────────────────────────────────────────────────────────

def get_tender(db: Session, tender_id: UUID) -> Optional[Tender]:
    return db.get(Tender, tender_id)


def create_tender(
    db: Session,
    *,
    company_id: str,
    tender_reference: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    metadata_: Optional[Dict[str, Any]] = None,
) -> Tender:
    tender = Tender(
        company_id=company_id,
        tender_reference=tender_reference,
        title=title,
        description=description,
        metadata_=metadata_ or {},
    )
    db.add(tender)
    db.commit()
    db.refresh(tender)
    return tender


# ── Approval ─────────────────────────────────────────────────────────────

def create_approval(
    db: Session,
    *,
    pipeline_run_id: UUID,
    pipeline_step_id: Optional[UUID] = None,
    approval_type: str,
    actor: str,
    decision: str,
    comments: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> PipelineApproval:
    approval = PipelineApproval(
        pipeline_run_id=pipeline_run_id,
        pipeline_step_id=pipeline_step_id,
        approval_type=approval_type,
        actor=actor,
        decision=decision,
        comments=comments,
        payload=payload or {},
        decision_at=datetime.now(timezone.utc),
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval


def get_pipeline_step_by_name(
    db: Session, pipeline_run_id: UUID, step_name: str
) -> Optional[PipelineStep]:
    return (
        db.execute(
            select(PipelineStep)
            .where(PipelineStep.pipeline_run_id == pipeline_run_id)
            .where(PipelineStep.step_name == step_name)
        )
        .scalars()
        .first()
    )


# ── Annexure ─────────────────────────────────────────────────────────────

def create_annexure(
    db: Session,
    *,
    tender_id: UUID,
    title: str,
    code: Optional[str] = None,
    metadata_: Optional[Dict[str, Any]] = None,
) -> Annexure:
    annexure = Annexure(
        tender_id=tender_id,
        title=title,
        code=code,
        metadata_=metadata_ or {},
    )
    db.add(annexure)
    db.commit()
    db.refresh(annexure)
    return annexure


def create_filled_annexure(
    db: Session,
    *,
    annexure_id: UUID,
    pipeline_run_id: UUID,
    filled_data: Dict[str, Any],
    storage_path: Optional[str] = None,
) -> FilledAnnexure:
    filled = FilledAnnexure(
        annexure_id=annexure_id,
        pipeline_run_id=pipeline_run_id,
        filled_data=filled_data,
        storage_path=storage_path,
        filled_at=datetime.now(timezone.utc),
    )
    db.add(filled)
    db.commit()
    db.refresh(filled)
    return filled


# ── Bidding Document ─────────────────────────────────────────────────────

def create_bidding_document(
    db: Session,
    *,
    pipeline_run_id: UUID,
    document_name: str,
    storage_path: str,
    metadata_: Optional[Dict[str, Any]] = None,
) -> BiddingDocument:
    doc = BiddingDocument(
        pipeline_run_id=pipeline_run_id,
        document_name=document_name,
        storage_path=storage_path,
        metadata_=metadata_ or {},
        generated_at=datetime.now(timezone.utc),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


# ==========================================================================
# NEW HELPER FUNCTIONS FOR UPDATING PIPELINE RUN STATUS
# ==========================================================================

def update_pipeline_run_completed(
    db: Session,
    run_id: UUID,
    result_payload: Dict[str, Any],
) -> Optional[PipelineRun]:
    """Set pipeline run status to completed and store the final result."""
    run = db.get(PipelineRun, run_id)
    if not run:
        return None
    run.status = "completed"
    run.result_payload = result_payload
    run.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(run)
    return run


def update_pipeline_run_failed(
    db: Session,
    run_id: UUID,
    error_payload: Dict[str, Any],
) -> Optional[PipelineRun]:
    """Set pipeline run status to failed and store error details."""
    run = db.get(PipelineRun, run_id)
    if not run:
        return None
    run.status = "failed"
    run.result_payload = error_payload
    run.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(run)
    return run


# ==========================================================================
# NEW HELPER FUNCTIONS FOR FILLED ANNEXURES & BIDDING DOCUMENTS
# (using tender_id and company_id, no pipeline_run_id requirement)
# ==========================================================================

def create_filled_annexure_with_tender_company(
    db: Session,
    *,
    annexure_id: UUID,
    tender_id: UUID,
    company_id: UUID,
    filled_data: Dict[str, Any],
    raw_response: Optional[Dict[str, Any]] = None,
) -> FilledAnnexure:
    """Create a filled annexure record directly linked to tender and company."""
    filled = FilledAnnexure(
        annexure_id=annexure_id,
        tender_id=tender_id,
        company_id=company_id,
        filled_data=filled_data,
        raw_response=raw_response or {},
        status="completed",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(filled)
    db.commit()
    db.refresh(filled)
    return filled


def create_bidding_document_with_tender_company(
    db: Session,
    *,
    tender_id: UUID,
    company_id: UUID,
    document_type: str,
    title: str,
    file_path: Optional[str] = None,
    content_json: Optional[Dict[str, Any]] = None,
    metadata_: Optional[Dict[str, Any]] = None,
) -> BiddingDocument:
    """Create a bidding document record directly linked to tender and company."""
    doc = BiddingDocument(
        tender_id=tender_id,
        company_id=company_id,
        document_type=document_type,
        title=title,
        file_path=file_path,
        content_json=content_json or {},
        metadata_=metadata_ or {},
        status="generated",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc