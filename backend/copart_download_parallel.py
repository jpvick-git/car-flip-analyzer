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
import platform

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

MAX_WORKERS = 1
SLEEP_BETWEEN_LOTS = 2


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
    zip_files = glob.glob(os.path.join(lot_folder, "*.zip"))
    for z in zip_files:
        with zipfile.ZipFile(z, "r") as zip_ref:
            zip_ref.extractall(lot_folder)
        os.remove(z)


def get_image_url(lot_id):
    folder = os.path.join(DOWNLOAD_DIR, str(lot_id))
    if not os.path.exists(folder):
        return None

    for f in sorted(os.listdir(folder)):
        if f.lower().endswith((".jpg", ".jpeg", ".png")):
            return f"https://api.carflipanalyzer.com/backend/downloads/{lot_id}/{f}"
    return None


# --------------------------------------------------
# CSV LOADER
# --------------------------------------------------
def load_csv_to_user(engine, user_id, csv_path=None):
    """Load the CSV directly if provided; otherwise fallback to latest in UPLOADS_DIR."""
    if csv_path and os.path.exists(csv_path):
        print(f"📂 Using provided CSV: {csv_path}")
        df = pd.read_csv(csv_path)
    else:
        csv_files = glob.glob(os.path.join(UPLOADS_DIR, "*.csv"))
        if not csv_files:
            print(f"❌ No CSV files found in {UPLOADS_DIR}")
            return
        latest_csv = max(csv_files, key=os.path.getmtime)
        print(f"📂 Using latest uploaded CSV: {latest_csv}")
        df = pd.read_csv(latest_csv)

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    rename_map = {
        "lot/inv_#": "lot_inv_num",
        "est._retail_value": "est_retail_value",
        "est._retail_value_usd": "est_retail_value",
        "sale_date": "sale_date",
        "year": "year",
        "make": "make",
        "model": "model",
        "engine_type": "engine_type",
        "vin": "vin",
        "damage_description": "damage_description",
        "lot_url": "lot_url"
    }
    df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns}, inplace=True)

    if "lot_inv_num" not in df.columns:
        raise ValueError(f"❌ 'lot_inv_num' column missing from CSV. Found: {list(df.columns)}")

    df["lot_inv_num"] = df["lot_inv_num"].astype(str)

    with engine.begin() as conn:
        lot_nums = df["lot_inv_num"].tolist()
        if not lot_nums:
            print("⚠️ No lots found in CSV.")
            return

        placeholders = ", ".join([f"'{lot}'" for lot in lot_nums])
        query = f"SELECT * FROM user_vehicles WHERE lot_inv_num IN ({placeholders})"

        all_existing = pd.read_sql(query, conn)
        existing_lots = set(all_existing["lot_inv_num"].astype(str).tolist())

        user_existing = pd.read_sql(
            text("SELECT lot_inv_num FROM user_vehicles WHERE user_id = :uid"),
            conn,
            params={"uid": user_id},
        )
        user_existing_lots = set(user_existing["lot_inv_num"].astype(str).tolist())

        to_copy = [lot for lot in existing_lots if lot not in user_existing_lots]
        to_download = [lot for lot in lot_nums if lot not in existing_lots and lot not in user_existing_lots]

        if to_copy:
            existing_to_copy = all_existing[all_existing["lot_inv_num"].isin(to_copy)].copy()
            existing_to_copy["user_id"] = user_id
            existing_to_copy["created_at"] = pd.Timestamp.now()
            existing_to_copy.drop(columns=["id"], inplace=True, errors="ignore")

            def ensure_image_url(row):
                current = str(row.get("image_url") or "").strip()
                if current:
                    return current
                return get_image_url(row["lot_inv_num"])

            existing_to_copy["image_url"] = existing_to_copy.apply(ensure_image_url, axis=1)
            existing_to_copy.to_sql("user_vehicles", con=conn, if_exists="append", index=False)
            print(f"📋 Duplicated {len(existing_to_copy)} existing lots for user {user_id}.")

        if to_download:
            new_rows = df[df["lot_inv_num"].isin(to_download)].copy()
            new_rows["user_id"] = user_id
            new_rows["created_at"] = pd.Timestamp.now()
            new_rows["image_url"] = new_rows["lot_inv_num"].apply(get_image_url)

            allowed_cols = conn.execute(text("SELECT TOP 0 * FROM user_vehicles")).keys()
            new_rows = new_rows[[c for c in new_rows.columns if c in allowed_cols]]

            new_rows.to_sql("user_vehicles", con=conn, if_exists="append", index=False)
            print(f"🆕 Inserted {len(new_rows)} brand new lots for user {user_id}.")
        else:
            print(f"ℹ️ No new lots to insert for user {user_id}.")


# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main(user_id: int, csv_path: str):
    engine = get_engine()
    load_csv_to_user(engine, user_id, csv_path)

    csv_df = pd.read_csv(csv_path)
    if "Lot/Inv #" in csv_df.columns:
        lot_nums = csv_df["Lot/Inv #"].astype(str).tolist()
    elif "lot_inv_num" in csv_df.columns:
        lot_nums = csv_df["lot_inv_num"].astype(str).tolist()
    else:
        lot_nums = []

    for lot in lot_nums:
        os.makedirs(os.path.join(DOWNLOAD_DIR, lot), exist_ok=True)

    folders = [f for f in os.listdir(DOWNLOAD_DIR) if os.path.isdir(os.path.join(DOWNLOAD_DIR, f))]
    if not folders:
        print("⚠️ No lot folders found.")
        return

    print(f"📦 Found {len(folders)} lots to process.")
    done = failed = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(download_images, f"https://www.copart.com/lot/{lot}") for lot in folders]
        for future in as_completed(futures):
            try:
                lot_id = future.result()
                if lot_id:
                    done += 1
                    image_url = get_image_url(lot_id)
                    if image_url:
                        with engine.begin() as conn:
                            conn.execute(
                                text("UPDATE user_vehicles SET image_url = :image_url WHERE lot_inv_num = :lot"),
                                {"image_url": image_url, "lot": str(lot_id)},
                            )
                        print(f"🖼️ Updated image_url for lot {lot_id}: {image_url}")
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

    csv_path = sys.argv[1]
    USER_ID = int(sys.argv[2])

    if not os.path.exists(csv_path):
        print(f"❌ CSV not found: {csv_path}")
        sys.exit(1)

    print(f"✅ Starting Copart load for user {USER_ID}")
    print(f"📄 CSV path: {csv_path}")

    main(USER_ID, csv_path)
