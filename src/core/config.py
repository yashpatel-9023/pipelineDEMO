# src/core/config.py
"""Centralised application configuration.

All settings are read from environment variables with sensible defaults for
local development.  Import ``get_settings()`` wherever you need config instead
of hard-coding values.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings backed by environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── General ──────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    DEBUG: bool = False
    SECRET_KEY: str = "insecure-default-secret-change-me-in-production"

    # ── Database ─────────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql+psycopg2://postgres:postgres@localhost:5432/pipelinedemo"
    )

    # ── Redis / Cache ────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 3600  # 1 hour default

    # ── Temporal ─────────────────────────────────────────────────────────
    TEMPORAL_TARGET_HOST: str = "localhost:7233"
    TEMPORAL_TASK_QUEUE: str = "pipeline-task-queue"

    # ── Upstream service URLs ────────────────────────────────────────────
    SUMMARY_SERVICE_URL: str = "http://localhost:8001"
    SUMMARY_SERVICE_API_KEY: Optional[str] = None

    ELIGIBILITY_SERVICE_URL: str = "http://localhost:8002"
    ELIGIBILITY_SERVICE_API_KEY: Optional[str] = None

    ANNEXURE_SERVICE_URL: str = "http://localhost:8003"
    ANNEXURE_SERVICE_API_KEY: Optional[str] = None

    TEMPLATE_SERVICE_URL: str = "http://localhost:8004"
    TEMPLATE_SERVICE_API_KEY: Optional[str] = None

    AUTOFILL_SERVICE_URL: str = "http://localhost:8005"
    AUTOFILL_SERVICE_API_KEY: Optional[str] = None

    FINAL_RESPONSE_SERVICE_URL: str = "http://localhost:8006"
    FINAL_RESPONSE_SERVICE_API_KEY: Optional[str] = None

    # ── Eligibility threshold ────────────────────────────────────────────
    ELIGIBILITY_THRESHOLD: int = 75


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton of the application settings."""
    settings = Settings()
    # Basic validation for critical production settings
    if settings.ENVIRONMENT == "production":
        if settings.SECRET_KEY == "insecure-default-secret-change-me-in-production":
            raise ValueError("SECRET_KEY must be changed in production environment")
    return settings

