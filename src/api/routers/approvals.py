from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.dependencies import get_db
from src.api.schemas import ApprovalDecisionRequest, ApprovalDecisionResponse
from src.db.models import PipelineApproval, PipelineRun, PipelineStep

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.post("/{workflow_id}", response_model=ApprovalDecisionResponse)
async def submit_approval(
    workflow_id: str,
    request: ApprovalDecisionRequest,
    db: Session = Depends(get_db),
) -> ApprovalDecisionResponse:
    pipeline_run = db.query(PipelineRun).filter(PipelineRun.workflow_id == workflow_id).first()
    if not pipeline_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {workflow_id} not found",
        )

    approval = PipelineApproval(
        pipeline_run_id=pipeline_run.id,
        pipeline_step_id=None,
        approval_type=request.approval_type,
        actor=request.actor,
        decision=request.decision,
        comments=request.comments,
        payload=request.payload,
    )
    db.add(approval)

    step = (
        db.query(PipelineStep)
        .filter(PipelineStep.pipeline_run_id == pipeline_run.id)
        .filter(PipelineStep.step_name == request.step_name)
        .first()
    )
    if step:
        step.status = "approved" if request.decision.lower() == "approve" else "rejected"

    db.commit()

    return ApprovalDecisionResponse(
        workflow_id=workflow_id,
        step_name=request.step_name,
        decision=request.decision,
        status="recorded",
    )
