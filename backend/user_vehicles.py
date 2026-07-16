# backend/user_vehicles.py

import os
import shutil
import json
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from .db import get_engine
from .auth import get_current_user, get_vehicle_owner_id, require_not_demo
from .ai_estimator import run_ai
from .copart_utils import enrich_vehicle
from .vehicle_model import normalize_vehicle, is_private_party, buyer_fee_rate
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
            # Deal lifecycle + outcome tracking (flywheel)
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS deal_status VARCHAR(16) DEFAULT 'analyzing'",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS actual_purchase_price INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS actual_repair_cost INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS actual_sale_price INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS actual_transport_cost INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS list_price INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS outcome_notes TEXT",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS listed_at TIMESTAMP",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS predicted_max_bid INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS predicted_repair INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS predicted_resale INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS predicted_profit INTEGER",
            # Dealer/lot mode: backend gross + buy cost stack
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS backend_gross INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS buy_auction_fee INTEGER",
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS buy_deal_shield INTEGER",
            # Unguessable public identifier used in URLs/API instead of the serial id.
            # Volatile default backfills existing rows with distinct 32-char hex tokens.
            "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS public_id VARCHAR(32) "
            "DEFAULT md5(random()::text || clock_timestamp()::text || random()::text)",
            "UPDATE user_vehicles SET public_id = "
            "md5(random()::text || clock_timestamp()::text || id::text) "
            "WHERE public_id IS NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_vehicles_public_id "
            "ON user_vehicles (public_id)",
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
# DEAL LIFECYCLE / OUTCOME TRACKING
# --------------------------------------------------------------
DEAL_STATUSES = frozenset({
    "analyzing",
    "watching",
    "bought",
    "in_repair",
    "listed",
    "sold",
    "passed",
})

# Statuses that mean the vehicle has been acquired (used for stamping timestamps)
ACQUIRED_STATUSES = frozenset({"bought", "in_repair", "listed", "sold"})


class PredictionSnapshot(BaseModel):
    predicted_max_bid: int | None = None
    predicted_repair: int | None = None
    predicted_resale: int | None = None
    predicted_profit: int | None = None


# Stage-gated actuals captured at the moment of a status transition
# (e.g. purchase price when marking bought, recon when leaving in-repair).
class OutcomeCapture(BaseModel):
    actual_purchase_price: int | None = None
    actual_repair_cost: int | None = None
    actual_transport_cost: int | None = None
    list_price: int | None = None
    actual_sale_price: int | None = None


class StatusUpdatePayload(BaseModel):
    deal_status: str
    snapshot: PredictionSnapshot | None = None
    capture: OutcomeCapture | None = None


# Hard sanity bound for any single money field (rejects fat-finger / bad data).
MONEY_MAX = 5_000_000

# Money fields that flow through the outcome endpoint.
OUTCOME_MONEY_FIELDS = (
    "actual_purchase_price",
    "actual_repair_cost",
    "actual_sale_price",
    "actual_transport_cost",
    "list_price",
    "backend_gross",
    "buy_auction_fee",
    "buy_deal_shield",
)


class OutcomeUpdatePayload(BaseModel):
    actual_purchase_price: int | None = None
    actual_repair_cost: int | None = None
    actual_sale_price: int | None = None
    actual_transport_cost: int | None = None
    list_price: int | None = None
    # Dealer/lot mode fields
    backend_gross: int | None = None
    buy_auction_fee: int | None = None
    buy_deal_shield: int | None = None
    outcome_notes: str | None = None


