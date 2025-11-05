import os
import shutil
import datetime
import subprocess
import platform
from fastapi import APIRouter, UploadFile, Depends
from fastapi.responses import JSONResponse
from .auth import get_current_user

router = APIRouter()

# Detect OS for correct paths
if platform.system() == "Windows":
    UPLOAD_DIR = r"C:\car-flip-data\user_uploads"
    BACKEND_DIR = r"C:\car-flip-analyzer\backend"
else:
    UPLOAD_DIR = "/root/car-flip-analyzer/user_uploads"
    BACKEND_DIR = "/root/car-flip-analyzer/backend"

os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload_file")
async def upload_and_process_file(file: UploadFile, user=Depends(get_current_user)):
    try:
        # --- Step 1: Save uploaded file ---
        ext = os.path.splitext(file.filename)[1]
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_username = user["email"].replace("@", "_").replace(".", "_")
        new_filename = f"{date_str}_{safe_username}{ext}"
        file_path = os.path.join(UPLOAD_DIR, new_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # --- Step 2: Run background scripts ---
        subprocess.Popen(["python3", "copart_download_parallel.py", str(user["id"])], cwd=BACKEND_DIR)
        subprocess.Popen(["python3", "ai_repair_estimator.py", str(user["id"])], cwd=BACKEND_DIR)

        return JSONResponse(content={
            "message": "✅ File uploaded and processing started",
            "filename": new_filename
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
