import os
import re
import sys
import time
import zipfile
import shutil
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine, text

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = (
    os.path.join(BASE_DIR, "downloads")
    if "backend" in BASE_DIR.lower()
    else os.path.join(BASE_DIR, "backend", "downloads")
)
UPLOADS_DIR = (
    os.path.join(os.path.dirname(BASE_DIR), "user_uploads")
    if "backend" in BASE_DIR.lower()
    else os.path.join(BASE_DIR, "user_uploads")
)

SERVER = "carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433"
DB_NAME = "cars"
USERNAME = "jpvick-git"
PASSWORD = "Nk^+Cq4MfUNt%8q"
DRIVER = "ODBC Driver 18 for SQL Server"

MAX_WORKERS = 2  # parallel browser threads
SLEEP_BETWEEN_LOTS = 2.5
PLAYWRIGHT_TIMEOUT = 45_000

# SQLAlchemy connection
CONN_STR = (
    f"mssql+pyodbc://{USERNAME}:{PASSWORD}@{SERVER}/{DB_NAME}"
    f"?driver={DRIVER}&Encrypt=yes&TrustServerCertificate=yes"
)
engine = create_engine(CONN_STR, pool_pre_ping=True)

# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def extract_lot_number(value: str) -> str:
    """Extract 6–8 digit Copart lot number from text or URL."""
    if pd.isna(value):
        return None
    match = re.search(r"\b(\d{6,8})\b", str(value))
    return match.group(1) if match else str(value).strip()


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


# --------------------------------------------------
# CSV IMPORT
# --------------------------------------------------
def import_csv_to_db(csv_path: str, user_id: int) -> None:
    """
    Load the Copart LotSearchresults CSV into user_vehicles (upsert).
    Updates existing lots for this user, inserts new ones if missing.
    """
    df = pd.read_csv(csv_path)
    print(f"📦 Loaded {len(df)} rows from {os.path.basename(csv_path)}")

    # Normalize headers
    df.columns = (
        df.columns.str.strip()
        .str.lower()
        .str.replace(" ", "_")
        .str.replace("/", "_")
        .str.replace(r"[^\w_]", "", regex=True)
    )

    # Expected Copart headers
    # lot_url, lot_inv_, est_retail_value, sale_date, year, make, model,
    # engine_type, cylinders, vin, title_code, odometer, odometer_description,
    # damage_description, current_bid, my_bid, item_number,
    # sale_name, auto_grade, sale_light, announcements
    rename_map = {
        "lot_url": "lot_url",
        "lot_inv_": "lot_number",
        "lotinv_": "lot_number",
        "est_retail_value": "est_retail_value",
        "sale_date": "sale_date",
        "year": "year",
        "make": "make",
        "model": "model",
        "engine_type": "engine_type",
        "cylinders": "cylinders",
        "vin": "vin",
        "title_code": "title_code",
        "odometer": "odometer",
        "odometer_description": "odometer_description",
        "damage_description": "damage_description",
        "current_bid": "current_bid",
        "my_bid": "my_bid",
        "item_number": "item_number",
        "sale_name": "sale_name",
        "auto_grade": "auto_grade",
        "sale_light": "sale_light",
        "announcements": "announcements",
    }
    df = df.rename(columns=rename_map)

    # Extract 6–8 digit lot numbers from column
    df["lot_number"] = df["lot_number"].apply(extract_lot_number)
    df["user_id"] = user_id

    # Filter to DB-relevant columns
    valid_cols = [
        "user_id", "lot_url", "lot_number", "est_retail_value", "sale_date", "year",
        "make", "model", "engine_type", "cylinders", "vin", "title_code", "odometer",
        "odometer_description", "damage_description", "current_bid", "my_bid",
        "item_number", "sale_name", "auto_grade", "sale_light", "announcements"
    ]
    df = df[[c for c in valid_cols if c in df.columns]]

    # Sanitize: convert everything to string or None
    df = df.replace({pd.NA: None})
    df = df.astype(str).replace({"nan": None, "None": None})
    print(f"🧩 Preparing {len(df)} records for merge into user_vehicles...")

    with engine.begin() as conn:
        for _, row in df.iterrows():
            clean = {k: (None if v in [None, "nan", "None"] else str(v).strip()) for k, v in row.items()}

            conn.execute(
                text("""
                    MERGE user_vehicles AS target
                    USING (SELECT :user_id AS user_id, :lot_number AS lot_number) AS src
                    ON target.user_id = src.user_id AND target.lot_number = src.lot_number
                    WHEN MATCHED THEN
                        UPDATE SET
                            lot_url = :lot_url,
                            est_retail_value = :est_retail_value,
                            sale_date = :sale_date,
                            year = :year,
                            make = :make,
                            model = :model,
                            engine_type = :engine_type,
                            cylinders = :cylinders,
                            vin = :vin,
                            title_code = :title_code,
                            odometer = :odometer,
                            odometer_description = :odometer_description,
                            damage_description = :damage_description,
                            current_bid = :current_bid,
                            my_bid = :my_bid,
                            item_number = :item_number,
                            sale_name = :sale_name,
                            auto_grade = :auto_grade,
                            sale_light = :sale_light,
                            announcements = :announcements,
                            updated_at = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (user_id, lot_url, lot_number, est_retail_value, sale_date,
                                year, make, model, engine_type, cylinders, vin, title_code,
                                odometer, odometer_description, damage_description,
                                current_bid, my_bid, item_number, sale_name, auto_grade,
                                sale_light, announcements, created_at)
                        VALUES (:user_id, :lot_url, :lot_number, :est_retail_value, :sale_date,
                                :year, :make, :model, :engine_type, :cylinders, :vin, :title_code,
                                :odometer, :odometer_description, :damage_description,
                                :current_bid, :my_bid, :item_number, :sale_name, :auto_grade,
                                :sale_light, :announcements, GETDATE());
                """),
                clean,
            )

        print(f"✅ Upserted {len(df)} records into user_vehicles for user {user_id}")
        return df  # ✅ return the dataframe for use in main()


