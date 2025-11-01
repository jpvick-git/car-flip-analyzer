from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
import urllib
import threading
import os
from fastapi.staticfiles import StaticFiles
import subprocess

# --------------------------------------------------
# ODBC DRIVER PATH FIX (Render compatible)
# --------------------------------------------------
os.environ["LD_LIBRARY_PATH"] = "/opt/render/project/src/backend/odbc/usr/lib/x86_64-linux-gnu"
os.environ["ODBCINSTINI"] = "/opt/render/project/src/backend/odbc/etc/odbcinst.ini"
os.environ["ODBCSYSINI"] = "/opt/render/project/src/backend/odbc/etc"

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
# DATABASE CONFIGURATION
# --------------------------------------------------
DRIVER = "ODBC Driver 18 for SQL Server"
SERVER = os.getenv("SERVER")
DATABASE = os.getenv("DATABASE")
USERNAME = os.getenv("USERNAME")
PASSWORD = os.getenv("PASSWORD")

def get_engine():
    """Create a SQLAlchemy engine for AWS RDS SQL Server."""
    connection_string = (
        f"Driver={{{DRIVER}}};"
        f"Server={SERVER},1433;"
        f"Database={DATABASE};"
        f"Uid={USERNAME};"
        f"Pwd={PASSWORD};"
        "Encrypt=yes;"
        "TrustServerCertificate=yes;"
    )
    params = urllib.parse.quote_plus(connection_string)
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}", pool_pre_ping=True)

# --------------------------------------------------
# IMAGE CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

# Serve static car images
app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

def get_first_image(lot_id):
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
    first_image = images[0]
    return f"/downloads/{lot_id}/{first_image}"

# --------------------------------------------------
# ROUTES
# --------------------------------------------------
@app.get("/")
def root():
    return {"status": "Backend is running"}

@app.get("/test_db")
def test_db():
    """Test connection to SQL Server."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("SELECT DB_NAME(), SUSER_NAME();")).fetchone()
            return {"database": row[0], "user": row[1]}
    except Exception as e:
        return {"error": str(e)}

@app.get("/cars/with_estimates")
def get_cars_with_estimates():
    """Return cars where repair_estimate is not null, with calculated values and image URLs."""
    try:
        engine = get_engine()
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
                import re
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
# MAIN ENTRYPOINT
# --------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 10000))
    uvicorn.run("backend.backend_api:app", host="0.0.0.0", port=port)
