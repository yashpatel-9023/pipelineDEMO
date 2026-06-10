from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.dependencies import get_db, get_current_user
from src.api.schemas import (
    AnnexureSelectionRequest,
    PipelineStartRequest,
    PipelineStartResponse,
    PipelineStatusResponse,
    ResumePipelineResponse,
)
from src.db.models import PipelineRun
from src.orchestration.temporal_client import create_temporal_client, start_pipeline

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.post("/start", response_model=PipelineStartResponse)
async def start_pipeline_route(
    request: PipelineStartRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
) -> PipelineStartResponse:
    handle = await start_pipeline(request.model_dump())
    pipeline_run = PipelineRun(
        tender_id=request.tender_id,
        company_id=request.company_id,
        workflow_id=handle.id,
        status="running",
        current_step="started",
        input_payload=request.payload,
        metadata_={
            "selection_signal_timeout_seconds": request.selection_signal_timeout_seconds,
        },
    )
    db.add(pipeline_run)
    db.commit()
    db.refresh(pipeline_run)

    return PipelineStartResponse(workflow_id=handle.id, status="started")


@router.get("/{workflow_id}/status", response_model=PipelineStatusResponse)
async def get_pipeline_status(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
) -> PipelineStatusResponse:
    client = await create_temporal_client()
    handle = client.get_workflow_handle(workflow_id)
    try:
        status_response = await handle.query("status")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow {workflow_id} not found or query failed: {exc}",
        )

    return PipelineStatusResponse(**status_response)


@router.post("/{workflow_id}/resume", response_model=ResumePipelineResponse)
async def resume_pipeline(
    workflow_id: str,
    request: AnnexureSelectionRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
) -> ResumePipelineResponse:
    client = await create_temporal_client()
    handle = client.get_workflow_handle(workflow_id)
    try:
        await handle.signal("select_annexures", request.annexure_ids)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to resume workflow {workflow_id}: {exc}",
        )

    pipeline_run = db.query(PipelineRun).filter(PipelineRun.workflow_id == workflow_id).first()
    if pipeline_run:
        pipeline_run.current_step = "awaiting_selection"
        db.commit()

    return ResumePipelineResponse(workflow_id=workflow_id, status="signaled")
