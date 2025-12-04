import os
import time
import zipfile
import shutil
import requests
import argparse
from sqlalchemy import create_engine, text
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
API_BASE_URL = "https://api.carflipanalyzer.com" # Points to your VPS

# Ensure download dir exists
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------
# Use the connection string from your .env or fallback to the one in your files
PG_CONN = os.getenv("DATABASE_URL", "postgresql+psycopg2://carflip_user:AVNS_KMNjNg_8wx4vECPoFfh@carflip-db-do-user-28471662-0.i.db.ondigitalocean.com:25060/carflip?sslmode=require")
rds_engine = create_engine(PG_CONN, pool_pre_ping=True)

# --------------------------------------------------
# UPLOAD HELPER (THE FIX)
# --------------------------------------------------
def upload_image_to_vps(lot_number, local_image_path):
    """Uploads the local Windows file to the VPS so the web app can see it."""
    url = f"{API_BASE_URL}/upload_image"
    filename = os.path.basename(local_image_path)
    
    print(f"⬆️ Uploading {filename} to VPS...")
    
    try:
        with open(local_image_path, "rb") as f:
            files = {"file": (filename, f, "image/jpeg")}
            data = {"lot": str(lot_number)}
            response = requests.post(url, data=data, files=files, timeout=30)
            
        if response.status_code == 200:
            # Return the Web URL that the Frontend will use
            return f"{API_BASE_URL}/backend/downloads/{lot_number}/{filename}"
        else:
            print(f"❌ Upload failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Upload Error: {e}")
        return None

# --------------------------------------------------
# ZIP EXTRACTION & UPLOAD
# --------------------------------------------------
def extract_and_upload(zip_path, lot_number, user_id):
    target_dir = os.path.join(DOWNLOAD_DIR, str(lot_number))
    
    # Clean previous attempts
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    os.makedirs(target_dir, exist_ok=True)

    # Extract
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(target_dir)

    # Find images
    images = sorted([
        f for f in os.listdir(target_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ])

    if not images:
        print(f"❌ No images found in zip for lot {lot_number}")
        return

    # ⬆️ UPLOAD IMAGES TO VPS ⬆️
    remote_image_url = None
    
    for img_name in images:
        local_path = os.path.join(target_dir, img_name)
        uploaded_url = upload_image_to_vps(lot_number, local_path)
        
        # Save the first successful upload as the main image
        if uploaded_url and remote_image_url is None:
            remote_image_url = uploaded_url

    # UPDATE DB
    if remote_image_url:
        try:
            with rds_engine.begin() as conn:
                conn.execute(
                    text("""
                        UPDATE user_vehicles
                        SET image_url = :url,
                            lot_url   = :lot_url
                        WHERE lot_number = :lot AND user_id = :uid
                    """),
                    {
                        "url": remote_image_url,
                        "lot_url": f"https://www.copart.com/lot/{lot_number}",
                        "lot": str(lot_number),
                        "uid": int(user_id)
                    }
                )
            print(f"✅ Database updated for lot {lot_number}")
        except Exception as e:
            print(f"❌ DB Update Error: {e}")

# --------------------------------------------------
# PLAYWRIGHT DOWNLOADER
# --------------------------------------------------
def download_copart_images(lot_number, user_id):
    print(f"Processing Lot {lot_number}...")
    lot_url = f"https://www.copart.com/lot/{lot_number}"

    with sync_playwright() as p:
        # Launch Headful (visible) to bypass bot detection
        browser = p.chromium.launch(headless=False) 
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            page.goto(lot_url, timeout=60000)
            
            # Simple selector logic for "Download All" (simplified for stability)
            # You may need to update selectors if Copart changes their UI
            try:
                page.wait_for_selector("span.download-image-sprite-icon", timeout=5000)
                page.click("span.download-image-sprite-icon")
                
                with page.expect_download(timeout=30000) as download_info:
                    page.click("button:has-text('Download all')") # Adjust selector based on actual UI
                    
                download = download_info.value
                zip_path = os.path.join(DOWNLOAD_DIR, f"{lot_number}.zip")
                download.save_as(zip_path)
                
                # Extract and Upload
                extract_and_upload(zip_path, lot_number, user_id)
                
                # Clean up zip
                if os.path.exists(zip_path):
                    os.remove(zip_path)

            except Exception as e:
                print(f"⚠️ Could not automate download for {lot_number}: {e}")

        except Exception as e:
            print(f"❌ Browser Error: {e}")
        finally:
            context.close()
            browser.close()

# --------------------------------------------------
# MAIN EXECUTION
# --------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("user_id", help="User ID")
    parser.add_argument("--lots", help="Comma-separated lot numbers")
    parser.add_argument("--download", action="store_true")
    
    args = parser.parse_args()
    
    if args.lots:
        lots = [l.strip() for l in args.lots.split(",") if l.strip()]
        for lot in lots:
            download_copart_images(lot, args.user_id)
            time.sleep(2)