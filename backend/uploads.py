import os
import shutil
import datetime
import subprocess
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

# ✅ Add your allowed IP here
ALLOWED_IPS = {"68.186.200.184"}  # <-- Replace with your actual home/public IP

# ✅ RDS connection to fetch user info if needed
RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)

router = APIRouter()

# --------------------------------------------------
# ROUTE: Upload and process CSV
# --------------------------------------------------
@router.post("/upload_file")
async def upload_and_process_file(request: Request, file: UploadFile, user=Depends(get_current_user)):
    """
    Uploads a CSV, clones any existing cars from the DB for this user,
    and only triggers ngrok if there are new, unseen lots.
    """
    try:
        client_ip = request.client.host
        print(f"🌐 Upload attempt from IP: {client_ip} by user {user['email']}")

        # --- Step 0: Restrict demo uploads ---
        if user["email"].lower() == "demo@123.com" and client_ip not in ALLOWED_IPS:
            raise HTTPException(status_code=403, detail="Uploads are restricted for demo users from this IP.")

        # --- Step 1: Save uploaded file ---
        ext = os.path.splitext(file.filename)[1]
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_email = user["email"].replace("@", "_").replace(".", "_")
        new_filename = f"{date_str}_{safe_email}{ext}"
        file_path = os.path.join(UPLOAD_DIR, new_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"📄 Saved upload to {file_path}")

        # --- Step 2: Clone any existing cars from DB ---
        df = pd.read_csv(file_path)
        new_lots = []
        cloned_lots = []
        with rds_engine.begin() as conn:
            for _, row in df.iterrows():
                lot_num = str(row.get("lot_inv_num") or row.get("Lot") or "").strip()
                if not lot_num:
                    continue

                # Skip if this user already has it
                exists_user = conn.execute(
                    text("SELECT 1 FROM user_vehicles WHERE lot_inv_num = :lot AND user_id = :uid"),
                    {"lot": lot_num, "uid": user["id"]},
                ).fetchone()
                if exists_user:
                    continue

                # Check if any record exists for another user
                existing = conn.execute(
                    text("SELECT TOP 1 * FROM user_vehicles WHERE lot_inv_num = :lot"),
                    {"lot": lot_num},
                ).fetchone()

                if existing:
                    v = dict(existing._mapping)
                    conn.execute(
                        text("""
                            INSERT INTO user_vehicles (
                                user_id, lot_inv_num, lot_url, year, make, model,
                                odometer, damage_description, repair_estimate,
                                resale_estimate, repair_details, resale_details, image_url
                            )
                            VALUES (
                                :uid, :lot, :url, :year, :make, :model, :odo,
                                :damage, :rep_est, :res_est, :rep_det, :res_det, :img
                            )
                        """),
                        {
                            "uid": user["id"],
                            "lot": v.get("lot_inv_num"),
                            "url": v.get("lot_url"),
                            "year": v.get("year"),
                            "make": v.get("make"),
                            "model": v.get("model"),
                            "odo": v.get("odometer"),
                            "damage": v.get("damage_description"),
                            "rep_est": v.get("repair_estimate"),
                            "res_est": v.get("resale_estimate"),
                            "rep_det": v.get("repair_details"),
                            "res_det": v.get("resale_details"),
                            "img": v.get("image_url"),
                        },
                    )
                    cloned_lots.append(lot_num)
                else:
                    new_lots.append(lot_num)

        print(f"✅ Cloned {len(cloned_lots)} existing lots for user {user['id']}")
        if not new_lots:
            print("🚫 All lots already exist — skipping ngrok trigger.")
            return JSONResponse(
                content={
                    "message": f"✅ All {len(cloned_lots)} vehicles already existed and were cloned for this user.",
                    "new_lots": [],
                    "cloned_lots": cloned_lots,
                }
            )

        # --- Step 3: Only trigger ngrok for new lots ---
        try:
            print(f"📤 Sending CSV with {len(new_lots)} new lots to {LOCAL_TRIGGER_URL} ...")
            with open(file_path, "rb") as f:
                files = {"file": (os.path.basename(file_path), f, "text/csv")}
                data = {"user_id": str(user["id"])}

                resp = requests.post(LOCAL_TRIGGER_URL, data=data, files=files, timeout=30)

            if resp.status_code == 200:
                print(f"🚀 Trigger sent successfully for {file_path}")
            else:
                print(f"⚠️ Trigger failed with status {resp.status_code}: {resp.text}")

        except Exception as e:
            print(f"⚠️ Could not send trigger to local machine: {e}")

        # --- Step 4: (Optional) background AI estimator ---
        VENV_PYTHON = "/root/car-flip-analyzer/backend/venv/bin/python3"
        subprocess.Popen(
            [VENV_PYTHON, "ai_repair_estimator.py", str(user["id"])],
            cwd="/root/car-flip-analyzer/backend"
        )

        return JSONResponse(
            content={
                "message": "✅ File uploaded and new lots sent to local listener",
                "new_lots": new_lots,
                "cloned_lots": cloned_lots,
            }
        )

    except Exception as e:
        print(f"❌ Error in upload_and_process_file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
