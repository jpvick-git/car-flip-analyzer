# --------------------------------------------------
# Car Flip Analyzer Backend (Clean Build)
# --------------------------------------------------
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from dotenv import load_dotenv
import os
import time

# --------------------------------------------------
# ENV + APP CONFIG
# --------------------------------------------------
load_dotenv()
app = FastAPI(title="Car Flip Analyzer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# IMAGE CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")
print(f"📂 Serving images from: {DOWNLOAD_DIR}")


def get_first_image(lot_id: str):
    """Return the first found image for a given lot."""
    lot_id = str(lot_id).split(".")[0].strip()
    lot_folder = os.path.join(DOWNLOAD_DIR, lot_id)
    if not os.path.exists(lot_folder):
        return None

    # Prefer _Image_1.*
    for ext in (".jpg", ".jpeg", ".png"):
        candidate = f"{lot_id}_Image_1{ext}"
        path = os.path.join(lot_folder, candidate)
        if os.path.exists(path):
            return f"https://api.carflipanalyzer.com/downloads/{lot_id}/{candidate}"

    # Fallback: first image in folder
    for file in sorted(os.listdir(lot_folder)):
        if file.lower().endswith((".jpg", ".jpeg", ".png")):
            return f"https://api.carflipanalyzer.com/downloads/{lot_id}/{file}"
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
    """Quick database connection test."""
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT DB_NAME(), SUSER_NAME();")).fetchone()
            return {"database": row[0], "user": row[1]}
    except Exception as e:
        return {"error": str(e)}


# --------------------------------------------------
# DB HEALTH + INIT
# --------------------------------------------------
def wait_for_db(max_retries=5, delay=3):
    for attempt in range(1, max_retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"✅ Database connected on attempt {attempt}")
            return True
        except Exception as e:
            print(f"⏳ DB not ready (attempt {attempt}/{max_retries}): {e}")
            time.sleep(delay)
    raise RuntimeError("❌ Could not connect to the database after several attempts.")


@app.on_event("startup")
def create_tables_if_needed():
    """Ensure the user_vehicles table exists."""
    wait_for_db()
    with engine.begin() as conn:
        conn.execute(text("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_vehicles' AND xtype='U')
            CREATE TABLE user_vehicles (
                id INT IDENTITY(1,1) PRIMARY KEY,
                user_id INT NOT NULL,
                lot_number VARCHAR(50),
                lot_url NVARCHAR(MAX),
                year INT,
                make VARCHAR(100),
                model VARCHAR(100),
                damage_description NVARCHAR(MAX),
                repair_estimate DECIMAL(12,2),
                resale_estimate DECIMAL(12,2),
                repair_details NVARCHAR(MAX),
                resale_details NVARCHAR(MAX),
                created_at DATETIME DEFAULT GETDATE()
            );
        """))
    print("✅ user_vehicles table verified and ready!")


# --------------------------------------------------
# ROUTER REGISTRATION
# --------------------------------------------------
from .uploads import router as uploads_router
from .user_vehicles import router as vehicles_router
from .auth import router as auth_router

app.include_router(uploads_router)
app.include_router(vehicles_router)
app.include_router(auth_router)


# --------------------------------------------------
# MAIN ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.backend_api:app", host="0.0.0.0", port=8000)
