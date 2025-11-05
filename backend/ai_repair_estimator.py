import os
import time
import re, json
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy import create_engine, text
from openai import OpenAI

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

DOWNLOAD_DIR = os.path.join(os.getcwd(), "downloads")
MAX_WORKERS = 5
SLEEP_BETWEEN_LOTS = 1.5

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
    Analyze a single vehicle (dict or folder) and return AI repair & resale estimates.
    """
    year = vehicle.get("year")
    make = vehicle.get("make")
    model = vehicle.get("model")
    damage = vehicle.get("damage_description", "")
    lot_number = vehicle.get("lot_number")

    prompt = f"""
You are an automotive expert. Based on the following vehicle info, estimate:
1. The repair cost in USD.
2. The expected resale value in USD after repairs.
3. Provide a short descriptive analysis for each.

Vehicle:
Year: {year}
Make: {make}
Model: {model}
Damage: {damage}

Respond ONLY in JSON format:
{{
  "repair_estimate": number,
  "repair_details": "string",
  "resale_estimate": number,
  "resale_details": "string"
}}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
    )

    raw = response.choices[0].message.content.strip()

    # 🧹 Remove code fences and language hints
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.replace("json", "", 1).strip()
    if raw.endswith("```"):
        raw = raw[:-3].strip()
    # 🧹 Clean invalid commas and currency symbols before parsing
    clean = re.sub(r'(?<=\d),(?=\d)', '', raw)   # remove commas inside numbers (e.g. 45,000 → 45000)
    clean = clean.replace('$', '')               # remove dollar signs
    clean = clean.strip()

    try:
        parsed = json.loads(clean)
    except json.JSONDecodeError as e:
        print(f"⚠️ Invalid JSON for {lot_number}: {e}\nRaw:\n{raw}")
        parsed = {
            "repair_estimate": None,
            "repair_details": raw,
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
                    SELECT TOP 1 year, make, model, damage_description
                    FROM user_vehicles
                    WHERE lot_inv_num = :lot
                """),
                {"lot": lot},
            ).fetchone()

        if not row:
            print(f"⚠️ No user_vehicles record found for lot {lot}")
            return False

        year, make, model, damage = row
        print(f"🚗 Lot {lot}: {year} {make} {model} ({damage})")

        vehicle = {
            "lot_number": lot,
            "year": year,
            "make": make,
            "model": model,
            "damage_description": damage,
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

    print(f"📦 Found {total} lots to process.")
    done = failed = 0
    start_time = time.time()

    print(f"🚀 Starting thread pool for {total} lots...")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for lot in all_folders:
            print(f"▶️ Queuing lot {lot} for processing...")
            futures.append(executor.submit(process_lot, lot, rds_engine))
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
    import sys
    if len(sys.argv) > 1:
        USER_ID = int(sys.argv[1])
    else:
        print("❌ No user ID provided. Example: python ai_repair_estimator.py 2")
        sys.exit(1)

    main(USER_ID)
