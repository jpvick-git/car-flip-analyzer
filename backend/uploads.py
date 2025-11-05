import os
import shutil
import datetime
import subprocess
from fastapi import APIRouter, UploadFile, Depends
from fastapi.responses import JSONResponse
from .auth import get_current_user  # correct relative import

UPLOAD_DIR = r"C:\car-flip-data\user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()

@router.post("/upload_file")
async def upload_and_process_file(file: UploadFile, user=Depends(get_current_user)):
    """
    1. Save uploaded file (with timestamp and token prefix)
    2. Trigger Copart download and AI estimator automatically
    """
    try:
        # --- Step 1: Save uploaded file ---
        ext = os.path.splitext(file.filename)[1]
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_username = user["email"].replace("@", "_").replace(".", "_")
        token_prefix = user["access_token"][:8] if "access_token" in user else "user"
        new_filename = f"{date_str}_{safe_username}_{token_prefix}{ext}"
        file_path = os.path.join(UPLOAD_DIR, new_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # --- Step 2: Trigger Copart download ---
        subprocess.Popen(
            ["python", "copart_download_parallel.py", str(user["id"])],
            cwd="C:\\car-flip-analyzer\\backend"
        )

        # --- Step 3: Trigger AI repair estimator ---
        subprocess.Popen(
            ["python", "ai_repair_estimator.py", str(user["id"])],
            cwd="C:\\car-flip-analyzer\\backend"
)


        return JSONResponse(content={
            "message": "✅ File uploaded and processing started",
            "filename": new_filename
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
