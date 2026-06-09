# src/cache/cache_keys.py
"""Cache key builders for the pipeline.

Centralised key patterns ensure that cache reads and invalidations stay in
sync across modules.
"""

from __future__ import annotations

# ── Key prefixes ─────────────────────────────────────────────────────────
_PREFIX = "pipeline"


def summary_key(tender_id: str) -> str:
    """Cache key for a tender summary result."""
    return f"{_PREFIX}:summary:{tender_id}"


def eligibility_key(tender_id: str, company_id: str) -> str:
    """Cache key for an eligibility result."""
    return f"{_PREFIX}:eligibility:{tender_id}:{company_id}"


def company_profile_key(company_id: str) -> str:
    """Cache key for a company profile lookup."""
    return f"{_PREFIX}:company:{company_id}"


def annexure_listing_key(tender_id: str) -> str:
    """Cache key for the annexure listing response."""
    return f"{_PREFIX}:annexure_listing:{tender_id}"


def template_key(tender_id: str, annexure_id: str) -> str:
    """Cache key for a generated annexure template."""
    return f"{_PREFIX}:template:{tender_id}:{annexure_id}"


def autofill_key(tender_id: str, annexure_id: str, company_id: str) -> str:
    """Cache key for an autofilled annexure."""
    return f"{_PREFIX}:autofill:{tender_id}:{annexure_id}:{company_id}"


def tender_pattern(tender_id: str) -> str:
    """Glob pattern to invalidate all cache entries for a tender."""
    return f"{_PREFIX}:*:{tender_id}*"
