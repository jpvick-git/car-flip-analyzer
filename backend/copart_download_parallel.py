import os
import re
import sys
import time
import zipfile
import json
import shutil
import pandas as pd
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy import create_engine, text
from openai import OpenAI
import argparse

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
MAX_IMAGES = 8  # up to 8 Copart photos per vehicle

# Database connection (RDS)
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
    parser.add_argument("--download", action="store_true", help="Run download and AI sequence")
    return parser.parse_args()

# --------------------------------------------------
# EXISTING FUNCTIONS (keep yours here)
# --------------------------------------------------
def normalize_lot(val):
    """Normalize lot_number to clean string digits (no .0, commas, spaces)."""
    if pd.isna(val):
        return ""
    val = str(val).strip()
    if val.endswith(".0"):
        val = val[:-2]
    return val.replace(",", "").strip()


def import_csv_to_db(csv_path, user_id):
    """Existing import routine for CSV uploads"""
    df = pd.read_csv(csv_path)
    print(f"📄 Loaded CSV: {csv_path} ({len(df)} rows)")
    # your existing import logic continues here ...
    return df


def main(csv_path, user_id):
    """Your original CSV-based download + AI logic"""
    print(f"👤 User ID: {user_id}")
    print(f"📄 CSV Path: {csv_path}")
    df = import_csv_to_db(csv_path, user_id)
    # ... rest of your existing main() logic (unchanged) ...


# --------------------------------------------------
# NEW: DIRECT LOT PROCESSING MODE
# --------------------------------------------------
def process_lots_directly(lots, user_id):
    """
    Skip CSV and pull lot data directly from DB.
    Downloads images and triggers AI estimation for each lot.
    """
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

                # --- Download Copart images ---
                print(f"⬇️  Downloading images for lot {lot} ...")
                try:
                    subprocess.run(
                        [
                            "python",
                            "copart_image_downloader.py",  # (adjust if your script name differs)
                            str(lot),
                        ],
                        cwd=BASE_DIR,
                        check=True,
                    )
                except Exception as e:
                    print(f"⚠️  Image download failed for lot {lot}: {e}")

                # --- AI Estimation ---
                try:
                    print("🧠 Running AI repair/resale estimation ...")
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

    if lots_arg:
        lots = [l.strip() for l in lots_arg.split(",") if l.strip()]
        print(f"📦 Received {len(lots)} lots from trigger for user {user_id}: {lots}")
        process_lots_directly(lots, user_id)
    else:
        # Fallback to CSV path mode (legacy)
        if len(sys.argv) < 3:
            print("❌ Usage: python copart_download_parallel.py <csv_path> <user_id>")
            sys.exit(1)
        csv_path = sys.argv[1]
        user_id = sys.argv[2]
        main(csv_path, user_id)
