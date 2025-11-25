# backend/ai_estimator.py

import os
import tempfile
import requests
from .ai_repair_estimator import analyze_vehicle  # <-- your real engine

# ----------------------------------------------------
# Wrapper: Estimate repair from a single image URL
# ----------------------------------------------------
async def estimate_repair_cost(image_url: str | None):
    if not image_url:
        return 1500  # fallback

    # Download image locally for analyze_vehicle() which expects file paths
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()

        # Save temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp.write(response.content)
            local_path = tmp.name

        vehicle = {
            "images": [local_path],
            "year": None,
            "make": None,
            "model": None,
            "damage_description": "",
            "lot_number": "manual",
            "odometer": "Unknown",
            "title_code": "Unknown",
        }

        result = analyze_vehicle(vehicle)
        return int(result.get("repair_estimate") or 1500)

    except Exception as e:
        print("Manual upload repair error:", e)
        return 1500


# ----------------------------------------------------
# Wrapper: Estimate resale from basic info
# ----------------------------------------------------
async def estimate_resale_value(year: int, make: str, model: str, mileage: int):
    # analyze_vehicle requires images — but resale estimation can still work
    try:
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

        result = analyze_vehicle(vehicle)
        return int(result.get("resale_estimate") or 5000)

    except Exception as e:
        print("Manual upload resale error:", e)
        return 5000
