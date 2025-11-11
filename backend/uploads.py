import os
import shutil
import datetime
import subprocess
import requests
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
async def upload_and_process_file(
    file: UploadFile,
    user=Depends(get_current_user),
    request: Request
):
    """
    1. Save uploaded file to /user_uploads
    2. Trigger Copart download on Windows via ngrok
    3. Run AI estimator (optional, local)
    4. Restrict demo uploads to owner IP only
    """
    try:
        client_ip = request.client.host
        print(f"🌐 Upload attempt from IP: {client_ip} by user {user['email']}")

        # --- Step 0: Restrict demo uploads ---
        if user["email"].lower() == "demo@123.com" and client_ip not in ALLOWED_IPS:
            print(f"🚫 Blocked unauthorized upload for demo user from IP: {client_ip}")
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

        # --- Step 2: Send the actual CSV to local Windows machine via ngrok ---
        try:
            print(f"📤 Sending CSV to {LOCAL_TRIGGER_URL} ...")

            with open(file_path, "rb") as f:
                files = {"file": (os.path.basename(file_path), f, "text/csv")}
                data = {"user_id": str(user["id"])}

                resp = requests.post(
                    LOCAL_TRIGGER_URL,
                    data=data,
                    files=files,
                    timeout=30
                )

            if resp.status_code == 200:
                print(f"🚀 Trigger sent successfully for {file_path}")
            else:
                print(f"⚠️ Trigger failed with status {resp.status_code}: {resp.text}")

        except Exception as e:
            print(f"⚠️ Could not send trigger to local machine: {e}")

        # --- Step 3: Optionally run local processing (if enabled) ---
        VENV_PYTHON = "/root/car-flip-analyzer/backend/venv/bin/python3"
        subprocess.Popen(
            [VENV_PYTHON, "ai_repair_estimator.py", str(user["id"])],
            cwd="/root/car-flip-analyzer/backend"
        )

        return JSONResponse(content={
            "message": "✅ File uploaded and processing started",
            "filename": new_filename
        })

    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"error": e.detail})

    except Exception as e:
        print(f"❌ Error in upload_and_process_file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
