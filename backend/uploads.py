import os
import shutil
import datetime
import requests
import pandas as pd
from fastapi import APIRouter, UploadFile, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from .auth import get_current_user

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
UPLOAD_DIR = "/root/car-flip-analyzer/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

LOCAL_TRIGGER_URL = "https://quinquevalent-hayley-unhackneyed.ngrok-free.dev/trigger"
ALLOWED_IPS = {"68.186.200.184"}

# AWS RDS SQL Server connection
RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)

router = APIRouter()

# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def normalize_lot(val):
    """Normalize lot_number to clean string digits (no .0, commas, spaces)."""
    if pd.isna(val):
        return ""
    val = str(val).strip()
    if val.endswith(".0"):
        val = val[:-2]
    return val.replace(",", "").strip()

# --------------------------------------------------
# ROUTE: Upload and process CSV
# --------------------------------------------------
@router.post("/upload_file")
async def upload_and_process_file(request: Request, file: UploadFile, user=Depends(get_current_user)):
    """
    Uploads a CSV, updates or inserts user_vehicles records,
    triggers Copart for new lots, and triggers AI for any missing repair_estimates.
    """
    try:
        client_ip = request.client.host
        print(f"🌐 Upload attempt from IP: {client_ip} by user {user['email']}")

        # Restrict demo uploads from outside approved IP
        if user["email"].lower() == "demo@123.com" and client_ip not in ALLOWED_IPS:
            raise HTTPException(status_code=403, detail="Uploads restricted for demo users from this IP.")

        # --- Step 1: Save uploaded file ---
        ext = os.path.splitext(file.filename)[1]
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_email = user["email"].replace("@", "_").replace(".", "_")
        new_filename = f"{date_str}_{safe_email}{ext}"
        file_path = os.path.join(UPLOAD_DIR, new_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"📄 Saved upload to {file_path}")

    except Exception as e:
        print(f"❌ Error saving file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

    # --------------------------------------------------
    # Step 2: Insert or Update Lots
    # --------------------------------------------------
    try:
        df = pd.read_csv(file_path)
        new_lots, updated_lots, cloned_lots = [], [], []

        with rds_engine.begin() as conn:
            print(f"🧾 CSV Columns Detected: {list(df.columns)}")

            for _, row in df.iterrows():
                lot_num = None
                for col in ["lot_number", "lot_inv_num", "Lot", "Lot #", "Lot/Inv #"]:
                    if col in df.columns:
                        lot_num = normalize_lot(row[col])
                        break

                if not lot_num:
                    print(f"⚠️ Skipping row (no valid lot number): {row.to_dict()}")
                    continue

                # Already exists for current user?
                exists_user = conn.execute(
                    text("""
                        SELECT 1 FROM user_vehicles
                        WHERE LTRIM(RTRIM(lot_number)) = :lot
                          AND user_id = :uid
                    """),
                    {"lot": lot_num, "uid": user["id"]},
                ).fetchone()

                if exists_user:
                    # Update existing record (partial update)
                    conn.execute(
                        text("""
                            UPDATE user_vehicles
                            SET
                                lot_url = COALESCE(NULLIF(:lot_url, ''), lot_url),
                                est_retail_value = COALESCE(NULLIF(:retail, ''), est_retail_value),
                                sale_date = COALESCE(NULLIF(:sale_date, ''), sale_date),
                                year = COALESCE(NULLIF(:year, ''), year),
                                make = COALESCE(NULLIF(:make, ''), make),
                                model = COALESCE(NULLIF(:model, ''), model),
                                engine_type = COALESCE(NULLIF(:engine_type, ''), engine_type),
                                cylinders = COALESCE(NULLIF(:cylinders, ''), cylinders),
                                vin = COALESCE(NULLIF(:vin, ''), vin),
                                title_code = COALESCE(NULLIF(:title_code, ''), title_code),
                                odometer = COALESCE(NULLIF(:odometer, ''), odometer),
                                odometer_description = COALESCE(NULLIF(:odo_desc, ''), odometer_description),
                                damage_description = COALESCE(NULLIF(:damage_description, ''), damage_description),
                                current_bid = COALESCE(NULLIF(:current_bid, ''), current_bid),
                                my_bid = COALESCE(NULLIF(:my_bid, ''), my_bid),
                                item_number = COALESCE(NULLIF(:item_number, ''), item_number),
                                sale_name = COALESCE(NULLIF(:sale_name, ''), sale_name),
                                auto_grade = COALESCE(NULLIF(:auto_grade, ''), auto_grade),
                                sale_light = COALESCE(NULLIF(:sale_light, ''), sale_light),
                                announcements = COALESCE(NULLIF(:announcements, ''), announcements),
                                updated_at = GETDATE()
                            WHERE user_id = :uid AND LTRIM(RTRIM(lot_number)) = :lot
                        """),
                        {
                            "uid": user["id"],
                            "lot": lot_num,
                            "lot_url": str(row.get("Lot URL", "")),
                            "retail": str(row.get("Est. Retail value", "")),
                            "sale_date": str(row.get("Sale date", "")),
                            "year": str(row.get("Year", "")),
                            "make": str(row.get("Make", "")),
                            "model": str(row.get("Model", "")),
                            "engine_type": str(row.get("Engine type", "")),
                            "cylinders": str(row.get("Cylinders", "")),
                            "vin": str(row.get("VIN", "")),
                            "title_code": str(row.get("Title code", "")),
                            "odometer": str(row.get("Odometer", "")),
                            "odo_desc": str(row.get("Odometer description", "")),
                            "damage_description": str(row.get("Damage description", "")),
                            "current_bid": str(row.get("Current bid", "")),
                            "my_bid": str(row.get("My bid", "")),
                            "item_number": str(row.get("Item number", "")),
                            "sale_name": str(row.get("Sale name", "")),
                            "auto_grade": str(row.get("Auto grade", "")),
                            "sale_light": str(row.get("Sale light", "")),
                            "announcements": str(row.get("Announcements", "")),
                        },
                    )
                    updated_lots.append(lot_num)
                    continue

                # --- Clone if same lot exists for another user ---
                existing = conn.execute(
                    text("""
                        SELECT TOP 1 * FROM user_vehicles
                        WHERE REPLACE(LTRIM(RTRIM(lot_number)), ',', '') = :lot
                        ORDER BY updated_at DESC
                    """),
                    {"lot": lot_num},
                ).fetchone()

                if existing:
                    v = dict(existing._mapping)
                    conn.execute(
                        text("""
                            INSERT INTO user_vehicles (
                                user_id, lot_url, lot_number, est_retail_value, sale_date,
                                year, make, model, engine_type, cylinders, vin, title_code,
                                odometer, odometer_description, damage_description,
                                current_bid, my_bid, item_number, sale_name,
                                auto_grade, sale_light, announcements,
                                repair_estimate, repair_details, resale_details, resale_estimate,
                                created_at, updated_at, image_url
                            )
                            VALUES (
                                :uid, :url, :lot, :retail, :sale_date,
                                :year, :make, :model, :engine, :cyl, :vin, :title,
                                :odo, :odo_desc, :damage,
                                :curr_bid, :my_bid, :item_num, :sale_name,
                                :auto_grade, :sale_light, :announcements,
                                :rep_est, :rep_det, :res_det, :res_est,
                                GETDATE(), NULL, :img
                            )
                        """),
                        {
                            "uid": user["id"],
                            "url": v.get("lot_url"),
                            "lot": v.get("lot_number"),
                            "retail": v.get("est_retail_value"),
                            "sale_date": v.get("sale_date"),
                            "year": v.get("year"),
                            "make": v.get("make"),
                            "model": v.get("model"),
                            "engine": v.get("engine_type"),
                            "cyl": v.get("cylinders"),
                            "vin": v.get("vin"),
                            "title": v.get("title_code"),
                            "odo": v.get("odometer"),
                            "odo_desc": v.get("odometer_description"),
                            "damage": v.get("damage_description"),
                            "curr_bid": v.get("current_bid"),
                            "my_bid": v.get("my_bid"),
                            "item_num": v.get("item_number"),
                            "sale_name": v.get("sale_name"),
                            "auto_grade": v.get("auto_grade"),
                            "sale_light": v.get("sale_light"),
                            "announcements": v.get("announcements"),
                            "rep_est": v.get("repair_estimate"),
                            "rep_det": v.get("repair_details"),
                            "res_det": v.get("resale_details"),
                            "res_est": v.get("resale_estimate"),
                            "img": v.get("image_url"),
                        },
                    )
                    cloned_lots.append(lot_num)
                    print(f"✅ Cloned lot {lot_num} → user {user['id']}")
                else:
                    # --- Insert new placeholder ---
                    conn.execute(
                        text("""
                            INSERT INTO user_vehicles (
                                user_id, lot_number, sale_date, year, make, model,
                                damage_description, sale_name, created_at
                            )
                            VALUES (
                                :uid, :lot, :sale_date, :year, :make, :model,
                                :damage, :sale_name, GETDATE()
                            )
                        """),
                        {
                            "uid": user["id"],
                            "lot": lot_num,
                            "sale_date": str(row.get("Sale date", "")),
                            "year": str(row.get("Year", "")),
                            "make": str(row.get("Make", "")),
                            "model": str(row.get("Model", "")),
                            "damage": str(row.get("Damage description", "")),
                            "sale_name": str(row.get("Sale name", "")),
                        },
                    )
                    new_lots.append(lot_num)
                    print(f"🆕 Inserted new lot {lot_num} for user {user['id']}")

        print(f"✅ {len(cloned_lots)} cloned, {len(new_lots)} new, {len(updated_lots)} updated for user {user['id']}")

    except Exception as e:
        print(f"❌ Error processing file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

    # --------------------------------------------------
    # Step 3: Trigger Copart + AI
    # --------------------------------------------------
    try:
        copart_lots = new_lots  # new only
        ai_lots = []

        with rds_engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT lot_number
                    FROM user_vehicles
                    WHERE user_id = :uid
                      AND (repair_estimate IS NULL OR repair_estimate = '')
                """),
                {"uid": user["id"]},
            ).fetchall()
            ai_lots = [r[0] for r in rows]

        print(f"🧠 {len(ai_lots)} lots need AI | 🚗 {len(copart_lots)} lots need Copart")

        # --- Copart trigger (new only) ---
        if copart_lots:
            payload = {"user_id": user["id"], "copart_lots": copart_lots}
            print(f"🔗 Triggering Copart download: {payload}")
            response = requests.post(LOCAL_TRIGGER_URL, json=payload, timeout=25)
            if response.ok:
                print("✅ Copart downloader triggered successfully.")
            else:
                print(f"⚠️ Copart trigger returned {response.status_code}: {response.text}")

        # --- AI trigger (missing repair_estimate) ---
        if ai_lots:
            payload = {"user_id": user["id"], "ai_lots": ai_lots}
            print(f"🤖 Triggering AI estimator: {payload}")
            response = requests.post(LOCAL_TRIGGER_URL, json=payload, timeout=25)
            if response.ok:
                print("✅ AI estimator triggered successfully.")
            else:
                print(f"⚠️ AI trigger returned {response.status_code}: {response.text}")

        if not copart_lots and not ai_lots:
            print("🚫 No lots require Copart or AI processing.")

    except Exception as e:
        print(f"⚠️ Error during automation trigger step: {e}")

    return {"status": "success", "uploaded": file.filename}
