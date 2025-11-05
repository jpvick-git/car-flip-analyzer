import os
import shutil
import datetime
import subprocess
from fastapi import APIRouter, UploadFile, Depends
from fastapi.responses import JSONResponse
from .auth import get_current_user

UPLOAD_DIR = "/root/car-flip-analyzer/backend/user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()

@router.post("/upload_file")
async def upload_and_process_file(file: UploadFile, user=Depends(get_current_user)):
    """
    1. Save uploaded file to backend/user_uploads
    2. Trigger Copart download + AI estimator
    """
    try:
        ext = os.path.splitext(file.filename)[1]
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        new_filename = f"{date_str}_user{user['id']}{ext}"
        file_path = os.path.join(UPLOAD_DIR, new_filename)

        # Save uploaded CSV file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Run the Copart download with the exact file path and user id
        subprocess.Popen(
            ["python3", "copart_download_parallel.py", file_path, str(user["id"])],
            cwd="/root/car-flip-analyzer/backend"
        )

        # Run the AI estimator next
        subprocess.Popen(
            ["python3", "ai_repair_estimator.py", str(user["id"])],
            cwd="/root/car-flip-analyzer/backend"
        )

        return JSONResponse(content={
            "message": "✅ File uploaded and processing started",
            "filename": new_filename
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
