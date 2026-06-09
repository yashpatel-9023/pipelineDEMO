from typing import Any, Dict, List


def build_annexure_selection_notification(tender_id: str, company_id: str, annexure_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "tender_id": tender_id,
        "company_id": company_id,
        "message": "Please review the extracted annexures and select the ones to generate templates for.",
        "annexures": annexure_items,
    }
