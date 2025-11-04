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
OPENAI_PROJECT_ID = os.getenv("OPENAI_PROJECT_ID")

if not OPENAI_API_KEY:
    raise EnvironmentError("❌ OPENAI_API_KEY not found. Make sure it’s in your environment or .env file.")

print(f"🔑 Using OpenAI key prefix: {OPENAI_API_KEY[:12]}...")
if OPENAI_PROJECT_ID:
    print(f"📁 Project ID: {OPENAI_PROJECT_ID}")

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

DB_NAME = "cars"
SERVER = "localhost\\SQLEXPRESS"
DRIVER = "ODBC Driver 18 for SQL Server"
DATABASE_URL="mssql+pyodbc:///?odbc_connect=Driver%3D%7BODBC+Driver+18+for+SQL+Server%7D%3BServer%3Dcarflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com%2C1433%3BDatabase%3Dcars%3BUid%3Dyouruser%3BPwd%3Dyourpassword%3BEncrypt%3Dyes%3BTrustServerCertificate%3Dyes%3B"

MAX_WORKERS = 2
MAX_IMAGES = 8
RETRY_LIMIT = 3
SLEEP_BETWEEN_LOTS = 1.5
MIN_INTERVAL = 10  # seconds between requests

client = OpenAI()
rate_lock = threading.Semaphore(1)
_last_request_time = 0

# --------------------------------------------------
# DATABASE CONNECTIONS
# --------------------------------------------------
def get_engine():
    """Local SQL Server (localhost\SQLEXPRESS)"""
    connection_string = (
        f"Driver={{{DRIVER}}};"
        f"Server={SERVER};"
        f"Database={DB_NAME};"
        "Trusted_Connection=yes;"
        "Encrypt=no;"
    )
    params = urllib.parse.quote_plus(connection_string)
    return create_engine(
        f"mssql+pyodbc:///?odbc_connect={params}",
        pool_pre_ping=True,   # Ensures connections are checked before use
        pool_size=5,          # Keeps up to 5 connections ready for threads
        max_overflow=10       # Allows temporary extra connections if needed
    )


def get_rds_engine():
    """AWS RDS SQL Server using DATABASE_URL from environment"""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise EnvironmentError("❌ DATABASE_URL not found. Add it to your .env file.")
    
    print("🌐 Connecting to AWS RDS database...")
    return create_engine(
        db_url,
        pool_pre_ping=True,
        connect_args={"TrustServerCertificate": "yes"},
    )


# --------------------------------------------------
# TEST THE RDS CONNECTION
# --------------------------------------------------
print("\n🔍 Testing RDS connection after security group update...")

try:
    # ✅ Create the engine before testing
    rds_engine = get_rds_engine()

    with rds_engine.connect() as conn:
        dbname = conn.execute(text("SELECT DB_NAME()")).scalar()
        print(f"✅ Connected to RDS database: {dbname}")

        # Optional: confirm record visibility
        lot_id = "40852084"
        row = conn.execute(
            text("SELECT TOP 1 lot_url, year, make, model FROM cars WHERE lot_url LIKE :pattern"),
            {"pattern": f"%{lot_id}%"},
        ).fetchone()
        if row:
            print(f"✅ Found RDS record for lot {lot_id}: {row}")
        else:
            print(f"⚠️ No RDS record found for lot {lot_id}")

except Exception as e:
    print(f"❌ Could not connect to RDS: {e}")

# --------------------------------------------------
# JSON PARSER
# --------------------------------------------------
def safe_json_parse(raw):
    """Try to extract and parse valid JSON even if wrapped or messy."""
    raw = raw.strip()

    # Remove code fences or language tags
    raw = re.sub(r"^```[a-zA-Z0-9]*", "", raw)
    raw = raw.replace("```", "").strip()

    # Remove invisible or non-ASCII whitespace
    raw = raw.encode("utf-8", "ignore").decode("utf-8", "ignore")

    # Fix common invalid numeric formats (e.g. 5,000 -> 5000)
    raw = re.sub(r"(\d),(\d)", r"\1\2", raw)

    # Attempt direct JSON load
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Fallback: extract first and last curly brace region
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        fragment = raw[start:end + 1]
        try:
            return json.loads(fragment)
        except Exception as e:
            raise ValueError(f"Invalid JSON fragment: {e}\n{fragment}")

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
# CALL 1: REPAIR ANALYSIS (IMAGES)
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
1. The minimum realistic repair cost (in USD) to make the car presentable and roadworthy (not showroom perfect).
2. A short, precise summary describing visible damage and required repairs.

