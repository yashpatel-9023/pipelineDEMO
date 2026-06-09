# src/models/response_models.py
"""Generic API response wrappers.

All FastAPI endpoints should return data wrapped in one of these models so
that clients always receive a consistent JSON envelope.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class SuccessResponse(BaseModel, Generic[T]):
    """Standard success envelope."""

    success: bool = True
    message: str = "OK"
    data: Optional[T] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    success: bool = False
    message: str
    error_code: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list envelope."""

    success: bool = True
    message: str = "OK"
    data: List[T] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
