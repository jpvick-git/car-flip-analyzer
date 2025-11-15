import os
import time
import re
import json
import sys
import base64
import pandas as pd
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
# Corrected path to user_uploads
uploads_dir = os.path.join(os.path.dirname(BASE_DIR), "user_uploads")

MAX_WORKERS = 3
SLEEP_BETWEEN_LOTS = 2.0
MAX_IMAGES = 8  # up to 8 Copart photos per vehicle

# Database connection (RDS only)
RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)

# OpenAI client
client = OpenAI()
print(f"Using OpenAI key prefix: {client.api_key[:10]}...")
print("📁 Project ID: proj_yG0FqcGEaLjCW7kutLC5nG4S")

# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def extract_lot_number(value: str) -> str:
    """Extract numeric lot number from messy spreadsheet text."""
    match = re.search(r"\d{5,}", value)
    return match.group(0) if match else value.strip()

# --------------------------------------------------
# CORE ANALYSIS FUNCTION
# --------------------------------------------------

def analyze_vehicle(vehicle):
    """
    Analyze a single vehicle with AI using LOCAL image bytes (not hosted URLs).
    Returns repair/resale estimates and descriptive details.
    """
    year = vehicle.get("year")
    make = vehicle.get("make")
    model = vehicle.get("model")
    damage = vehicle.get("damage_description", "")
    lot_number = vehicle.get("lot_number")
    image_paths = vehicle.get("images", [])
    odometer_display = vehicle.get("odometer", "Unknown")
    # Normalize title type for clarity
    raw_title = vehicle.get("title_code", "Unknown")
    title_code = str(raw_title).strip().title() if raw_title else "Unknown"

    # Handle common Copart variants (normalize terms)
    if any(term in title_code.lower() for term in ["salvage", "rebuilt", "junk", "flood", "lemon"]):
        title_code = "Branded"
    elif "clean" in title_code.lower():
        title_code = "Clean"
    elif "unknown" in title_code.lower() or not title_code.strip():
        title_code = "Unknown"
    

    system_prompt = (
        "You are an experienced automotive appraiser, body shop estimator, "
        "and used-car market analyst. You evaluate salvage auction vehicles "
        "using photos and damage notes to produce realistic repair and resale estimates."
    )

    user_prompt = f"""
You are a professional automotive appraiser and auction analyst who evaluates vehicles for wholesale resale or flipping.
This vehicle was acquired from a salvage or wholesale auction.

Vehicle Info:
- Year: {year}
- Make: {make}
- Model: {model}
- Reported Damage: {damage}
- Odometer: {odometer_display}
- Title Type: {title_code}

Guidelines:
- Treat all vehicles as **non-retail ready** unless the title type explicitly states "Clean."
- If the title type is Salvage, Rebuilt, Flood, Lemon, Junk, or similar, apply appropriate discounts (typically 30–50% below clean title values).
- You may assume mileage varies within ±10,000 miles when estimating resale.
- When writing your explanation, **always reference the odometer value shown above** (never invent a different number).

From the provided photos and details, assess the following:

1. Describe visible exterior and structural damage (front, rear, sides, roof, undercarriage).
2. Identify parts that likely require replacement (e.g., bumper, hood, headlights).
3. List components that could be repaired (e.g., trim, scratches, paintless dent repair).
4. Estimate realistic labor hours for body and paint work.
5. Note any signs of frame, flood, or mechanical damage.
6. Check for missing parts, deployed airbags, or wheel/tire issues.
7. Review interior condition (seats, dash, controls, panels).
8. Estimate a conservative repair cost (parts + labor + paint).
9. Estimate a realistic **wholesale resale value**, factoring:
   - Odometer reading of {odometer_display} miles (±10k internal range)
   - Title Type: {title_code}
   - Damage severity
   - Current wholesale and auction trends
10. Provide a short expert summary assessing overall flip potential.

Return **only valid JSON** in the following structure:
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

    print(f"🖼️ Attaching up to {len(image_paths[:MAX_IMAGES])} images for lot {lot_number}...")
    for img_path in image_paths[:MAX_IMAGES]:
        try:
            with open(img_path, "rb") as f:
                img_bytes = f.read()
                img_b64 = base64.b64encode(img_bytes).decode("utf-8")

            messages[1]["content"].append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
            })
        except Exception as e:
            print(f"⚠️ Failed to attach {img_path}: {e}")

    # Send to OpenAI
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.4,
    )

    raw = response.choices[0].message.content.strip()

    # Clean up JSON (in case it’s wrapped in markdown)
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
                    SELECT TOP 1 year, make, model, damage_description, odometer, title_code, repair_estimate
                    FROM user_vehicles
                    WHERE lot_number = :lot
                """),
                {"lot": lot},
            ).fetchone()

        if not row:
            print(f"⚠️ No user_vehicles record found for lot {lot}")
            return False

        year, make, model, damage, odometer, title_code, existing_repair = row
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
            "odometer": odometer or "Unknown",
            "title_code": title_code if title_code else "Unknown",
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
                    WHERE lot_number = :lot;
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
    uploads_dir = os.path.join(os.path.dirname(BASE_DIR), "user_uploads")

    if not os.path.exists(uploads_dir):
        print("❌ No user_uploads directory found.")
        return

    csv_files = [
        os.path.join(uploads_dir, f)
        for f in os.listdir(uploads_dir)
        if f.endswith(".csv")
    ]

    if not csv_files:
        print("❌ No CSV files found in user_uploads.")
        return

    email_slug = None
    with rds_engine.connect() as conn:
        row = conn.execute(
            text("SELECT email FROM users WHERE id = :id"), {"id": user_id}
        ).fetchone()
        if row:
            email_slug = row[0].replace("@", "_").replace(".", "_")

    matching_csvs = (
        [f for f in csv_files if email_slug and email_slug in f]
        if email_slug
        else csv_files
    )

    if not matching_csvs:
        print(f"❌ No CSV found matching user {user_id} ({email_slug}).")
        return

    csv_path = max(matching_csvs, key=os.path.getmtime)
    print(f"📄 Using spreadsheet: {os.path.basename(csv_path)}")

    df = pd.read_csv(csv_path)

    preferred_cols = ["Lot/Inv #", "lot_number", "Lot # Number"]
    lot_col = next((c for c in df.columns if c.strip() in preferred_cols), None)

    if not lot_col:
        lot_col = next((c for c in df.columns if "lot" in c.lower()), None)

    lot_numbers = [extract_lot_number(x) for x in df[lot_col].dropna().astype(str).unique()]
    print(f"📦 Found {len(lot_numbers)} lots in spreadsheet.")

    done = failed = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for lot in lot_numbers:
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
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("user_id", type=int, help="User ID")
    parser.add_argument("--lots", type=str, help="Comma-separated lot numbers", default=None)
    args = parser.parse_args()

    USER_ID = args.user_id
    LOTS = args.lots.split(",") if args.lots else []

    if LOTS:
        print(f"📦 Running AI estimator for specific lots: {LOTS}")
        done = failed = 0
        start_time = time.time()

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            for lot in LOTS:
                lot = lot.strip()
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
        print(f"🎯 Completed AI analysis for user {USER_ID} (manual lots mode).")

    else:
        print(f"📦 No lot list provided — falling back to CSV detection for user {USER_ID}")
        main(USER_ID)


