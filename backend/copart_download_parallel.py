import os
import time
import glob
import zipfile
import pandas as pd
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine, text
from datetime import datetime

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = (
    os.path.join(BASE_DIR, "backend", "downloads")
    if "backend" not in BASE_DIR.lower()
    else os.path.join(BASE_DIR, "downloads")
)
UPLOADS_DIR = "/root/car-flip-analyzer/user_uploads"

SERVER = "carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433"
DB_NAME = "cars"
USERNAME = "admin"
PASSWORD = "1K0xi*rfMR!r4VN7"
DRIVER = "ODBC Driver 18 for SQL Server"

MAX_WORKERS = 3
SLEEP_BETWEEN_LOTS = 2

def get_latest_csv():
    """
    Return the CSV path passed from uploads.py, or fall back to latest in uploads folder.
    """
    # ✅ Use file path passed from the backend
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        print(f"📂 Using CSV file from argument: {sys.argv[1]}")
        return sys.argv[1]

    # Fallback: most recent CSV
    csv_files = glob.glob(os.path.join(UPLOADS_DIR, "*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"❌ No CSV files found in {UPLOADS_DIR}")
    latest = max(csv_files, key=os.path.getmtime)
    print(f"📂 Using latest CSV fallback: {latest}")
    return latest

# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------
def get_engine():
    conn_str = (
        f"mssql+pyodbc://{USERNAME}:{PASSWORD}@{SERVER}/{DB_NAME}"
        "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
    )
    return create_engine(conn_str, fast_executemany=True)


# --------------------------------------------------
# FILE HELPERS
# --------------------------------------------------
def move_and_unzip(lot_folder):
    """Unzip and move downloaded images into the lot folder."""
    zip_files = glob.glob(os.path.join(lot_folder, "*.zip"))
    for z in zip_files:
        with zipfile.ZipFile(z, "r") as zip_ref:
            zip_ref.extractall(lot_folder)
        os.remove(z)


def get_image_url(lot_id):
    """Return the first found image URL for the given lot folder (absolute public path)."""
    folder = os.path.join(DOWNLOAD_DIR, str(lot_id))
    if not os.path.exists(folder):
        return None

    for f in sorted(os.listdir(folder)):
        if f.lower().endswith((".jpg", ".jpeg", ".png")):
            # ✅ Match backend_api.py static mount path
            return f"https://api.carflipanalyzer.com/backend/downloads/{lot_id}/{f}"
    return None


# --------------------------------------------------
# CSV LOADER (LOAD / COPY EXISTING LOTS)
# --------------------------------------------------
# --------------------------------------------------
# CLEAN & NORMALIZE CSV HEADERS
# --------------------------------------------------
df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

# ✅ Map your known Copart spreadsheet columns to match DB fields
rename_map = {
    "lot/inv_#": "lot_inv_num",
    "lot_url": "lot_url",
    "est._retail_value": "est_retail_value",  # fixes the invalid '.' issue
    "est._retail_value_usd": "est_retail_value",
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

df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns}, inplace=True)

# ✅ Verify required column exists
if "lot_inv_num" not in df.columns:
    raise ValueError(
        f"❌ 'lot_inv_num' column missing from CSV. Found: {list(df.columns)}"
    )

df["lot_inv_num"] = df["lot_inv_num"].astype(str)

def load_csv_to_user(engine, user_id):
    """
    Loads the latest uploaded CSV into user_vehicles.
    For each lot:
      • If it already exists for ANY user, copy it for the current user.
      • Otherwise, insert the new row from the CSV (to be downloaded later).
      • Ensures image_url is set if local images exist.
    """
    csv_files = glob.glob(os.path.join(UPLOADS_DIR, "*.csv"))
    if not csv_files:
        print(f"❌ No CSV files found in {UPLOADS_DIR}")
        return
    latest_csv = max(csv_files, key=os.path.getmtime)
    print(f"📂 Using latest uploaded CSV: {latest_csv}")

    df = pd.read_csv(latest_csv)
    df.columns = [normalize_column_name(c) for c in df.columns]
# ✅ Rename the known CSV column "Lot/Inv #" → "lot_inv_num"
    if "lot/inv_#" in df.columns:
        df.rename(columns={"lot/inv_#": "lot_inv_num"}, inplace=True)

    if "lot_inv_num" not in df.columns:
        raise ValueError(f"❌ 'lot_inv_num' column is missing from CSV. Found: {list(df.columns)}")

    df["lot_inv_num"] = df["lot_inv_num"].astype(str)

    with engine.begin() as conn:
        # Fetch existing lots for any user
        lot_nums = df["lot_inv_num"].tolist()
        if not lot_nums:
            print("⚠️ No lots found in CSV.")
            return

        # Build a dynamic SQL-safe IN clause
        placeholders = ", ".join([f"'{lot}'" for lot in lot_nums])
        query = f"SELECT * FROM user_vehicles WHERE lot_inv_num IN ({placeholders})"

        all_existing = pd.read_sql(query, conn)

        existing_lots = set(all_existing["lot_inv_num"].astype(str).tolist())

        # Fetch lots that this user already owns
        user_existing = pd.read_sql(
            text("SELECT lot_inv_num FROM user_vehicles WHERE user_id = :uid"),
            conn,
            params={"uid": user_id},
        )
        user_existing_lots = set(user_existing["lot_inv_num"].astype(str).tolist())

        # Decide which lots to copy / download
        to_copy = [lot for lot in existing_lots if lot not in user_existing_lots]
        to_download = [
            lot
            for lot in df["lot_inv_num"].tolist()
            if lot not in existing_lots and lot not in user_existing_lots
        ]

        # ✅ Copy existing lots from other users
        if to_copy:
            existing_to_copy = all_existing[
                all_existing["lot_inv_num"].isin(to_copy)
            ].copy()
            existing_to_copy["user_id"] = user_id
            existing_to_copy["created_at"] = pd.Timestamp.now()
            existing_to_copy.drop(columns=["id"], inplace=True, errors="ignore")

            def ensure_image_url(row):
                current = str(row.get("image_url") or "").strip()
                if current:
                    return current
                return get_image_url(row["lot_inv_num"])

            existing_to_copy["image_url"] = existing_to_copy.apply(
                ensure_image_url, axis=1
            )

            existing_to_copy.to_sql(
                "user_vehicles", con=conn, if_exists="append", index=False
            )
            print(f"📋 Duplicated {len(existing_to_copy)} existing lots for user {user_id}.")

        # ✅ Insert new lots (not in DB yet)
        if to_download:
            new_rows = df[df["lot_inv_num"].isin(to_download)].copy()
            new_rows["user_id"] = user_id
            new_rows["created_at"] = pd.Timestamp.now()
            new_rows["image_url"] = new_rows["lot_inv_num"].apply(get_image_url)
            new_rows.to_sql("user_vehicles", con=conn, if_exists="append", index=False)
            print(f"🆕 Inserted {len(new_rows)} brand new lots for user {user_id}.")
        else:
            print(f"ℹ️ No new lots to insert for user {user_id}.")


# --------------------------------------------------
# IMAGE DOWNLOAD FUNCTION
# --------------------------------------------------
def download_images(lot_url):
    lot_id = lot_url.split("/lot/")[1].split("/")[0]
    lot_folder = os.path.join(DOWNLOAD_DIR, lot_id)

    # ✅ Skip download if images already exist
    if os.path.exists(lot_folder) and any(
        f.lower().endswith((".jpg", ".jpeg", ".png")) for f in os.listdir(lot_folder)
    ):
        print(f"🖼️ Skipping {lot_id} (images already exist in {lot_folder})")
        image_url = get_image_url(lot_id)
        with get_engine().begin() as conn:
            conn.execute(
                text("""
                    UPDATE user_vehicles
                    SET image_url = :url
                    WHERE lot_inv_num = :lot
                """),
                {"url": image_url, "lot": lot_id},
            )
        return lot_id  # ✅ Return lot_id for DB sync

    os.makedirs(lot_folder, exist_ok=True)
    print(f"🚗 Downloading lot {lot_id}...")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False, slow_mo=250)
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()

            page.goto(lot_url, timeout=90000)
            page.wait_for_selector("img", timeout=25000)

            # Skip 360° image if present
            try:
                if page.is_visible("span.p-galleria-item-next-icon.pi.pi-chevron-right"):
                    page.click("span.p-galleria-item-next-icon.pi.pi-chevron-right")
                    print("➡️ Skipped 360° view")
                    time.sleep(2)
            except Exception:
                pass

            # Click download arrow
            arrow_selectors = [
                "span.lot-details-header-sprite.download-image-sprite-icon",
                "button.download-image-sprite-icon",
                "div.lot-details-header-sprite.download-image-sprite-icon",
                "a.lot-image-floating-CTA span.download-image-sprite-icon",
            ]

            arrow_clicked = False
            for sel in arrow_selectors:
                try:
                    page.wait_for_selector(sel, timeout=8000)
                    page.locator(sel).first.click()
                    arrow_clicked = True
                    break
                except Exception:
                    continue

            if not arrow_clicked:
                print(f"❌ Could not find download arrow for {lot_id}")
                browser.close()
                return None

            # Download all images
            selectors = [
                "a:has-text('Download all')",
                "a:has-text('Download All')",
                "button:has-text('Download all')",
                "button:has-text('Download All')",
            ]
            for sel in selectors:
                try:
                    page.wait_for_selector(sel, timeout=15000)
                    with page.expect_download(timeout=60000) as dl_info:
                        page.locator(sel).first.click()
                    dl = dl_info.value
                    zip_path = os.path.join(lot_folder, f"{lot_id}.zip")
                    dl.save_as(zip_path)
                    move_and_unzip(lot_folder)
                    print(f"✅ Downloaded {lot_id}")
                    browser.close()

                    image_url = get_image_url(lot_id)
                    with get_engine().begin() as conn:
                        conn.execute(
                            text("""
                                UPDATE user_vehicles
                                SET image_url = :url
                                WHERE lot_inv_num = :lot
                            """),
                            {"url": image_url, "lot": lot_id},
                        )
                    return lot_id
                except Exception:
                    continue

            browser.close()
            return None

    except Exception as e:
        print(f"⚠️ Error on {lot_id}: {e}")
        return None


