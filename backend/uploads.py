import os
import pandas as pd
from fastapi import APIRouter, UploadFile, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from .auth import get_current_user

router = APIRouter()

# Setup
UPLOAD_DIR = "/root/car-flip-analyzer/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# RDS connection
RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)

# Utility
def normalize_lot(val):
    if pd.isna(val): return ""
    val = str(val).strip()
    if val.endswith(".0"): val = val[:-2]
    return val.replace(",", "").strip()

# Upload route
@router.post("/upload_file")
async def upload_file(
    request: Request,
    file: UploadFile,
    user=Depends(get_current_user),
):
    try:
        # Save uploaded file
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())
        print(f"Saved CSV to: {file_path}")

        df = pd.read_csv(file_path)
        print("CSV Columns:", list(df.columns))

        with rds_engine.begin() as conn:
            for _, row in df.iterrows():
                lot_number = normalize_lot(row.get("Lot/Inv #", ""))
                if not lot_number:
                    print("Skipping row without Lot Number")
                    continue

                # Check if user already has this lot
                exists = conn.execute(
                    text("""
                        SELECT 1 FROM user_vehicles
                        WHERE user_id = :uid AND LTRIM(RTRIM(lot_number)) = :lot
                    """),
                    {"uid": user["id"], "lot": lot_number},
                ).fetchone()

                # Normalize fields
                def getval(col): 
                    val = row.get(col, "")
                    return str(val).strip() if pd.notna(val) else ""

                values = {
                    "user_id": user["id"],
                    "lot_url": getval("Lot URL"),
                    "lot_number": lot_number,
                    "est_retail_value": getval("Est. Retail value"),
                    "sale_date": getval("Sale date"),
                    "year": getval("Year"),
                    "make": getval("Make"),
                    "model": getval("Model"),
                    "engine_type": getval("Engine type"),
                    "cylinders": getval("Cylinders"),
                    "vin": getval("VIN"),
                    "title_code": getval("Title code"),
                    "odometer": getval("Odometer"),
                    "odometer_description": getval("Odometer description"),
                    "damage_description": getval("Damage description"),
                    "current_bid": getval("Current bid"),
                    "my_bid": getval("My bid"),
                    "item_number": getval("Item number"),
                    "sale_name": getval("Sale name"),
                    "auto_grade": getval("Auto grade"),
                    "sale_light": getval("Sale light"),
                    "announcements": getval("Announcements"),
                }

                if exists:
                    # Update existing row
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
                            WHERE user_id = :user_id AND LTRIM(RTRIM(lot_number)) = :lot_number
                        """),
                        values
                    )
                    print(f"Updated lot {lot_number} for user {user['id']}")
                else:
                    # Insert new row
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

        return {"status": "success", "rows": len(df)}

    except Exception as e:
        print("Upload failed:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})
