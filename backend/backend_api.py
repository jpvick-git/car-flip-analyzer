from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os
import re
import time

# --------------------------------------------------
# FASTAPI SETUP
# --------------------------------------------------
load_dotenv()
app = FastAPI()

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
app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")
print(f"📂 Serving images from: {DOWNLOAD_DIR}")


def get_first_image(lot_id):
    """Return the first matching image for a given lot (handles _Image_1 filenames)."""
    # Ensure lot_id is a clean string (no .0 from floats)
    lot_id = str(lot_id).split(".")[0].strip()

    lot_folder = os.path.join(DOWNLOAD_DIR, lot_id)
    if not os.path.exists(lot_folder):
        print(f"⚠️ No folder found for lot {lot_id} at {lot_folder}")
        return None

    all_files = os.listdir(lot_folder)
    print(f"📸 Files for {lot_id}: {all_files}")

    images = [
        f for f in all_files
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]
    if not images:
        print(f"⚠️ No image files found for lot {lot_id}")
        return None

    images.sort(key=lambda x: ("_image_1" not in x.lower(), x.lower()))
    chosen = f"/downloads/{lot_id}/{images[0]}"
    print(f"✅ Image found for {lot_id}: {chosen}")
    return chosen

# --------------------------------------------------
# DATABASE CONFIGURATION (SQL Server on AWS RDS)
# --------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL not set")

print(f"🌐 Connecting to {DATABASE_URL}")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"TrustServerCertificate": "yes"},
)

def get_engine():
    return engine

# --------------------------------------------------
# ROUTES
# --------------------------------------------------
@app.get("/")
def root():
    return {"status": "✅ Backend is running with SQL Server!"}

@app.get("/test_db")
def test_db():
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT DB_NAME(), SUSER_NAME();")).fetchone()
            return {"database": row[0], "user": row[1]}
    except Exception as e:
        return {"error": str(e)}

@app.get("/cars/with_estimates")
def get_cars_with_estimates():
    """Return cars where repair_estimate is not null, with calculated values and image URLs."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT
                    lot_inv_num,
                    year,
                    make,
                    model,
                    odometer,
                    damage_description,
                    est_retail_value,
                    repair_estimate,
                    lot_url,
                    repair_details,
                    resale_details
                FROM cars
                WHERE repair_estimate IS NOT NULL
            """)).fetchall()

        def to_float(value):
            """Convert to float safely, removing $, commas, and text like 'USD'."""
            if value is None:
                return 0.0
            if isinstance(value, (int, float)):
                return float(value)

            value = str(value)
            cleaned = re.sub(r"[^0-9.\-]", "", value)
            try:
                return float(cleaned) if cleaned else 0.0
            except ValueError:
                print(f"⚠️ Could not convert '{value}' to float, defaulting to 0.0")
                return 0.0

        cars = []
        for r in rows:
            lot_id = str(r[0]).split(".")[0].strip()
            resale = to_float(r[6])
            repair = to_float(r[7])
            fees = resale * 0.0725
            target_margin = 0.30
            max_bid = max(0, round(resale - (repair + fees + resale * target_margin)))
            profit = resale - (repair + fees + max_bid)
            margin = round((profit / resale * 100), 1) if resale else 0.0

            image_url = get_first_image(lot_id)

            cars.append({
                "id": lot_id,
                "year": r[1],
                "make": r[2],
                "model": r[3],
                "odometer": r[4],
                "damage": r[5],
                "resale": resale,
                "repairs": repair,
                "fees": round(fees, 2),
                "maxBid": max_bid,
                "profit": round(profit, 2),
                "margin": margin,
                "url": r[8],
                "repair_details": r[9] or "",
                "resale_details": r[10] or "",
                "image_url": image_url or "",
            })

        return {"cars": cars}

    except Exception as e:
        print("❌ Error in /cars/with_estimates:", e)
        return {"error": str(e)}


# --------------------------------------------------
# DB CONNECTION WAIT
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

# --------------------------------------------------
# AUTO TABLE CREATION
# --------------------------------------------------
@app.on_event("startup")
def create_tables_if_needed():
    wait_for_db()
    with engine.connect() as conn:
        conn.execute(text("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='cars' AND xtype='U')
            CREATE TABLE cars (
                lot_inv_num VARCHAR(50) PRIMARY KEY,
                year INT,
                make VARCHAR(100),
                model VARCHAR(100),
                odometer INT,
                damage_description VARCHAR(255),
                est_retail_value DECIMAL(12,2),
                repair_estimate DECIMAL(12,2),
                lot_url NVARCHAR(MAX),
                repair_details NVARCHAR(MAX),
                resale_details NVARCHAR(MAX)
            );
        """))
        conn.commit()
    print("✅ Cars table ready!")

# --------------------------------------------------
# MAIN ENTRYPOINT
# --------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend_api:app", host="0.0.0.0", port=8000)