# --------------------------------------------------
# PLAYWRIGHT DOWNLOAD
# --------------------------------------------------
def download_lot_images(lot_number: str):
    """Open Copart lot page, skip 360°, open download menu, click Download All, extract images."""
    lot_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
    ensure_dir(lot_dir)
    zip_path = os.path.join(lot_dir, f"{lot_number}.zip")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=["--start-maximized"],
                channel="chrome"
            )
            page = browser.new_page(accept_downloads=True)
            url = f"https://www.copart.com/lot/{lot_number}"
            print(f"🌐 Opening {url}")
            page.goto(url, timeout=PLAYWRIGHT_TIMEOUT)
            time.sleep(4)

            # Skip 360° view if it's the first image
            try:
                next_btn = page.locator("button[aria-label*='next']")
                if next_btn.is_visible():
                    next_btn.click()
                    print("⏭️ Skipped 360° view image")
                    time.sleep(2)
            except Exception:
                pass

            # Wait for and click the download arrow icon
            try:
                download_icon = page.locator("span.download-image-sprite-icon").first
                page.wait_for_selector("span.download-image-sprite-icon", timeout=7000)
                download_icon.click()
                print("⬇️ Clicked download arrow icon")
                time.sleep(1)
            except Exception as e:
                print(f"⚠️ Could not find download arrow icon for lot {lot_number}: {e}")
                browser.close()
                return False

            # Wait for and click "Download All"
            try:
                with page.expect_download(timeout=PLAYWRIGHT_TIMEOUT) as download_info:
                    page.click("text=Download All")
                download = download_info.value
                download.save_as(zip_path)
                print(f"📦 Downloaded {lot_number}.zip")
            except Exception as e:
                print(f"⚠️ Could not download images for lot {lot_number}: {e}")
                browser.close()
                return False

            time.sleep(2)
            if browser.is_connected():
                browser.close()

        # Extract images if ZIP is valid
        if zipfile.is_zipfile(zip_path):
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(lot_dir)
            os.remove(zip_path)
            print(f"🖼️ Extracted images for lot {lot_number}")
            return True
        else:
            print(f"⚠️ Invalid ZIP for lot {lot_number}")
            return False

    except Exception as e:
        print(f"⚠️ Playwright error on lot {lot_number}: {e}")
        return False

# --------------------------------------------------
# DB UPDATE
# --------------------------------------------------
def update_image_url(lot_number: str):
    """Write image URLs to DB (served via backend static route)."""
    try:
        lot_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
        images = [
            f"https://api.carflipanalyzer.com/backend/downloads/{lot_number}/{img}"
            for img in sorted(os.listdir(lot_dir))
            if img.lower().endswith((".jpg", ".jpeg", ".png"))
        ]
        if not images:
            print(f"⚠️ No images to update for lot {lot_number}")
            return False

        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE user_vehicles
                    SET image_url = :url
                    WHERE lot_number = :lot
                """),
                {"url": images[0], "lot": lot_number},
            )
        print(f"✅ Updated DB with first image for lot {lot_number}")
        return True
    except Exception as e:
        print(f"⚠️ DB update failed for lot {lot_number}: {e}")
        return False


# --------------------------------------------------
# MAIN LOT PROCESSING
# --------------------------------------------------
def process_lot(lot_number: str):
    """Full sequence for one lot: download → extract → update DB."""
    if not lot_number:
        return False

    success = download_lot_images(lot_number)
    if success:
        update_image_url(lot_number)
    return success


# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main(csv_path: str, user_id: int):
    print(f"👤 User ID: {user_id}")
    print(f"📄 CSV Path: {csv_path}")

    df = import_csv_to_db(csv_path, user_id)
    lots = df["lot_number"].unique().tolist()
    print(f"🚗 Found {len(lots)} unique lots to process.")

    start_time = time.time()
    done = failed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_lot, lot): lot for lot in lots}
        for future in as_completed(futures):
            lot = futures[future]
            try:
                if future.result():
                    done += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"⚠️ Error processing lot {lot}: {e}")
                failed += 1
            time.sleep(SLEEP_BETWEEN_LOTS)

    print(f"\n✅ Summary: {done} done | {failed} failed | Elapsed {(time.time()-start_time)/60:.1f} min.")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("❌ Usage: python copart_download_parallel.py <user_id> <csv_path>")
        sys.exit(1)

    # Auto-detect argument order
    arg1, arg2 = sys.argv[1], sys.argv[2]
    if arg1.isdigit():
        USER_ID = int(arg1)
        CSV_PATH = arg2
    elif arg2.isdigit():
        USER_ID = int(arg2)
        CSV_PATH = arg1
    else:
        print("❌ Could not determine which argument is user_id.")
        sys.exit(1)

    print(f"👤 User ID: {USER_ID}")
    print(f"📄 CSV Path: {CSV_PATH}")
    main(CSV_PATH, USER_ID)
