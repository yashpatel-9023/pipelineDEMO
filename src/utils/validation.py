# src/utils/validation.py
"""Payload and input validation helpers.

These are lightweight guards meant to be called at the edge of the system
(API routes, activity functions) before passing data deeper into the pipeline.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, Optional
from uuid import UUID


_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def validate_uuid(value: str, field_name: str = "id") -> UUID:
    """Parse and return a ``UUID``, raising ``ValueError`` on bad input."""
    if not _UUID_RE.match(value):
        raise ValueError(f"'{field_name}' is not a valid UUID: {value!r}")
    return UUID(value)


def validate_payload_keys(
    payload: Dict[str, Any],
    required_keys: Iterable[str],
    context: str = "payload",
) -> None:
    """Raise ``ValueError`` if any of ``required_keys`` are missing from the payload."""
    missing = [k for k in required_keys if k not in payload]
    if missing:
        raise ValueError(f"Missing required key(s) in {context}: {', '.join(missing)}")


def validate_non_empty_string(
    value: Optional[str],
    field_name: str = "field",
) -> str:
    """Raise ``ValueError`` if the string is ``None`` or whitespace-only."""
    if not value or not value.strip():
        raise ValueError(f"'{field_name}' must be a non-empty string")
    return value.strip()


def validate_score_range(
    score: int,
    min_val: int = 0,
    max_val: int = 100,
    field_name: str = "score",
) -> int:
    """Ensure an integer score falls within the expected range."""
    if not (min_val <= score <= max_val):
        raise ValueError(
            f"'{field_name}' must be between {min_val} and {max_val}, got {score}"
        )
    return score
