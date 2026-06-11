import json
from pathlib import Path

MOCK_DIR = Path("/app/JSONS")  # path inside container

def load_mock_response(activity_name: str) -> dict:
    """Load the corresponding JSON file for the activity."""
    mapping = {
        "fetch_tender_summary": "AI_Summary_Response.json",
        "evaluate_eligibility": "AI_Eligibility_Response.json",
        "list_annexures": "AI_Annexure_Listings_Response.json",
        "generate_templates": "AI_Annexure_Template_Generation_Response.json",
        "autofill_template": "AI_Annexure_Autofill_Response.json",
        "generate_final_response": "AI_Final_Response.json",
    }
    filename = mapping.get(activity_name)
    if not filename:
        return {"error": f"No mock defined for {activity_name}"}
    filepath = MOCK_DIR / filename
    if not filepath.exists():
        # fallback to minimal mock
        return {"warning": f"Mock file {filename} not found", "data": {}}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)