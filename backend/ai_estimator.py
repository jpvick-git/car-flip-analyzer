import os
import tempfile
import requests
from .ai_repair_estimator import analyze_vehicle


def run_ai(vehicle: dict, mode: str = "full"):
    try:
        result = analyze_vehicle(vehicle, mode=mode)
        response = {}

        if mode in ("full", "repair"):
            response["repair_estimate"] = int(result.get("repair_estimate") or 1500)
            response["repair_details"] = result.get("repair_details") or "No repair details available."

        if mode in ("full", "resale"):
            response["resale_estimate"] = int(result.get("resale_estimate") or 5000)
            response["resale_details"] = result.get("resale_details") or "No resale details available."

        if mode in ("full", "known_issues"):
            response["reliability_summary"] = result.get("reliability_summary") or "No reliability summary available."
            response["known_issues"] = result.get("known_issues") or []
            response["wear_items"] = result.get("wear_items") or []

        return response

    except Exception as e:
        print("AI wrapper failure:", e)
        fallback = {
            "repair_estimate": 1500,
            "repair_details": "AI error — using fallback repair cost.",
            "resale_estimate": 5000,
            "resale_details": "AI error — using fallback resale estimate.",
            "reliability_summary": "AI error — no reliability summary available.",
            "known_issues": [],
            "wear_items": [],
        }
        if mode == "repair":
            return {k: fallback[k] for k in ("repair_estimate", "repair_details")}
        if mode == "resale":
            return {k: fallback[k] for k in ("resale_estimate", "resale_details")}
        if mode == "known_issues":
            return {k: fallback[k] for k in ("reliability_summary", "known_issues", "wear_items")}
        return fallback


async def estimate_repair_cost(
    image_url: str | None,
    year: int | str | None = None,
    make: str | None = None,
    model: str | None = None,
    damage_description: str = "",
    odometer: str | int | None = None,
    title_code: str = "Unknown",
):
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
        "year": year,
        "make": make,
        "model": model,
        "damage_description": damage_description,
        "lot_number": "manual",
        "odometer": odometer or "Unknown",
        "title_code": title_code,
    }

    return run_ai(vehicle, mode="repair")


async def estimate_resale_value(
    year: int | None,
    make: str | None,
    model: str | None,
    mileage: int | None,
    damage_description: str = "",
    title_code: str = "Clean",
    repair_estimate: int | None = None,
    repair_details: str | None = None,
):
    vehicle = {
        "images": [],
        "year": year,
        "make": make,
        "model": model,
        "damage_description": damage_description,
        "lot_number": "manual",
        "odometer": mileage or "Unknown",
        "title_code": title_code,
    }

    if repair_estimate is not None or repair_details:
        vehicle["repair_context"] = {
            "repair_estimate": repair_estimate,
            "repair_details": repair_details,
        }

    return run_ai(vehicle, mode="resale")