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
# DATABASE
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
# IMAGE ENCODING
# --------------------------------------------------
def encode_image(image_path):
    """Convert image to base64 for API upload."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


# --------------------------------------------------
# JSON SANITIZER
# --------------------------------------------------
def safe_json_parse(raw):
    """Safely extract JSON from model output even if wrapped in code fences."""
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
# AI ESTIMATION (Combined Vision + Resale)
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

    # Base64 encode & compress
    def encode_image(image_path, max_size_kb=500):
        from PIL import Image
        import io, base64
        img = Image.open(image_path)
        img.thumbnail((1024, 1024))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    image_inputs = [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{encode_image(img)}"}
        }
        for img in image_files
    ]

    vehicle_info = (
        f"Year: {year or 'Unknown'}\n"
        f"Make: {make or 'Unknown'}\n"
        f"Model: {model or 'Unknown'}\n"
        f"Mileage: {mileage or 'Unknown'}"
    )

    prompt = (
        "You are 'Auto Mate', a professional used-car appraiser and repair estimator. "
        "Analyze the attached vehicle photos and estimate both:\n"
        "1. The minimum reasonable repair cost to make it presentable and roadworthy for resale (not showroom perfect).\n"
        "2. The current resale value range (low, high, average) assuming the repairs are completed.\n\n"
        f"Vehicle details:\n{vehicle_info}\n\n"
        "Respond ONLY in JSON format exactly like this:\n"
        "{\n"
        "  'repair': { 'estimate': number, 'details': 'plain-English summary of visible damage and required repairs' },\n"
        "  'resale': { 'low': number, 'high': number, 'average': number, 'details': 'summary of value factors and reasoning' }\n"
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
                    model="gpt-4o",  # ✅ Vision-enabled model
                    messages=[{
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}] + image_inputs
                    }],
                    max_tokens=800,
                )

            raw = response.choices[0].message.content.strip()

            # Handle text-only fallback if GPT-4o vision is somehow unavailable
            if "unable to analyze images" in raw.lower():
                raise RuntimeError("Model returned vision-disabled response.")

            parsed = safe_json_parse(raw)

            repair = parsed.get("repair", {})
            resale = parsed.get("resale", {})

            return (
                float(repair.get("estimate", 0)),
                repair.get("details", ""),
                float(resale.get("average", 0)),
                resale.get("details", ""),
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
    """Process a single lot folder — analyze, save results, update DB."""
    folder_path = os.path.join(DOWNLOAD_DIR, lot_id)
    if not os.path.exists(folder_path):
        print(f"⚠️ Missing folder for {lot_id}, skipping.")
        return False

    estimate_path = os.path.join(folder_path, "repair_estimate.txt")
    details_path = os.path.join(folder_path, "repair_details.txt")
    resale_path = os.path.join(folder_path, "resale_estimate.txt")

    if os.path.exists(estimate_path):
        print(f"⏭️ Skipping {lot_id} — already analyzed.")
        return True

    try:
        print(f"🧠 Analyzing vehicle for lot {lot_id} ...")
        repair_est, repair_det, resale_avg, resale_det = analyze_vehicle(folder_path)

        # --- Write local text results ---
        with open(estimate_path, "w", encoding="utf-8") as f:
            f.write(f"{repair_est:.2f}")
        with open(details_path, "w", encoding="utf-8") as f:
            f.write(repair_det)
        with open(resale_path, "w", encoding="utf-8") as f:
            f.write(f"{resale_avg:.2f}\n{resale_det}")

        # --- Update SQL Server table ---
        try:
            with engine.begin() as conn:
                conn.execute(
                    text("""
                        UPDATE cars
                        SET repair_estimate = :repair_estimate,
                            repair_details = :repair_details,
                            est_retail_value = :resale_estimate,
                            resale_details = :resale_details
                        WHERE lot_url LIKE :pattern
                    """),
                    {
                        "repair_estimate": repair_est,
                        "repair_details": repair_det,
                        "resale_estimate": resale_avg,
                        "resale_details": resale_det,
                        "pattern": f"%{lot_id}%",
                    },
                )
            print(f"✅ {lot_id} updated: Repair ${repair_est:.0f} | Resale ${resale_avg:.0f}")
        except Exception as db_err:
            print(f"⚠️ DB update failed for {lot_id}: {db_err}")

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

    all_folders = [
        f for f in os.listdir(DOWNLOAD_DIR)
        if os.path.isdir(os.path.join(DOWNLOAD_DIR, f))
    ]
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
