from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from fastapi.staticfiles import StaticFiles
import os
import re
import time

# --------------------------------------------------
# FASTAPI SETUP
# --------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# DATABASE CONFIGURATION (SQL Server on AWS RDS)
# --------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL not set")

print(f"🌐 Connecting to {DATABASE_URL}")

# ✅ SQL Server requires ODBC Driver 18 and uses TrustServerCertificate for SSL
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"TrustServerCertificate": "yes"},
)

def get_engine():
    """Return the global database engine."""
    return engine


# --------------------------------------------------
# IMAGE CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

def get_first_image(lot_id: str):
    """Return the first matching image for a given lot."""
    lot_folder = os.path.join(DOWNLOAD_DIR, str(lot_id))
    if not os.path.exists(lot_folder):
        return None
    images = [
        f for f in os.listdir(lot_folder)
        if f.lower().startswith(str(lot_id).lower()) and f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]
    if not images:
        return None
    images.sort()
    return f"/downloads/{lot_id}/{images[0]}"


# --------------------------------------------------
# ROUTES
# --------------------------------------------------
@app.get("/")
def root():
    return {"status": "✅ Backend is running with SQL Server!"}


@app.get("/test_db")
def test_db():
    """Test connection to SQL Server database."""
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
            rows = conn.execute(
                text("""
                    SELECT
                        lot_inv_num AS lot_number,
                        year,
                        make,
                        model,
                        odometer,
                        damage_description AS damage,
                        est_retail_value AS resale_value,
                        repair_estimate,
                        lot_url,
                        repair_details,
                        resale_details
                    FROM cars
                    WHERE repair_estimate IS NOT NULL
                """)
            ).fetchall()

        cars = []
        for r in rows:
            def to_float(v):
                if not v:
                    return 0.0
                if isinstance(v, (int, float)):
                    return float(v)
                num = re.sub(r"[^0-9.]", "", str(v))
                return float(num) if num else 0.0

            resale = to_float(r.resale_value)
            repair = to_float(r.repair_estimate)
            fees = resale * 0.0725
            target_margin = 0.30
            max_bid = max(0, round(resale - (repair + fees + resale * target_margin)))
            profit = resale - (repair + fees + max_bid)
            margin = round((profit / resale * 100), 1) if resale else 0.0
            image_url = get_first_image(r.lot_number)

            cars.append({
                "id": r.lot_number,
                "year": r.year,
                "make": r.make,
                "model": r.model,
                "odometer": r.odometer,
                "damage": r.damage,
                "resale": resale,
                "repairs": repair,
                "fees": round(fees, 2),
                "maxBid": max_bid,
                "profit": round(profit, 2),
                "margin": margin,
                "url": r.lot_url,
                "repair_details": r.repair_details or "",
                "resale_details": r.resale_details or "",
                "image_url": image_url or "",
            })

        return {"cars": cars}

    except Exception as e:
        return {"error": str(e)}


# --------------------------------------------------
# DB CONNECTION WAIT
# --------------------------------------------------
def wait_for_db(max_retries=5, delay=3):
    """Wait for the database to be ready before continuing startup."""
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
    port = int(os.getenv("PORT", 10000))
    uvicorn.run("backend_api:app", host="0.0.0.0", port=port)
