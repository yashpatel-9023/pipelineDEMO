from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.dependencies import get_db, get_current_user
from src.api.schemas import ApprovalDecisionRequest, ApprovalDecisionResponse
from src.db.repository import (
    create_approval,
    get_pipeline_run_by_workflow_id,
    get_pipeline_step_by_name,
)

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.post("/{workflow_id}", response_model=ApprovalDecisionResponse)
async def submit_approval(
    workflow_id: str,
    request: ApprovalDecisionRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
) -> ApprovalDecisionResponse:
    pipeline_run = get_pipeline_run_by_workflow_id(db, workflow_id)
    if not pipeline_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {workflow_id} not found",
        )

    step = get_pipeline_step_by_name(db, pipeline_run.id, request.step_name)
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline step {request.step_name} not found for run {workflow_id}",
        )

    approval = create_approval(
        db,
        pipeline_run_id=pipeline_run.id,
        pipeline_step_id=step.id,
        approval_type=request.approval_type,
        actor=request.actor,
        decision=request.decision,
        comments=request.comments,
        payload=request.payload,
    )

    step.status = "approved" if request.decision.lower() == "approve" else "rejected"
    db.commit()

    return ApprovalDecisionResponse(
        workflow_id=workflow_id,
        step_name=request.step_name,
        decision=request.decision,
        status="recorded",
    )
