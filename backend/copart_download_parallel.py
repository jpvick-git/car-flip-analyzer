import os
import re
import sys
import time
import zipfile
import json
import shutil
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy import create_engine, text
from openai import OpenAI
import argparse
from playwright.sync_api import sync_playwright

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

MAX_WORKERS = 3
SLEEP_BETWEEN_LOTS = 2.0
MAX_IMAGES = 8

RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)


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
# COPART SELECTOR LIBRARY
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
    "viewer_360": [
        "canvas",
        "iframe[src*='360']",
        "span:has-text('360')",
        "div[class*='360']",
    ],
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


def extract_zip(download_path, lot_number):
    """Unzip the downloaded images into the downloads/lot_number folder."""
    target_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
    os.makedirs(target_dir, exist_ok=True)
    with zipfile.ZipFile(download_path, "r") as zip_ref:
        zip_ref.extractall(target_dir)
    print(f"✅ Extracted images for lot {lot_number} to {target_dir}")


def click_next_image(page):
    """Click next image button using multiple selectors."""
    for sel in COPART_SELECTORS["next_image_buttons"]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            loc.first.click()
            page.wait_for_timeout(1500)
            return True
    return False


def is_360_image(page):
    """Check if the current viewer is a 360° image."""
    for sel in COPART_SELECTORS["viewer_360"]:
        if page.locator(sel).count() > 0:
            return True
    return False


def find_download_arrow(page):
    """Find first visible 'download' icon span."""
    for sel in COPART_SELECTORS["download_arrows"]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            return loc.first
    return None


def find_download_all_element(page):
    """Find 'Download all' anchor or button."""
    # Try all known selectors first
    for sel in COPART_SELECTORS["download_all_elements"]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            return loc.first
    # Fallback brute-force text search
    all_elems = page.locator("a, button")
    count = all_elems.count()
    for i in range(count):
        try:
            text_val = (all_elems.nth(i).inner_text() or "").strip().lower()
            if "download all" in text_val:
                return all_elems.nth(i)
        except Exception:
            continue
    return None


# --------------------------------------------------
# PLAYWRIGHT IMAGE DOWNLOADER
# --------------------------------------------------
def download_copart_images(lot_number):
    """Open Copart lot page, skip 360°, find download arrow, and click 'Download all'."""
    print(f"🎬 Launching Playwright to download images for lot {lot_number} ...")
    lot_url = f"https://www.copart.com/lot/{lot_number}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            page.goto(lot_url, timeout=90000)
            print(f"🌐 Opened {lot_url}")
            page.wait_for_timeout(4000)

            # --- Skip first 360° image if present ---
            if is_360_image(page):
                print("⏭️  Detected 360° image; clicking next...")
                click_next_image(page)
                page.wait_for_timeout(2000)

            # --- Find download arrow ---
            arrow = None
            for i in range(12):
                arrow = find_download_arrow(page)
                if arrow:
                    print("⬇️  Found download arrow icon.")
                    break
                print("🔄 No arrow yet; advancing image...")
                click_next_image(page)

            if not arrow:
                raise Exception("❌ Download arrow not found after 12 attempts.")

            arrow.click()
            print("📂 Download menu opened; waiting for 'Download all' element ...")

            # --- Find 'Download all' ---
            target = None
            for attempt in range(90):  # up to ~45 seconds
                target = find_download_all_element(page)
                if target:
                    print(f"✅ Found 'Download all' on attempt {attempt + 1}.")
                    break
                page.wait_for_timeout(500)

            if not target:
                raise Exception("❌ 'Download all' button not found after 45 seconds.")

            # --- Click and wait for download ---
            with page.expect_download(timeout=180000) as download_info:
                target.click()
                print("📦 'Download all' clicked; waiting for ZIP ...")

            download = download_info.value
            saved_path = os.path.join(DOWNLOAD_DIR, f"{lot_number}.zip")
            download.save_as(saved_path)
            print(f"📥 ZIP saved to {saved_path}")

            extract_zip(saved_path, lot_number)
            os.remove(saved_path)

            print(f"✅ Completed download for lot {lot_number}")

        except Exception as e:
            print(f"❌ Error during Playwright download for lot {lot_number}: {e}")

        finally:
            print("🕐 Waiting 10 seconds before closing browser...")
            page.wait_for_timeout(10000)
            context.close()
            browser.close()


# --------------------------------------------------
# DIRECT LOT PROCESSING MODE
# --------------------------------------------------
def process_lots_directly(lots, user_id):
    """Process each lot: download images via Playwright, then run AI estimation."""
    from ai_repair_estimator import analyze_vehicle

    try:
        with rds_engine.begin() as conn:
            for lot in lots:
                row = conn.execute(
                    text("""
                        SELECT TOP 1 * FROM user_vehicles
                        WHERE lot_number = :lot AND user_id = :uid
                    """),
                    {"lot": lot, "uid": user_id},
                ).fetchone()

                if not row:
                    print(f"⚠️ Lot {lot} not found in DB; skipping.")
                    continue

                v = dict(row._mapping)
                print(f"\n🚗 Processing {v.get('year')} {v.get('make')} {v.get('model')} (Lot {lot})")

                # --- Image Download ---
                download_copart_images(lot)

                # --- AI Estimation ---
                try:
                    print("🧠 Running AI repair/resale estimation ...")
                    v["odometer_display"] = v.get("odometer", "Unknown")
                    result = analyze_vehicle(v)
                    conn.execute(
                        text("""
                            UPDATE user_vehicles
                            SET repair_estimate = :rep_est,
                                resale_estimate = :res_est,
                                repair_details = :rep_det,
                                resale_details = :res_det
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
                    print(f"✅ AI estimation completed for lot {lot}")
                except Exception as e:
                    print(f"❌ AI estimation error for lot {lot}: {e}")

                time.sleep(SLEEP_BETWEEN_LOTS)

    except Exception as e:
        print(f"❌ Error in process_lots_directly: {e}")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    args = parse_args()
    user_id = args.user_id
    lots_arg = args.lots

    if args.download and not lots_arg:
        print("❌ Must specify --lots when using --download.")
        sys.exit(1)

    if lots_arg:
        lots = [l.strip() for l in lots_arg.split(",") if l.strip()]
        if args.download:
            print("🚀 Running download + AI estimator (combined mode)...")
            process_lots_directly(lots, user_id)

        else:
            print(f"📦 Received {len(lots)} lots from trigger for user {user_id}: {lots}")
            process_lots_directly(lots, user_id)
    else:
        print("❌ Usage: python copart_download_parallel.py <user_id> --lots 12345678 --download")
