from __future__ import annotations

import os
import uuid
from typing import Any, Dict

from temporalio.client import Client

from .workflows import TenderBidWorkflow, TenderPipelineInput


async def create_temporal_client() -> Client:
    target_host = os.getenv("TEMPORAL_TARGET_HOST", "localhost:7233")
    return await Client.connect(target_host)


async def start_pipeline(input_data: Dict[str, Any]) -> Any:
    client = await create_temporal_client()
    workflow_id = input_data.get("workflow_id") or f"tender-pipeline-{input_data.get('tender_id', 'unknown')}-{uuid.uuid4()}"
    workflow_input = {k: v for k, v in input_data.items() if k != "workflow_id"}
    handle = await client.start_workflow(
        TenderBidWorkflow.run,
        TenderPipelineInput(**workflow_input),
        id=workflow_id,
        task_queue=os.getenv("TEMPORAL_TASK_QUEUE", "pipeline-task-queue"),
    )
    return handle
