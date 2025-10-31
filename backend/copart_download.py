import os
import pandas as pd
import zipfile
import time
import urllib
from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine, text

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "LotSearchresults.csv")
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

DB_NAME = "cars"
TABLE_NAME = "cars"
SERVER = "localhost\\SQLEXPRESS"  # or "localhost\\SQLEXPRESS" if using SQL Express
DRIVER = "ODBC Driver 18 for SQL Server"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------

def get_engine():
    """Create SQLAlchemy engine for SQL Server."""
    try:
        connection_string = (
            f"Driver={{{DRIVER}}};"
            f"Server={SERVER};"
            f"Database={DB_NAME};"
            "Trusted_Connection=yes;"
            "Encrypt=no;"
        )
        params = urllib.parse.quote_plus(connection_string)
        engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}")
        print(f"✅ Connected successfully to SQL Server database '{DB_NAME}'!")
        return engine
    except Exception as e:
        print("❌ Database connection failed:", e)
        raise

# --------------------------------------------------
# LOAD CSV INTO DATABASE
# --------------------------------------------------

def load_csv_to_db(engine):
    print(f"📦 Loading {CSV_PATH} into SQL Server database '{DB_NAME}'...")

    df = pd.read_csv(CSV_PATH)

    df.rename(columns={
        'Lot URL': 'lot_url',
        'Lot/Inv #': 'lot_inv_num',
        'Est. Retail value': 'est_retail_value',
        'Sale date': 'sale_date',
        'Year': 'year',
        'Make': 'make',
        'Model': 'model',
        'Engine type': 'engine_type',
        'Cylinders': 'cylinders',
        'VIN': 'vin',
        'Title code': 'title_code',
        'Odometer': 'odometer',
        'Odometer description': 'odometer_description',
        'Damage description': 'damage_description',
        'Current bid': 'current_bid',
        'My bid': 'my_bid',
        'Item number': 'item_number',
        'Sale name': 'sale_name',
        'Auto grade': 'auto_grade',
        'Sale light': 'sale_light',
        'Announcements': 'announcements'
    }, inplace=True)

    for col in ["repair_estimate", "repair_details"]:
        if col not in df.columns:
            df[col] = None

    df.to_sql(TABLE_NAME, con=engine, if_exists='replace', index=False)
    print(f"✅ Loaded {len(df)} rows into table '{TABLE_NAME}' successfully.")

# --------------------------------------------------
# RETRIEVE LOT URLS FROM DATABASE
# --------------------------------------------------

def get_urls_from_db(engine, limit=1000):
    query = text(f"""
        SELECT lot_url
        FROM {TABLE_NAME}
        WHERE (repair_estimate IS NULL OR repair_estimate = '' OR repair_estimate = 0)
          AND lot_url IS NOT NULL
        ORDER BY lot_url
        OFFSET 0 ROWS FETCH NEXT {limit} ROWS ONLY;
    """)
    with engine.begin() as conn:
        df = pd.read_sql(query, conn)
    urls = df["lot_url"].dropna().tolist()
    print(f"🔗 Found {len(urls)} URLs needing download.")
    return urls

# --------------------------------------------------
# DOWNLOAD IMAGES USING PLAYWRIGHT
# --------------------------------------------------

def download_images(lot_url):
    """Opens Edge, navigates to Copart lot, downloads all images."""
    lot_id = lot_url.split("/lot/")[1].split("/")[0]
    lot_folder = os.path.join(DOWNLOAD_DIR, lot_id)
    os.makedirs(lot_folder, exist_ok=True)

    # ✅ Skip if images already exist
    existing_images = [
        f for f in os.listdir(lot_folder)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]
    if len(existing_images) >= 5:
        print(f"⏭️ Skipping {lot_id} — already has {len(existing_images)} images.")
        return True

    print(f"🚗 Starting download for lot {lot_id}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, channel="msedge")
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.goto(lot_url, timeout=60000)
        page.wait_for_selector("img", timeout=15000)

        selectors = [
            "a.lot-image-floating-CTA span.download-image-sprite-icon",
            "span.lot-details-header-sprite.download-image-sprite-icon",
            "button.download-image-sprite-icon",
            "div.lot-details-header-sprite.download-image-sprite-icon"
        ]

        download_clicked = False
        for sel in selectors:
            try:
                page.wait_for_selector(sel, timeout=5000)
                page.locator(sel).first.click()
                print(f"⬇️ Clicked download arrow via selector: {sel}")
                download_clicked = True
                break
            except Exception:
                continue

        if not download_clicked:
            print("⚠️ Could not click download arrow — trying hover...")
            page.hover("div.lot-image-container, img")
            page.wait_for_timeout(1000)
            for sel in selectors:
                try:
                    page.locator(sel).first.click()
                    print(f"⬇️ Clicked after hover: {sel}")
                    download_clicked = True
                    break
                except Exception:
                    continue

        if not download_clicked:
            print("❌ Still couldn’t find download button — skipping this lot.")
            browser.close()
            return False

        # ✅ Continue to click “Download all”
        try:
            page.wait_for_selector("text=Download all", timeout=8000)
            download_all = page.locator("text=Download all")
            with page.expect_download() as dl_info:
                download_all.first.click()
            dl = dl_info.value

            # Save ZIP directly into lot folder
            zip_path = os.path.join(lot_folder, dl.suggested_filename)
            dl.save_as(zip_path)
            print(f"📦 Saved ZIP to {zip_path}")

            # ✅ Extract it right after download
            move_and_unzip(lot_id)

        except Exception as e:
            print(f"⚠️ Could not click 'Download all': {e}")

        time.sleep(6)
        browser.close()

    print(f"✅ Finished lot {lot_id}.")
    return True

# --------------------------------------------------
# MOVE & UNZIP DOWNLOADED FILES
# --------------------------------------------------

def move_and_unzip(lot_id):
    """Finds ZIPs in the lot's download folder, extracts them there, and deletes the ZIP file."""
    lot_folder = os.path.join(DOWNLOAD_DIR, lot_id)
    os.makedirs(lot_folder, exist_ok=True)

    zip_files = [f for f in os.listdir(lot_folder) if f.lower().endswith(".zip")]
    if not zip_files:
        print(f"⚠️ No ZIP files found for lot {lot_id}")
        return

    for zip_file in zip_files:
        zip_path = os.path.join(lot_folder, zip_file)
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(lot_folder)
            os.remove(zip_path)
            print(f"🖼️ Extracted and removed ZIP: {zip_file}")
        except Exception as e:
            print(f"⚠️ Error extracting {zip_file}: {e}")

# --------------------------------------------------
# MAIN WORKFLOW
# --------------------------------------------------

def main():
    engine = get_engine()
    load_csv_to_db(engine)
    urls = get_urls_from_db(engine)

    total = len(urls)
    for i, url in enumerate(urls, 1):
        print(f"\n[{i}/{total}] Processing {url}")
        download_images(url)

    print("\n✅ All done — all images downloaded and unzipped!")

if __name__ == "__main__":
    main()
