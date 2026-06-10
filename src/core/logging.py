# src/core/logging.py
"""Structured logging configuration.

Provides a JSON formatter for production and a human-readable formatter for
local development.  Call ``setup_logging()`` once at application startup
(e.g. in ``main.py`` or the Temporal worker entry-point).
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Optional

# ── Correlation-ID context var ───────────────────────────────────────────
correlation_id_var: ContextVar[Optional[str]] = ContextVar(
    "correlation_id", default=None
)


def set_correlation_id(cid: Optional[str] = None) -> str:
    """Set (or generate) a correlation ID for the current async context."""
    cid = cid or str(uuid.uuid4())
    correlation_id_var.set(cid)
    return cid


def get_correlation_id() -> Optional[str]:
    """Retrieve the current correlation ID (may be ``None``)."""
    return correlation_id_var.get()


# ── JSON formatter ───────────────────────────────────────────────────────
class JSONFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        message = record.getMessage()
        # Simple masking for sensitive keys in messages
        for sensitive_key in ("SECRET_KEY", "API_KEY", "password", "token"):
            if sensitive_key in message:
                message = message.replace(message, "[MASKED]")

        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": message,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        cid = get_correlation_id()
        if cid:
            log_entry["correlation_id"] = cid

        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Merge any extra fields attached via ``logger.info("msg", extra={…})``
        for key in ("pipeline_run_id", "tender_id", "company_id", "step", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                log_entry[key] = value

        return json.dumps(log_entry, default=str)


# ── Setup helper ─────────────────────────────────────────────────────────
def setup_logging(level: str = "INFO", json_output: bool = True) -> None:
    """Configure the root logger.

    Parameters
    ----------
    level:
        Logging level name (``DEBUG``, ``INFO``, ``WARNING``, …).
    json_output:
        When ``True`` (default / production), use the JSON formatter.
        When ``False`` (local dev), use a simple human-readable format.
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove any pre-existing handlers to avoid duplicate output
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    stream_handler = logging.StreamHandler(sys.stdout)

    if json_output:
        stream_handler.setFormatter(JSONFormatter())
    else:
        stream_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )

    root.addHandler(stream_handler)

    # Quieten noisy third-party loggers
    for noisy in ("httpx", "httpcore", "temporalio", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger.  Prefer this over ``logging.getLogger()``."""
    return logging.getLogger(name)
