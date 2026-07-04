# backend/user_vehicles.py

import os
import shutil
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy import text
from .db import get_engine
from .auth import get_current_user, get_vehicle_owner_id, require_not_demo
from fastapi.responses import JSONResponse

router = APIRouter()

engine = get_engine()

# Correct downloads directory
DOWNLOAD_DIR = "/opt/carflip/backend/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


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
            vehicles.append(dict(row._mapping))
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
    return dict(row._mapping)


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
