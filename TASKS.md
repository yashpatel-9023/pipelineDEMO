You are an expert Python backend architect specializing in building reliable, production-grade AI orchestration systems.
Project Goal:
Build a production-grade Orchestrator that automates the full Tender/Bid preparation pipeline by composing existing independent APIs.
Important Instructions

Do not generate the entire project in one go.
Follow the tasks strictly one by one.
After completing each task, stop and wait for my confirmation before moving to the next task.
I will provide specific JSON examples (payloads & responses) for each relevant task.


Task 1: Architecture & Technology Decision

Propose the overall architecture.
Choose the best orchestration tool (Temporal.io preferred, or LangGraph + Postgres if simpler).
Justify your choice.
Provide high-level component diagram (in text).
Define folder structure for the project.


Task 2: Database Schema Design

Design PostgreSQL schema using SQLAlchemy / Prisma style.
Include all important tables: companies, tenders, pipeline_runs, pipeline_steps, documents, annexures, eligibility_results, bidding_documents, etc.
Use JSONB heavily where needed.
Provide full DDL / migration script.


Task 3: Core Data Models (Pydantic)

Create Pydantic v2 models for:
Tender Metadata
Company Profile
Pipeline Run & Step Status
Eligibility Result
Annexure Listing Result
Annexure Template
Filled Annexure
Final Bid Response

Mention the JSON names I will attach: summary_response.json, eligibility_response.json, annexure_listing_response.json, template_generation_response.json, autofill_response.json, final_response_generation_response.json


Task 4: API Clients / Service Layer

Create clean service classes / clients for calling existing APIs:
Summary Service
Eligibility Service
Annexure Listing Service
Template Generation Service
Autofill Service
Final Response Generation Service

Use the lightweight trigger payloads we discussed.
Add proper error handling and retries.

(I will attach the respective JSON examples for each API when you reach this task)

Task 5: Main Orchestration Workflow

Implement the main workflow using your chosen orchestration tool (Temporal / LangGraph).
Define all steps with proper error handling, retries, and Human-in-the-Loop (HITL) checkpoints.
Include logic for:
Eligibility threshold check (>75%)
Annexure listing → user selection → template generation → autofill
Final AI Response Generation



Task 6: FastAPI Endpoints + HITL

Create FastAPI routes for:
Start Pipeline
Get Pipeline Status
Resume Pipeline (after manual fix)
Upload Documents
Approve / Reject Step



Task 7: Final Polish

Add logging, monitoring hooks, notifications.
Docker + docker-compose setup.
README with full instructions.


Additional Requirements for Queue & Cache:

Use Redis for caching (company profile, summary, eligibility results, frequent lookups).
Use Celery or Temporal's built-in queues for background task processing and retries.
The orchestrator should be async and event-driven.
Implement proper caching strategy (e.g., cache eligibility result for X hours, invalidate on document upload).
Use message queue for long-running steps like Annexure processing and Final Response Generation.
Handle retries, dead-letter queues, and rate limiting for external APIs.

Do not over-engineer in early tasks. Implement basic Redis + Celery/Temporal queue support in relevant tasks.


Start with Task 1 now.
After you complete each task, I will review and give you the next task + relevant JSON examples.