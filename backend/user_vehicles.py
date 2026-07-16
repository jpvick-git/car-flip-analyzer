# backend/user_vehicles.py

import os
import shutil
import json
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from .db import get_engine
from .auth import get_current_user, get_vehicle_owner_id, require_not_demo
from .ai_estimator import run_ai
from .copart_utils import enrich_vehicle
from .vehicle_model import normalize_vehicle, is_private_party
from .ai_repair_estimator import select_images_by_angle, repair_plan_db_params, analyze_vehicle
from fastapi.responses import JSONResponse

router = APIRouter()

engine = get_engine()

DOWNLOAD_DIR = "/opt/carflip/backend/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


def _ensure_schema_columns():
    with engine.begin() as conn:
        for stmt in (
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS repair_breakdown TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS reliability_summary TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS known_issues TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS wear_items TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT FALSE",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS review_reasons TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) DEFAULT 'salvage_auction'",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS asking_price INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS listing_description TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS red_flags TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS negotiation_summary TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS negotiation_talking_points TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS suggested_offer_low INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS suggested_offer_high INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS offer_rationale TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS transport_pickup_location TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS transport_delivery_location TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS transport_distance_miles NUMERIC",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS transport_type TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS transport_cost_estimate NUMERIC",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS transport_cost_manual_override NUMERIC",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS transport_notes TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS repair_difficulty_score NUMERIC",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS repair_difficulty_label TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS parts_availability TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS estimated_labor_hours NUMERIC",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS estimated_repair_days_min NUMERIC",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS estimated_repair_days_max NUMERIC",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS diy_friendly TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS parts_needed TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS shop_services_needed TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS repair_plan_summary TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS repair_plan_warnings TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS hidden_damage_risks TEXT",
        ):
            conn.execute(text(stmt))


_ensure_schema_columns()


class RepairItem(BaseModel):
    description: str
    cost: int


class RepairUpdatePayload(BaseModel):
    repair_items: list[RepairItem]


TRANSPORT_TYPES = frozenset({
    "local_tow",
    "self_pickup",
    "open_carrier",
    "enclosed_carrier",
    "drive_home",
})


class TransportUpdatePayload(BaseModel):
    transport_pickup_location: str | None = None
    transport_delivery_location: str | None = None
    transport_distance_miles: float | None = None
    transport_type: str | None = None
    transport_cost_estimate: int | None = None
    transport_cost_manual_override: int | None = None
    transport_notes: str | None = None


