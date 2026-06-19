from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.core.config import get_settings

from .activities import (
    autofill_template,
    evaluate_eligibility,
    fetch_tender_summary,
    generate_final_response,
    generate_templates,
    list_annexures,
    notify_human_for_annexure_selection,
    update_final_pipeline_status
)


DEFAULT_TASK_QUEUE = "pipeline-task-queue"


class TenderPipelineInput(BaseModel):
    tender_id: str
    company_id: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    selection_signal_timeout_seconds: int = 3600


class TenderPipelineResult(BaseModel):
    status: str
    eligibility_score: Optional[int] = None
    eligibility_passed: Optional[bool] = None
    selected_annexures: List[str] = Field(default_factory=list)
    final_response: Dict[str, Any] = Field(default_factory=dict)
    workflow_state: Dict[str, Any] = Field(default_factory=dict)


def _extract_eligibility_score(response: Dict[str, Any]) -> int:
    if "score" in response and response["score"] is not None:
        return int(response["score"])

    if "Data" in response and isinstance(response["Data"], list):
        first_item = response["Data"][0] if response["Data"] else {}
        eligibility_details = first_item.get("company_eligibility_details", {})
        ai_items = eligibility_details.get("ai_eligibility", [])
        if ai_items:
            complied = sum(1 for item in ai_items if item.get("complied") == "complied")
            return int((complied / len(ai_items)) * 100)

    return 0


def _extract_annexure_codes(listing_response: Dict[str, Any]) -> List[str]:
    """Extract annexure IDs from the listing response (nested templates)."""
    annexure_ids = []
    for file_result in listing_response.get("results", []):
        templates = file_result.get("result", {}).get("templates", [])
        for template in templates:
            aid = template.get("annexure_id")
            if aid:
                annexure_ids.append(aid)
    return annexure_ids


