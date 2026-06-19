from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from src.api.dependencies import get_db, get_current_user
from src.db.models import Company, Tender, PipelineRun, PipelineStep, BiddingDocument, FilledAnnexure

router = APIRouter(prefix="/metadata", tags=["metadata"])


@router.get("/companies")
async def get_companies(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """List all seeded companies."""
    companies = db.query(Company).all()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "registration_number": c.registration_number,
            "industry": c.industry,
            "country": c.country,
            "profile": c.profile,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in companies
    ]


@router.get("/tenders")
async def get_tenders(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """List all seeded tenders."""
    tenders = db.query(Tender).all()
    return [
        {
            "id": str(t.id),
            "company_id": str(t.company_id),
            "tender_reference": t.tender_reference,
            "title": t.title,
            "description": t.description,
            "folder_path": t.folder_path,
            "status": t.status,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tenders
    ]


@router.get("/runs")
async def get_pipeline_runs(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """List all pipeline runs, ordered by creation date desc."""
    runs = db.query(PipelineRun).order_by(PipelineRun.created_at.desc()).all()
    return [
        {
            "id": str(r.id),
            "tender_id": str(r.tender_id),
            "tender_reference": r.tender.tender_reference if r.tender else None,
            "company_id": str(r.company_id),
            "company_name": r.company.name if r.company else None,
            "workflow_id": r.workflow_id,
            "run_id": r.run_id,
            "status": r.status,
            "current_step": r.current_step,
            "input_payload": r.input_payload,
            "result_payload": r.result_payload,
            "workflow_state": r.workflow_state,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}/steps")
async def get_pipeline_steps(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """List all steps for a specific pipeline run, ordered by step_order."""
    try:
        run_uuid = UUID(run_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid pipeline run ID format: {run_id}",
        )

    run = db.query(PipelineRun).filter(PipelineRun.id == run_uuid).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {run_id} not found",
        )

    steps = db.query(PipelineStep).filter(PipelineStep.pipeline_run_id == run_uuid).order_by(PipelineStep.step_order.asc(), PipelineStep.created_at.asc()).all()
    return [
        {
            "id": str(s.id),
            "step_name": s.step_name,
            "step_type": s.step_type,
            "status": s.status,
            "step_order": s.step_order,
            "attempts": s.attempts,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "output": s.output,
            "error": s.error,
        }
        for s in steps
    ]


@router.get("/runs/{run_id}/artifacts")
async def get_pipeline_artifacts(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Fetch generated filled annexures and final bid documents for a pipeline run."""
    try:
        run_uuid = UUID(run_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid pipeline run ID format: {run_id}",
        )

    run = db.query(PipelineRun).filter(PipelineRun.id == run_uuid).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {run_id} not found",
        )

    # Fetch final bidding documents for this tender and company
    bid_docs = db.query(BiddingDocument).filter(
        BiddingDocument.tender_id == run.tender_id,
        BiddingDocument.company_id == run.company_id
    ).all()

    # Fetch filled annexures
    filled_annexures = db.query(FilledAnnexure).filter(
        FilledAnnexure.tender_id == run.tender_id,
        FilledAnnexure.company_id == run.company_id
    ).all()

    return {
        "bidding_documents": [
            {
                "id": str(doc.id),
                "document_type": doc.document_type,
                "title": doc.title,
                "file_path": doc.file_path,
                "content_json": doc.content_json,
                "status": doc.status,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            }
            for doc in bid_docs
        ],
        "filled_annexures": [
            {
                "id": str(fa.id),
                "annexure_code": fa.annexure.code if fa.annexure else None,
                "annexure_title": fa.annexure.title if fa.annexure else None,
                "filled_data": fa.filled_data,
                "status": fa.status,
                "completed_at": fa.completed_at.isoformat() if fa.completed_at else None,
                "created_at": fa.created_at.isoformat() if fa.created_at else None,
            }
            for fa in filled_annexures
        ]
    }
