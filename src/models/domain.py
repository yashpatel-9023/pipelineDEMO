from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ApiResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    raw_data: Dict[str, Any] = Field(default_factory=dict)
    processed_at: Optional[datetime] = None


class SummaryResultItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    status: Optional[str] = None
    status_code: Optional[int] = None
    folder_path: Optional[str] = None
    result: Dict[str, Any] = Field(default_factory=dict)
    timestamp: Optional[datetime] = None
    from_cache: Optional[bool] = None


class SummaryJson(BaseModel):
    model_config = ConfigDict(extra="allow")
    results: List[SummaryResultItem] = Field(default_factory=list)


class SummaryData(BaseModel):
    model_config = ConfigDict(extra="allow")
    tender_id: Optional[int] = None
    summary_json: SummaryJson = Field(default_factory=SummaryJson)


class SummaryResponse(ApiResponse):
    model_config = ConfigDict(extra="allow")
    Success: Optional[bool] = None
    Message: Optional[str] = None
    TotalRecord: Optional[int] = None
    IsAuthFailure: Optional[bool] = None
    Data: Optional[SummaryData] = None
    StatusCode: Optional[int] = None
    summary_text: Optional[str] = None
    key_highlights: List[str] = Field(default_factory=list)
    checklist: Optional[str] = None
    eligibility_criteria: Optional[str] = None
    required_certifications: Optional[str] = None
    scope_of_work: Optional[str] = None
    products: List[str] = Field(default_factory=list)