def _extract_annexure_items(listing_response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract full annexure template items for human notification."""
    items = []
    for file_result in listing_response.get("results", []):
        templates = file_result.get("result", {}).get("templates", [])
        for template in templates:
            # Include source file for context
            item = template.copy()
            item["source_file"] = file_result.get("file_path", "")
            items.append(item)
    return items


@workflow.defn
class TenderBidWorkflow:
    def __init__(self) -> None:
        self.selected_annexure_ids: Optional[List[str]] = None
        self.current_status: str = "pending"
        self.workflow_state: Dict[str, Any] = {}
        self.retry_eligibility_signal: bool = False

    @workflow.run
    async def run(self, input_data: TenderPipelineInput) -> TenderPipelineResult:
        self.current_status = "running"
        self.workflow_state = {
            "tender_id": input_data.tender_id,
            "company_id": input_data.company_id,
            "step": "started",
        }

        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=5),
            maximum_interval=timedelta(seconds=30),
            backoff_coefficient=2.0,
            maximum_attempts=3,
        )

        activity_kwargs = {
            "schedule_to_close_timeout": timedelta(minutes=2),
            "start_to_close_timeout": timedelta(minutes=2),
            "retry_policy": retry_policy,
        }

        summary_response = await workflow.execute_activity(
            fetch_tender_summary,
            input_data.payload,
            **activity_kwargs,
        )
        workflow.logger.info(f"Summary activity completed for tender {input_data.tender_id}")
        self.workflow_state["summary_response"] = summary_response

        while True:
            eligibility_response = await workflow.execute_activity(
                evaluate_eligibility,
                input_data.payload,
                **activity_kwargs,
            )
            workflow.logger.info(f"Eligibility activity completed for tender {input_data.tender_id}")
            self.workflow_state["eligibility_response"] = eligibility_response

            eligibility_score = _extract_eligibility_score(eligibility_response)
            eligibility_passed = eligibility_score >= get_settings().ELIGIBILITY_THRESHOLD
            if eligibility_passed:
                break

            self.current_status = "waiting_for_retry"
            await workflow.execute_activity(
                update_final_pipeline_status,
                {
                    "pipeline_run_id": input_data.payload.get("pipeline_run_id"),
                    "status": "waiting_for_retry",
                    "result_payload": {
                        "message": "Eligibility threshold not met. Waiting for retry.",
                        "score": eligibility_score,
                    },
                },
                **activity_kwargs,
            )

            await workflow.wait_condition(
                lambda: self.retry_eligibility_signal,
            )

            self.retry_eligibility_signal = False
            self.current_status = "running"
            await workflow.execute_activity(
                update_final_pipeline_status,
                {
                    "pipeline_run_id": input_data.payload.get("pipeline_run_id"),
                    "status": "running",
                    "result_payload": {
                        "message": "Retrying eligibility check",
                    },
                },
                **activity_kwargs,
            )

        annexure_listing = await workflow.execute_activity(
            list_annexures,
            input_data.payload,
            **activity_kwargs,
        )
        workflow.logger.info(f"Annexure listing activity completed for tender {input_data.tender_id}")
        self.workflow_state["annexure_listing"] = annexure_listing

        # Build full annexure items list
        annexure_items = _extract_annexure_items(annexure_listing)

        template_payload = {
            "tender_id": input_data.tender_id,
            "company_id": input_data.company_id,
            "annexure_items": annexure_items,
            "context": input_data.payload,
            "pipeline_run_id": input_data.payload.get("pipeline_run_id"),
        }
        template_response = await workflow.execute_activity(
            generate_templates,
            template_payload,
            **activity_kwargs,
        )
        workflow.logger.info(f"Template generation activity completed for tender {input_data.tender_id}")
        self.workflow_state["template_response"] = template_response

        # Build full annexure items list for notification
        await workflow.execute_activity(
            notify_human_for_annexure_selection,
            args=[
                input_data.tender_id,
                input_data.company_id,
                annexure_items,
            ],
            **activity_kwargs,
        )
        workflow.logger.info(f"Annexure selection notification activity completed for tender {input_data.tender_id}")
        self.current_status = "waiting_for_selection"
        if self.selected_annexure_ids is None:
            await workflow.wait_condition(
                lambda: self.selected_annexure_ids is not None,
                timeout=timedelta(seconds=input_data.selection_signal_timeout_seconds),
            )

        self.current_status = "selected"
        # Use signal-provided IDs, or fallback to all extracted codes if signal missing
        all_ids = [item.get("annexure_id") for item in annexure_items if item.get("annexure_id")]
        selected_ids = self.selected_annexure_ids if self.selected_annexure_ids is not None else all_ids
        self.workflow_state["selected_annexures"] = selected_ids

        # Filter the generated templates to only keep selected ones
        selected_templates = []
        for res in template_response.get("results", []):
            if res.get("annexure_id") in selected_ids:
                selected_templates.append(res)

        autofill_results = []
        for template in selected_templates:
            autofill_response = await workflow.execute_activity(
                autofill_template,
                {
                    "tender_id": input_data.tender_id,
                    "company_id": input_data.company_id,
                    "template": template,
                    "annexure_id": template.get("annexure_id"),
                    "context": input_data.payload,
                    "pipeline_run_id": input_data.payload.get("pipeline_run_id"),
                },
                **activity_kwargs,
            )
            autofill_results.append(autofill_response)

        final_response_payload = {
            "tender_id": input_data.tender_id,
            "company_id": input_data.company_id,
            "summary_response": summary_response,
            "eligibility_response": eligibility_response,
            "annexure_ids": selected_ids,
            "template_response": {
                "status": "success",
                "results": selected_templates
            },
            "autofill_results": autofill_results,
            "pipeline_run_id": input_data.payload.get("pipeline_run_id"),
        }

        final_response = await workflow.execute_activity(
            generate_final_response,
            final_response_payload,
            **activity_kwargs,
        )
        workflow.logger.info(f"Final response generation activity completed for tender {input_data.tender_id}")
        self.workflow_state["final_response"] = final_response

        # Update pipeline run status in DB to completed
        await workflow.execute_activity(
            update_final_pipeline_status,
            {
                "pipeline_run_id": input_data.payload.get("pipeline_run_id"),
                "status": "completed",
                "result_payload": {
                    "eligibility_score": eligibility_score,
                    "selected_annexures": selected_ids,
                    "final_response": final_response,
                },
            },
            **activity_kwargs,
        )

        workflow.logger.info(f"Final pipeline status update activity completed for tender {input_data.tender_id}")
        self.current_status = "completed"
        return TenderPipelineResult(
            status="completed",
            eligibility_score=eligibility_score,
            eligibility_passed=True,
            selected_annexures=selected_ids,
            final_response=final_response,
            workflow_state=self.workflow_state,
        )

    @workflow.signal
    def select_annexures(self, annexure_ids: List[str]) -> None:
        self.selected_annexure_ids = annexure_ids

    @workflow.signal
    def retry_eligibility(self) -> None:
        self.retry_eligibility_signal = True

    @workflow.query
    def status(self) -> Dict[str, Any]:
        return {
            "status": self.current_status,
            "selected_annexures": self.selected_annexure_ids,
            "workflow_state": self.workflow_state,
        }