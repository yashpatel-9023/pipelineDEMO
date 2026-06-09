from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PipelineStartRequest(BaseModel):
    tender_id: str
    company_id: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    selection_signal_timeout_seconds: Optional[int] = 3600
    workflow_id: Optional[str] = None


class PipelineStartResponse(BaseModel):
    workflow_id: str
    status: str


class PipelineStatusResponse(BaseModel):
    status: str
    selected_annexures: Optional[List[str]] = None
    workflow_state: Dict[str, Any] = Field(default_factory=dict)


class AnnexureSelectionRequest(BaseModel):
    annexure_ids: List[str]


class ResumePipelineResponse(BaseModel):
    workflow_id: str
    status: str


class DocumentUploadRequest(BaseModel):
    tender_id: str
    name: str
    document_type: str
    source: Optional[str] = "upload"
    document_source: Optional[str] = "company"
    storage_path: Optional[str] = None
    encrypted_path: Optional[str] = None
    content_hash: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    uploaded_by: Optional[str] = None


class DocumentUploadResponse(BaseModel):
    document_id: str
    status: str


class ApprovalDecisionRequest(BaseModel):
    step_name: str
    approval_type: str
    actor: str
    decision: str
    comments: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class ApprovalDecisionResponse(BaseModel):
    workflow_id: str
    step_name: str
    decision: str
    status: str