def _realized_profit(row: dict) -> int | None:
    """Realized profit for a sold deal, or None if not enough data.

    Includes dealer-mode backend gross and buy cost stack when present.
    Flipper deals leave those columns NULL, so this stays backward compatible.
    """
    sale = row.get("actual_sale_price")
    purchase = row.get("actual_purchase_price")
    if sale is None or purchase is None:
        return None
    repair = row.get("actual_repair_cost") or 0
    transport = row.get("actual_transport_cost") or 0
    backend = row.get("backend_gross") or 0
    auction_fee = row.get("buy_auction_fee") or 0
    deal_shield = row.get("buy_deal_shield") or 0
    buyer_fee = round(int(purchase) * buyer_fee_rate(row))
    return (
        int(sale)
        + int(backend)
        - int(purchase)
        - int(repair)
        - int(transport)
        - int(auction_fee)
        - int(deal_shield)
        - buyer_fee
    )


def _front_gross(row: dict) -> int | None:
    """Realized profit excluding backend gross (vehicle front-end only)."""
    realized = _realized_profit(row)
    if realized is None:
        return None
    return realized - int(row.get("backend_gross") or 0)


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
@router.get("/vehicle/{public_id}")
def get_vehicle(public_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = get_vehicle_owner_id(current_user)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id}
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return normalize_vehicle(enrich_vehicle(dict(row._mapping)))


@router.patch("/vehicle/{public_id}/repair")
def update_vehicle_repair(
    public_id: str,
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
                WHERE public_id = :pid AND user_id = :uid
            """),
            {
                "total": total,
                "breakdown": json.dumps(items),
                "pid": public_id,
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


@router.post("/vehicle/{public_id}/repair_plan")
def refresh_vehicle_repair_plan(
    public_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Re-run vision-based repair analysis and refresh the repair plan."""
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle_data = dict(row._mapping)
    lot_number = vehicle_data.get("lot_number") or str(vehicle_data.get("id"))
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
                WHERE public_id = :pid AND user_id = :uid
            """),
            {
                "repair_estimate": result.get("repair_estimate"),
                "repair_details": result.get("repair_details"),
                "repair_breakdown": breakdown_json,
                **plan_params,
                "pid": public_id,
                "uid": owner_id,
            },
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        saved = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()

    response = _repair_plan_response(dict(saved._mapping))
    response["repair_estimate"] = saved.repair_estimate
    response["repair_details"] = saved.repair_details
    response["repair_breakdown"] = _parse_json_field(saved.repair_breakdown)
    return response


@router.patch("/vehicle/{public_id}/transport")
def update_vehicle_transport(
    public_id: str,
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
                WHERE public_id = :pid AND user_id = :uid
            """),
            {
                "pickup": payload.transport_pickup_location,
                "delivery": payload.transport_delivery_location,
                "distance": distance,
                "transport_type": transport_type or "local_tow",
                "estimate": estimate,
                "manual_override": manual_override,
                "notes": payload.transport_notes,
                "pid": public_id,
                "uid": owner_id,
            },
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return normalize_vehicle(enrich_vehicle(dict(row._mapping)))


