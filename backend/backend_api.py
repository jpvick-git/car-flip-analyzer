# --------------------------------------------------
# Car Flip Analyzer Backend (Clean Build)
# --------------------------------------------------
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from dotenv import load_dotenv
from pydantic import BaseModel
import subprocess
import os
import time



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
        "https://car-flip-analyzer-git-main-jpvick-gits-projects.vercel.app",
        "https://carflipanalyzer-git-main-jpvick-gits-projects.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# IMAGE CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = "/root/car-flip-analyzer/backend/downloads"

print(f"📂 Serving static images from: {DOWNLOAD_DIR}")

# Serve static images
app.mount("/backend/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")


def get_first_image(lot_id: str):
    lot_id = str(lot_id).split(".")[0].strip()
    lot_folder = os.path.join(DOWNLOAD_DIR, lot_id)

    if not os.path.exists(lot_folder):
        return None

    for ext in (".jpg", ".jpeg", ".png"):
        candidate = f"{lot_id}_Image_1{ext}"
        path = os.path.join(lot_folder, candidate)
        if os.path.exists(path):
            return f"https://api.carflipanalyzer.com/backend/downloads/{lot_id}/{candidate}"

    for file in sorted(os.listdir(lot_folder)):
        if file.lower().endswith((".jpg", ".jpeg", ".png")):
            return f"https://api.carflipanalyzer.com/backend/downloads/{lot_id}/{file}"

    return None


# --------------------------------------------------
# DATABASE CONFIGURATION
# --------------------------------------------------
from .db import get_engine
engine = get_engine()


# --------------------------------------------------
# BASIC ROUTES
# --------------------------------------------------
@app.get("/")
def root():
    return {"status": "✅ Backend is running and serving images!"}


@app.get("/test_db")
def test_db():
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT DB_NAME(), SUSER_NAME();")).fetchone()
            return {"database": row[0], "user": row[1]}
    except Exception as e:
        return {"error": str(e)}


# --------------------------------------------------
# TRIGGER ENDPOINT
# --------------------------------------------------
class TriggerPayload(BaseModel):
    user_id: int
    ai_lots: list[str] = []
    copart_lots: list[str] = []


@app.post("/trigger")
async def trigger_pipeline(payload: TriggerPayload):
    user_id = payload.user_id
    ai_lots = payload.ai_lots
    copart_lots = payload.copart_lots

    print(f"🚀 Trigger received for user {user_id}")
    print(f"🧠 AI Lots: {ai_lots} | 🚗 Copart Lots: {copart_lots}")

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    try:
        # Copart downloader
        if copart_lots:
            copart_str = ",".join(copart_lots)
            subprocess.Popen([
                "/root/car-flip-analyzer/backend/venv/bin/python",
                "/root/car-flip-analyzer/backend/copart_download_parallel.py",
                str(user_id),
                "--lots", copart_str,
                "--download"
            ])

        # AI estimator
        if ai_lots:
            ai_str = ",".join(ai_lots)
            subprocess.Popen([
                "/root/car-flip-analyzer/backend/venv/bin/python",
                "/root/car-flip-analyzer/backend/ai_repair_estimator.py",
                str(user_id),
                "--lots", ai_str
            ])

        return {"status": "success"}

    except Exception as e:
        return {"error": str(e)}


# --------------------------------------------------
# ROUTER REGISTRATION
# --------------------------------------------------
from .uploads import router as uploads_router
from .user_vehicles import router as vehicles_router
from .auth import router as auth_router
from backend.routes.manual_vehicle import router as manual_vehicle_router
from backend.routes.carquery import router as carquery_router
from backend.routes.nhtsa import router as nhtsa_router
from backend.routers.specs import router as specs_router



# REGISTER ALL ROUTERS HERE EXACTLY ONE TIME
app.include_router(uploads_router)
app.include_router(vehicles_router)
app.include_router(auth_router)
app.include_router(manual_vehicle_router)
app.include_router(carquery_router)
app.include_router(nhtsa_router)
app.include_router(specs_router, prefix="/api")

# --------------------------------------------------
# MAIN ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.backend_api:app", host="0.0.0.0", port=8000)
