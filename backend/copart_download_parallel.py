import os
import re
import sys
import time
import zipfile
import json
import shutil
import requests
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy import create_engine, text
from playwright.sync_api import sync_playwright
import argparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --------------------------------------------------
# INITIAL LOG
# --------------------------------------------------
with open("copart_debug_log.txt", "a") as f:
    f.write(f"Script started at {time.ctime()}\n")
    f.flush()

print("Script print reached", flush=True)

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Handle folder structure (whether inside backend or root)
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

# ⚠️ POINTS TO YOUR VPS API (For the Air Gap Fix)
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000/api")

MAX_WORKERS = 3
SLEEP_BETWEEN_LOTS = 2.0
MAX_IMAGES = 8

# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------
PG_CONN = os.getenv("DATABASE_URL", "postgresql+psycopg2://carflip_user:AVNS_KMNjNg_8wx4vECPoFfh@carflip-db-do-user-28471662-0.i.db.ondigitalocean.com:25060/carflip?sslmode=require")
rds_engine = create_engine(PG_CONN, pool_pre_ping=True)

# GLOBAL variable
user_id = None

# --------------------------------------------------
# ARGUMENT PARSING
# --------------------------------------------------
def parse_args():
    parser = argparse.ArgumentParser(description="Copart Downloader & AI Estimator")
    parser.add_argument("user_id", help="User ID running the download")
    parser.add_argument("--lots", help="Comma-separated list of lot numbers", default=None)
    parser.add_argument("--download", action="store_true", help="Run image download directly")
    return parser.parse_args()


# --------------------------------------------------
# COPART SELECTORS (Your Custom Logic)
# --------------------------------------------------
COPART_SELECTORS = {
    "next_image_buttons": [
        "button[aria-label='Next']",
        "button[aria-label='Next Image']",
        "button[aria-label='Next Photo']",
        "span.p-galleria-item-next-icon.pi.pi-chevron-right",
        "div.p-galleria-item-next",
    ],
    "download_arrows": [
        "span.lot-details-header-sprite.download-image-sprite-icon",
        "span.download-image-sprite-icon",
        "span[class*='download-image']",
        "span[class*='download']",
        "button[aria-label*='Download']",
    ],
    "download_all_elements": [
        "a.p-pb-5.text-dark-gray-3.p-decor-none",
        "a:has-text('Download all')",
        "button.btn-reset.p-pb-5.text-dark-gray-3.p-decor-none",
        "button:has-text('Download all')",
        "a:text('Download all')",
        "a:text('DOWNLOAD ALL')",
        "button:text('Download all')",
        "button:text('DOWNLOAD ALL')",
    ],
    "viewer_360": ["canvas", "iframe[src*='360']", "span:has-text('360')", "div[class*='360']"],
}


# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def normalize_lot(val):
    if pd.isna(val):
        return ""
    val = str(val).strip()
    if val.endswith(".0"):
        val = val[:-2]
    return val.replace(",", "").strip()

# 🔥 THE FIX: Upload Function
def upload_image_to_vps(lot_number, local_image_path):
    """Uploads local image to VPS and returns the public URL."""
    url = f"{API_BASE_URL}/upload_image"
    filename = os.path.basename(local_image_path)
    
    try:
        with open(local_image_path, "rb") as f:
            files = {"file": (filename, f, "image/jpeg")}
            data = {"lot": str(lot_number)}
            response = requests.post(url, data=data, files=files, timeout=30)
            
        if response.status_code == 200:
            return response.json().get("url")
    except Exception as e:
        print(f"❌ Upload Error for {filename}: {e}")
    return None

