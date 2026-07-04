# backend/user_vehicles.py

import os
import shutil
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy import text
from .db import get_engine
from .auth import get_current_user
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
