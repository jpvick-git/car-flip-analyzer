import os
import shutil
import datetime
import subprocess
import requests
from fastapi import APIRouter, UploadFile, Depends
from fastapi.responses import JSONResponse
from .auth import get_current_user

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
UPLOAD_DIR = "/root/car-flip-analyzer/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

LOCAL_TRIGGER_URL = "https://quinquevalent-hayley-unhackneyed.ngrok-free.dev/trigger"

router = APIRouter()

# --------------------------------------------------
# ROUTE: Upload and process CSV
# --------------------------------------------------
@router.post("/upload_file")
async def upload_and_process_file(file: UploadFile, user=Depends(get_current_user)):
    """
    1. Save uploaded file to /user_uploads
    2. Trigger Copart download on Windows via ngrok
    3. Run AI estimator (optional, local)
    """
    try:
        # --- Step 1: Save uploaded file ---
        ext = os.path.splitext(file.filename)[1]
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        # Create a readable + unique filename
        safe_email = user["email"].replace("@", "_").replace(".", "_")
        token_fragment = user.get("access_token", "no_token")[:8]
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
                    data=data,          # form fields
                    files=files,        # attach CSV
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

    except Exception as e:
        print(f"❌ Error in upload_and_process_file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