def extract_zip(download_path, lot_number):
    """Unzip downloaded images, UPLOAD to VPS, then update DB."""
    target_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
    os.makedirs(target_dir, exist_ok=True)

    try:
        with zipfile.ZipFile(download_path, "r") as zip_ref:
            zip_ref.extractall(target_dir)
        print(f"Extracted images for lot {lot_number} to {target_dir}")
    except Exception as e:
        print(f"❌ Zip extraction failed: {e}")
        return

    # --------------------------------------------------
    # UPLOAD LOOP (The Critical Fix)
    # --------------------------------------------------
    try:
        files = sorted([
            f for f in os.listdir(target_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ])

        if not files:
            print(f"No images found for lot {lot_number}")
            return

        print(f"⬆️ Uploading {len(files)} images to Cloud...")
        
        main_image_url = None

        for img in files:
            local_path = os.path.join(target_dir, img)
            # Upload to VPS
            remote_url = upload_image_to_vps(lot_number, local_path)
            
            # Save the first successful URL to be the DB thumbnail
            if remote_url and main_image_url is None:
                main_image_url = remote_url

        if not main_image_url:
            print(f"❌ Failed to upload images for lot {lot_number}")
            return

        # --------------------------------------------------
        # UPDATE DB WITH REMOTE URL
        # --------------------------------------------------
        lot_url = f"https://www.copart.com/lot/{lot_number}"

        with rds_engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE user_vehicles
                    SET image_url = :url,
                        lot_url   = :lot_url
                    WHERE lot_number = :lot AND user_id = :uid
                """),
                {
                    "url": main_image_url,
                    "lot_url": lot_url,
                    "lot": str(lot_number),
                    "uid": int(user_id)
                }
            )

        if result.rowcount == 0:
            print(f"⚠️ No DB record found to update for Lot {lot_number}")
        else:
            print(f"✅ Database updated with REMOTE image URL for Lot {lot_number}")

    except Exception as e:
        print(f"Error processing images for lot {lot_number}: {e}")


# --------------------------------------------------
# PLAYWRIGHT HELPERS
# --------------------------------------------------
def click_next_image(page):
    for sel in COPART_SELECTORS["next_image_buttons"]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            loc.first.click()
            page.wait_for_timeout(1500)
            return True
    return False

def is_360_image(page):
    return any(page.locator(sel).count() > 0 for sel in COPART_SELECTORS["viewer_360"])

def find_download_arrow(page):
    for sel in COPART_SELECTORS["download_arrows"]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            return loc.first
    return None

def find_download_all_element(page):
    for sel in COPART_SELECTORS["download_all_elements"]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            return loc.first

    all_elems = page.locator("a, button")
    count = all_elems.count()
    for i in range(count):
        try:
            txt = (all_elems.nth(i).inner_text() or "").lower()
            if "download all" in txt:
                return all_elems.nth(i)
        except:
            continue
    return None


# --------------------------------------------------
# PLAYWRIGHT DOWNLOADER
# --------------------------------------------------
def download_copart_images(lot_number):
    print(f"Downloading images for lot {lot_number}")
    lot_url = f"https://www.copart.com/lot/{lot_number}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            page.goto(lot_url, timeout=90000)
            page.wait_for_timeout(4000)

            # Skip 360 if present
            if is_360_image(page):
                click_next_image(page)

            # Find download arrow
            arrow = None
            for _ in range(12):
                arrow = find_download_arrow(page)
                if arrow:
                    break
                click_next_image(page)

            if not arrow:
                raise Exception("Download arrow not found")

            arrow.click()
            page.wait_for_timeout(1500)

            # Find "Download All"
            target = None
            for _ in range(90):
                target = find_download_all_element(page)
                if target:
                    break
                page.wait_for_timeout(500)

            if not target:
                raise Exception("'Download all' not found")

            # Click and Save
            with page.expect_download(timeout=180000) as download_info:
                target.click()

            download = download_info.value
            zip_path = os.path.join(DOWNLOAD_DIR, f"{lot_number}.zip")
            download.save_as(zip_path)

            extract_zip(zip_path, lot_number)
            os.remove(zip_path)

            print(f"Images downloaded & processed for lot {lot_number}")

        except Exception as e:
            print(f"Error for lot {lot_number}: {e}")

        finally:
            page.wait_for_timeout(5000)
            context.close()
            browser.close()


# --------------------------------------------------
# PROCESS LOTS + AI LOGIC
# --------------------------------------------------
def process_lots_directly(lots, uid):
    try:
        from ai_repair_estimator import analyze_vehicle, _load_vehicle_for_lot
    except ImportError:
        print("⚠️ Warning: ai_repair_estimator.py not found. AI steps will fail if run.")
        analyze_vehicle = lambda v, mode="full": {}
        _load_vehicle_for_lot = None

    global user_id
    user_id = uid

    try:
        with rds_engine.begin() as conn:
            for lot in lots:
                row = conn.execute(
                    text("""
                        SELECT 1 FROM user_vehicles
                        WHERE lot_number = :lot AND user_id = :uid
                        LIMIT 1
                    """),
                    {"lot": lot, "uid": user_id},
                ).fetchone()

                if not row:
                    print(f"Lot {lot} not found; skipping.")
                    continue

                # 1. DOWNLOAD & UPLOAD
                download_copart_images(lot)

                # 2. RUN AI with local images (angle-selected, full repair + resale)
                try:
                    if _load_vehicle_for_lot is None:
                        raise RuntimeError("ai_repair_estimator not available")

                    vehicle, meta_or_error = _load_vehicle_for_lot(lot, rds_engine)
                    if not vehicle:
                        print(f"AI skipped for lot {lot}: {meta_or_error}")
                        continue

                    print(
                        f"Running AI for lot {lot}: "
                        f"{meta_or_error['image_count']} images selected of "
                        f"{meta_or_error.get('images_available', '?')} available"
                    )
                    vehicle.pop("keep_structured", None)
                    result = analyze_vehicle(vehicle, mode="full")

                    conn.execute(
                        text("""
                            UPDATE user_vehicles
                            SET repair_estimate = :rep_est,
                                resale_estimate = :res_est,
                                repair_details = :rep_det,
                                resale_details = :res_det,
                                updated_at = NOW()
                            WHERE lot_number = :lot AND user_id = :uid
                        """),
                        {
                            "rep_est": result.get("repair_estimate"),
                            "res_est": result.get("resale_estimate"),
                            "rep_det": result.get("repair_details"),
                            "res_det": result.get("resale_details"),
                            "lot": lot,
                            "uid": user_id,
                        },
                    )
                    print(f"✅ AI updated lot {lot}")

                except Exception as e:
                    print(f"AI estimation error for lot {lot}: {e}")

                time.sleep(SLEEP_BETWEEN_LOTS)

    except Exception as e:
        print(f"Fatal error: {e}")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    args = parse_args()
    user_id = args.user_id
    lots_arg = args.lots

    if args.download and not lots_arg:
        print("Must specify --lots with --download")
        sys.exit(1)

    if lots_arg:
        lots = [l.strip() for l in lots_arg.split(",") if l.strip()]
        process_lots_directly(lots, user_id)
    else:
        print("Usage: python copart_download_parallel.py <user_id> --lots 12345 --download")