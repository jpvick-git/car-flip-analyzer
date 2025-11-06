import os
import shutil
import datetime
import subprocess
import requests
from fastapi import APIRouter, UploadFile, Depends
from fastapi.responses import JSONResponse
from .auth import get_current_user

UPLOAD_DIR = "/root/car-flip-analyzer/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()

@router.post("/upload_file")
async def upload_and_process_file(file: UploadFile, user=Depends(get_current_user)):
    try:
        # --- Step 1: Save uploaded file on Ubuntu ---
        ext = os.path.splitext(file.filename)[1]
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_email = user["email"].replace("@", "_").replace(".", "_")
        new_filename = f"{date_str}_{safe_email}{ext}"
        file_path = os.path.join(UPLOAD_DIR, new_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"📄 Saved upload to {file_path}")

        # --- Step 2: Send the actual CSV to local machine via ngrok ---
        LOCAL_TRIGGER_URL = " https://quinquevalent-hayley-unhackneyed.ngrok-free.dev/trigger"

        try:
            with open(file_path, "rb") as f:
                files = {"file": (os.path.basename(file_path), f, "text/csv")}
                data = {"user_id": user["id"]}
                response = requests.post(LOCAL_TRIGGER_URL, data=data, files=files, timeout=30)
            print(f"🚀 Trigger sent successfully for {file_path}: {response.status_code}")
        except Exception as e:
            print(f"⚠️ Could not send trigger to local machine: {e}")

        # --- Step 3: (optional) run local scripts on Ubuntu too if needed ---
        VENV_PYTHON = "/root/car-flip-analyzer/backend/venv/bin/python3"
        subprocess.Popen(
            [VENV_PYTHON, "ai_repair_estimator.py", str(user["id"])],
            cwd="/root/car-flip-analyzer/backend"
        )

        return JSONResponse(content={
            "message": "✅ File uploaded and sent to local machine",
            "filename": new_filename
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
