import asyncio
import os

from temporalio.client import Client
from temporalio.worker import Worker, UnsandboxedWorkflowRunner

from src.orchestration.workflows import TenderBidWorkflow
from src.orchestration import activities


def _task_queue() -> str:
    return os.getenv("TEMPORAL_TASK_QUEUE", "pipeline-task-queue")


async def main() -> None:
    client = await Client.connect(os.getenv("TEMPORAL_TARGET_HOST", "localhost:7233"))
    worker = Worker(
        client,
        task_queue=_task_queue(),
        workflow_runner=UnsandboxedWorkflowRunner(),
        workflows=[TenderBidWorkflow],
        activities=[
            activities.fetch_tender_summary,
            activities.evaluate_eligibility,
            activities.list_annexures,
            activities.generate_templates,
            activities.autofill_template,
            activities.generate_final_response,
            activities.notify_human_for_annexure_selection,
        ],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
