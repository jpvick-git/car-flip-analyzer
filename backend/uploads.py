import os
import threading
import pandas as pd
import requests
from fastapi import APIRouter, UploadFile, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from .auth import get_current_user, require_not_demo
from .copart_utils import resolve_make_model
from .db import get_engine

router = APIRouter()

# -----------------------------------------------------------
# CONFIG
# -----------------------------------------------------------
# Correct absolute path for your VPS
UPLOAD_DIR = "/opt/carflip/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ✅ TRIGGER FIX: Send to Localhost (our Proxy) instead of Ngrok directly.
# This lets backend_api.py handle the changing Ngrok URL.
INTERNAL_TRIGGER_URL = "http://localhost:8000/api/trigger"

# ✅ DB FIX: Use the shared engine (Postgres) instead of hardcoding credentials
rds_engine = get_engine()

# -----------------------------------------------------------
# HELPERS
# -----------------------------------------------------------
def normalize_lot(val):
    if pd.isna(val):
        return ""
    val = str(val).strip()
    if val.endswith(".0"):
        val = val[:-2]
    return val.replace(",", "").strip()


def getval(row, col):
    val = row.get(col, "")
    return str(val).strip() if pd.notna(val) else ""


# -----------------------------------------------------------
# ROUTE: UPLOAD CSV + INSERT/UPDATE LOTS + TRIGGER DOWNLOAD
# -----------------------------------------------------------
@router.post("/upload_file")
async def upload_file(
    request: Request,
    file: UploadFile,
    user=Depends(get_current_user),
):
    require_not_demo(user)
    try:
        # ------------------------------------------------------------------
        # 1. SAVE UPLOADED CSV
        # ------------------------------------------------------------------
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())

        print(f"Saved CSV upload to: {file_path}")

        df = pd.read_csv(file_path)

        # ------------------------------------------------------------------
        # 2. PROCESS CSV ROWS
        # ------------------------------------------------------------------
        with rds_engine.begin() as conn:
            for _, row in df.iterrows():

                lot_number = normalize_lot(row.get("Lot/Inv #", ""))
                if not lot_number:
                    continue

                # Check if record already exists for user
                exists = conn.execute(
                    text("""
                        SELECT 1 FROM user_vehicles
                        WHERE user_id = :uid
                          AND TRIM(lot_number) = :lot
                    """),
                    {"uid": user["id"], "lot": lot_number},
                ).fetchone()

                lot_url = getval(row, "Lot URL")
                csv_year = getval(row, "Year")
                csv_make = getval(row, "Make")
                csv_model = getval(row, "Model")
                make, model = resolve_make_model(lot_url, csv_make, csv_model, csv_year)

                values = {
                    "user_id": user["id"],
                    "lot_number": lot_number,
                    "lot_url": lot_url,
                    "est_retail_value": getval(row, "Est. Retail value"),
                    "sale_date": getval(row, "Sale date"),
                    "year": csv_year,
                    "make": make or csv_make,
                    "model": model or csv_model,
                    "engine_type": getval(row, "Engine type"),
                    "cylinders": getval(row, "Cylinders"),
                    "vin": getval(row, "VIN"),
                    "title_code": getval(row, "Title code"),
                    "odometer": getval(row, "Odometer"),
                    "odometer_description": getval(row, "Odometer description"),
                    "damage_description": getval(row, "Damage description"),
                    "current_bid": getval(row, "Current bid"),
                    "my_bid": getval(row, "My bid"),
                    "item_number": getval(row, "Item number"),
                    "sale_name": getval(row, "Sale name"),
                    "auto_grade": getval(row, "Auto grade"),
                    "sale_light": getval(row, "Sale light"),
                    "announcements": getval(row, "Announcements"),
                }

                if exists:
                    # UPDATE existing record
                    conn.execute(
                        text("""
                            UPDATE user_vehicles
                            SET
                                lot_url = :lot_url,
                                est_retail_value = :est_retail_value,
                                sale_date = :sale_date,
                                updated_at = NOW()
                            WHERE user_id = :user_id
                              AND TRIM(lot_number) = :lot_number
                        """),
                        {"lot_url": values["lot_url"], "est_retail_value": values["est_retail_value"], 
                         "sale_date": values["sale_date"], "user_id": user["id"], "lot_number": lot_number}
                    )
                else:
                    # INSERT new record
                    conn.execute(
                        text("""
                            INSERT INTO user_vehicles (
                                user_id, lot_url, lot_number, est_retail_value,
                                sale_date, year, make, model, engine_type, cylinders, vin,
                                title_code, odometer, odometer_description, damage_description,
                                current_bid, my_bid, item_number, sale_name,
                                auto_grade, sale_light, announcements,
                                created_at
                            )
                            VALUES (
                                :user_id, :lot_url, :lot_number, :est_retail_value,
                                :sale_date, :year, :make, :model, :engine_type, :cylinders, :vin,
                                :title_code, :odometer, :odometer_description, :damage_description,
                                :current_bid, :my_bid, :item_number, :sale_name,
                                :auto_grade, :sale_light, :announcements,
                                NOW()
                            )
                        """),
                        values
                    )

        # ------------------------------------------------------------------
        # 3. TRIGGER LOGIC
        # ------------------------------------------------------------------
        try:
            with rds_engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT lot_number
                        FROM user_vehicles
                        WHERE user_id = :uid
                          AND image_url IS NULL
                    """),
                    {"uid": user["id"]}
                )
                lots_to_download = [str(row[0]) for row in result]

            print("Lots needing images:", lots_to_download)

            if lots_to_download:
                print("Firing trigger in background for lots:", lots_to_download)

                def fire_trigger():
                    try:
                        resp = requests.post(
                            INTERNAL_TRIGGER_URL,
                            json={
                                "user_id": user["id"],
                                "copart_lots": lots_to_download,
                                "ai_lots": []
                            },
                            timeout=300
                        )
                        print("Trigger response:", resp.status_code)
                    except Exception as e:
                        print("Trigger error:", e)

                threading.Thread(target=fire_trigger, daemon=True).start()

        except Exception as e:
            print("Downloader trigger failed:", e)

        return {"status": "success", "rows": len(df)}

    except Exception as e:
        print("Upload failed:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})