@router.post("/vehicle/{public_id}/known_issues")
def refresh_vehicle_known_issues(
    public_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Re-run platform reliability lookup (text-only, no photos)."""
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT id, year, make, model, odometer, lot_number
                FROM user_vehicles
                WHERE public_id = :pid AND user_id = :uid
            """),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle = {
        "images": [],
        "year": row.year,
        "make": row.make,
        "model": row.model,
        "odometer": row.odometer or "Unknown",
        "lot_number": row.lot_number or str(row.id),
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
                WHERE public_id = :pid AND user_id = :uid
            """),
            {
                "summary": result.get("reliability_summary"),
                "known_issues": known_issues_json,
                "wear_items": wear_items_json,
                "pid": public_id,
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


@router.post("/vehicle/{public_id}/negotiation")
def refresh_vehicle_negotiation(
    public_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate AI negotiation talking points for a private-party listing."""
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT id, year, make, model, odometer, lot_number, source_type,
                       asking_price, est_retail_value, listing_description, damage_description,
                       title_code, repair_estimate, repair_breakdown, resale_estimate,
                       red_flags
                FROM user_vehicles
                WHERE public_id = :pid AND user_id = :uid
            """),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle_data = dict(row._mapping)
    if not is_private_party(vehicle_data):
        raise HTTPException(
            status_code=400,
            detail="Negotiation coaching is only available for private-party listings.",
        )

    lot_number = vehicle_data.get("lot_number") or str(vehicle_data.get("id"))
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
                WHERE public_id = :pid AND user_id = :uid
            """),
            {
                "summary": result.get("negotiation_summary"),
                "talking_points": talking_points_json,
                "offer_low": result.get("suggested_offer_low"),
                "offer_high": result.get("suggested_offer_high"),
                "offer_rationale": result.get("offer_rationale"),
                "pid": public_id,
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
# UPDATE DEAL STATUS (lifecycle)
# --------------------------------------------------------------
@router.patch("/vehicle/{public_id}/status")
def update_vehicle_status(
    public_id: str,
    payload: StatusUpdatePayload,
    current_user: dict = Depends(get_current_user),
):
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    status = (payload.deal_status or "").strip().lower()
    if status not in DEAL_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid deal status")

    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        existing = dict(row._mapping)

        sets = ["deal_status = :status", "updated_at = NOW()"]
        params = {"status": status, "pid": public_id, "uid": owner_id}

        # Stamp lifecycle timestamps on first transition into each stage
        if status in ACQUIRED_STATUSES and not existing.get("purchased_at"):
            sets.append("purchased_at = NOW()")
        if status == "listed" and not existing.get("listed_at"):
            sets.append("listed_at = NOW()")
        if status == "sold" and not existing.get("sold_at"):
            sets.append("sold_at = NOW()")

        # Freeze prediction snapshot when the deal is first marked bought
        snap = payload.snapshot
        if (
            status in ACQUIRED_STATUSES
            and existing.get("predicted_max_bid") is None
            and snap is not None
        ):
            if snap.predicted_max_bid is not None:
                sets.append("predicted_max_bid = :p_bid")
                params["p_bid"] = int(snap.predicted_max_bid)
            if snap.predicted_repair is not None:
                sets.append("predicted_repair = :p_repair")
                params["p_repair"] = int(snap.predicted_repair)
            if snap.predicted_resale is not None:
                sets.append("predicted_resale = :p_resale")
                params["p_resale"] = int(snap.predicted_resale)
            if snap.predicted_profit is not None:
                sets.append("predicted_profit = :p_profit")
                params["p_profit"] = int(snap.predicted_profit)

        # Stage-gated actuals captured during this transition
        cap = payload.capture
        if cap is not None:
            for field in ("actual_purchase_price", "actual_repair_cost",
                          "actual_transport_cost", "list_price", "actual_sale_price"):
                val = getattr(cap, field)
                if val is None:
                    continue
                if val < 0:
                    raise HTTPException(status_code=400, detail=f"{field} cannot be negative")
                if val > MONEY_MAX:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{field} looks too large — double-check the value",
                    )
                sets.append(f"{field} = :{field}")
                params[field] = val

        conn.execute(
            text(f"UPDATE user_vehicles SET {', '.join(sets)} WHERE public_id = :pid AND user_id = :uid"),
            params,
        )

        saved = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()

    return normalize_vehicle(enrich_vehicle(dict(saved._mapping)))