Guidelines:
- Use numeric precision (e.g., 2175 not "around 2000").
- Avoid vague words like "roughly" or "approximately".
- Base labor and parts costs on typical 2025 U.S. market averages.
- Write 1–3 concise sentences for details.

Vehicle details:
{vehicle_info}

Respond ONLY in this JSON format:
{{
  "repair": {{
    "estimate": number,
    "details": "summary of visible damage and required repairs (1–3 sentences)"
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
                print(f"⏳ Rate limit hit (repair) — waiting {cooldown:.1f}s before retry...")
                time.sleep(cooldown)
                continue
            print(f"⚠️ Repair attempt {attempt} failed: {err}")
            time.sleep(3)

    raise RuntimeError("Max retries reached for repair analysis.")

# --------------------------------------------------
# CALL 2: RESALE + EVALUATION (TEXT ONLY)
# --------------------------------------------------
def analyze_resale(year, make, model, mileage, repair_est, repair_details):
    global _last_request_time

    prompt = f"""
You are "Auto Mate", a used-car market valuation analyst.

Estimate the realistic resale value and flipping potential of this vehicle,
based on the provided repair summary and vehicle details.

Vehicle:
Year: {year or 'Unknown'}
Make: {make or 'Unknown'}
Model: {model or 'Unknown'}
Mileage: {mileage or 'Unknown'}

Condition after repairs:
{repair_details}
Repair cost estimate: ${repair_est:.0f}

Guidelines:
- Provide a resale estimate in USD based on 2025 U.S. market data (KBB, Edmunds, AutoTrader trends).
- Be realistic and avoid extreme or rounded numbers.
- Write concise professional text.

Respond ONLY in this JSON format:
{{
  "resale": {{
    "estimate": number,
    "details": "brief reasoning for resale value based on mileage, condition, and market demand"
  }},
  "evaluation": {{
    "summary": "2–3 sentence summary describing if this is a good flip opportunity considering repair cost vs resale potential"
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
            evaluation = parsed.get("evaluation", {})

            return (
                float(resale.get("estimate", 0)),
                resale.get("details", ""),
                evaluation.get("summary", "")
            )

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
# MASTER ANALYSIS WRAPPER (TWO CALLS)
# --------------------------------------------------
def analyze_vehicle(folder_path, year=None, make=None, model=None, mileage=None):
    repair_est, repair_details = analyze_repair(folder_path, year, make, model, mileage)
    resale_est, resale_details, evaluation_text = analyze_resale(
        year, make, model, mileage, repair_est, repair_details
    )
    return repair_est, repair_details, resale_est, resale_details, evaluation_text

# --------------------------------------------------
# LOT PROCESSING
# --------------------------------------------------

def process_lot(lot_id, engine):
    folder_path = os.path.join(DOWNLOAD_DIR, lot_id)
    if not os.path.exists(folder_path):
        print(f"⚠️ Missing folder for {lot_id}, skipping.")
        return False

def process_lot(lot_id, local_engine, rds_engine):
    folder_path = os.path.join(DOWNLOAD_DIR, lot_id)
    if not os.path.exists(folder_path):
        print(f"⚠️ Missing folder for {lot_id}, skipping.")
        return False

    # --------------------------------------------------
    # 🧩 Fetch car info from either Local or RDS
    # --------------------------------------------------
    row = None
    for engine, label in [(local_engine, "Local"), (rds_engine, "RDS")]:
        try:
            with engine.connect() as conn:
                result = conn.execute(
                    text("SELECT TOP 1 year, make, model, odometer FROM cars WHERE lot_url LIKE :pattern"),
                    {"pattern": f"%{lot_id}%"},
                ).fetchone()
                if result:
                    row = result
                    print(f"✅ Found car info in {label} DB for lot {lot_id}: {result}")
                    break
        except Exception as e:
            print(f"⚠️ Could not fetch car info from {label} DB: {e}")

    if not row:
        print(f"⚠️ No car record found for {lot_id} in either DB, skipping.")
        return False

    year = row.year if hasattr(row, "year") else None
    make = row.make if hasattr(row, "make") else None
    model = row.model if hasattr(row, "model") else None
    mileage = row.odometer if hasattr(row, "odometer") else None

    # 🖨️ Print car info to console
    print(f"\n🚗 Lot {lot_id}: {year or 'Unknown'} {make or ''} {model or ''} ({mileage or 'N/A'} mi)")

    # --------------------------------------------------
    # 🗂️ Skip already processed lots
    # --------------------------------------------------
    estimate_path = os.path.join(folder_path, "repair_estimate.txt")
    details_path = os.path.join(folder_path, "repair_details.txt")
    resale_path = os.path.join(folder_path, "resale_details.txt")
    evaluation_path = os.path.join(folder_path, "evaluation.txt")

    if os.path.exists(estimate_path):
        print(f"⏭️ Skipping {lot_id} — already analyzed.")
        return True

    # --------------------------------------------------
    # 🔍 Run AI analysis and write results
    # --------------------------------------------------
    try:
        print(f"🧠 Analyzing vehicle for lot {lot_id} ...")
        repair_est, repair_det, resale_est, resale_det, evaluation_text = analyze_vehicle(
            folder_path, year, make, model, mileage
        )

        # 💾 Save results locally
        with open(estimate_path, "w", encoding="utf-8") as f:
            f.write(f"{repair_est:.2f}")
        with open(details_path, "w", encoding="utf-8") as f:
            f.write(repair_det)
        with open(resale_path, "w", encoding="utf-8") as f:
            f.write(resale_det)
        with open(evaluation_path, "w", encoding="utf-8") as f:
            f.write(evaluation_text)

        # --------------------------------------------------
        # 🧱 Update both Local + RDS databases
        # --------------------------------------------------
        for engine, label in [(local_engine, "Local"), (rds_engine, "RDS")]:
            try:
                with engine.begin() as conn:
                    result = conn.execute(
                        text("""
                            UPDATE cars
                            SET repair_estimate = :repair_estimate,
                                repair_details = :repair_details,
                                est_retail_value = :est_retail_value,
                                resale_details = :resale_details
                            WHERE lot_url LIKE :pattern
                        """),
                        {
                            "repair_estimate": repair_est,
                            "repair_details": repair_det,
                            "est_retail_value": resale_est,
                            "resale_details": resale_det,
                            "pattern": f"%{lot_id}%",
                        },
                    )
                print(f"✅ {label} DB updated for lot {lot_id} (rows affected: {result.rowcount})")
            except Exception as db_err:
                print(f"⚠️ {label} DB update failed for {lot_id}: {db_err}")

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

# --------------------------------------------------
# 📂 Collect all lot folders to process
# --------------------------------------------------
local_engine = get_engine()
rds_engine = get_rds_engine()

# --------------------------------------------------
# 🧹 Delete sold/expired lots from DBs and local folders
# --------------------------------------------------
cleanup_query = """
DELETE FROM cars
OUTPUT DELETED.lot_url
WHERE 
    sale_date <> 'future'
    AND TRY_CONVERT(
        DATE,
        LTRIM(RTRIM(
            REPLACE(REPLACE(REPLACE(sale_date, 'CST', ''), 'CDT', ''), 'UTC', '')
        ))
    ) < CAST(GETDATE() AS DATE);
"""

def extract_lot_id_from_url(url):
    """Return the Copart lot number from a Copart URL."""
    if not url:
        return None
    import re
    match = re.search(r'/lot/(\d+)/', url)
    return match.group(1) if match else None

deleted_lots = set()

try:
    # 🧹 Remove expired lots from LOCAL DB
    with local_engine.begin() as conn:
        result = conn.execute(text(cleanup_query))
        deleted_lots.update([extract_lot_id_from_url(row[0]) for row in result if row[0]])
        print(f"🧹 Local cleanup complete. Removed {len(deleted_lots)} records.")

    # 🧹 Remove expired lots from RDS
    with rds_engine.begin() as conn:
        result = conn.execute(text(cleanup_query))
        deleted_lots.update([extract_lot_id_from_url(row[0]) for row in result if row[0]])
        print(f"🧹 RDS cleanup complete. Removed {len(deleted_lots)} records.")

    # 🗑️ Delete local folders that match removed lots
    removed_count = 0
    for lot_id in deleted_lots:
        if not lot_id:
            continue
        folder_path = os.path.join(DOWNLOAD_DIR, lot_id)
        if os.path.exists(folder_path):
            import shutil
            shutil.rmtree(folder_path, ignore_errors=True)
            removed_count += 1
    print(f"🗑️ Deleted {removed_count} local folders for sold/expired lots.")

except Exception as e:
    print(f"⚠️ Cleanup failed: {e}")


all_folders = [
    folder
    for folder in os.listdir(DOWNLOAD_DIR)
    if os.path.isdir(os.path.join(DOWNLOAD_DIR, folder))
]

print(f"📦 Found {len(all_folders)} lots to process.")

done = 0
failed = 0

print(f"🚀 Starting thread pool for {len(all_folders)} lots...")

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    futures = []
    for lot in all_folders:
        print(f"▶️ Queuing lot {lot} for processing...")
        # pass both engines to process_lot
        futures.append(executor.submit(process_lot, lot, local_engine, rds_engine))
        time.sleep(SLEEP_BETWEEN_LOTS)

    for future in as_completed(futures):
        try:
            # use timeout to avoid indefinite hangs
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
