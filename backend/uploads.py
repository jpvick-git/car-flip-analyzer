# (The rest of the imports and setup are unchanged)
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

import sys
with open("copart_debug_log.txt", "a") as f:
    f.write("Script started\n")
    f.flush()

print("Script print reached", flush=True)

# CONFIGURATION
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

# RDS connection
RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
rds_engine = create_engine(RDS_CONN, pool_pre_ping=True)

user_id = None

def parse_args():
    parser = argparse.ArgumentParser(description="Copart Downloader & AI Estimator")
    parser.add_argument("user_id", help="User ID running the download")
    parser.add_argument("--lots", help="Comma-separated list of lot numbers", default=None)
    parser.add_argument("--download", action="store_true", help="Run image download directly")
    return parser.parse_args()

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

def normalize_lot(val):
    if pd.isna(val):
        return ""
    val = str(val).strip()
    if val.endswith(".0"):
        val = val[:-2]
    return val.replace(",", "").strip()

def extract_zip(download_path, lot_number, lot_url):
    target_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
    os.makedirs(target_dir, exist_ok=True)

    with zipfile.ZipFile(download_path, "r") as zip_ref:
        zip_ref.extractall(target_dir)
    print(f"Extracted images for lot {lot_number} to {target_dir}")

    try:
        files = sorted([
            f for f in os.listdir(target_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ])

        if not files:
            print(f"No images found for lot {lot_number}")
            return

        first_img = files[0]
        image_url = (
            f"https://raw.githubusercontent.com/jpvick-git/car-flip-analyzer/"
            f"main/backend/downloads/{lot_number}/{first_img}"
        )
        print(f"First image detected: {image_url}")

        with rds_engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE user_vehicles
                    SET image_url = :url,
                        lot_url = :lot_url
                    WHERE lot_number = :lot AND user_id = :uid
                """),
                {
                    "url": image_url,
                    "lot_url": lot_url,
                    "lot": str(lot_number),
                    "uid": int(user_id)
                }
            )

        if result.rowcount == 0:
            print(f"No DB rows updated for LOT={lot_number} USER_ID={user_id}")
        else:
            print(f"Saved image and lot URL to DB for lot {lot_number}")

    except Exception as e:
        print(f"Error saving image URL for lot {lot_number}: {e}")

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

def download_copart_images(lot_number, lot_url):
    print(f"Downloading images for lot {lot_number} from {lot_url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            page.goto(lot_url, timeout=90000)
            page.wait_for_timeout(4000)

            if is_360_image(page):
                click_next_image(page)

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

            target = None
            for _ in range(90):
                target = find_download_all_element(page)
                if target:
                    break
                page.wait_for_timeout(500)

            if not target:
                raise Exception("'Download all' not found")

            with page.expect_download(timeout=180000) as download_info:
                target.click()

            download = download_info.value
            zip_path = os.path.join(DOWNLOAD_DIR, f"{lot_number}.zip")
            download.save_as(zip_path)

            extract_zip(zip_path, lot_number, lot_url)
            os.remove(zip_path)

            print(f"Images downloaded for lot {lot_number}")

        except Exception as e:
            print(f"Error for lot {lot_number}: {e}")

        finally:
            page.wait_for_timeout(5000)
            context.close()
            browser.close()

def process_lots_directly(lots, uid):
    from ai_repair_estimator import analyze_vehicle

    global user_id
    user_id = uid

    try:
        with rds_engine.begin() as conn:
            for lot in lots:
                row = conn.execute(
                    text("""
                        SELECT TOP 1 * FROM user_vehicles
                        WHERE lot_number = :lot AND user_id = :uid
                    """),
                    {"lot": lot, "uid": user_id}
                ).fetchone()

                if not row:
                    print(f"Lot {lot} not found; skipping.")
                    continue

                v = dict(row._mapping)
                lot_url = v.get("lot_url") or f"https://www.copart.com/lot/{lot}"
                download_copart_images(lot, lot_url)

                try:
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

                except Exception as e:
                    print(f"AI estimation error for lot {lot}: {e}")

                time.sleep(SLEEP_BETWEEN_LOTS)

    except Exception as e:
        print(f"Fatal error: {e}")

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