# --------------------------------------------------------------
# UPDATE DEAL OUTCOME (actual numbers)
# --------------------------------------------------------------
@router.patch("/vehicle/{public_id}/outcome")
def update_vehicle_outcome(
    public_id: str,
    payload: OutcomeUpdatePayload,
    current_user: dict = Depends(get_current_user),
):
    require_not_demo(current_user)
    owner_id = get_vehicle_owner_id(current_user)

    for field in OUTCOME_MONEY_FIELDS:
        val = getattr(payload, field)
        if val is None:
            continue
        if val < 0:
            raise HTTPException(status_code=400, detail=f"{field} cannot be negative")
        if val > MONEY_MAX:
            raise HTTPException(
                status_code=400,
                detail=f"{field} looks too large — double-check the value",
            )

    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        existing = dict(row._mapping)

        sets = ["updated_at = NOW()"]
        params = {"pid": public_id, "uid": owner_id}

        fields = payload.model_dump(exclude_unset=True)
        for key, val in fields.items():
            sets.append(f"{key} = :{key}")
            params[key] = val

        # Logging a sale price closes out the deal
        if payload.actual_sale_price is not None:
            if not existing.get("sold_at"):
                sets.append("sold_at = NOW()")
            if existing.get("deal_status") != "sold":
                sets.append("deal_status = 'sold'")
        # Logging a purchase price implies the deal was bought
        if payload.actual_purchase_price is not None and not existing.get("purchased_at"):
            sets.append("purchased_at = NOW()")
            if existing.get("deal_status") in (None, "analyzing", "watching"):
                sets.append("deal_status = 'bought'")

        conn.execute(
            text(f"UPDATE user_vehicles SET {', '.join(sets)} WHERE public_id = :pid AND user_id = :uid"),
            params,
        )

        saved = conn.execute(
            text("SELECT * FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id},
        ).fetchone()

    result = normalize_vehicle(enrich_vehicle(dict(saved._mapping)))
    result["realized_profit"] = _realized_profit(dict(saved._mapping))
    return result


# --------------------------------------------------------------
# PORTFOLIO SUMMARY (scoreboard)
# --------------------------------------------------------------
@router.get("/portfolio/summary")
def portfolio_summary(current_user: dict = Depends(get_current_user)):
    owner_id = get_vehicle_owner_id(current_user)

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM user_vehicles WHERE user_id = :uid"),
            {"uid": owner_id},
        ).fetchall()
        prefs = conn.execute(
            text("""
                SELECT business_type, target_turn_days, max_turn_days
                FROM users WHERE id = :uid
            """),
            {"uid": owner_id},
        ).fetchone()

    prefs = dict(prefs._mapping) if prefs else {}
    business_type = prefs.get("business_type") or "flipper"
    target_turn_days = int(prefs.get("target_turn_days") or 60)
    max_turn_days = int(prefs.get("max_turn_days") or 90)

    now = datetime.utcnow()

    status_counts = {s: 0 for s in DEAL_STATUSES}
    active_count = 0
    total_invested = 0
    realized_profit_total = 0
    roi_values = []
    days_to_sell_values = []
    sold_count = 0
    win_count = 0
    profit_errors = []
    buy_called = 0
    buy_profitable = 0
    recent_sold = []

    # Dealer/lot metrics
    front_gross_total = 0
    back_gross_total = 0
    front_gross_values = []
    back_gross_values = []
    recon_variance_values = []
    aging_buckets = {"fresh": 0, "aging": 0, "stale": 0}
    units_over_max_turn = 0

    for row in rows:
        v = dict(row._mapping)
        status = (v.get("deal_status") or "analyzing").lower()
        if status not in status_counts:
            status_counts[status] = 0
        status_counts[status] += 1

        if status in ("watching", "bought", "in_repair", "listed"):
            active_count += 1

        # Aging for unsold, on-lot units (dealer aging tracker)
        if status in ("bought", "in_repair", "listed"):
            purchased_at = v.get("purchased_at")
            if purchased_at:
                try:
                    days_on_lot = (now - purchased_at).days
                    if days_on_lot < target_turn_days:
                        aging_buckets["fresh"] += 1
                    elif days_on_lot <= max_turn_days:
                        aging_buckets["aging"] += 1
                    else:
                        aging_buckets["stale"] += 1
                        units_over_max_turn += 1
                except (TypeError, AttributeError):
                    pass

        if status == "sold":
            realized = _realized_profit(v)
            purchase = v.get("actual_purchase_price")
            if realized is not None:
                sold_count += 1
                realized_profit_total += realized
                invested = int(purchase or 0) + int(v.get("actual_repair_cost") or 0) + int(v.get("actual_transport_cost") or 0)
                total_invested += invested
                if invested > 0:
                    roi_values.append((realized / invested) * 100)
                if realized > 0:
                    win_count += 1

                back = int(v.get("backend_gross") or 0)
                front = realized - back
                front_gross_total += front
                back_gross_total += back
                front_gross_values.append(front)
                back_gross_values.append(back)

                predicted_repair = v.get("predicted_repair")
                actual_repair = v.get("actual_repair_cost")
                if predicted_repair is not None and actual_repair is not None:
                    recon_variance_values.append(int(actual_repair) - int(predicted_repair))

                predicted_profit = v.get("predicted_profit")
                if predicted_profit is not None:
                    profit_errors.append(abs(realized - int(predicted_profit)))

                rec = str(v.get("flip_recommendation") or "").upper()
                if rec == "BUY":
                    buy_called += 1
                    if realized > 0:
                        buy_profitable += 1

                purchased_at = v.get("purchased_at")
                sold_at = v.get("sold_at")
                if purchased_at and sold_at:
                    try:
                        days = (sold_at - purchased_at).days
                        if days >= 0:
                            days_to_sell_values.append(days)
                    except (TypeError, AttributeError):
                        pass

                recent_sold.append({
                    "id": v.get("id"),
                    "public_id": v.get("public_id"),
                    "year": v.get("year"),
                    "make": v.get("make"),
                    "model": v.get("model"),
                    "image_url": v.get("image_url"),
                    "sold_at": sold_at.isoformat() if sold_at else None,
                    "actual_purchase_price": purchase,
                    "actual_repair_cost": v.get("actual_repair_cost"),
                    "actual_sale_price": v.get("actual_sale_price"),
                    "backend_gross": back,
                    "front_gross": front,
                    "predicted_profit": predicted_profit,
                    "predicted_repair": predicted_repair,
                    "realized_profit": realized,
                })

    recent_sold.sort(key=lambda r: r.get("sold_at") or "", reverse=True)

    def _avg(values):
        return round(sum(values) / len(values), 1) if values else None

    return {
        "business_type": business_type,
        "target_turn_days": target_turn_days,
        "max_turn_days": max_turn_days,
        "status_counts": status_counts,
        "active_count": active_count,
        "sold_count": sold_count,
        "realized_profit_total": realized_profit_total,
        "total_invested": total_invested,
        "avg_roi": _avg(roi_values),
        "win_rate": round((win_count / sold_count) * 100, 1) if sold_count else None,
        "avg_days_to_sell": _avg(days_to_sell_values),
        "avg_profit_error": _avg(profit_errors),
        "buy_called": buy_called,
        "buy_hit_rate": round((buy_profitable / buy_called) * 100, 1) if buy_called else None,
        # Dealer/lot metrics
        "front_gross_total": front_gross_total,
        "back_gross_total": back_gross_total,
        "avg_front_gross": _avg(front_gross_values),
        "avg_back_gross": _avg(back_gross_values),
        "avg_recon_variance": _avg(recon_variance_values),
        "aging_buckets": aging_buckets,
        "units_over_max_turn": units_over_max_turn,
        "recent_sold": recent_sold[:10],
    }


# --------------------------------------------------------------
# GET ALL IMAGES FOR A VEHICLE
# --------------------------------------------------------------
@router.get("/vehicle/{public_id}/images")
def get_vehicle_images(public_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = get_vehicle_owner_id(current_user)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT lot_number FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
            {"pid": public_id, "uid": owner_id}
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
@router.delete("/delete_vehicle/{public_id}")
def delete_vehicle(public_id: str, current_user: dict = Depends(get_current_user)):
    require_not_demo(current_user)
    try:
        user_id = current_user["id"]
        with engine.begin() as conn:
            result = conn.execute(
                text("DELETE FROM user_vehicles WHERE public_id = :pid AND user_id = :uid"),
                {"pid": public_id, "uid": user_id},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Vehicle not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
