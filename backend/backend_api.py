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
        "https://car-flip-analyzer-git-main-jpvick-gits-projects.vercel.app",
        "https://carflipanalyzer-git-main-jpvick-gits-projects.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"  # Temporary debug allow-all
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = "/root/car-flip-analyzer/backend/downloads"

# Ensure download directory exists
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

print(f"📂 Serving static images from: {DOWNLOAD_DIR}")

# Serve static images
app.mount("/backend/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

# Database Engine
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
            # PostgreSQL specific version check
            row = conn.execute(text("SELECT version();")).fetchone()
            return {"database": "Connected", "version": row[0]}
    except Exception as e:
        return {"error": str(e)}

# --------------------------------------------------
# TRIGGER ENDPOINT (THE PROXY FIX)
# --------------------------------------------------
# This receives a trigger from the Frontend and forwards it 
# to your Windows machine via Ngrok.
class TriggerPayload(BaseModel):
    user_id: int
    ai_lots: list[str] = []
    copart_lots: list[str] = []

@app.post("/trigger")
async def trigger_pipeline(payload: TriggerPayload):
    # ⚠️ UPDATE THIS URL whenever you restart Ngrok, or set WINDOWS_WORKER_URL in .env
    windows_worker_url = os.getenv("WINDOWS_WORKER_URL", "https://quinquevalent-hayley-unhackneyed.ngrok-free.dev")
    target_url = f"{windows_worker_url}/trigger"

    print(f"🚀 Forwarding trigger to Windows Worker: {target_url}")
    print(f"📦 Payload: {payload.dict()}")

    try:
        # Proxy the request to the Windows Machine
        resp = requests.post(target_url, json=payload.dict(), timeout=5)
        
        if resp.status_code == 200:
            return {"status": "success", "worker_response": resp.json()}
        else:
            return {"status": "error", "worker_status": resp.status_code, "detail": resp.text}

    except Exception as e:
        print(f"❌ Failed to reach Windows Worker: {e}")
        return {
            "status": "error", 
            "detail": "Could not reach Windows Worker. Check Ngrok URL.",
            "error_message": str(e)
        }

# --------------------------------------------------
# IMAGE UPLOAD RECEIVER (CRITICAL FIX)
# --------------------------------------------------
# This endpoint receives the image FROM the Windows machine
@app.post("/upload_image")
async def upload_image(lot: str = Form(...), file: UploadFile = File(...)):
    try:
        # Create lot specific directory
        lot_dir = os.path.join(DOWNLOAD_DIR, str(lot))
        os.makedirs(lot_dir, exist_ok=True)

        file_path = os.path.join(lot_dir, file.filename)

        # Save the file
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        print(f"✅ Received image for Lot {lot}: {file.filename}")
        
        # Return the public URL that React will use
        return {
            "status": "ok", 
            "path": file_path,
            "url": f"https://api.carflipanalyzer.com/backend/downloads/{lot}/{file.filename}"
        }
    except Exception as e:
        print(f"❌ Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------------------------------
# ROUTER REGISTRATION
# --------------------------------------------------
from .uploads import router as uploads_router
from .auth import router as auth_router
from .user_vehicles import router as vehicles_router
# Note: Ensure these paths exist in your folder structure
# If 'backend.routes...' fails, try using relative imports like .routes.manual_vehicle
try:
    from backend.routes.manual_vehicle import router as manual_vehicle_router
    from backend.routes.specs import router as specs_router
except ImportError:
    # Fallback for different folder structures
    from .routes.manual_vehicle import router as manual_vehicle_router
    from .routes.specs import router as specs_router

app.include_router(uploads_router)
app.include_router(auth_router)
app.include_router(manual_vehicle_router)
app.include_router(vehicles_router)
app.include_router(specs_router, prefix="/api")

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