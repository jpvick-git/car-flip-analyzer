import os
import tempfile
import requests
from .ai_repair_estimator import analyze_vehicle   # your full GPT engine


# ----------------------------------------------------
# Helper: run analyze_vehicle safely
# ----------------------------------------------------
def run_ai(vehicle: dict):
    try:
        result = analyze_vehicle(vehicle)

        return {
            "repair_estimate": int(result.get("repair_estimate") or 1500),
            "repair_details": result.get("repair_details") or "No repair details available.",
            "resale_estimate": int(result.get("resale_estimate") or 5000),
            "resale_details": result.get("resale_details") or "No resale details available.",
        }

    except Exception as e:
        print("AI wrapper failure:", e)
        return {
            "repair_estimate": 1500,
            "repair_details": "AI error — using fallback repair cost.",
            "resale_estimate": 5000,
            "resale_details": "AI error — using fallback resale estimate.",
        }


# ----------------------------------------------------
# Estimate repair cost using first image (optional)
# ----------------------------------------------------
async def estimate_repair_cost(image_url: str | None):
    local_path = None

    try:
        if image_url:
            response = requests.get(image_url, timeout=10)
            response.raise_for_status()

            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
                tmp.write(response.content)
                local_path = tmp.name

    except Exception as e:
        print("Image download failed:", e)

    vehicle = {
        "images": [local_path] if local_path else [],
        "year": None,
        "make": None,
        "model": None,
        "damage_description": "",
        "lot_number": "manual",
        "odometer": "Unknown",
        "title_code": "Unknown",
    }

    return run_ai(vehicle)


# ----------------------------------------------------
# Estimate resale value without images
# ----------------------------------------------------
async def estimate_resale_value(year: int | None, make: str | None,
                                model: str | None, mileage: int | None):
    vehicle = {
        "images": [],
        "year": year,
        "make": make,
        "model": model,
        "damage_description": "",
        "lot_number": "manual",
        "odometer": mileage or "Unknown",
        "title_code": "Clean",
    }

    return run_ai(vehicle)
