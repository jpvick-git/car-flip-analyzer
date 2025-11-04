import os
import json
import time
import base64
import urllib
import random
import threading
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from PIL import Image
import io

# --------------------------------------------------
# LOAD ENVIRONMENT VARIABLES
# --------------------------------------------------
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise EnvironmentError("❌ OPENAI_API_KEY not found. Make sure it’s in your .env file.")

print(f"🔑 Using OpenAI key prefix: {OPENAI_API_KEY[:12]}...")

# --------------------------------------------------
# CONFIGURATION (RDS ONLY)
# --------------------------------------------------
DB_NAME = "cars"
TABLE_NAME = "cars"
SERVER = "carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433"
USERNAME = "admin"
PASSWORD = "1K0xi*rfMR!r4VN7"
DRIVER = "ODBC Driver 18 for SQL Server"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

MAX_WORKERS = 2
MAX_IMAGES = 8
RETRY_LIMIT = 3
SLEEP_BETWEEN_LOTS = 1.5
MIN_INTERVAL = 10  # seconds between API calls

params = urllib.parse.quote_plus(
    f"Driver={{{DRIVER}}};"
    f"Server={SERVER};"
    f"Database={DB_NAME};"
    f"Uid={USERNAME};"
    f"Pwd={PASSWORD};"
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
)
DATABASE_URL = f"mssql+pyodbc:///?odbc_connect={params}"

client = OpenAI()
rate_lock = threading.Semaphore(1)
_last_request_time = 0

# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------
def get_engine():
    print("🌐 Connecting to AWS RDS database...")
    return create_engine(DATABASE_URL, pool_pre_ping=True)

# --------------------------------------------------
# TEST CONNECTION
# --------------------------------------------------
try:
    engine = get_engine()
    with engine.connect() as conn:
        dbname = conn.execute(text("SELECT DB_NAME()")).scalar()
        print(f"✅ Connected to RDS database: {dbname}")
except Exception as e:
    print(f"❌ Could not connect to RDS: {e}")

# --------------------------------------------------
# JSON PARSER
# --------------------------------------------------
def safe_json_parse(raw):
    raw = raw.strip()
    raw = re.sub(r"^```[a-zA-Z0-9]*", "", raw)
    raw = raw.replace("```", "").strip()
    raw = raw.encode("utf-8", "ignore").decode("utf-8", "ignore")
    raw = re.sub(r"(\d),(\d)", r"\1\2", raw)

    try:
        return json.loads(raw)
    except Exception:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        fragment = raw[start:end + 1]
        return json.loads(fragment)
    raise ValueError(f"Invalid JSON: {raw}")

# --------------------------------------------------
# IMAGE ENCODING
# --------------------------------------------------
def encode_image(image_path):
    img = Image.open(image_path)
    img.thumbnail((1024, 1024))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

# --------------------------------------------------
# AI CALL 1: REPAIR ANALYSIS
# --------------------------------------------------
def analyze_repair(folder_path, year=None, make=None, model=None, mileage=None):
    global _last_request_time

    image_files = [
        os.path.join(folder_path, f)
        for f in os.listdir(folder_path)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ][:MAX_IMAGES]

    if not image_files:
        raise ValueError("No images found for this lot.")

    image_inputs = [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encode_image(img)}"}}
        for img in image_files
    ]

    vehicle_info = (
        f"Year: {year or 'Unknown'}\n"
        f"Make: {make or 'Unknown'}\n"
        f"Model: {model or 'Unknown'}\n"
        f"Mileage: {mileage or 'Unknown'}"
    )

    prompt = f"""
You are "Auto Mate", a professional used-car flipper and repair cost estimator.

Analyze the attached vehicle photos and estimate:
1. The minimum realistic repair cost (in USD) to make the car presentable and roadworthy.
2. A short, precise summary describing visible damage and required repairs.

Respond ONLY in this JSON format:
{{
  "repair": {{
    "estimate": number,
    "details": "summary of visible damage and required repairs"
  }}
}}
"""

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            with rate_lock:
                now = time.time()
                wait = MIN_INTERVAL - (now - _last_request_time)
                if wait > 0:
                    time.sleep(wait)
                _last_request_time = time.time()

                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "user", "content": [{"type": "text", "text": prompt}] + image_inputs}],
                    max_tokens=600,
                    temperature=0.15,
                )

            raw = response.choices[0].message.content.strip()
            parsed = safe_json_parse(raw)
            repair = parsed.get("repair", {})
            return float(repair.get("estimate", 0)), repair.get("details", "")
        except Exception as e:
            err = str(e)
            if "rate limit" in err.lower() or "429" in err:
                cooldown = min(45, 5 * (2 ** attempt)) + random.uniform(0, 3)
                print(f"⏳ Rate limit hit — waiting {cooldown:.1f}s before retry...")
                time.sleep(cooldown)
                continue
            print(f"⚠️ Repair attempt {attempt} failed: {err}")
            time.sleep(3)
    raise RuntimeError("Max retries reached for repair analysis.")

