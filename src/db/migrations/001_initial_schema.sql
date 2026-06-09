CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(128),
    industry VARCHAR(128),
    country VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_registration_number ON companies(registration_number);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

CREATE TABLE IF NOT EXISTS tenders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tender_reference VARCHAR(255) NOT NULL,
    title VARCHAR(512),
    description TEXT,
    source_url VARCHAR(1024),
    bms_gui_id VARCHAR(255),
    folder_path VARCHAR(1024),
    external_tender_id VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_at TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenders_reference ON tenders(tender_reference);
CREATE INDEX IF NOT EXISTS idx_tenders_company_id ON tenders(company_id);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    document_type VARCHAR(64) NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'upload',
    document_source VARCHAR(64) NOT NULL DEFAULT 'company',
    storage_path VARCHAR(1024),
    encrypted_path VARCHAR(1024),
    content_hash VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'available',
    uploaded_by VARCHAR(128),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_tender_id ON documents(tender_id);

CREATE TABLE IF NOT EXISTS annexures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    code VARCHAR(128) NOT NULL,
    title VARCHAR(512),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    listing_payload JSONB DEFAULT '{}'::jsonb,
    template_payload JSONB DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    selected BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_annexures_tender_code ON annexures(tender_id, code);
CREATE INDEX IF NOT EXISTS idx_annexures_tender_id ON annexures(tender_id);

CREATE TABLE IF NOT EXISTS filled_annexures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    annexure_id UUID NOT NULL REFERENCES annexures(id) ON DELETE CASCADE,
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    filled_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_response JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'created',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filled_annexures_annexure_id ON filled_annexures(annexure_id);
CREATE INDEX IF NOT EXISTS idx_filled_annexures_company_id ON filled_annexures(company_id);

CREATE TABLE IF NOT EXISTS eligibility_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    passed BOOLEAN NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_response JSONB DEFAULT '{}'::jsonb,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_eligibility_tender_company ON eligibility_results(tender_id, company_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_tender_id ON eligibility_results(tender_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_company_id ON eligibility_results(company_id);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    workflow_id VARCHAR(255),
    run_id VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    current_step VARCHAR(128),
    input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_payload JSONB DEFAULT '{}'::jsonb,
    workflow_state JSONB DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_tender_id ON pipeline_runs(tender_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_company_id ON pipeline_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_workflow_id ON pipeline_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_id ON pipeline_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);

CREATE TABLE IF NOT EXISTS pipeline_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    step_name VARCHAR(128) NOT NULL,
    step_type VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    step_order INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    output JSONB DEFAULT '{}'::jsonb,
    error JSONB DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run_id ON pipeline_steps(pipeline_run_id);

CREATE TABLE IF NOT EXISTS bidding_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_type VARCHAR(128) NOT NULL,
    title VARCHAR(512),
    file_path VARCHAR(1024),
    content_json JSONB DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bidding_documents_tender_id ON bidding_documents(tender_id);
CREATE INDEX IF NOT EXISTS idx_bidding_documents_company_id ON bidding_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_bidding_documents_status ON bidding_documents(status);

CREATE TABLE IF NOT EXISTS pipeline_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    pipeline_step_id UUID REFERENCES pipeline_steps(id) ON DELETE SET NULL,
    approval_type VARCHAR(64) NOT NULL,
    actor VARCHAR(128),
    decision VARCHAR(32) NOT NULL,
    comments TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decision_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipeline_approvals_run_id ON pipeline_approvals(pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_approvals_step_id ON pipeline_approvals(pipeline_step_id);