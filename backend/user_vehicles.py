import os
import shutil
import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from auth import get_current_user  # ensure this import path matches your project

router = APIRouter()
UPLOAD_DIR = os.path.join(os.getcwd(), "user_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload_file")
async def upload_user_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Accept any uploaded file, rename it with date + user + token prefix,
    and save it to /user_uploads/.
    Example filename: 20251104_235910_test_example_com_7.csv
    """
    try:
        # Extract user info
        username = user.get("email") or user.get("username", "user")
        safe_username = username.replace("@", "_").replace(".", "_")

        short_token = str(user.get("id") or user.get("sub") or "anon")[:6]
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        # Original extension
        ext = os.path.splitext(file.filename)[1]

        # Build new filename with DATE FIRST
        new_filename = f"{timestamp}_{safe_username}_{short_token}{ext}"

        # Destination path
        dest_path = os.path.join(UPLOAD_DIR, new_filename)

        # Save file
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "message": "✅ File uploaded successfully",
            "saved_as": new_filename,
            "path": dest_path,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
