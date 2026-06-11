from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from src.api.dependencies import get_db, get_current_user
from src.api.schemas import (
    AnnexureSelectionRequest,
    PipelineStartRequest,
    PipelineStartResponse,
    PipelineStatusResponse,
    ResumePipelineResponse,
)
from src.db.repository import (
    create_pipeline_run,
    get_pipeline_run_by_workflow_id,
    create_approval,
    get_pipeline_step_by_name,
)
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError
from src.orchestration.temporal_client import create_temporal_client, start_pipeline

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.post("/start", response_model=PipelineStartResponse)
async def start_pipeline_route(
    request: PipelineStartRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
) -> PipelineStartResponse:
    # 1. Create pipeline run record first
    pipeline_run = create_pipeline_run(
        db,
        tender_id=request.tender_id,
        company_id=request.company_id,
        workflow_id="pending",  # placeholder, will be updated after workflow start
        input_payload=request.payload,
        metadata_={
            "selection_signal_timeout_seconds": request.selection_signal_timeout_seconds,
        },
    )
    run_id = str(pipeline_run.id)

    # 2. Inject pipeline_run_id into the payload for the workflow
    payload_with_run_id = request.payload.copy() if request.payload else {}
    payload_with_run_id["pipeline_run_id"] = run_id
    # Also pass tender_id and company_id as strings for DB writes
    payload_with_run_id["tender_id"] = request.tender_id
    payload_with_run_id["company_id"] = request.company_id

    # 3. Start the workflow
    handle = await start_pipeline({
        "tender_id": request.tender_id,
        "company_id": request.company_id,
        "payload": payload_with_run_id,
        "selection_signal_timeout_seconds": request.selection_signal_timeout_seconds,
    })

    # 4. Update pipeline run with actual workflow_id
    pipeline_run.workflow_id = handle.id
    db.commit()

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
    except RPCError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow {workflow_id} status query failed: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred while querying workflow {workflow_id}: {exc}",
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

    # Write approval record
    pipeline_run = get_pipeline_run_by_workflow_id(db, workflow_id)
    if pipeline_run:
        # Find the step (annexure listing step) to link approval
        step = get_pipeline_step_by_name(db, pipeline_run.id, "list_annexures")
        create_approval(
            db,
            pipeline_run_id=pipeline_run.id,
            pipeline_step_id=step.id if step else None,
            approval_type="annexure_selection",
            actor=current_user,
            decision="selected",
            payload={"selected_annexure_ids": request.annexure_ids},
        )
        pipeline_run.current_step = "awaiting_selection"
        db.commit()

    return ResumePipelineResponse(workflow_id=workflow_id, status="signaled")