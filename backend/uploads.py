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

# Update this to your active ngrok endpoint if needed
LOCAL_TRIGGER_URL = "https://quinquevalent-hayley-unhackneyed.ngrok-free.dev/trigger"

# Restrict demo uploads
ALLOWED_IPS = {"68.186.200.184"}  # your home IP

# RDS Connection
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
    Uploads a CSV, clones existing lots for this user if they exist in DB,
    and only triggers Copart download + AI if any new lots remain.
    """
    try:
        client_ip = request.client.host
        print(f"🌐 Upload attempt from IP: {client_ip} by user {user['email']}")

        # Restrict demo uploads
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
    # Step 2: Clone existing lots or mark new ones
    # --------------------------------------------------
    try:
        df = pd.read_csv(file_path)
        new_lots = []
        cloned_lots = []

        with rds_engine.begin() as conn:
            # Debug — show headers
            print(f"🧾 CSV Columns Detected: {list(df.columns)}")

            for _, row in df.iterrows():
                lot_num = None
                # Handle multiple possible column names
                for col in ["lot_number", "lot_inv_num", "Lot", "Lot #", "Lot/Inv #"]:
                    if col in df.columns:
                        lot_num = normalize_lot(row[col])
                        break

                if not lot_num:
                    print(f"⚠️ Skipping row (no valid lot number found): {row.to_dict()}")
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
                    print(f"⏩ User {user['id']} already has lot {lot_num}, skipping.")
                    continue

                # Look for same lot in DB (any user)
                existing = conn.execute(
                    text("""
                        SELECT TOP 1 *
                        FROM user_vehicles
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
                    print(f"✅ Cloned lot {lot_num} → user {user['id']}")
                    cloned_lots.append(lot_num)
                else:
                    print(f"❌ Lot {lot_num} not found in DB for any user — will require Copart.")
                    new_lots.append(lot_num)

        print(f"✅ {len(cloned_lots)} cloned, {len(new_lots)} new for user {user['id']}")

        # --------------------------------------------------
        # Step 3: Recheck DB after cloning (SQL Server compatible)
        # --------------------------------------------------
        try:
            lot_list = [normalize_lot(l) for l in df["Lot/Inv #"] if not pd.isna(l)]
            if not lot_list:
                print("⚠️ No valid lot numbers found in CSV for recheck.")
                existing_count = 0
            else:
                # Dynamically build placeholders for SQL Server
                placeholders = ", ".join([f":lot{i}" for i in range(len(lot_list))])
                query = text(f"""
                    SELECT COUNT(*) AS cnt
                    FROM user_vehicles
                    WHERE user_id = :uid
                      AND lot_number IN ({placeholders})
                """)

                params = {"uid": user["id"]}
                for i, lot in enumerate(lot_list):
                    params[f"lot{i}"] = lot

                with rds_engine.begin() as conn:
                    existing_count = conn.execute(query, params).scalar()

            if existing_count == len(lot_list):
                print(f"🚫 All {existing_count} lots now exist for user {user['id']} — skipping Copart/AI.")
                return JSONResponse(
                    content={
                        "message": f"✅ All {existing_count} lots cloned for user {user['id']} — no new lots to process.",
                        "cloned_lots": cloned_lots,
                    }
                )

            print(f"🚀 Proceeding with Copart for remaining {len(new_lots)} lots.")

        except Exception as e:
            print(f"❌ Error during final lot existence check: {e}")
            return JSONResponse(status_code=500, content={"error": str(e)})

