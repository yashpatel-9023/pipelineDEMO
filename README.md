# Tender Bid Orchestrator

**An AI-powered, event-driven platform that automates end-to-end government tender bid preparation** — from document ingestion and eligibility checks to annexure generation, autofill, and final bid compilation.

Built with **FastAPI + Temporal + PostgreSQL + Redis** on the backend and a **React (Vite)** dashboard on the frontend.

---

## Table of Contents

- [Platform Overview](#platform-overview)
- [How It Works — Pipeline Lifecycle](#how-it-works--pipeline-lifecycle)
- [Architecture Diagram](#architecture-diagram)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Configure Environment Variables](#2-configure-environment-variables)
  - [3A. Run with Docker (Recommended)](#3a-run-with-docker-recommended)
  - [3B. Run Locally (Without Docker)](#3b-run-locally-without-docker)
- [Database Setup](#database-setup)
  - [Migrations](#migrations)
  - [Seeding Sample Data](#seeding-sample-data)
- [Authentication](#authentication)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [Authentication Token](#authentication-token)
  - [Pipeline Endpoints](#pipeline-endpoints)
  - [Document Endpoints](#document-endpoints)
  - [Approval Endpoints](#approval-endpoints)
  - [Metadata Endpoints](#metadata-endpoints)
- [Frontend Dashboard](#frontend-dashboard)
- [Mock Mode vs Live AI Services](#mock-mode-vs-live-ai-services)
- [Configuration Reference](#configuration-reference)
- [What to Change After Cloning](#what-to-change-after-cloning)
- [Temporal UI](#temporal-ui)
- [Testing](#testing)
- [License](#license)

---

## Platform Overview

The **Tender Bid Orchestrator** is a pipeline platform designed for organizations that respond to government/procurement tenders. It automates the labour-intensive process of:

1. **Summarizing** tender documents (PDFs, CSVs, HTML) using AI.
2. **Evaluating eligibility** — checking whether a company meets all mandatory criteria.
3. **Listing annexures** — extracting required forms/annexures from tender attachments.
4. **Generating templates** — producing fillable template structures for each annexure.
5. **Autofilling templates** — pre-populating annexure fields with company profile data.
6. **Compiling the final bid response** — assembling all documents, mapping company files to checklist requirements, and generating PDFs.

All steps are orchestrated as a **durable Temporal workflow**, meaning the pipeline survives crashes, supports retries, and allows human-in-the-loop intervention (e.g., retry eligibility after updating company documents).

---

## How It Works — Pipeline Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Tender Bid Pipeline Flow                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  POST /pipeline/start                                                │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────┐                                             │
│  │ 1. Tender Summary   │  → AI summarizes all tender documents       │
│  └────────┬────────────┘                                             │
│           ▼                                                          │
│  ┌─────────────────────┐     ┌──────────────────────┐                │
│  │ 2. Eligibility      │────▶│ Score < Threshold?   │                │
│  │    Check            │     │ → Wait for retry     │                │
│  └────────┬────────────┘     │   signal from user   │                │
│           │ (passed)         └──────────────────────┘                │
│           ▼                                                          │
│  ┌─────────────────────┐                                             │
│  │ 3. List Annexures   │  → Extract required forms from tender docs  │
│  └────────┬────────────┘                                             │
│           ▼                                                          │
│  ┌─────────────────────┐                                             │
│  │ 4. Generate         │  → Build structured templates per annexure  │
│  │    Templates        │                                             │
│  └────────┬────────────┘                                             │
│           ▼                                                          │
│  ┌─────────────────────┐                                             │
│  │ 5. Autofill         │  → Populate templates with company data     │
│  │    Templates        │     (runs per-annexure)                     │
│  └────────┬────────────┘                                             │
│           ▼                                                          │
│  ┌─────────────────────┐                                             │
│  │ 6. Final Response   │  → Compile checklist, match docs, gen PDFs  │
│  └────────┬────────────┘                                             │
│           ▼                                                          │
│       Pipeline Completed                                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Key behaviors:**
- If the eligibility score is below the configured threshold (`ELIGIBILITY_THRESHOLD`, default `100`), the workflow **pauses** and waits for a `retry_eligibility` signal via `POST /pipeline/{workflow_id}/retry`.
- Each step is recorded as a `PipelineStep` row in the database with status tracking (`pending` → `completed` / `failed`).
- The final response step performs **semantic matching** between checklist items and company documents / filled annexures to auto-map available files and flag missing ones.
- Missing bidding documents can be manually uploaded via `POST /pipeline/{workflow_id}/bidding-documents/{doc_id}/upload`.

---

## Architecture Diagram

```
                    ┌──────────────┐
                    │   React UI   │  (Vite, port 3000)
                    │  Dashboard   │
                    └──────┬───────┘
                           │ HTTP (proxied)
                    ┌──────▼───────┐
                    │   FastAPI    │  (Gunicorn + Uvicorn, port 8000)
                    │   REST API   │
                    └──┬───┬───┬───┘
                       │   │   │
          ┌────────────┘   │   └────────────┐
          ▼                ▼                ▼
   ┌────────────┐   ┌───────────┐   ┌────────────┐
   │ PostgreSQL │   │   Redis   │   │  Temporal  │
   │  (DB)      │   │  (Cache)  │   │  (Workflow) │
   │  port 5432 │   │  port 6379│   │  port 7233 │
   └────────────┘   └───────────┘   └─────┬──────┘
                                          │
                                   ┌──────▼───────┐
                                   │   Temporal    │
                                   │   Worker      │
                                   │  (Activities) │
                                   └──────┬────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                   ┌────────────┐  ┌────────────┐  ┌────────────┐
                   │ Summary AI │  │Eligibility │  │ Annexure   │
                   │  Service   │  │ AI Service │  │ AI Service │
                   │  :8001     │  │  :8002     │  │  :8003-6   │
                   └────────────┘  └────────────┘  └────────────┘
```

---

## Tech Stack

| Layer            | Technology                                                |
| ---------------- | --------------------------------------------------------- |
| **API**          | Python 3.12, FastAPI 0.136, Gunicorn, Uvicorn             |
| **Workflow**     | Temporal 1.29 (self-hosted via `temporalio/auto-setup`)   |
| **Database**     | PostgreSQL 16, SQLAlchemy 2.0, psycopg2                   |
| **Cache**        | Redis 7 (async via `redis.asyncio`)                       |
| **Auth**         | JWT (python-jose), bcrypt (passlib)                       |
| **HTTP Client**  | httpx (async, with retry + backoff)                       |
| **PDF Gen**      | WeasyPrint ≥ 63                                           |
| **Frontend**     | React 19, Vite 8                                          |
| **Infra**        | Docker, Docker Compose                                    |
| **Validation**   | Pydantic 2.13, pydantic-settings 2.14                     |

---

## Project Structure

```
pipelineDEMO/
├── docker-compose.yml          # All services: db, redis, temporal, api, worker
├── Dockerfile                  # Python 3.12 image for api + worker
├── requirements.txt            # Python dependencies
├── .env.example                # Template for environment variables
│
├── src/                        # ── Backend Source Code ──
│   ├── api/
│   │   ├── main.py             # FastAPI app, CORS, security headers, /healthz, /token
│   │   ├── schemas.py          # Pydantic request/response models
│   │   ├── dependencies.py     # JWT auth dependency (get_current_user)
│   │   └── routers/
│   │       ├── pipeline.py     # /pipeline/* — start, status, resume, retry, bidding docs
│   │       ├── documents.py    # /documents/* — upload documents
│   │       ├── approvals.py    # /approvals/* — submit step approvals
│   │       └── metadata.py     # /metadata/* — companies, tenders, runs, steps, artifacts
│   │
│   ├── core/
│   │   ├── config.py           # Centralised Settings (pydantic-settings, reads .env)
│   │   ├── security.py         # Password hashing, JWT create/decode
│   │   ├── logging.py          # Structured JSON logging, correlation IDs
│   │   └── exceptions.py       # Custom exception hierarchy
│   │
│   ├── db/
│   │   ├── base.py             # SQLAlchemy engine, SessionLocal, get_db dependency
│   │   ├── models.py           # ORM models: Company, Tender, Document, Annexure,
│   │   │                       #   FilledAnnexure, EligibilityResult, PipelineRun,
│   │   │                       #   PipelineStep, BiddingDocument, PipelineApproval
│   │   ├── repository.py       # CRUD functions for all models
│   │   └── migrations/
│   │       └── 001_initial_schema.sql  # DDL for all tables
│   │
│   ├── orchestration/
│   │   ├── workflows.py        # TenderBidWorkflow (Temporal @workflow.defn)
│   │   ├── activities.py       # 7 Temporal activities (summary, eligibility, etc.)
│   │   ├── temporal_client.py  # Temporal client factory + start_pipeline helper
│   │   └── human_tasks.py      # Human-in-the-loop task helpers
│   │
│   ├── workers/
│   │   └── temporal_worker.py  # Temporal worker entry point
│   │
│   ├── services/
│   │   ├── base_api_client.py  # Async HTTP client with retry + exponential backoff
│   │   ├── summary_service.py
│   │   ├── eligibility_service.py
│   │   ├── annexure_listing_service.py
│   │   ├── template_generation_service.py
│   │   ├── autofill_service.py
│   │   └── final_response_service.py
│   │
│   ├── pipelines/
│   │   ├── step_definitions.py # Step type registry + handler pattern
│   │   └── handlers.py         # Step handler implementations
│   │
│   ├── cache/
│   │   ├── redis_client.py     # Async RedisCache singleton (get/set JSON, invalidate)
│   │   ├── cache_keys.py       # Cache key builders
│   │   └── service.py          # Cache service layer
│   │
│   ├── models/
│   │   ├── domain.py           # Pydantic domain models for AI responses
│   │   ├── pydantic_models.py  # Shared Pydantic models
│   │   └── response_models.py  # API response models
│   │
│   └── utils/
│       ├── http.py             # HTTP utility helpers
│       ├── matching.py         # Semantic matching for document mapping
│       ├── mock_loader.py      # Loads mock JSON responses (from /JSONS)
│       ├── pdf_generator.py    # HTML → PDF conversion (WeasyPrint)
│       ├── retries.py          # Generic retry decorator
│       └── validation.py       # Input validation utilities
│
├── scripts/
│   ├── entrypoint.sh           # Docker entrypoint: wait for deps, run migrations, exec
│   ├── run_migrations.py       # Apply SQL migrations
│   └── seed_db.py              # Seed DB with sample company + tender data
│
├── frontend/                   # ── React Dashboard ──
│   ├── package.json            # React 19, Vite 8
│   ├── vite.config.js          # Dev server on :3000, proxy API to :8000
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx             # Full dashboard UI (single-file React app)
│       ├── App.css
│       └── index.css           # Global styles
│
├── JSONS/                      # Mock AI response JSONs for offline development
│   ├── AI_Summary_Response.json
│   ├── AI_Eligibility_Response.json
│   ├── AI_Annexure_Listings_Response.json
│   ├── AI_Annexure_Template_Generation_Response_*.json
│   ├── AI_Annexure_Autofill_Response_*.json
│   ├── AI_Final_Response.json
│   └── ... (payloads for each pipeline step)
│
├── Drone Company Profile/      # Sample company docs (PDFs: GST, PAN, ISO, etc.)
├── Drone-TenderID-99896935/    # Sample tender docs (PDFs, CSV, HTML)
├── storage/
│   └── bidding_documents/      # Generated/uploaded bid documents (runtime)
└── tests/
    ├── unit/                   # Unit tests (empty — ready for contribution)
    └── integration/            # Integration tests (empty — ready for contribution)
```

---

## Prerequisites

### For Docker Setup (Recommended)

- [Docker](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)

### For Local Setup

- **Python 3.12+**
- **PostgreSQL 16** (running on `localhost:5432`)
- **Redis 7** (running on `localhost:6379`)
- **Temporal Server** (running on `localhost:7233`) — see [Temporal docs](https://docs.temporal.io/self-hosted-guide/setup)
- **Node.js 18+** and **npm** (for the frontend)
- System libraries for WeasyPrint: `libpango`, `libcairo2`, `libharfbuzz`, `libgdk-pixbuf` (Linux/macOS)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yashpatel-9023/pipelineDEMO.git
cd pipelineDEMO
```

### 2. Configure Environment Variables

```bash
# Copy the example file and edit with your values
cp .env.example .env
```

Open `.env` and review/modify the values (see [Configuration Reference](#configuration-reference) for details). The defaults work out-of-the-box with Docker Compose.

> **Important:** The `.env` file is gitignored. You must create it manually after cloning.

### 3A. Run with Docker (Recommended)

This single command starts **all 6 services**: PostgreSQL, Redis, Temporal, Temporal UI, API, and Worker.

```bash
# Build and start all services in detached mode
docker compose up --build -d
```

**What happens on startup:**
1. PostgreSQL starts and creates the `pipelinedemo` database.
2. Redis starts.
3. Temporal auto-setup starts (waits for PostgreSQL to be healthy).
4. Temporal UI starts on port `8088`.
5. The **API** container runs `scripts/entrypoint.sh` which:
   - Waits for PostgreSQL to be ready (up to 30 retries).
   - Waits for Redis to be ready.
   - Runs database migrations (`scripts/run_migrations.py`).
   - Starts Gunicorn with 4 Uvicorn workers on port `8000`.
6. The **Worker** container starts the Temporal worker process.

**Verify everything is running:**

```bash
# Check all containers are healthy
docker compose ps

# Test the health endpoint
curl http://localhost:8000/healthz
```

**Expected response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": "up",
    "redis": "up"
  }
}
```

**Seed the database with sample data:**

```bash
docker compose exec api python scripts/seed_db.py
```

This creates a sample company ("Garuda Aerospace Limited") and tender with all documents from the `Drone Company Profile/` and `Drone-TenderID-99896935/` folders.

**View logs:**

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f worker
```

**Stop all services:**

```bash
docker compose down          # Stop containers (keeps data)
docker compose down -v       # Stop containers AND delete volumes (fresh start)
```

---

### 3B. Run Locally (Without Docker)

> **Prerequisite:** PostgreSQL, Redis, and Temporal must already be running on your machine.

#### Step 1: Create and activate a virtual environment

```bash
python -m venv .venv

# Linux / macOS
source .venv/bin/activate

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
```

#### Step 2: Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### Step 3: Configure `.env` for local development

Update your `.env` file to point to local services:

```dotenv
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/pipelinedemo
REDIS_URL=redis://localhost:6379/0
TEMPORAL_TARGET_HOST=localhost:7233
```

> **Note:** Create the `pipelinedemo` database in PostgreSQL if it doesn't exist:
> ```bash
> createdb -U postgres pipelinedemo
> ```

#### Step 4: Run database migrations

```bash
python scripts/run_migrations.py
```

#### Step 5: Seed sample data (optional)

```bash
python scripts/seed_db.py
```

> **Note:** When running locally, the mock loader expects JSON files at `/app/JSONS`. Either set `USE_MOCK_AI=false` or create a symlink / update `MOCK_DIR` in `src/utils/mock_loader.py` to point to the project's `JSONS/` folder.

#### Step 6: Start the API server

```bash
# Development mode (auto-reload)
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

# Production mode
gunicorn src.api.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

#### Step 7: Start the Temporal worker (separate terminal)

```bash
python -m src.workers.temporal_worker
```

#### Step 8: Start the frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server starts on **http://localhost:3000** and proxies all API calls to `http://127.0.0.1:8000`.

---

## Database Setup

### Migrations

The schema is defined in `src/db/migrations/001_initial_schema.sql` and creates the following tables:

| Table                 | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `companies`           | Company profiles and metadata                      |
| `tenders`             | Tender records linked to companies                 |
| `documents`           | Source documents (company profiles, tender PDFs)    |
| `annexures`           | Extracted annexure definitions from tender docs     |
| `filled_annexures`    | AI-autofilled annexure data                        |
| `eligibility_results` | Eligibility scores and pass/fail per tender+company |
| `pipeline_runs`       | Pipeline execution records (workflow tracking)      |
| `pipeline_steps`      | Individual step status within a pipeline run        |
| `bidding_documents`   | Final compiled bid documents + checklist items      |
| `pipeline_approvals`  | Human approval/rejection records                   |

**Run migrations manually:**

```bash
# Docker
docker compose exec api python scripts/run_migrations.py

# Local
python scripts/run_migrations.py
```

### Seeding Sample Data

The seed script creates a sample company and tender from the included document folders:

```bash
# Docker (default company name)
docker compose exec api python scripts/seed_db.py

# With custom company name
docker compose exec api python scripts/seed_db.py --company "Your Company Name"

# Local
python scripts/seed_db.py --company "Your Company Name"
```

After seeding, note the **Company ID** and **Tender ID** printed — you'll need them to start a pipeline.

---

## Authentication

All API endpoints (except `/healthz`) require a **JWT Bearer token**.

### Get a Token

```bash
curl -X POST http://localhost:8000/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=password123"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### Use the Token

Include it in the `Authorization` header for all subsequent requests:

```bash
curl -H "Authorization: Bearer <your_token>" http://localhost:8000/metadata/companies
```

**Default credentials (demo only):**

| Username | Password      |
| -------- | ------------- |
| `admin`  | `password123` |

> ⚠️ **In production**, replace the hardcoded `MOCK_USERS` in `src/api/main.py` with a proper user database and change `SECRET_KEY` in your `.env`.

You can also authenticate interactively via the **Swagger UI** at `http://localhost:8000/docs` using the 🔒 **Authorize** button.

---

## API Reference

**Base URL:** `http://localhost:8000`  
**Interactive Docs:** `http://localhost:8000/docs` (Swagger UI)

### Health Check

| Method | Endpoint   | Auth | Description                          |
| ------ | ---------- | ---- | ------------------------------------ |
| `GET`  | `/healthz` | No   | Deep health check (API, DB, Redis)   |

### Authentication Token

| Method | Endpoint | Auth | Description                    |
| ------ | -------- | ---- | ------------------------------ |
| `POST` | `/token` | No   | Exchange credentials for JWT   |

### Pipeline Endpoints

| Method | Endpoint                                              | Description                              |
| ------ | ----------------------------------------------------- | ---------------------------------------- |
| `POST` | `/pipeline/start`                                     | Start a new tender bid pipeline          |
| `GET`  | `/pipeline/{workflow_id}/status`                      | Query Temporal workflow status           |
| `POST` | `/pipeline/{workflow_id}/resume`                      | Signal annexure selection to workflow     |
| `POST` | `/pipeline/{workflow_id}/retry`                       | Signal eligibility retry to workflow     |
| `GET`  | `/pipeline/{workflow_id}/bidding-documents`            | List final bidding documents             |
| `POST` | `/pipeline/{workflow_id}/bidding-documents/{id}/upload`| Upload a missing bidding document        |
| `GET`  | `/pipeline/documents/preview?path=...`                 | Preview/download a document by file path |

**Start a pipeline — example request:**

```bash
curl -X POST http://localhost:8000/pipeline/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tender_id": "<TENDER_UUID>",
    "company_id": "<COMPANY_UUID>",
    "payload": {}
  }'
```

### Document Endpoints

| Method | Endpoint             | Description                 |
| ------ | -------------------- | --------------------------- |
| `POST` | `/documents/upload`  | Register a document record  |

### Approval Endpoints

| Method | Endpoint                   | Description                          |
| ------ | -------------------------- | ------------------------------------ |
| `POST` | `/approvals/{workflow_id}` | Submit approval/rejection for a step |

### Metadata Endpoints

| Method | Endpoint                        | Description                              |
| ------ | ------------------------------- | ---------------------------------------- |
| `GET`  | `/metadata/companies`           | List all companies                       |
| `GET`  | `/metadata/tenders`             | List all tenders                         |
| `GET`  | `/metadata/runs`                | List all pipeline runs                   |
| `GET`  | `/metadata/runs/{run_id}/steps` | List steps for a pipeline run            |
| `GET`  | `/metadata/runs/{run_id}/artifacts` | Get filled annexures + bidding docs  |

---

## Frontend Dashboard

The React frontend provides a visual interface for:

- Selecting company and tender
- Starting pipeline runs
- Real-time pipeline status tracking (step-by-step progress)
- Viewing AI-generated summaries, eligibility results, annexures
- Autofilled template preview
- Bidding document checklist (mapped / missing status)
- Uploading missing documents
- Retrying failed eligibility checks

**Access:** `http://localhost:3000` (dev server) — requires the backend API to be running on port `8000`.

> The frontend is a standalone Vite app. It is **not** served by the Docker Compose stack. Run it separately with `cd frontend && npm install && npm run dev`.

---

## Mock Mode vs Live AI Services

The platform supports a **mock mode** for development without external AI services.

| Environment Variable | Default | Behavior                                    |
| -------------------- | ------- | ------------------------------------------- |
| `USE_MOCK_AI`        | `true`  | All AI calls return pre-recorded JSON responses from the `JSONS/` folder |

When `USE_MOCK_AI=true` (default), the Temporal activities load responses from files like:
- `AI_Summary_Response.json`
- `AI_Eligibility_Response.json`
- `AI_Annexure_Listings_Response.json`
- `AI_Annexure_Template_Generation_Response_1.json` / `_2.json`
- `AI_Annexure_Autofill_Response_1.json` / `_2.json` / `_3.json`
- `AI_Final_Response.json`

When `USE_MOCK_AI=false`, the system calls the external AI microservices at the URLs configured in `.env`. If those services are unreachable, it **falls back to mock responses** gracefully.

---

## Configuration Reference

All settings are managed via environment variables (loaded from `.env`). See `src/core/config.py` for the full `Settings` class.

| Variable                        | Default                                                              | Description                                    |
| ------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `ENVIRONMENT`                   | `development`                                                        | `development` / `production`                   |
| `LOG_LEVEL`                     | `INFO`                                                               | Python log level                               |
| `DEBUG`                         | `false`                                                              | Debug mode flag                                |
| `SECRET_KEY`                    | `insecure-default-secret-change-me-in-production`                    | JWT signing secret (**change in production!**) |
| `DATABASE_URL`                  | `postgresql+psycopg2://postgres:postgres@localhost:5432/pipelinedemo` | PostgreSQL connection string                   |
| `REDIS_URL`                     | `redis://localhost:6379/0`                                           | Redis connection string                        |
| `CACHE_TTL_SECONDS`             | `3600`                                                               | Default cache TTL (1 hour)                     |
| `TEMPORAL_TARGET_HOST`          | `localhost:7233`                                                     | Temporal gRPC endpoint                         |
| `TEMPORAL_TASK_QUEUE`           | `pipeline-task-queue`                                                | Temporal task queue name                       |
| `SUMMARY_SERVICE_URL`           | `http://localhost:8001`                                              | Summary AI service URL                         |
| `SUMMARY_SERVICE_API_KEY`       | *(empty)*                                                            | API key for summary service                    |
| `ELIGIBILITY_SERVICE_URL`       | `http://localhost:8002`                                              | Eligibility AI service URL                     |
| `ELIGIBILITY_SERVICE_API_KEY`   | *(empty)*                                                            | API key for eligibility service                |
| `ANNEXURE_SERVICE_URL`          | `http://localhost:8003`                                              | Annexure listing AI service URL                |
| `ANNEXURE_SERVICE_API_KEY`      | *(empty)*                                                            | API key for annexure service                   |
| `TEMPLATE_SERVICE_URL`          | `http://localhost:8004`                                              | Template generation AI service URL             |
| `TEMPLATE_SERVICE_API_KEY`      | *(empty)*                                                            | API key for template service                   |
| `AUTOFILL_SERVICE_URL`          | `http://localhost:8005`                                              | Autofill AI service URL                        |
| `AUTOFILL_SERVICE_API_KEY`      | *(empty)*                                                            | API key for autofill service                   |
| `FINAL_RESPONSE_SERVICE_URL`    | `http://localhost:8006`                                              | Final response AI service URL                  |
| `FINAL_RESPONSE_SERVICE_API_KEY`| *(empty)*                                                            | API key for final response service             |
| `ELIGIBILITY_THRESHOLD`         | `100`                                                                | Minimum eligibility score (%) to pass          |
| `USE_MOCK_AI`                   | `true`                                                               | Use mock JSON responses instead of live AI     |

---

## What to Change After Cloning

After cloning the repository, here's what you **must** configure before going to production:

### 🔴 Critical (Security)

1. **`SECRET_KEY`** in `.env` — Change to a long, random string (the app will refuse to start in `production` mode with the default value).
2. **`MOCK_USERS`** in `src/api/main.py` — Replace the hardcoded admin user with a real user database / auth provider.
3. **CORS origins** in `src/api/main.py` — Replace `allow_origins=["*"]` with your actual frontend domain(s).

### 🟡 Required for Live AI

4. **AI Service URLs & API Keys** — Set `*_SERVICE_URL` and `*_SERVICE_API_KEY` variables in `.env` to point to your actual AI microservices.
5. **`USE_MOCK_AI`** — Set to `false` to enable live AI calls.

### 🟢 Recommended

6. **`ELIGIBILITY_THRESHOLD`** — Adjust the pass/fail threshold for your domain (default is 100%).
7. **Database credentials** — Change the default `postgres:postgres` password in `.env` and `docker-compose.yml`.
8. **Mock data directories** — Replace `Drone Company Profile/` and `Drone-TenderID-99896935/` with your actual company/tender documents, or remove them and use the API to upload documents.
9. **`MOCK_DIR`** in `src/utils/mock_loader.py` — If running locally (not Docker), update the path from `/app/JSONS` to your actual `JSONS/` directory path.
10. **Frontend proxy config** — If your API runs on a different host/port, update `vite.config.js`.

---

## Temporal UI

When running with Docker Compose, the **Temporal Web UI** is available at:

**http://localhost:8088**

Use it to:
- Monitor workflow executions
- Inspect workflow history and events
- View activity inputs/outputs
- Debug failed workflows
- Send signals to running workflows

---

## Testing

The project has `tests/unit/` and `tests/integration/` directories ready for test files.

```bash
# Run tests (once tests are added)
pytest tests/

# With coverage
pytest tests/ --cov=src --cov-report=html
```

---

## Ports Summary

| Service      | Port   | URL                           |
| ------------ | ------ | ----------------------------- |
| API          | `8000` | http://localhost:8000          |
| Swagger UI   | `8000` | http://localhost:8000/docs     |
| Frontend     | `3000` | http://localhost:3000          |
| PostgreSQL   | `5432` | localhost:5432                 |
| Redis        | `6379` | localhost:6379                 |
| Temporal     | `7233` | localhost:7233 (gRPC)         |
| Temporal UI  | `8088` | http://localhost:8088          |

---

## License

This project is proprietary. All rights reserved.
