import os
import time
import re
import json
import sys
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy import create_engine, text
from openai import OpenAI

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = (
    os.path.join(BASE_DIR, "downloads")
    if "backend" in BASE_DIR.lower()
    else os.path.join(BASE_DIR, "backend", "downloads")
)
MAX_WORKERS = 3
SLEEP_BETWEEN_LOTS = 2.0
MAX_IMAGES = 8  # 🧠 Use all 8 Copart photos per vehicle

# Database connection (RDS only)
RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)

# OpenAI client
client = OpenAI()
print(f"🔑 Using OpenAI key prefix: {client.api_key[:10]}...")
print("📁 Project ID: proj_yG0FqcGEaLjCW7kutLC5nG4S")

# --------------------------------------------------
# CORE ANALYSIS FUNCTION
# --------------------------------------------------

def analyze_vehicle(vehicle):
    """
    Analyze a single vehicle with AI using local images + textual data.
    Returns repair/resale estimates and descriptive details.
    """
    year = vehicle.get("year")
    make = vehicle.get("make")
    model = vehicle.get("model")
    damage = vehicle.get("damage_description", "")
    lot_number = vehicle.get("lot_number")
    image_paths = vehicle.get("images", [])

    system_prompt = (
        "You are an experienced automotive appraiser, body shop estimator, "
        "and used-car market analyst. You evaluate salvage auction vehicles "
        "using photos and damage notes to produce realistic repair and resale estimates."
    )

    user_prompt = f"""
Evaluate this vehicle in depth using both the provided information and the attached photos.
Treat this as a professional repair and resale analysis for a car flipper or dealer.

Vehicle Info:
- Year: {year}
- Make: {make}
- Model: {model}
- Reported Damage: {damage}

From the photos, assess the following:
1. Visible exterior and structural damage (front, rear, sides, roof, undercarriage).
2. Which components likely require replacement (e.g., bumper, fender, hood, headlight).
3. Which components could be repaired (e.g., paint, dents, trim).
4. Estimate paint and body labor hours required.
5. Check for signs of mechanical, flood, or frame damage.
6. Identify missing parts, deployed airbags, and tire/wheel condition.
7. Evaluate the interior condition (visible seats, dash, steering wheel).
8. Estimate total repair cost (parts + labor + paint + misc).
9. Estimate post-repair resale value considering mileage, trim, and current market.
10. Give a short expert reasoning summary mentioning damage severity and market factors.

Return ONLY valid JSON like this:
{{
  "repair_estimate": number,
  "repair_details": "string",
  "resale_estimate": number,
  "resale_details": "string"
}}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
    ]

    print(f"🖼️ Attaching up to {len(image_paths[:MAX_IMAGES])} local images for lot {lot_number}...")
    for path in image_paths[:MAX_IMAGES]:
        if os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    img_bytes = f.read()
                img_b64 = base64.b64encode(img_bytes).decode("utf-8")
                messages[1]["content"].append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                })
            except Exception as e:
                print(f"⚠️ Failed to load image {path}: {e}")

    # Send request to OpenAI
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.4,
    )

    raw = response.choices[0].message.content.strip()

    # 🧹 Sanitize JSON
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.replace("json", "", 1).strip()
    if raw.endswith("```"):
        raw = raw[:-3].strip()
    clean = re.sub(r'(?<=\d),(?=\d)', '', raw)
    clean = clean.replace('$', '').strip()

    try:
        parsed = json.loads(clean)
    except json.JSONDecodeError as e:
        print(f"⚠️ Invalid JSON for lot {lot_number}: {e}\nRaw:\n{raw}")
        parsed = {
            "repair_estimate": None,
            "repair_details": raw[:800],
            "resale_estimate": None,
            "resale_details": "",
        }

    return parsed


# --------------------------------------------------
# LOT PROCESSING FUNCTION
# --------------------------------------------------

def process_lot(lot, rds_engine):
    """Handles one vehicle lot end-to-end (read → analyze → update DB)."""
    try:
        with rds_engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT TOP 1 year, make, model, damage_description, repair_estimate
                    FROM user_vehicles
                    WHERE lot_inv_num = :lot
                """),
                {"lot": lot},
            ).fetchone()

        if not row:
            print(f"⚠️ No user_vehicles record found for lot {lot}")
            return False

        year, make, model, damage, existing_repair = row
        if existing_repair:
            print(f"⏩ Skipping lot {lot} (already analyzed)")
            return True

        print(f"🚗 Lot {lot}: {year} {make} {model} ({damage})")

        lot_dir = os.path.join(DOWNLOAD_DIR, str(lot))
        images = [
            os.path.join(lot_dir, img)
            for img in sorted(os.listdir(lot_dir))
            if img.lower().endswith((".jpg", ".jpeg", ".png"))
        ][:MAX_IMAGES]

        if not images:
            print(f"⚠️ No images found for lot {lot}")
            return False

        vehicle = {
            "lot_number": lot,
            "year": year,
            "make": make,
            "model": model,
            "damage_description": damage,
            "images": images,
        }

        ai_result = analyze_vehicle(vehicle)

        with rds_engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE user_vehicles
                    SET repair_estimate = :repair_estimate,
                        repair_details = :repair_details,
                        resale_estimate = :resale_estimate,
                        resale_details = :resale_details,
                        updated_at = GETDATE()
                    WHERE lot_inv_num = :lot;
                """),
                {
                    "lot": lot,
                    "repair_estimate": ai_result.get("repair_estimate"),
                    "repair_details": ai_result.get("repair_details"),
                    "resale_estimate": ai_result.get("resale_estimate"),
                    "resale_details": ai_result.get("resale_details"),
                },
            )

        if result.rowcount == 0:
            print(f"⚠️ No rows updated for lot {lot}")
            return False

        print(f"✅ Updated lot {lot}")
        return True

    except Exception as e:
        print(f"⚠️ Error processing lot {lot}: {e}")
        return False


# --------------------------------------------------
# MAIN BATCH EXECUTION
# --------------------------------------------------

def main(user_id: int):
    if not os.path.exists(DOWNLOAD_DIR):
        print("❌ No downloads folder found.")
        return

    all_folders = [
        folder
        for folder in os.listdir(DOWNLOAD_DIR)
        if os.path.isdir(os.path.join(DOWNLOAD_DIR, folder))
    ]

    total = len(all_folders)
    if total == 0:
        print("No lot folders found.")
        return

    print(f"📦 Found {total} lots to process for user {user_id}.")
    done = failed = 0
    start_time = time.time()

    print(f"🚀 Starting thread pool for {total} lots...")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for lot in all_folders:
            print(f"▶️ Queuing lot {lot} for AI analysis...")
            futures.append(executor.submit(process_lot, lot, rds_engine))
            time.sleep(SLEEP_BETWEEN_LOTS)

        for future in as_completed(futures):
            try:
                if future.result(timeout=600):
                    done += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"⚠️ Thread exception: {e}")
                failed += 1

    elapsed = time.time() - start_time
    print(f"\n✅ Summary: {done} done | {failed} failed | Elapsed {elapsed/60:.1f} min.")
    print(f"🎯 Completed AI analysis for user {user_id}.")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) > 1:
        USER_ID = int(sys.argv[1])
    else:
        print("❌ No user ID provided. Example: python ai_repair_estimator.py 2")
        sys.exit(1)

    main(USER_ID)
