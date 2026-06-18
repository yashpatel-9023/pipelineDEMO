# src/core/exceptions.py
"""Application-specific exception hierarchy.

All custom exceptions inherit from ``PipelineBaseError`` so that a single
``except PipelineBaseError`` can catch every domain-level error while still
allowing fine-grained handling where needed.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class PipelineBaseError(Exception):
    """Root exception for every pipeline-related error."""

    def __init__(
        self,
        message: str = "An unexpected pipeline error occurred",
        *,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.details = details or {}


class ExternalServiceError(PipelineBaseError):
    """Raised when an upstream AI / micro-service call fails."""

    def __init__(
        self,
        service_name: str,
        message: str = "External service call failed",
        *,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(f"[{service_name}] {message}", details=details)
        self.service_name = service_name
        self.status_code = status_code


class EligibilityCheckFailed(PipelineBaseError):
    """Raised when a company does not meet the eligibility threshold."""

    def __init__(self, score: int, threshold: int = 100) -> None:
        super().__init__(
            f"Eligibility score {score}% is below the {threshold}% threshold",
            details={"score": score, "threshold": threshold},
        )
        self.score = score
        self.threshold = threshold


class AnnexureProcessingError(PipelineBaseError):
    """Raised when annexure listing, template generation, or autofill fails."""

    def __init__(
        self,
        step: str,
        message: str = "Annexure processing failed",
        *,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(f"[{step}] {message}", details=details)
        self.step = step


class CacheError(PipelineBaseError):
    """Raised when a cache read or write operation fails."""

    def __init__(
        self,
        message: str = "Cache operation failed",
        *,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, details=details)


class WorkflowNotFoundError(PipelineBaseError):
    """Raised when a Temporal workflow handle cannot be resolved."""

    def __init__(self, workflow_id: str) -> None:
        super().__init__(
            f"Workflow {workflow_id!r} not found",
            details={"workflow_id": workflow_id},
        )
        self.workflow_id = workflow_id


class ValidationError(PipelineBaseError):
    """Raised when input validation fails."""

    def __init__(
        self,
        message: str = "Validation failed",
        *,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, details=details)