class CompanyProfile(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    name: str
    registration_number: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = "active"
    profile: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Tender(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    company_id: Optional[str] = None
    tender_reference: str
    title: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    bms_gui_id: Optional[str] = None
    folder_path: Optional[str] = None
    external_tender_id: Optional[str] = None
    status: Optional[str] = "draft"
    metadata: Dict[str, Any] = Field(default_factory=dict)
    published_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    documents: List[Dict[str, Any]] = Field(default_factory=list)
    annexures: List[Dict[str, Any]] = Field(default_factory=list)
    summary: Optional[SummaryResponse] = None
    eligibility_result: Optional["EligibilityResult"] = None


class PipelineStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    paused = "paused"
    cancelled = "cancelled"


class StepStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    failed = "failed"
    waiting = "waiting"
    skipped = "skipped"


class PipelineStep(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    pipeline_run_id: Optional[str] = None
    step_name: str
    step_type: str
    status: StepStatus = StepStatus.pending
    order: int
    attempts: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    input_payload: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    error: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PipelineRun(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    tender_id: Optional[str] = None
    company_id: Optional[str] = None
    workflow_id: Optional[str] = None
    run_id: Optional[str] = None
    status: PipelineStatus = PipelineStatus.pending
    current_step: Optional[str] = None
    input_payload: Dict[str, Any] = Field(default_factory=dict)
    result_payload: Dict[str, Any] = Field(default_factory=dict)
    workflow_state: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    steps: List[PipelineStep] = Field(default_factory=list)


class AiEligibilityItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    reason: Optional[str] = None
    complied: str  # "complied" or "not complied"
    question: Optional[str] = None
    complied_documents: List[Dict[str, Any]] = Field(default_factory=list)


class CompanyEligibilityDetails(BaseModel):
    model_config = ConfigDict(extra="allow")
    ai_eligibility: List[AiEligibilityItem] = Field(default_factory=list)
    client_details: List[Dict[str, Any]] = Field(default_factory=list)


class EligibilityDataItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    company_ai_eligibility_id: Optional[int] = None
    bms_gui_id: Optional[str] = None
    company_id: Optional[int] = None
    company_eligibility_details: CompanyEligibilityDetails = Field(default_factory=CompanyEligibilityDetails)
    created_by: Optional[int] = None
    created_date_time: Optional[datetime] = None
    tender_id: Optional[int] = None


class EligibilityResult(ApiResponse):
    model_config = ConfigDict(extra="allow")
    Success: Optional[bool] = None
    Message: Optional[str] = None
    TotalRecord: Optional[int] = None
    IsAuthFailure: Optional[bool] = None
    Data: List[EligibilityDataItem] = Field(default_factory=list)
    StatusCode: Optional[int] = None
    score: Optional[int] = None
    passed: Optional[bool] = None
    evaluated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class AnnexureTemplate(BaseModel):
    model_config = ConfigDict(extra="allow")
    template_id: Optional[int] = None
    title: Optional[str] = None
    number: Optional[str] = None  # e.g., "Annexure-A"
    type: Optional[str] = None  # e.g., "Form", "Annexure", "Declaration"
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    confidence: Optional[float] = None
    is_duplicate: Optional[bool] = None
    duplicate_of: Optional[str] = None
    annexure_id: Optional[str] = None
    file_path: Optional[str] = None
    fields: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


class AnnexureDocumentInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    total_pages: Optional[int] = None
    analyzed_successfully: Optional[bool] = None


class AnnexureResultData(BaseModel):
    model_config = ConfigDict(extra="allow")
    total_templates: Optional[int] = None
    document_info: Optional[AnnexureDocumentInfo] = None
    templates: List[AnnexureTemplate] = Field(default_factory=list)


class AnnexureFileResult(BaseModel):
    model_config = ConfigDict(extra="allow")
    filename: str
    file_path: str
    annexure_id: str
    templates: List[AnnexureTemplate] = Field(default_factory=list)
    status: str  # "success" or "error"
    result: Optional[AnnexureResultData] = None
    timestamp: Optional[datetime] = None
    is_content_duplicate: Optional[bool] = None
    duplicate_of: Optional[str] = None


class DuplicatesSavedInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    saved: Optional[bool] = None
    tender_id: Optional[int] = None
    saved_disk: Optional[int] = None
    saved_archive: Optional[int] = None
    directory: Optional[str] = None


class AiDuplicatePassInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    ran: Optional[bool] = None


class AnnexureListingBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    status: Optional[str] = None
    message: Optional[str] = None
    total_files_processed: Optional[int] = None
    files_passed_filtering: Optional[int] = None
    filtering_enabled: Optional[bool] = None
    successful_files: Optional[int] = None
    error_files: Optional[int] = None
    total_templates_found: Optional[int] = None
    content_duplicates_skipped: Optional[int] = None
    duplicates_saved: Optional[DuplicatesSavedInfo] = None
    ai_duplicate_pass: Optional[AiDuplicatePassInfo] = None
    results: List[AnnexureFileResult] = Field(default_factory=list)


class AnnexureListingResponse(ApiResponse):
    body: Optional[AnnexureListingBody] = None
    StatusCode: Optional[int] = None
    items: List[AnnexureFileResult] = Field(default_factory=list)


class TemplateGenerationSummary(BaseModel):
    model_config = ConfigDict(extra="allow")
    total_templates: Optional[int] = None
    successful_splits: Optional[int] = None
    successful_processing: Optional[int] = None
    failed_splits: Optional[int] = None
    failed_processing: Optional[int] = None
    split_time: Optional[float] = None
    processing_time: Optional[float] = None
    total_time: Optional[float] = None
    success_rate: Optional[float] = None


class TemplateGenerationResult(BaseModel):
    model_config = ConfigDict(extra="allow")
    template_title: str
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    split_success: Optional[bool] = None
    processing_success: Optional[bool] = None
    split_error: Optional[str] = None
    processing_error: Optional[str] = None
    html_template: Optional[str] = None
    split_time: Optional[float] = None
    processing_time: Optional[float] = None
    total_time: Optional[float] = None
    file_size_mb: Optional[float] = None
    tokens_used: Optional[int] = None
    output_filename: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TemplateGenerationResponse(ApiResponse):
    model_config = ConfigDict(extra="allow")
    status: Optional[str] = None
    operation_id: Optional[str] = None
    filename: Optional[str] = None
    templates_requested: Optional[int] = None
    templates_processed: Optional[int] = None
    processing_time: Optional[float] = None
    timestamp: Optional[datetime] = None
    summary: Optional[TemplateGenerationSummary] = None
    results: List[TemplateGenerationResult] = Field(default_factory=list)


class AutofillResponse(ApiResponse):
    model_config = ConfigDict(extra="allow")
    filled_template: Optional[str] = None
    placeholders_found: List[str] = Field(default_factory=list)
    placeholders_filled: List[str] = Field(default_factory=list)
    placeholders_empty: List[str] = Field(default_factory=list)
    api_provider_used: Optional[str] = None


class FilledAnnexure(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    annexure_id: Optional[str] = None
    tender_id: Optional[str] = None
    company_id: Optional[str] = None
    template_title: Optional[str] = None
    filled_data: Dict[str, Any] = Field(default_factory=dict)
    filled_template: Optional[str] = None
    placeholders_found: List[str] = Field(default_factory=list)
    placeholders_filled: List[str] = Field(default_factory=list)
    placeholders_empty: List[str] = Field(default_factory=list)
    raw_response: Dict[str, Any] = Field(default_factory=dict)
    status: Optional[str] = "created"
    completed_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class FinalBiddingDocumentInsert(BaseModel):
    model_config = ConfigDict(extra="allow")
    company_bidding_document_insert: Optional[int] = None


class FinalAIResponseItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    question: Optional[str] = None
    complied: Optional[str] = None
    reason: Optional[str] = None
    complied_documents: List[Dict[str, Any]] = Field(default_factory=list)


class FinalAIResponseSummaryItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    results: List[Dict[str, Any]] = Field(default_factory=list)


class FinalAIResponseBlock(BaseModel):
    model_config = ConfigDict(extra="allow")
    client_details: List[Dict[str, Any]] = Field(default_factory=list)
    tenderdocpath: Optional[str] = None
    ai_summary: List[FinalAIResponseSummaryItem] = Field(default_factory=list)
    ai_response: List[FinalAIResponseItem] = Field(default_factory=list)
    status: Optional[str] = None
    status_code: Optional[int] = None


class FinalDocumentListEntry(BaseModel):
    model_config = ConfigDict(extra="allow")
    company_name: Optional[str] = None
    document_list: List[Dict[str, Any]] = Field(default_factory=list)


class FinalResponseDataItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    company_bidding_document_insert: Optional[int] = None
    client_details: List[Dict[str, Any]] = Field(default_factory=list)
    tenderdocpath: Optional[str] = None
    ai_summary: List[FinalAIResponseSummaryItem] = Field(default_factory=list)
    ai_response: List[FinalAIResponseItem] = Field(default_factory=list)
    status: Optional[str] = None
    status_code: Optional[int] = None
    company_name: Optional[str] = None
    document_list: List[Dict[str, Any]] = Field(default_factory=list)


class FinalBidResponse(ApiResponse):
    model_config = ConfigDict(extra="allow")
    Success: Optional[bool] = None
    Message: Optional[str] = None
    TotalRecord: Optional[int] = None
    IsAuthFailure: Optional[bool] = None
    Data: List[FinalResponseDataItem] = Field(default_factory=list)
    StatusCode: Optional[int] = None
