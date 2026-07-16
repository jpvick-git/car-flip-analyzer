# --------------------------------------------------
# Car Flip Analyzer Backend (Clean Build)
# --------------------------------------------------
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from dotenv import load_dotenv
from pydantic import BaseModel
import requests
import shutil
import os

# --------------------------------------------------
# ENV + APP CONFIG
# --------------------------------------------------
load_dotenv()
app = FastAPI(title="Car Flip Analyzer API", version="0.1.0")

# --------------------------------------------------
# CORS
# --------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.carflipanalyzer.com",
        "https://carflipanalyzer.com",
        "http://159.65.160.82",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = "/opt/carflip/backend/downloads"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

print(f"Serving static images from: {DOWNLOAD_DIR}")

app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

from .db import get_engine
engine = get_engine()

# --------------------------------------------------
# BASIC ROUTES
# --------------------------------------------------
@app.get("/")
def root():
    return {"status": "Backend is running"}

@app.get("/api/test_db")
def test_db():
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version();")).fetchone()
            return {"database": "Connected", "version": row[0]}
    except Exception as e:
        return {"error": str(e)}

# --------------------------------------------------
# TRIGGER ENDPOINT
# --------------------------------------------------
import subprocess
from datetime import datetime

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_DIR = os.path.join(BACKEND_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

PYTHON_PATH = "/opt/carflip-env/bin/python3"
COPART_SCRIPT = os.path.join(BACKEND_DIR, "copart_download_parallel.py")
AI_SCRIPT = os.path.join(BACKEND_DIR, "ai_repair_estimator.py")

class TriggerPayload(BaseModel):
    user_id: int
    ai_lots: list[str] = []
    copart_lots: list[str] = []

@app.post("/api/trigger")
async def trigger_pipeline(payload: TriggerPayload):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    launched = []

    try:
        if payload.copart_lots:
            log_file = os.path.join(LOGS_DIR, f"copart_{payload.user_id}_{timestamp}.log")
            with open(log_file, "w") as lf:
                subprocess.Popen(
                    [
                        "xvfb-run", "--auto-servernum",
                        PYTHON_PATH,
                        COPART_SCRIPT,
                        str(payload.user_id),
                        "--lots", ",".join(payload.copart_lots),
                        "--download"
                    ],
                    cwd=BACKEND_DIR,
                    stdout=lf,
                    stderr=lf,
                    env={**os.environ, "DISPLAY": ":99"}
                )
            launched.append("copart")

        if payload.ai_lots:
            log_file = os.path.join(LOGS_DIR, f"ai_{payload.user_id}_{timestamp}.log")
            with open(log_file, "w") as lf:
                subprocess.Popen(
                    [
                        PYTHON_PATH,
                        AI_SCRIPT,
                        str(payload.user_id),
                        "--lots", ",".join(payload.ai_lots)
                    ],
                    cwd=BACKEND_DIR,
                    stdout=lf,
                    stderr=lf
                )
            launched.append("ai")

        return {"status": "success", "launched": launched}

    except Exception as e:
        print(f"Trigger error: {e}")
        return {"status": "error", "detail": str(e)}

# --------------------------------------------------
# IMAGE UPLOAD
# --------------------------------------------------
@app.post("/api/upload_image")
async def upload_image(lot: str = Form(...), file: UploadFile = File(...)):
    try:
        lot_dir = os.path.join(DOWNLOAD_DIR, str(lot))
        os.makedirs(lot_dir, exist_ok=True)
        file_path = os.path.join(lot_dir, file.filename)
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        return {
            "status": "ok",
            "path": file_path,
            "url": f"https://carflipanalyzer.com/downloads/{lot}/{file.filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------------------------------
# ROUTER REGISTRATION
# --------------------------------------------------
from .uploads import router as uploads_router
from .auth import router as auth_router
from .user_vehicles import router as vehicles_router
try:
    from .routes.manual_vehicle import router as manual_vehicle_router
    from .routes.specs import router as specs_router
except ImportError:
    manual_vehicle_router = None
    specs_router = None

app.include_router(uploads_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(vehicles_router, prefix="/api")
if manual_vehicle_router:
    app.include_router(manual_vehicle_router, prefix="/api")
if specs_router:
    app.include_router(specs_router, prefix="/api")

from .user_settings import router as settings_router
app.include_router(settings_router, prefix="/api")

from .admin_routes import router as admin_router
app.include_router(admin_router, prefix="/api")

# --------------------------------------------------
# UVICORN SERVER START
# --------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend_api:app",
        host="0.0.0.0",
        port=8000,
        reload=False
    )
