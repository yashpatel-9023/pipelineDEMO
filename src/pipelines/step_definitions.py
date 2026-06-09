# src/pipelines/step_definitions.py
"""Pipeline step type registry.

Maps each pipeline step to metadata (display name, order, step type) and its
corresponding handler callable.  The orchestration layer references this
registry to decide which handler to invoke at each stage.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Callable, Coroutine, Dict, NamedTuple


class PipelineStepType(str, Enum):
    """Canonical names for each step in the tender/bid pipeline."""

    SUMMARY = "summary"
    ELIGIBILITY = "eligibility"
    ANNEXURE_LISTING = "annexure_listing"
    TEMPLATE_GENERATION = "template_generation"
    AUTOFILL = "autofill"
    FINAL_RESPONSE = "final_response"


class StepDefinition(NamedTuple):
    """Metadata for a single pipeline step."""

    step_type: PipelineStepType
    display_name: str
    order: int
    is_hitl: bool  # requires Human-in-the-Loop approval


# Ordered list of steps — used when creating PipelineStep rows at run start.
STEP_DEFINITIONS: list[StepDefinition] = [
    StepDefinition(PipelineStepType.SUMMARY, "Tender Summary", 1, False),
    StepDefinition(PipelineStepType.ELIGIBILITY, "Eligibility Check", 2, False),
    StepDefinition(PipelineStepType.ANNEXURE_LISTING, "Annexure Listing", 3, False),
    StepDefinition(PipelineStepType.TEMPLATE_GENERATION, "Template Generation", 4, True),
    StepDefinition(PipelineStepType.AUTOFILL, "Annexure Autofill", 5, False),
    StepDefinition(PipelineStepType.FINAL_RESPONSE, "Final Response", 6, False),
]

# Handler registry — populated by ``handlers.py`` at import time.
HandlerFn = Callable[..., Coroutine[Any, Any, Dict[str, Any]]]
_handler_registry: Dict[PipelineStepType, HandlerFn] = {}


def register_handler(step_type: PipelineStepType, handler: HandlerFn) -> None:
    """Register a handler callable for a step type."""
    _handler_registry[step_type] = handler


def get_handler(step_type: PipelineStepType) -> HandlerFn:
    """Look up the handler for a given step type."""
    if step_type not in _handler_registry:
        raise KeyError(f"No handler registered for step type {step_type!r}")
    return _handler_registry[step_type]


def get_step_definition(step_type: PipelineStepType) -> StepDefinition:
    """Return the ``StepDefinition`` for a given type."""
    for defn in STEP_DEFINITIONS:
        if defn.step_type == step_type:
            return defn
    raise KeyError(f"No step definition for {step_type!r}")
