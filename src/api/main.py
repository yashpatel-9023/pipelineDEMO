from __future__ import annotations

from fastapi import FastAPI

from .routers.approvals import router as approvals_router
from .routers.documents import router as documents_router
from .routers.pipeline import router as pipeline_router

app = FastAPI(title="Tender Bid Orchestrator API", version="0.1.0")

app.include_router(pipeline_router)
app.include_router(documents_router)
app.include_router(approvals_router)


@app.get("/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
