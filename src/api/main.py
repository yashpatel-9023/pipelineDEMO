from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from fastapi.security import OAuth2PasswordRequestForm

from src.core.security import create_access_token, verify_password
from src.db.base import engine
from src.cache.redis_client import get_redis_client
from sqlalchemy import text



from .routers.approvals import router as approvals_router
from .routers.documents import router as documents_router
from .routers.pipeline import router as pipeline_router

app = FastAPI(title="Tender Bid Orchestrator API", version="0.1.0")

# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Mock user for demonstration (In production, this would be in the DB)
MOCK_USERS = {
    "admin": "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6L6s57WyHYyJBNcu"  # hash for "password123"
}


@app.get("/healthz")
async def health_check():
    """Deep health check for API, DB, and Redis."""
    health_status = {"status": "healthy", "checks": {}}
    
    # Check Database
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        health_status["checks"]["database"] = "up"
    except Exception as exc:
        health_status["status"] = "unhealthy"
        health_status["checks"]["database"] = f"down: {str(exc)}"

    # Check Redis
    try:
        redis = get_redis_client()
        await redis.client.ping()
        health_status["checks"]["redis"] = "up"
    except Exception as exc:
        health_status["status"] = "unhealthy"
        health_status["checks"]["redis"] = f"down: {str(exc)}"

    if health_status["status"] != "healthy":
        raise HTTPException(status_code=503, detail=health_status)
    
    return health_status


@app.post("/token")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> dict[str, str]:
    """Exchange username/password for a JWT access token."""
    hashed_password = MOCK_USERS.get(form_data.username)
    if not hashed_password or not verify_password(form_data.password, hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": form_data.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


app.include_router(pipeline_router)
app.include_router(documents_router)
app.include_router(approvals_router)