# --------------------------------------------------
# MAIN BATCH EXECUTION
# --------------------------------------------------
def main(user_id: int):
    engine = get_engine()
    load_csv_to_user(engine, user_id)

    folders = [
        folder
        for folder in os.listdir(DOWNLOAD_DIR)
        if os.path.isdir(os.path.join(DOWNLOAD_DIR, folder))
    ]
    if not folders:
        print("⚠️ No lot folders found.")
        return

    print(f"📦 Found {len(folders)} lots to process.")
    done = failed = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [
            executor.submit(download_images, f"https://www.copart.com/lot/{lot}")
            for lot in folders
        ]
        for future in as_completed(futures):
            try:
                lot_id = future.result()
                if lot_id:
                    done += 1
                    image_url = get_image_url(lot_id)
                    if image_url:
                        with engine.begin() as conn:
                            conn.execute(
                                text("""
                                    UPDATE user_vehicles
                                    SET image_url = :image_url
                                    WHERE lot_inv_num = :lot
                                """),
                                {"image_url": image_url, "lot": str(lot_id)},
                            )
                        print(f"🖼️ Image URL updated for lot {lot_id}: {image_url}")
                    else:
                        print(f"⚠️ No image found for lot {lot_id}")
                else:
                    failed += 1
            except Exception as e:
                print(f"⚠️ Thread exception: {e}")
                failed += 1

    elapsed = time.time() - start
    print(f"\n✅ Summary: {done} done | {failed} failed | Elapsed {elapsed/60:.1f} min.")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("❌ Usage: python3 copart_download_parallel.py /path/to/file.csv <user_id>")
        sys.exit(1)

    csv_path = get_latest_csv()
    USER_ID = int(sys.argv[2])
    print(f"✅ Starting Copart load for user {USER_ID}")
    print(f"📄 CSV path: {csv_path}")
    main(USER_ID)


