import os
import shutil
import datetime
import subprocess
from fastapi import APIRouter, UploadFile, Depends
from fastapi.responses import JSONResponse
from .auth import get_current_user

UPLOAD_DIR = "/root/car-flip-analyzer/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()

@router.post("/upload_file")
async def upload_and_process_file(file: UploadFile, user=Depends(get_current_user)):
    """
    1. Save uploaded file to /user_uploads
    2. Trigger Copart download + AI estimator
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

        # --- Step 2: Trigger Copart + AI estimator using the venv Python ---
        VENV_PYTHON = "/root/car-flip-analyzer/backend/venv/bin/python3"

        subprocess.Popen(
            [VENV_PYTHON, "copart_download_parallel.py", file_path, str(user["id"])],
            cwd="/root/car-flip-analyzer/backend"
        )

        subprocess.Popen(
            [VENV_PYTHON, "ai_repair_estimator.py", str(user["id"])],
            cwd="/root/car-flip-analyzer/backend"
        )

        return JSONResponse(content={
            "message": "✅ File uploaded and processing started",
            "filename": new_filename
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

