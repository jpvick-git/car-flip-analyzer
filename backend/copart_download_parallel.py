import os
import time
import glob
import zipfile
import pandas as pd
import sys
import shutil
import subprocess
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

MAX_WORKERS = 2
SLEEP_BETWEEN_LOTS = 2

# 🔗 GitHub base for serving public images
GITHUB_BASE = "https://raw.githubusercontent.com/jpvick-git/car-images/main/downloads"

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
            return f"{GITHUB_BASE}/{lot_id}/{f}"
    return None

# --------------------------------------------------
# CSV LOADER
# --------------------------------------------------
def load_csv_to_user(engine, user_id, csv_path=None):
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
        "lot/inv_#": "lot_number",
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

    if "lot_number" not in df.columns:
        raise ValueError(f"❌ 'lot_number' column missing from CSV. Found: {list(df.columns)}")

    df["lot_number"] = df["lot_number"].astype(str)

    with engine.begin() as conn:
        lot_nums = df["lot_number"].tolist()
        if not lot_nums:
            print("⚠️ No lots found in CSV.")
            return

        placeholders = ", ".join([f"'{lot}'" for lot in lot_nums])
        query = f"SELECT * FROM user_vehicles WHERE lot_number IN ({placeholders})"
        all_existing = pd.read_sql(query, conn)
        existing_lots = set(all_existing["lot_number"].astype(str).tolist())

        user_existing = pd.read_sql(
            text("SELECT lot_number FROM user_vehicles WHERE user_id = :uid"),
            conn,
            params={"uid": user_id},
        )
        user_existing_lots = set(user_existing["lot_number"].astype(str).tolist())

        to_copy = [lot for lot in existing_lots if lot not in user_existing_lots]
        to_download = [lot for lot in lot_nums if lot not in existing_lots and lot not in user_existing_lots]

        if to_copy:
            existing_to_copy = all_existing[all_existing["lot_number"].isin(to_copy)].copy()
            existing_to_copy["user_id"] = user_id
            existing_to_copy["created_at"] = pd.Timestamp.now()
            existing_to_copy.drop(columns=["id"], inplace=True, errors="ignore")

            def ensure_image_url(row):
                current = str(row.get("image_url") or "").strip()
                if current:
                    return current
                return get_image_url(row["lot_number"])

            existing_to_copy["image_url"] = existing_to_copy.apply(ensure_image_url, axis=1)
            existing_to_copy.to_sql("user_vehicles", con=conn, if_exists="append", index=False)
            print(f"📋 Duplicated {len(existing_to_copy)} existing lots for user {user_id}.")

        if to_download:
            new_rows = df[df["lot_number"].isin(to_download)].copy()
            new_rows["user_id"] = user_id
            new_rows["created_at"] = pd.Timestamp.now()
            new_rows["image_url"] = new_rows["lot_number"].apply(get_image_url)

            allowed_cols = conn.execute(text("SELECT TOP 0 * FROM user_vehicles")).keys()
            new_rows = new_rows[[c for c in new_rows.columns if c in allowed_cols]]
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

    if os.path.exists(lot_folder) and any(f.lower().endswith((".jpg", ".jpeg", ".png")) for f in os.listdir(lot_folder)):
        print(f"🖼️ Skipping {lot_id} (already exists)")
        image_url = get_image_url(lot_id)
        with get_engine().begin() as conn:
            conn.execute(
                text("UPDATE user_vehicles SET image_url = :url WHERE lot_number = :lot"),
                {"url": image_url, "lot": lot_id},
            )
        return lot_id

    os.makedirs(lot_folder, exist_ok=True)
    print(f"🚗 Downloading lot {lot_id}...")

    try:
        with sync_playwright() as p:
            is_linux = "linux" in platform.system().lower()
            browser = p.chromium.launch(headless=is_linux, slow_mo=0 if is_linux else 200)
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()
            page.goto(lot_url, timeout=90000)
            time.sleep(5)

            try:
                page.wait_for_selector("div.p-galleria-content img", state="visible", timeout=60000)
            except Exception:
                pass

            # Skip 360° spinner if present
            try:
                if page.is_visible("span.p-galleria-item-next-icon.pi.pi-chevron-right"):
                    page.click("span.p-galleria-item-next-icon.pi.pi-chevron-right")
                    time.sleep(2)
            except Exception:
                pass

            arrow_selectors = [
                "span.lot-details-header-sprite.download-image-sprite-icon",
                "button.download-image-sprite-icon",
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
                print(f"❌ No download arrow for {lot_id}")
                browser.close()
                return None

            for sel in ["a:has-text('Download all')", "button:has-text('Download all')"]:
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
                            text("UPDATE user_vehicles SET image_url = :url WHERE lot_number = :lot"),
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
# COPY AND PUSH ONLY *_Image_1.JPG (SKIP IF EXISTS)
# --------------------------------------------------
def push_images_to_git():
    try:
        local_dir = r"C:\car-flip-analyzer\backend\downloads"
        repo_dir = r"C:\car-images"
        repo_downloads = os.path.join(repo_dir, "downloads")
        os.makedirs(repo_downloads, exist_ok=True)

        copied = 0
        lot_folders = [f for f in os.listdir(local_dir) if os.path.isdir(os.path.join(local_dir, f))]

        for lot in lot_folders:
            src_folder = os.path.join(local_dir, lot)
            dest_folder = os.path.join(repo_downloads, lot)
            os.makedirs(dest_folder, exist_ok=True)

            src_img = os.path.join(src_folder, f"{lot}_Image_1.jpg")
            dest_img = os.path.join(dest_folder, f"{lot}_Image_1.jpg")

            # Skip if image already exists in destination
            if os.path.exists(dest_img):
                continue

            if os.path.exists(src_img):
                shutil.copy2(src_img, dest_img)
                copied += 1

        if copied == 0:
            print("⚠️ No new *_Image_1.jpg files to copy or push.")
            return

        os.chdir(repo_dir)
        subprocess.run(["git", "add", "--ignore-errors", "."], check=True)
        subprocess.run([
            "git", "commit",
            "-m", f"Upload {copied} new _Image_1.jpg files - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        ], check=False)
        subprocess.run(["git", "push", "origin", "main"], check=True)

        print(f"✅ Uploaded {copied} new _Image_1.jpg files to car-images repo.")
    except subprocess.CalledProcessError as e:
        print(f"⚠️ Git push failed: {e}")
    except Exception as ex:
        print(f"❌ Unexpected error pushing images: {ex}")

# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main(user_id: int, csv_path: str):
    engine = get_engine()
    load_csv_to_user(engine, user_id, csv_path)

    csv_df = pd.read_csv(csv_path)
    lot_nums = (
        csv_df["Lot/Inv #"].astype(str).tolist()
        if "Lot/Inv #" in csv_df.columns
        else csv_df["lot_number"].astype(str).tolist()
        if "lot_number" in csv_df.columns
        else []
    )

    for lot in lot_nums:
        os.makedirs(os.path.join(DOWNLOAD_DIR, lot), exist_ok=True)

    folders = [f for f in os.listdir(DOWNLOAD_DIR) if os.path.isdir(os.path.join(DOWNLOAD_DIR, f))]
    if not folders:
        print("⚠️ No lot folders found.")
        return

    print(f"📦 Found {len(folders)} lots to process.")
    done = failed = 0
    start = time.time()

    batch_size = 10
    for i in range(0, len(folders), batch_size):
        batch = folders[i:i + batch_size]
        print(f"⚙️ Processing batch {i // batch_size + 1}/{(len(folders) + batch_size - 1) // batch_size}")

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [executor.submit(download_images, f"https://www.copart.com/lot/{lot}") for lot in batch]
            for future in as_completed(futures):
                try:
                    lot_id = future.result()
                    if lot_id:
                        done += 1
                        image_url = get_image_url(lot_id)
                        if image_url:
                            with engine.begin() as conn:
                                conn.execute(
                                    text("UPDATE user_vehicles SET image_url = :image_url WHERE lot_number = :lot"),
                                    {"image_url": image_url, "lot": str(lot_id)},
                                )
                            print(f"🖼️ Updated image_url for lot {lot_id}: {image_url}")
                    else:
                        failed += 1
                except Exception as e:
                    print(f"⚠️ Thread exception: {e}")
                    failed += 1

        print(f"⏳ Waiting {SLEEP_BETWEEN_LOTS} seconds before next batch...")
        time.sleep(SLEEP_BETWEEN_LOTS)

    elapsed = time.time() - start
    print(f"\n✅ Summary: {done} done | {failed} failed | Elapsed {elapsed/60:.1f} min.")

    push_images_to_git()

    # --------------------------------------------------
    # TRIGGER AI ESTIMATOR AFTER DOWNLOADS COMPLETE
    # --------------------------------------------------
    try:
        print(f"\n🤖 Launching ai_repair_estimator.py for user {user_id}...")
        subprocess.run(
            [sys.executable, "ai_repair_estimator.py", str(user_id)],
            cwd=BASE_DIR,
            check=True,
        )
        print("🚀 AI repair/resale estimation completed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"❌ AI estimator failed: {e}")
    except Exception as e:
        print(f"⚠️ Unexpected error launching ai_repair_estimator.py: {e}")


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