# --------------------------------------------------------------
# GET ALL VEHICLES FOR USER (Dashboard)
# --------------------------------------------------------------
@router.get("/get_vehicles")
def get_vehicles(current_user: dict = Depends(get_current_user)):
    try:
        user_id = get_vehicle_owner_id(current_user)

        with engine.connect() as conn:
            query = text("""
                SELECT *
                FROM user_vehicles
                WHERE user_id = :uid
                ORDER BY id DESC
            """)

            rows = conn.execute(query, {"uid": user_id}).fetchall()

        vehicles = []
        for row in rows:
            vehicles.append(normalize_vehicle(enrich_vehicle(dict(row._mapping))))
        return vehicles

    except Exception as e:
        print("❌ ERROR get_vehicles:", e)
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------------------------------------------
# UPLOAD FILES (Your original Copart CSV upload route)
# --------------------------------------------------------------
@router.post("/upload_user_file")
async def upload_user_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    require_not_demo(current_user)
    try:
        upload_dir = "/opt/carflip/user_uploads"
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {"status": "success", "filename": file.filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------------------------------------------
# GET SINGLE VEHICLE
# --------------------------------------------------------------
@router.get("/vehicle/{vehicle_id}")
def get_vehicle(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    owner_id = get_vehicle_owner_id(current_user)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE id = :id AND user_id = :uid"),
            {"id": vehicle_id, "uid": owner_id}
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return normalize_vehicle(enrich_vehicle(dict(row._mapping)))


@router.patch("/vehicle/{vehicle_id}/repair")
def update_vehicle_repair(
    vehicle_id: int,
    payload: RepairUpdatePayload,
    current_user: dict = Depends(get_current_user),
):
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    items = [
        {"description": item.description.strip(), "cost": max(int(item.cost), 0)}
        for item in payload.repair_items
        if item.description.strip()
    ]
    total = sum(item["cost"] for item in items)

    with engine.begin() as conn:
        result = conn.execute(
            text("""
                UPDATE user_vehicles
                SET repair_estimate = :total,
                    repair_breakdown = :breakdown,
                    updated_at = NOW()
                WHERE id = :id AND user_id = :uid
            """),
            {
                "total": total,
                "breakdown": json.dumps(items),
                "id": vehicle_id,
                "uid": owner_id,
            },
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found")

    return {
        "repair_estimate": total,
        "repair_breakdown": items,
    }


def _parse_json_field(raw, default=None):
    if default is None:
        default = []
    if raw is None or raw == "":
        return default
    if isinstance(raw, list):
        return raw
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else default
    except (json.JSONDecodeError, TypeError):
        return default


def _repair_plan_response(row_or_dict):
    data = dict(row_or_dict) if not isinstance(row_or_dict, dict) else row_or_dict
    return {
        "repair_difficulty_score": data.get("repair_difficulty_score"),
        "repair_difficulty_label": data.get("repair_difficulty_label"),
        "parts_availability": data.get("parts_availability"),
        "estimated_labor_hours": data.get("estimated_labor_hours"),
        "estimated_repair_days_min": data.get("estimated_repair_days_min"),
        "estimated_repair_days_max": data.get("estimated_repair_days_max"),
        "diy_friendly": data.get("diy_friendly"),
        "parts_needed": _parse_json_field(data.get("parts_needed")),
        "shop_services_needed": _parse_json_field(data.get("shop_services_needed")),
        "repair_plan_summary": data.get("repair_plan_summary"),
        "repair_plan_warnings": _parse_json_field(data.get("repair_plan_warnings")),
        "hidden_damage_risks": _parse_json_field(data.get("hidden_damage_risks")),
    }


@router.post("/vehicle/{vehicle_id}/repair_plan")
def refresh_vehicle_repair_plan(
    vehicle_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Re-run vision-based repair analysis and refresh the repair plan."""
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE id = :id AND user_id = :uid"),
            {"id": vehicle_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle_data = dict(row._mapping)
    lot_number = vehicle_data.get("lot_number") or str(vehicle_id)
    image_paths, image_entries = _load_vehicle_images(lot_number)

    if not image_paths:
        raise HTTPException(
            status_code=400,
            detail="No photos available for this vehicle. Upload or wait for images to finish downloading.",
        )

    vehicle = {
        **vehicle_data,
        "images": image_paths,
        "image_entries": image_entries,
        "lot_number": lot_number,
    }

    result = analyze_vehicle(vehicle, mode="repair")
    plan_params = repair_plan_db_params(result)
    breakdown_raw = result.get("repair_breakdown")
    if isinstance(breakdown_raw, str):
        breakdown_json = breakdown_raw
    elif isinstance(breakdown_raw, list):
        breakdown_json = json.dumps(breakdown_raw)
    else:
        breakdown_json = "[]"

    with engine.begin() as conn:
        updated = conn.execute(
            text("""
                UPDATE user_vehicles
                SET repair_estimate = :repair_estimate,
                    repair_details = :repair_details,
                    repair_breakdown = :repair_breakdown,
                    repair_difficulty_score = :repair_difficulty_score,
                    repair_difficulty_label = :repair_difficulty_label,
                    parts_availability = :parts_availability,
                    estimated_labor_hours = :estimated_labor_hours,
                    estimated_repair_days_min = :estimated_repair_days_min,
                    estimated_repair_days_max = :estimated_repair_days_max,
                    diy_friendly = :diy_friendly,
                    parts_needed = :parts_needed,
                    shop_services_needed = :shop_services_needed,
                    repair_plan_summary = :repair_plan_summary,
                    repair_plan_warnings = :repair_plan_warnings,
                    hidden_damage_risks = :hidden_damage_risks,
                    updated_at = NOW()
                WHERE id = :id AND user_id = :uid
            """),
            {
                "repair_estimate": result.get("repair_estimate"),
                "repair_details": result.get("repair_details"),
                "repair_breakdown": breakdown_json,
                **plan_params,
                "id": vehicle_id,
                "uid": owner_id,
            },
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        saved = conn.execute(
            text("SELECT * FROM user_vehicles WHERE id = :id AND user_id = :uid"),
            {"id": vehicle_id, "uid": owner_id},
        ).fetchone()

    response = _repair_plan_response(dict(saved._mapping))
    response["repair_estimate"] = saved.repair_estimate
    response["repair_details"] = saved.repair_details
    response["repair_breakdown"] = _parse_json_field(saved.repair_breakdown)
    return response


@router.patch("/vehicle/{vehicle_id}/transport")
def update_vehicle_transport(
    vehicle_id: int,
    payload: TransportUpdatePayload,
    current_user: dict = Depends(get_current_user),
):
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    transport_type = payload.transport_type
    if transport_type is not None and transport_type not in TRANSPORT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid transport type")

    manual_override = payload.transport_cost_manual_override
    if manual_override is not None and manual_override < 0:
        raise HTTPException(status_code=400, detail="Manual transport override cannot be negative")

    distance = payload.transport_distance_miles
    if distance is not None and distance < 0:
        raise HTTPException(status_code=400, detail="Distance cannot be negative")

    estimate = payload.transport_cost_estimate
    if estimate is not None and estimate < 0:
        raise HTTPException(status_code=400, detail="Transport estimate cannot be negative")

    with engine.begin() as conn:
        result = conn.execute(
            text("""
                UPDATE user_vehicles
                SET transport_pickup_location = :pickup,
                    transport_delivery_location = :delivery,
                    transport_distance_miles = :distance,
                    transport_type = COALESCE(:transport_type, transport_type, 'local_tow'),
                    transport_cost_estimate = :estimate,
                    transport_cost_manual_override = :manual_override,
                    transport_notes = :notes,
                    updated_at = NOW()
                WHERE id = :id AND user_id = :uid
            """),
            {
                "pickup": payload.transport_pickup_location,
                "delivery": payload.transport_delivery_location,
                "distance": distance,
                "transport_type": transport_type or "local_tow",
                "estimate": estimate,
                "manual_override": manual_override,
                "notes": payload.transport_notes,
                "id": vehicle_id,
                "uid": owner_id,
            },
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE id = :id AND user_id = :uid"),
            {"id": vehicle_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return normalize_vehicle(enrich_vehicle(dict(row._mapping)))


@router.post("/vehicle/{vehicle_id}/known_issues")
def refresh_vehicle_known_issues(
    vehicle_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Re-run platform reliability lookup (text-only, no photos)."""
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT year, make, model, odometer, lot_number
                FROM user_vehicles
                WHERE id = :id AND user_id = :uid
            """),
            {"id": vehicle_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle = {
        "images": [],
        "year": row.year,
        "make": row.make,
        "model": row.model,
        "odometer": row.odometer or "Unknown",
        "lot_number": row.lot_number or str(vehicle_id),
        "damage_description": "",
        "title_code": "Unknown",
    }

    result = run_ai(vehicle, mode="known_issues")
    known_issues_json = json.dumps(result.get("known_issues") or [])
    wear_items_json = json.dumps(result.get("wear_items") or [])

    with engine.begin() as conn:
        updated = conn.execute(
            text("""
                UPDATE user_vehicles
                SET reliability_summary = :summary,
                    known_issues = :known_issues,
                    wear_items = :wear_items,
                    updated_at = NOW()
                WHERE id = :id AND user_id = :uid
            """),
            {
                "summary": result.get("reliability_summary"),
                "known_issues": known_issues_json,
                "wear_items": wear_items_json,
                "id": vehicle_id,
                "uid": owner_id,
            },
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found")

    return {
        "reliability_summary": result.get("reliability_summary"),
        "known_issues": result.get("known_issues") or [],
        "wear_items": result.get("wear_items") or [],
    }


def _load_vehicle_images(lot_number: str) -> tuple[list[str], list[dict]]:
    lot_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
    if not os.path.isdir(lot_dir):
        return [], []

    image_entries, _ = select_images_by_angle(lot_dir)
    paths = [entry["path"] for entry in image_entries if entry.get("path")]
    return paths, image_entries


@router.post("/vehicle/{vehicle_id}/negotiation")
def refresh_vehicle_negotiation(
    vehicle_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Generate AI negotiation talking points for a private-party listing."""
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT year, make, model, odometer, lot_number, source_type,
                       asking_price, est_retail_value, listing_description, damage_description,
                       title_code, repair_estimate, repair_breakdown, resale_estimate,
                       red_flags
                FROM user_vehicles
                WHERE id = :id AND user_id = :uid
            """),
            {"id": vehicle_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle_data = dict(row._mapping)
    if not is_private_party(vehicle_data):
        raise HTTPException(
            status_code=400,
            detail="Negotiation coaching is only available for private-party listings.",
        )

    lot_number = vehicle_data.get("lot_number") or str(vehicle_id)
    image_paths, image_entries = _load_vehicle_images(lot_number)

    vehicle = {
        **vehicle_data,
        "images": image_paths,
        "image_entries": image_entries,
        "lot_number": lot_number,
    }

    result = run_ai(vehicle, mode="negotiation")
    talking_points_json = json.dumps(result.get("negotiation_talking_points") or [])

    with engine.begin() as conn:
        updated = conn.execute(
            text("""
                UPDATE user_vehicles
                SET negotiation_summary = :summary,
                    negotiation_talking_points = :talking_points,
                    suggested_offer_low = :offer_low,
                    suggested_offer_high = :offer_high,
                    offer_rationale = :offer_rationale,
                    updated_at = NOW()
                WHERE id = :id AND user_id = :uid
            """),
            {
                "summary": result.get("negotiation_summary"),
                "talking_points": talking_points_json,
                "offer_low": result.get("suggested_offer_low"),
                "offer_high": result.get("suggested_offer_high"),
                "offer_rationale": result.get("offer_rationale"),
                "id": vehicle_id,
                "uid": owner_id,
            },
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found")

    return {
        "negotiation_summary": result.get("negotiation_summary"),
        "negotiation_talking_points": result.get("negotiation_talking_points") or [],
        "suggested_offer_low": result.get("suggested_offer_low"),
        "suggested_offer_high": result.get("suggested_offer_high"),
        "offer_rationale": result.get("offer_rationale"),
    }


# --------------------------------------------------------------
# GET ALL IMAGES FOR A VEHICLE
# --------------------------------------------------------------
@router.get("/vehicle/{vehicle_id}/images")
def get_vehicle_images(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    owner_id = get_vehicle_owner_id(current_user)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT lot_number FROM user_vehicles WHERE id = :id AND user_id = :uid"),
            {"id": vehicle_id, "uid": owner_id}
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    lot_number = str(row[0])
    lot_dir = os.path.join(DOWNLOAD_DIR, lot_number)

    if not os.path.exists(lot_dir):
        return {"images": []}

    files = sorted([
        f for f in os.listdir(lot_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ])

    base_url = f"https://carflipanalyzer.com/downloads/{lot_number}"
    return {"images": [f"{base_url}/{f}" for f in files]}


# --------------------------------------------------------------
# GET STATE TAX / TITLE FEES
# --------------------------------------------------------------
@router.get("/states")
def get_states():
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT state_code, state_name, title_fee, avg_tax_rate, notes FROM tax_title_fees ORDER BY state_name")
        ).fetchall()
    return [dict(r._mapping) for r in rows]


# --------------------------------------------------------------
# DELETE VEHICLE
# --------------------------------------------------------------
@router.delete("/delete_vehicle/{vehicle_id}")
def delete_vehicle(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    require_not_demo(current_user)
    try:
        user_id = current_user["id"]
        with engine.begin() as conn:
            result = conn.execute(
                text("DELETE FROM user_vehicles WHERE id = :id AND user_id = :uid"),
                {"id": vehicle_id, "uid": user_id},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Vehicle not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
