import os
import json
import time
import base64
import urllib
import random
import threading
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
    raise EnvironmentError("❌ OPENAI_API_KEY not found. Set it in your environment or .env file.")

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

DB_NAME = "cars"
SERVER = "localhost\\SQLEXPRESS"
DRIVER = "ODBC Driver 18 for SQL Server"

MAX_WORKERS = 2
MAX_IMAGES = 5
RETRY_LIMIT = 3
SLEEP_BETWEEN_LOTS = 1.5
MIN_INTERVAL = 10  # seconds between requests to stay under rate limit

client = OpenAI()
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
    )
    params = urllib.parse.quote_plus(connection_string)
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}", pool_pre_ping=True, pool_size=5)

# --------------------------------------------------
# JSON PARSER (robust)
# --------------------------------------------------
def safe_json_parse(raw):
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").replace("json", "").strip()
    try:
        return json.loads(raw.replace("'", '"'))
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start:end + 1].replace("'", '"'))
            except Exception:
                pass
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
# AI ANALYSIS (GPT-4o Vision)
# --------------------------------------------------
def analyze_vehicle(folder_path, year=None, make=None, model=None, mileage=None):
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

    prompt = (
        "You are 'Auto Mate', a professional used-car flipper and investment evaluator. "
        "Analyze the attached vehicle photos and estimate both:\n"
        "1. The minimum reasonable repair cost to make it presentable and roadworthy for resale (not showroom perfect).\n"
        "2. A short professional evaluation discussing whether this vehicle would be a good purchase for flipping — "
        "considering its visible condition, potential repair complexity, likely profitability, and resale demand.\n\n"
        f"Vehicle details:\n{vehicle_info}\n\n"
        "Respond ONLY in JSON format exactly like this:\n"
        "{\n"
        "  'repair': { 'estimate': number, 'details': 'plain-English summary of visible damage and required repairs' },\n"
        "  'evaluation': { 'summary': 'short paragraph describing whether and why this car is or isn’t a good flip candidate' }\n"
        "}"
    )

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
                    messages=[{
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}] + image_inputs
                    }],
                    max_tokens=800,
                )

            raw = response.choices[0].message.content.strip()
            parsed = safe_json_parse(raw)

            repair = parsed.get("repair", {})
            evaluation = parsed.get("evaluation", {})

            return (
                float(repair.get("estimate", 0)),
                repair.get("details", ""),
                evaluation.get("summary", "")
            )

        except Exception as e:
            err = str(e)
            if "rate limit" in err.lower() or "429" in err:
                cooldown = min(45, 5 * (2 ** attempt)) + random.uniform(0, 3)
                print(f"⏳ Rate limit hit — waiting {cooldown:.1f}s before retry...")
                time.sleep(cooldown)
                continue
            print(f"⚠️ Attempt {attempt} failed: {err}")
            time.sleep(3)

    raise RuntimeError("Max retries reached for this lot.")

# --------------------------------------------------
# LOT PROCESSING
# --------------------------------------------------
def process_lot(lot_id, engine):
    folder_path = os.path.join(DOWNLOAD_DIR, lot_id)
    if not os.path.exists(folder_path):
        print(f"⚠️ Missing folder for {lot_id}, skipping.")
        return False

    estimate_path = os.path.join(folder_path, "repair_estimate.txt")
    details_path = os.path.join(folder_path, "repair_details.txt")
    evaluation_path = os.path.join(folder_path, "evaluation.txt")

    if os.path.exists(estimate_path):
        print(f"⏭️ Skipping {lot_id} — already analyzed.")
        return True

    try:
        print(f"🧠 Analyzing vehicle for lot {lot_id} ...")
        repair_est, repair_det, evaluation_summary = analyze_vehicle(folder_path)

        # --- Write local text results ---
        with open(estimate_path, "w", encoding="utf-8") as f:
            f.write(f"{repair_est:.2f}")
        with open(details_path, "w", encoding="utf-8") as f:
            f.write(repair_det)
        with open(evaluation_path, "w", encoding="utf-8") as f:
            f.write(evaluation_summary)

        # --- Update SQL Server table ---
        try:
            with engine.begin() as conn:
                conn.execute(
                    text("""
                        UPDATE cars
                        SET repair_estimate = :repair_estimate,
                            repair_details = :repair_details,
                            evaluation = :evaluation
                        WHERE lot_url LIKE :pattern
                    """),
                    {
                        "repair_estimate": repair_est,
                        "repair_details": repair_det,
                        "evaluation": evaluation_summary,
                        "pattern": f"%{lot_id}%",
                    },
                )
            print(f"✅ {lot_id} updated: Repair ${repair_est:.0f}")
        except Exception as db_err:
            print(f"⚠️ DB update failed for {lot_id}: {db_err}")

        return True

    except Exception as e:
        print(f"❌ Error processing {lot_id}: {e}")
        return False

# --------------------------------------------------
# MAIN EXECUTION
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

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for lot in all_folders:
            futures.append(executor.submit(process_lot, lot, engine))
            time.sleep(SLEEP_BETWEEN_LOTS)

        for future in as_completed(futures):
            try:
                if future.result():
                    done += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"⚠️ Thread exception: {e}")
                failed += 1

    elapsed = time.time() - start_time
    print(f"\n✅ Summary: {done} done | {failed} failed | Elapsed {elapsed/60:.1f} min.")

if __name__ == "__main__":
    main()
