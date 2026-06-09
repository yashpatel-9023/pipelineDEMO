from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, declarative_base
import uuid

Base = declarative_base()


class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    registration_number = Column(String(128), nullable=True, unique=True)
    industry = Column(String(128), nullable=True)
    country = Column(String(64), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    profile = Column(JSONB, nullable=False, default={})
    metadata_ = Column("metadata", JSONB, key="metadata_", nullable=True, default={})
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    tenders = relationship("Tender", back_populates="company")
    eligibility_results = relationship("EligibilityResult", back_populates="company")
    pipeline_runs = relationship("PipelineRun", back_populates="company")


class Tender(Base):
    __tablename__ = "tenders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    tender_reference = Column(String(255), nullable=False, index=True)
    title = Column(String(512), nullable=True)
    description = Column(Text, nullable=True)
    source_url = Column(String(1024), nullable=True)
    bms_gui_id = Column(String(255), nullable=True)
    folder_path = Column(String(1024), nullable=True)
    external_tender_id = Column(String(255), nullable=True)
    status = Column(String(32), nullable=False, default="draft")
    metadata_ = Column("metadata", JSONB, key="metadata_", nullable=False, default={})
    published_at = Column(DateTime(timezone=True), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    company = relationship("Company", back_populates="tenders")
    eligibility_results = relationship("EligibilityResult", back_populates="tender")
    pipeline_runs = relationship("PipelineRun", back_populates="tender")
    documents = relationship("Document", back_populates="tender")
    annexures = relationship("Annexure", back_populates="tender")
    bidding_documents = relationship("BiddingDocument", back_populates="tender")
    filled_annexures = relationship("FilledAnnexure", back_populates="tender")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tender_id = Column(UUID(as_uuid=True), ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    document_type = Column(String(64), nullable=False)
    source = Column(String(64), nullable=False, default="upload")
    document_source = Column(String(64), nullable=False, default="company")
    storage_path = Column(String(1024), nullable=True)
    encrypted_path = Column(String(1024), nullable=True)
    content_hash = Column(String(128), nullable=True)
    metadata_ = Column("metadata", JSONB, key="metadata_", nullable=False, default={})
    status = Column(String(32), nullable=False, default="available")
    uploaded_by = Column(String(128), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    tender = relationship("Tender", back_populates="documents")


class Annexure(Base):
    __tablename__ = "annexures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tender_id = Column(UUID(as_uuid=True), ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(128), nullable=False)
    title = Column(String(512), nullable=True)
    status = Column(String(32), nullable=False, default="pending")
    listing_payload = Column(JSONB, nullable=True, default={})
    template_payload = Column(JSONB, nullable=True, default={})
    metadata_ = Column("metadata", JSONB, key="metadata_", nullable=False, default={})
    selected = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    tender = relationship("Tender", back_populates="annexures")
    filled_annexures = relationship("FilledAnnexure", back_populates="annexure")

    __table_args__ = (
        UniqueConstraint("tender_id", "code", name="uq_annexure_tender_code"),
    )


class FilledAnnexure(Base):
    __tablename__ = "filled_annexures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    annexure_id = Column(UUID(as_uuid=True), ForeignKey("annexures.id", ondelete="CASCADE"), nullable=False)
    tender_id = Column(UUID(as_uuid=True), ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    filled_data = Column(JSONB, nullable=False, default={})
    raw_response = Column(JSONB, nullable=True, default={})
    status = Column(String(32), nullable=False, default="created")
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    annexure = relationship("Annexure", back_populates="filled_annexures")
    company = relationship("Company")
    tender = relationship("Tender", back_populates="filled_annexures")


class EligibilityResult(Base):
    __tablename__ = "eligibility_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tender_id = Column(UUID(as_uuid=True), ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, nullable=False)
    passed = Column(Boolean, nullable=False)
    details = Column(JSONB, nullable=False, default={})
    raw_response = Column(JSONB, nullable=True, default={})
    evaluated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)

    tender = relationship("Tender", back_populates="eligibility_results")
    company = relationship("Company", back_populates="eligibility_results")

    __table_args__ = (
        UniqueConstraint("tender_id", "company_id", name="uq_eligibility_tender_company"),
    )


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tender_id = Column(UUID(as_uuid=True), ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    workflow_id = Column(String(255), nullable=True, index=True)
    run_id = Column(String(255), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="pending", index=True)
    current_step = Column(String(128), nullable=True)
    input_payload = Column(JSONB, nullable=False, default={})
    result_payload = Column(JSONB, nullable=True, default={})
    workflow_state = Column(JSONB, nullable=True, default={})
    metadata_ = Column("metadata", JSONB, key="metadata_", nullable=False, default={})
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    tender = relationship("Tender", back_populates="pipeline_runs")
    company = relationship("Company", back_populates="pipeline_runs")
    pipeline_steps = relationship("PipelineStep", back_populates="pipeline_run")
    approvals = relationship("PipelineApproval", back_populates="pipeline_run")


class PipelineStep(Base):
    __tablename__ = "pipeline_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_run_id = Column(UUID(as_uuid=True), ForeignKey("pipeline_runs.id", ondelete="CASCADE"), nullable=False)
    step_name = Column(String(128), nullable=False)
    step_type = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    step_order = Column(Integer, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    output = Column(JSONB, nullable=True, default={})
    error = Column(JSONB, nullable=True, default={})
    metadata_ = Column("metadata", JSONB, key="metadata_", nullable=False, default={})
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    pipeline_run = relationship("PipelineRun", back_populates="pipeline_steps")
    approvals = relationship("PipelineApproval", back_populates="pipeline_step")


class BiddingDocument(Base):
    __tablename__ = "bidding_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tender_id = Column(UUID(as_uuid=True), ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    document_type = Column(String(128), nullable=False)
    title = Column(String(512), nullable=True)
    file_path = Column(String(1024), nullable=True)
    content_json = Column(JSONB, nullable=True, default={})
    metadata_ = Column("metadata", JSONB, key="metadata_", nullable=False, default={})
    status = Column(String(32), nullable=False, default="draft", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    tender = relationship("Tender", back_populates="bidding_documents")
    company = relationship("Company")


class PipelineApproval(Base):
    __tablename__ = "pipeline_approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_run_id = Column(UUID(as_uuid=True), ForeignKey("pipeline_runs.id", ondelete="CASCADE"), nullable=False)
    pipeline_step_id = Column(UUID(as_uuid=True), ForeignKey("pipeline_steps.id", ondelete="SET NULL"), nullable=True)
    approval_type = Column(String(64), nullable=False)
    actor = Column(String(128), nullable=True)
    decision = Column(String(32), nullable=False)
    comments = Column(Text, nullable=True)
    payload = Column(JSONB, nullable=True, default={})
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    decision_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    pipeline_run = relationship("PipelineRun", back_populates="approvals")
    pipeline_step = relationship("PipelineStep", back_populates="approvals")