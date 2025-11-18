import os
import pandas as pd
import requests
from fastapi import APIRouter, UploadFile, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from .auth import get_current_user

router = APIRouter()

# -----------------------------------------------------------
# CONFIG
# -----------------------------------------------------------
UPLOAD_DIR = "/root/car-flip-analyzer/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

LOCAL_TRIGGER_URL = "https://YOUR-NGROK-URL.ngrok-free.dev/trigger"

RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)


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
    try:
        # ------------------------------------------------------------------
        # SAVE UPLOADED CSV
        # ------------------------------------------------------------------
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())

        print(f"Saved CSV upload to: {file_path}")

        df = pd.read_csv(file_path)
        print("CSV Columns:", list(df.columns))

        # ------------------------------------------------------------------
        # PROCESS CSV ROWS: INSERT OR UPDATE VEHICLES
        # ------------------------------------------------------------------
        with rds_engine.begin() as conn:
            for _, row in df.iterrows():

                lot_number = normalize_lot(row.get("Lot/Inv #", ""))
                if not lot_number:
                    print("Skipping row with missing lot number:", row)
                    continue

                # Check if record already exists for user
                exists = conn.execute(
                    text("""
                        SELECT 1 FROM user_vehicles
                        WHERE user_id = :uid
                          AND LTRIM(RTRIM(lot_number)) = :lot
                    """),
                    {"uid": user["id"], "lot": lot_number},
                ).fetchone()

                values = {
                    "user_id": user["id"],
                    "lot_number": lot_number,
                    "lot_url": getval(row, "Lot URL"),
                    "est_retail_value": getval(row, "Est. Retail value"),
                    "sale_date": getval(row, "Sale date"),
                    "year": getval(row, "Year"),
                    "make": getval(row, "Make"),
                    "model": getval(row, "Model"),
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

                # ----------------------------------------------------------
                # UPDATE EXISTING
                # ----------------------------------------------------------
                if exists:
                    conn.execute(
                        text("""
                            UPDATE user_vehicles
                            SET
                                lot_url = :lot_url,
                                est_retail_value = :est_retail_value,
                                sale_date = :sale_date,
                                year = :year,
                                make = :make,
                                model = :model,
                                engine_type = :engine_type,
                                cylinders = :cylinders,
                                vin = :vin,
                                title_code = :title_code,
                                odometer = :odometer,
                                odometer_description = :odometer_description,
                                damage_description = :damage_description,
                                current_bid = :current_bid,
                                my_bid = :my_bid,
                                item_number = :item_number,
                                sale_name = :sale_name,
                                auto_grade = :auto_grade,
                                sale_light = :sale_light,
                                announcements = :announcements,
                                updated_at = GETDATE()
                            WHERE user_id = :user_id
                              AND LTRIM(RTRIM(lot_number)) = :lot_number
                        """),
                        values
                    )
                    print(f"Updated lot {lot_number} for user {user['id']}")

                # ----------------------------------------------------------
                # INSERT NEW RECORD
                # ----------------------------------------------------------
                else:
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
                                GETDATE()
                            )
                        """),
                        values
                    )
                    print(f"Inserted lot {lot_number} for user {user['id']}")

        # ------------------------------------------------------------------
        # AFTER PROCESSING ALL LOTS → TRIGGER COPART IMAGE DOWNLOAD
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
                print("Sending trigger payload to:", LOCAL_TRIGGER_URL)
                resp = requests.post(
                    LOCAL_TRIGGER_URL,
                    json={
                        "user_id": user["id"],
                        "copart_lots": lots_to_download,
                        "ai_lots": []
                    }
                )
                print("Trigger response:", resp.status_code, resp.text)

        except Exception as e:
            print("Downloader trigger failed:", e)

        # ------------------------------------------------------------------
        return {"status": "success", "rows": len(df)}

    except Exception as e:
        print("Upload failed:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})
