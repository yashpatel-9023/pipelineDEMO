# Tender/Bid Orchestrator

## Architecture Overview

This project is built as an async, event-driven AI orchestration system for tender/bid preparation. It composes independent upstream APIs into a durable pipeline using a service layer and workflow orchestration.

### Chosen technologies
- Python 3.11+ with async support
- FastAPI for REST endpoints and HITL integration
- Temporal for workflow orchestration and durable task execution
- PostgreSQL with JSONB for flexible tender/document metadata storage
- SQLAlchemy ORM for schema and data access
- httpx for async external API calls with retry handling
- Redis for caching frequent lookups and API results

### High-level flow
1. Ingest company and tender metadata
2. Summarize tender / generate eligibility criteria
3. Evaluate company eligibility via AI eligibility service
4. List annexures and generate annexure templates
5. Autofill annexure templates with AI
6. Generate final response and persist bidding documents

### Components
- `src/api/` - FastAPI entry points and route definitions
- `src/orchestration/` - Workflow definitions, activities, HITL checkpoints, Temporal client
- `src/services/` - API clients for summary, eligibility, annexure listing, template generation, autofill, and final response
- `src/db/` - SQLAlchemy schema, migration scripts, and repository helpers
- `src/models/` - Pydantic data models for API responses and internal domain objects
- `src/cache/` - Redis cache integration
- `src/utils/` - Shared helpers like retry strategies and validation

## Folder structure

- `src/api/` - REST API and route modules
- `src/cache/` - caching and Redis clients
- `src/core/` - core domain wiring and shared services
- `src/db/` - database models, migrations, and repository layer
- `src/models/` - Pydantic models for payload validation and response parsing
- `src/orchestration/` - Temporal workflows and activities
- `src/pipelines/` - pipeline definitions and step orchestration helpers
- `src/services/` - external API wrappers with retry and error handling
- `src/utils/` - utility modules
- `src/workers/` - background execution workers (Temporal/Celery)

## Local Docker setup

This repository includes Docker configuration in the root directory and a migration runner script at `scripts/run_migrations.py`.

### Prerequisites
- Docker Desktop or Docker Engine installed
- Docker Compose v2 available as `docker compose`
- Git repo root at `c:\Users\isourcing\Desktop\pipelineDEMO`

### Start the Application

From the repository root, start all containers (API, Worker, Temporal, PostgreSQL, and Redis):

```bash
docker compose up --build -d
```

*Note: Database migrations are automatically applied on startup by the `entrypoint.sh` script.*

Wait until the containers are healthy and the Temporal UI is available at `http://localhost:8088`.

### Service endpoints
- FastAPI: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/healthz`
- Temporal UI: `http://localhost:8088`

> If your Docker installation uses legacy compose, replace `docker compose` with `docker-compose`.

## Task status
- Task 1: architecture decision and project structure documented
- Task 2: PostgreSQL schema defined via SQLAlchemy and migration script
- Task 3: core Pydantic models implemented
- Task 4: service layer clients created with retry-bearing base client
- Task 5: Main orchestration workflow built with Temporal (eligibility logic, annexure pipeline, human-in-the-loop)
- Task 6: FastAPI endpoints built for pipeline triggering, document upload, and HITL approvals
- Task 7: Final polish completed (logging, Docker compose with Redis, configuration management, DB seeder)

---
*End of Pipeline DEMO.*
