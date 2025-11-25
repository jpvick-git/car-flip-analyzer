import os
import json
import shutil
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy import text

# Correct import for package mode
from .db import get_engine

# Your existing auth import:
from .auth import get_current_user

# Provide get_db so Depends(get_db) keeps working
def get_db():
    engine = get_engine()
    conn = engine.connect()
    try:
        yield conn
    finally:
        conn.close()

router = APIRouter()

# ----------------------------------------------------
# PATHS
# ----------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = (
    os.path.join(BASE_DIR, "downloads")
    if "backend" in BASE_DIR.lower()
    else os.path.join(BASE_DIR, "backend", "downloads")
)

UPLOADS_DIR = (
    os.path.join(os.path.dirname(BASE_DIR), "user_uploads")
    if "backend" in BASE_DIR.lower()
    else os.path.join(BASE_DIR, "user_uploads")
)

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# ----------------------------------------------------
# HELPERS
# ----------------------------------------------------
def safe_get(row, col, default=""):
    return row[col] if col in row and pd.notna(row[col]) else default


# ----------------------------------------------------
# GET VEHICLES (NOW RETURNS TAX/TITLE BASED ON USER STATE)
# ----------------------------------------------------
@router.get("/get_vehicles")
def get_vehicles(db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:

        # Pull vehicles + user's state_code
        query = text("""
            SELECT
                uv.id,
                uv.user_id,
                uv.lot_number,
                uv.lot_url,
                uv.year,
                uv.make,
                uv.model,
                uv.damage_description,
                uv.odometer,
                uv.title_code,
                uv.repair_estimate,
                uv.resale_estimate,
                uv.repair_details,
                uv.resale_details,
                uv.image_url,
                uv.sale_name,
                uv.sale_date,
                u.state_code
            FROM user_vehicles uv
            JOIN users u ON uv.user_id = u.id
            WHERE uv.user_id = :user_id
            ORDER BY uv.id DESC;
        """)

        rows = db.execute(query, {"user_id": current_user["id"]}).fetchall()

        # No vehicles yet
        if not rows:
            return []

        user_state = rows[0].state_code or None

        # Lookup tax/title fees for user's state
        if user_state:
            tax_query = text("""
                SELECT avg_tax_rate, title_fee
                FROM tax_title_fees
                WHERE state_code = :state
            """)
            tax_row = db.execute(tax_query, {"state": user_state}).fetchone()

            avg_tax_rate = float(tax_row.avg_tax_rate) if tax_row and tax_row.avg_tax_rate is not None else 0
            title_fee = float(tax_row.title_fee) if tax_row and tax_row.title_fee is not None else 0
        else:
            avg_tax_rate = 0
            title_fee = 0

        vehicles = []

        for row in rows:
            vehicles.append({
                "id": row.id,
                "user_id": row.user_id,
                "lot_number": row.lot_number,
                "lot_url": row.lot_url,
                "year": row.year,
                "make": row.make,
                "model": row.model,
                "damage_description": row.damage_description,
                "odometer": row.odometer,
                "title_code": row.title_code,
                "repair_estimate": row.repair_estimate,
                "resale_estimate": row.resale_estimate,
                "repair_details": row.repair_details,
                "resale_details": row.resale_details,
                "image_url": row.image_url,
                "images": [row.image_url] if row.image_url else [],
                "sale_name": row.sale_name,
                "sale_date": row.sale_date,
                "state_code": row.state_code,
                "avg_tax_rate": avg_tax_rate,
                "title_fee": title_fee,
            })

        return vehicles

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------
# UPLOAD CSV FOR USER
# ----------------------------------------------------
@router.post("/upload_user_file")
async def upload_user_file(
    file: UploadFile = File(...),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        if not file.filename.endswith((".csv", ".xlsx")):
            raise HTTPException(status_code=400, detail="Only CSV or XLSX allowed.")

        save_path = os.path.join(UPLOADS_DIR, file.filename)
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        df = pd.read_csv(save_path) if file.filename.endswith(".csv") else pd.read_excel(save_path)
        inserted = 0

        for _, row in df.iterrows():
            lot_number = safe_get(row, "lot_number", "")
            lot_url = safe_get(row, "lot_url", "")

            year = safe_get(row, "year", "")
            make = safe_get(row, "make", "")
            model = safe_get(row, "model", "")

            damage = safe_get(row, "damage_description", "")
            odometer = safe_get(row, "odometer", "")
            title_code = safe_get(row, "title_code", "")

            repair_est = safe_get(row, "repair_estimate", "")
            resale_est = safe_get(row, "resale_estimate", "")
            repair_details = safe_get(row, "repair_details", "")
            resale_details = safe_get(row, "resale_details", "")

            img_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
            images = []

            if os.path.isdir(img_dir):
                for filename in sorted(os.listdir(img_dir)):
                    if filename.lower().endswith((".jpg", ".jpeg", ".png")):
                        images.append(os.path.join(img_dir, filename))

            query = text("""
                INSERT INTO user_vehicles
                (user_id, lot_number, lot_url, year, make, model,
                 damage_description, odometer, title_code,
                 repair_estimate, resale_estimate, repair_details, resale_details, image_url)
                VALUES
                (:user_id, :lot_number, :lot_url, :year, :make, :model,
                 :damage_description, :odometer, :title_code,
                 :repair_estimate, :resale_estimate, :repair_details, :resale_details, :image_url);
            """)

            db.execute(query, {
                "user_id": current_user["id"],
                "lot_number": lot_number,
                "lot_url": lot_url,
                "year": year,
                "make": make,
                "model": model,
                "damage_description": damage,
                "odometer": odometer,
                "title_code": title_code,
                "repair_estimate": repair_est,
                "resale_estimate": resale_est,
                "repair_details": repair_details,
                "resale_details": resale_details,
                "image_url": "",
            })

            db.commit()
            inserted += 1

        return {"status": "success", "inserted_rows": inserted}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------
# ADD SINGLE VEHICLE (Manual Entry)
# ----------------------------------------------------
@router.post("/add_vehicle")
def add_vehicle(payload: dict, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        lot_number = payload.get("lot_number")
        if not lot_number:
            raise HTTPException(status_code=400, detail="lot_number required.")

        img_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
        images = []

        if os.path.isdir(img_dir):
            for filename in sorted(os.listdir(img_dir)):
                if filename.lower().endswith((".jpg", ".jpeg", ".png")):
                    images.append(os.path.join(img_dir, filename))

        query = text("""
            INSERT INTO user_vehicles
            (user_id, lot_number, lot_url, year, make, model, damage_description, odometer,
             title_code, repair_estimate, resale_estimate, repair_details, resale_details,
             tax_amount, fees_amount, image_url)
            VALUES
            (:user_id, :lot_number, :lot_url, :year, :make, :model, :damage_description,
             :odometer, :title_code, :repair_estimate, :resale_estimate, :repair_details,
             :resale_details, :tax_amount, :fees_amount, :image_url);
        """)

        db.execute(query, {
            "user_id": current_user["id"],
            "lot_number": payload.get("lot_number"),
            "lot_url": payload.get("lot_url", ""),
            "year": payload.get("year", ""),
            "make": payload.get("make", ""),
            "model": payload.get("model", ""),
            "damage_description": payload.get("damage_description", ""),
            "odometer": payload.get("odometer", ""),
            "title_code": payload.get("title_code", ""),
            "repair_estimate": payload.get("repair_estimate", ""),
            "resale_estimate": payload.get("resale_estimate", ""),
            "repair_details": payload.get("repair_details", ""),
            "resale_details": payload.get("resale_details", ""),
            "tax_amount": payload.get("tax_amount", ""),
            "fees_amount": payload.get("fees_amount", ""),
            "image_url": json.dumps(images),
        })

        db.commit()

        return {"status": "success"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------
# DELETE VEHICLE
# ----------------------------------------------------
@router.delete("/delete_vehicle/{vehicle_id}")
def delete_vehicle(vehicle_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        query = text("""
            DELETE FROM user_vehicles
            WHERE id = :vehicle_id AND user_id = :user_id;
        """)

        result = db.execute(query, {
            "vehicle_id": vehicle_id,
            "user_id": current_user["id"],
        })

        db.commit()

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found.")

        return {"status": "deleted"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
