import json
from pathlib import Path

MOCK_DIR = Path("/app/JSONS")  # path inside container

def load_mock_response(activity_name: str, payload: dict = None) -> dict:
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
    
    # Custom logic for file-specific mock template generation responses
    if activity_name == "generate_templates" and payload:
        filename_val = payload.get("filename", "")
        if "201281730" in filename_val:
            filename = "AI_Annexure_Template_Generation_Response_1.json"
        elif "201281731" in filename_val:
            filename = "AI_Annexure_Template_Generation_Response_2.json"
            
    if activity_name == "autofill_template" and payload:
        annexure_id = str(payload.get("annexure_id", ""))
        if "bae369c6" in annexure_id:
            filename = "AI_Annexure_Autofill_Response_1.json"
        elif "5dd6edc1" in annexure_id:
            filename = "AI_Annexure_Autofill_Response_2.json"
        elif "7d307024" in annexure_id:
            filename = "AI_Annexure_Autofill_Response_3.json"
        else:
            filename = "AI_Annexure_Autofill_Response_1.json"
            
    if not filename:
        return {"error": f"No mock defined for {activity_name}"}
    filepath = MOCK_DIR / filename
    if not filepath.exists():
        # fallback to minimal mock
        return {"warning": f"Mock file {filename} not found", "data": {}}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)