# --------------------------------------------------
# AI CALL 2: RESALE ANALYSIS
# --------------------------------------------------
def analyze_resale(year, make, model, mileage, repair_est, repair_details):
    global _last_request_time

    prompt = f"""
You are "Auto Mate", a used-car market valuation analyst.

Estimate the realistic resale value of this vehicle based on the following details:

Vehicle Information:
- Year: {year or 'Unknown'}
- Make: {make or 'Unknown'}
- Model: {model or 'Unknown'}
- Mileage: {mileage or 'Unknown'}
- Estimated repair cost: ${repair_est:.0f}
- Repair summary: {repair_details}

Guidelines:
- Use realistic U.S. 2025 market data trends (KBB, Edmunds, AutoTrader).
- Avoid extreme or rounded numbers; use a fair market estimate.
- Keep reasoning short and professional.

Respond ONLY in this JSON format:
{{
  "resale": {{
    "estimate": number,
    "details": "brief reasoning for resale value based on condition and market demand"
  }}
}}
"""

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            with rate_lock:
                now = time.time()
                wait = MIN_INTERVAL - (now - _last_request_time)
                if wait > 0:
                    time.sleep(wait)
                _last_request_time = time.time()

                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}],
                    max_tokens=600,
                    temperature=0.25,
                )

            raw = response.choices[0].message.content.strip()
            parsed = safe_json_parse(raw)
            resale = parsed.get("resale", {})

            # Fallback if the model responds with plain text
            if not resale or "estimate" not in resale:
                raise ValueError(f"Invalid resale JSON: {raw}")

            return float(resale.get("estimate", 0)), resale.get("details", "")

        except Exception as e:
            err = str(e)
            if "rate limit" in err.lower() or "429" in err:
                cooldown = min(45, 5 * (2 ** attempt)) + random.uniform(0, 3)
                print(f"⏳ Rate limit hit (resale) — waiting {cooldown:.1f}s before retry...")
                time.sleep(cooldown)
                continue
            print(f"⚠️ Resale attempt {attempt} failed: {err}")
            time.sleep(3)
    raise RuntimeError("Max retries reached for resale analysis.")
# --------------------------------------------------
# MASTER ANALYSIS
# --------------------------------------------------
def analyze_vehicle(folder_path, year=None, make=None, model=None, mileage=None):
    repair_est, repair_details = analyze_repair(folder_path, year, make, model, mileage)
    resale_est, resale_details = analyze_resale(year, make, model, mileage, repair_est, repair_details)
    return repair_est, repair_details, resale_est, resale_details

# --------------------------------------------------
# LOT PROCESSING
# --------------------------------------------------
def process_lot(lot_id, engine):
    folder_path = os.path.join(DOWNLOAD_DIR, lot_id)
    if not os.path.exists(folder_path):
        print(f"⚠️ Missing folder for {lot_id}, skipping.")
        return False

    # Fetch car info from RDS
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT TOP 1 year, make, model, odometer FROM cars WHERE lot_url LIKE :pattern"),
                {"pattern": f"%{lot_id}%"},
            ).fetchone()
        if not row:
            print(f"⚠️ No record found for lot {lot_id}")
            return False
    except Exception as e:
        print(f"⚠️ Error fetching car info for {lot_id}: {e}")
        return False

    year, make, model, mileage = row.year, row.make, row.model, row.odometer
    print(f"🚗 Lot {lot_id}: {year or 'Unknown'} {make or ''} {model or ''} ({mileage or 'N/A'} mi)")

    try:
        repair_est, repair_det, resale_est, resale_det = analyze_vehicle(folder_path, year, make, model, mileage)

        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE cars
                    SET repair_estimate = :repair_estimate,
                        repair_details = :repair_details,
                        est_retail_value = :est_retail_value
                    WHERE lot_url LIKE :pattern
                """),
                {
                    "repair_estimate": repair_est,
                    "repair_details": repair_det,
                    "est_retail_value": resale_est,
                    "pattern": f"%{lot_id}%",
                },
            )
        print(f"✅ RDS DB updated for lot {lot_id} (rows affected: {result.rowcount})")
        return True

    except Exception as e:
        print(f"❌ Error processing {lot_id}: {e}")
        return False

# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main():
    if not os.path.exists(DOWNLOAD_DIR):
        print("❌ No downloads folder found.")
        return

    all_folders = [f for f in os.listdir(DOWNLOAD_DIR) if os.path.isdir(os.path.join(DOWNLOAD_DIR, f))]
    total = len(all_folders)
    if total == 0:
        print("No lot folders found.")
        return

    print(f"📦 Found {total} lots to process.")
    engine = get_engine()

    done = failed = 0
    start_time = time.time()

    print(f"🚀 Starting thread pool for {total} lots...")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for lot in all_folders:
            print(f"▶️ Queuing lot {lot} for processing...")
            futures.append(executor.submit(process_lot, lot, engine))
            time.sleep(SLEEP_BETWEEN_LOTS)

        for future in as_completed(futures):
            try:
                if future.result(timeout=300):
                    done += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"⚠️ Thread exception: {e}")
                failed += 1

    elapsed = time.time() - start_time
    print(f"\n✅ Summary: {done} done | {failed} failed | Elapsed {elapsed/60:.1f} min.")

# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    main()
