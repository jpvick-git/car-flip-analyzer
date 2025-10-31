from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
import urllib
import threading

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_NAME = "cars"  # name of your database
SERVER = "localhost\\SQLEXPRESS"
DRIVER = "ODBC Driver 18 for SQL Server"

MAX_WORKERS = 2
MAX_IMAGES = 5
RETRY_LIMIT = 3
SLEEP_BETWEEN_LOTS = 1.5
MIN_INTERVAL = 10  # seconds between requests to stay under rate limit

# --- optional global rate limiting for OpenAI or external APIs ---
client = None  # placeholder for your OpenAI client
rate_lock = threading.Semaphore(1)
_last_request_time = 0


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------
def get_engine():
    connection_string = (
        f"Driver={{{DRIVER}}};"
        f"Server={SERVER};"
        f"Database={DB_NAME};"
        "Trusted_Connection=yes;"
        "Encrypt=no;"
        "TrustServerCertificate=yes;"
    )
    params = urllib.parse.quote_plus(connection_string)
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}", pool_pre_ping=True, pool_size=5)


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
    """Return cars where repair_estimate is not null, with calculated values."""
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
                        repair_details
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
                "repair_details": r.repair_details if getattr(r, "repair_details", None) else "",  # ✅ add this
            })

        return {"cars": cars}

    except Exception as e:
        return {"error": str(e)}


# --------------------------------------------------
# MAIN ENTRYPOINT
# --------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend_api:app", host="127.0.0.1", port=8000, reload=True)
