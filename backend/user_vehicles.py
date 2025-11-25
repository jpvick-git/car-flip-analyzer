# backend/user_vehicles.py

import os
import shutil
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy import text
from .db import get_engine
from .auth import get_current_user
from fastapi.responses import JSONResponse

router = APIRouter()

# Correct downloads directory
DOWNLOAD_DIR = "/root/car-flip-analyzer/backend/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


# --------------------------------------------------------------
# GET ALL VEHICLES FOR USER (Dashboard)
# --------------------------------------------------------------
@router.get("/get_vehicles")
def get_vehicles(current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["id"]

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
            vehicles.append({key: getattr(row, key) for key in row.keys()})

        return vehicles

    except Exception as e:
        print("❌ ERROR get_vehicles:", e)
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------------------------------------------
# UPLOAD FILES (Your original Copart CSV upload route)
# --------------------------------------------------------------
@router.post("/upload_user_file")
async def upload_user_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    try:
        upload_dir = "/root/car-flip-analyzer/user_uploads"
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {"status": "success", "filename": file.filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------------------------------------------------------
# ADD MANUAL VEHICLE (Marketplace, Private Seller, etc.)
# --------------------------------------------------------------
@router.post("/add_manual_vehicle")
async def add_manual_vehicle(
    year: int = None,
    make: str = None,
    model: str = None,
    mileage: int = None,
    damage_description: str = None,
    title_code: str = None,
    listing_url: str = None,
    location: str = None,
    files: list[UploadFile] = File(None),
    db=Depends(get_engine),
    current_user: dict = Depends(get_current_user),
):

    try:
        user_id = current_user["id"]

        # ----------------------------------------------------------
        # Generate userId-numeric_sequence lot number
        # ----------------------------------------------------------
        seq_query = text("""
            SELECT lot_number
            FROM user_vehicles
            WHERE user_id = :uid AND lot_number LIKE :pattern
            ORDER BY id DESC
        """)

        rows = db.execute(seq_query, {
            "uid": user_id,
            "pattern": f"{user_id}-%"
        }).fetchall()

        if rows:
            try:
                last_lot = rows[0].lot_number
                last_seq = int(last_lot.split("-")[1])
            except:
                last_seq = 0
        else:
            last_seq = 0

        new_seq = last_seq + 1
        lot_number = f"{user_id}-{new_seq:05d}"

        # ----------------------------------------------------------
        # Save uploaded images
        # ----------------------------------------------------------
        save_folder = os.path.join(DOWNLOAD_DIR, lot_number)
        os.makedirs(save_folder, exist_ok=True)

        first_image_url = None

        if files:
            for idx, file in enumerate(files, start=1):
                ext = os.path.splitext(file.filename)[-1] or ".jpg"
                filename = f"{lot_number}_Image_{idx}{ext}"
                save_path = os.path.join(save_folder, filename)

                with open(save_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                img_url = f"https://api.carflipanalyzer.com/backend/downloads/{lot_number}/{filename}"

                if first_image_url is None:
                    first_image_url = img_url

        if not first_image_url:
            first_image_url = ""

        # ----------------------------------------------------------
        # Get AI Repair & Resale Estimates
        # ----------------------------------------------------------
        from .ai_estimator import estimate_repair_cost, estimate_resale_value

        repair_est = await estimate_repair_cost(first_image_url)
        resale_est = await estimate_resale_value(year, make, model, mileage)

        # ----------------------------------------------------------
        # Insert into database (user_vehicles)
        # ----------------------------------------------------------
        insert_query = text("""
            INSERT INTO user_vehicles
            (user_id, lot_number, lot_url, year, make, model,
             damage_description, odometer, title_code, sale_name, sale_date,
             repair_estimate, resale_estimate, image_url)
            OUTPUT INSERTED.id
            VALUES
            (:user_id, :lot_number, :lot_url, :year, :make, :model,
             :damage_description, :odometer, :title_code, :sale_name, NULL,
             :repair_estimate, :resale_estimate, :image_url)
        """)

        new_id = db.execute(insert_query, {
            "user_id": user_id,
            "lot_number": lot_number,
            "lot_url": listing_url or "",
            "year": year,
            "make": make,
            "model": model,
            "damage_description": damage_description or "",
            "odometer": mileage or "",
            "title_code": title_code or "",
            "sale_name": location or "Manual",
            "repair_estimate": repair_est,
            "resale_estimate": resale_est,
            "image_url": first_image_url,
        }).scalar()

        db.commit()

        # ----------------------------------------------------------
        # Return the created record
        # ----------------------------------------------------------
        return {
            "status": "success",
            "id": new_id,
            "lot_number": lot_number,
            "image_url": first_image_url,
            "repair_estimate": repair_est,
            "resale_estimate": resale_est,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------------------------------------------------------
# DELETE VEHICLE
# --------------------------------------------------------------
@router.delete("/delete_vehicle/{vehicle_id}")
def delete_vehicle(vehicle_id: int, db=Depends(get_engine), current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["id"]

        delete_query = text("""
            DELETE FROM user_vehicles
            WHERE id = :id AND user_id = :uid
        """)

        db.execute(delete_query, {"id": vehicle_id, "uid": user_id})
        db.commit()

        return {"status": "deleted"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
