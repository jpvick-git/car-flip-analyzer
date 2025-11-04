import threading
import os
import pandas as pd
import zipfile
import time
import urllib
from concurrent.futures import ThreadPoolExecutor, as_completed
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
SERVER = "carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433"
USERNAME = "admin"         # 🔒 your actual RDS username
PASSWORD = "1K0xi*rfMR!r4VN7" # 🔒 your actual RDS password
DRIVER = "ODBC Driver 18 for SQL Server"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)


# --------------------------------------------------
# DATABASE CONNECTION (RDS)
# --------------------------------------------------

def get_engine():
    """Create SQLAlchemy engine for AWS RDS SQL Server."""
    try:
        connection_string = (
            f"Driver={{{DRIVER}}};"
            f"Server={SERVER};"
            f"Database={DB_NAME};"
            f"Uid={USERNAME};"
            f"Pwd={PASSWORD};"
            "Encrypt=yes;"
            "TrustServerCertificate=yes;"
        )
        params = urllib.parse.quote_plus(connection_string)
        engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}")
        print(f"✅ Connected successfully to RDS SQL Server database '{DB_NAME}'!")
        return engine
    except Exception as e:
        print("❌ Database connection failed:", e)
        raise


# --------------------------------------------------
# LOAD CSV INTO DATABASE
# --------------------------------------------------

def load_csv_to_db(engine):
    print(f"📦 Loading {CSV_PATH} into temporary table...")

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

    # load to temp table
    df.to_sql("cars_temp", con=engine, if_exists='replace', index=False)
    print("✅ Loaded CSV into temporary table 'cars_temp'.")

    # merge into main table
    with engine.begin() as conn:
        conn.execute(text("""
            MERGE cars AS target
            USING cars_temp AS source
            ON target.lot_url = source.lot_url
            WHEN MATCHED THEN
                UPDATE SET
                    target.year = source.year,
                    target.make = source.make,
                    target.model = source.model,
                    target.odometer = source.odometer,
                    target.damage_description = source.damage_description,
                    target.sale_date = source.sale_date
            WHEN NOT MATCHED THEN
                INSERT (lot_url, lot_inv_num, est_retail_value, sale_date, year, make, model,
                        engine_type, cylinders, vin, title_code, odometer, odometer_description,
                        damage_description, current_bid, my_bid, item_number, sale_name,
                        auto_grade, sale_light, announcements)
                VALUES (source.lot_url, source.lot_inv_num, source.est_retail_value, source.sale_date,
                        source.year, source.make, source.model, source.engine_type, source.cylinders,
                        source.vin, source.title_code, source.odometer, source.odometer_description,
                        source.damage_description, source.current_bid, source.my_bid, source.item_number,
                        source.sale_name, source.auto_grade, source.sale_light, source.announcements);
        """))
        print("✅ Merged new CSV data into 'cars' successfully.")
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
# MOVE & UNZIP DOWNLOADED FILES
# --------------------------------------------------

def move_and_unzip(target_folder):
    """Find and extract any .zip files in the target folder."""
    zip_files = [f for f in os.listdir(target_folder) if f.endswith(".zip")]
    if not zip_files:
        print("⚠️ No ZIP files found in target folder.")
        return

    for file in zip_files:
        zip_path = os.path.join(target_folder, file)
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(target_folder)
            os.remove(zip_path)
            print(f"🖼️ Extracted and removed {zip_path}")
        except Exception as e:
            print(f"⚠️ Error unzipping {zip_path}: {e}")


# --------------------------------------------------
# DOWNLOAD IMAGES USING PLAYWRIGHT
# --------------------------------------------------

def download_images(lot_url):
    """Opens Edge, navigates to Copart lot, downloads all images with a timeout."""
    lot_id = lot_url.split("/lot/")[1].split("/")[0]
    lot_folder = os.path.join(DOWNLOAD_DIR, lot_id)
    os.makedirs(lot_folder, exist_ok=True)

    existing_images = [f for f in os.listdir(lot_folder)
                       if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    if len(existing_images) >= 5:
        print(f"[⏭️] Skipping {lot_id} — already has {len(existing_images)} images.")
        return True

    print(f"🚗 Starting download for lot {lot_id}...")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                channel="msedge",
                args=["--disable-blink-features=AutomationControlled", "--start-maximized"]
            )

            # Auto timeout safety
            def watchdog():
                time.sleep(45)
                try:
                    browser.close()
                    print(f"⏰ Timeout: Closed browser for lot {lot_id}.")
                except Exception:
                    pass

            threading.Thread(target=watchdog, daemon=True).start()

            context = browser.new_context(accept_downloads=True)
            page = context.new_page()
            page.goto(lot_url, timeout=60000)

            try:
                page.wait_for_selector("img", timeout=15000)
            except:
                print(f"⚠️ Image load timeout for {lot_id}.")
                browser.close()
                return False

            # 🌀 Handle 360° image case — click the next image button
            try:
                if page.is_visible("span.p-galleria-item-next-icon.pi.pi-chevron-right"):
                    page.click("span.p-galleria-item-next-icon.pi.pi-chevron-right")
                    print(f"➡️ Clicked next image to skip 360° view for {lot_id}.")
                    time.sleep(1.5)  # give it time to update the image
            except Exception as e:
                print(f"⚠️ Could not click next image (maybe already normal image): {e}")

            # 🎯 Now look for the download arrow
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

            # 🖼️ Fallback: open image viewer if no download arrow
            if not download_clicked:
                try:
                    print(f"🔍 No download arrow found — opening image viewer for {lot_id}...")
                    page.click("#media-lot-image", timeout=5000)
                    page.wait_for_selector("a.p-pb-5.text-dark-gray-3.p-decor-none", timeout=8000)
                    print(f"🖼️ Image viewer opened — retrying download all...")
                    download_clicked = True
                except Exception as e:
                    print(f"❌ Could not open image viewer for {lot_id}: {e}")
                    browser.close()
                    return False

            # 📦 Try clicking "Download all"
            try:
                page.wait_for_selector("a.p-pb-5.text-dark-gray-3.p-decor-none", timeout=8000)
                download_all = page.locator("a.p-pb-5.text-dark-gray-3.p-decor-none")
                with page.expect_download() as dl_info:
                    download_all.first.click()
                dl = dl_info.value

                zip_path = os.path.join(lot_folder, f"{lot_id}.zip")
                dl.save_as(zip_path)
                print(f"📦 Saved ZIP to {zip_path}")

                move_and_unzip(lot_folder)
            except Exception as e:
                print(f"⚠️ Could not click 'Download all' for {lot_id}: {e}")
                browser.close()
                return False

            browser.close()
        print(f"✅ Finished lot {lot_id}.")
        return True

    except Exception as e:
        print(f"⚠️ Error during download for {lot_id}: {e}")
        return False

# --------------------------------------------------
# MAIN (Parallel)
# --------------------------------------------------

def main():
    engine = get_engine()
    load_csv_to_db(engine)
    urls = get_urls_from_db(engine)
    total = len(urls)
    if not urls:
        print("⚠️ No URLs found.")
        return

    print(f"🚀 Starting parallel downloads ({total} lots)...\n")
    failed_lots = []  # store failed lot IDs

    # First pass
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(download_images, url): url for url in urls}
        for i, future in enumerate(as_completed(futures), 1):
            url = futures[future]
            lot_id = url.split("/lot/")[1].split("/")[0]
            try:
                success = future.result()
                if success:
                    print(f"[{i}/{total}] ✅ Success for {lot_id}")
                else:
                    print(f"[{i}/{total}] ❌ Failed for {lot_id}")
                    failed_lots.append(lot_id)
            except Exception as e:
                print(f"[{i}/{total}] ❌ Error for {lot_id}: {e}")
                failed_lots.append(lot_id)

    # Retry failed lots once
    if failed_lots:
        print(f"\n🔁 Retrying {len(failed_lots)} failed lots...\n")
        retry_success = []
        retry_fail = []

        for lot_id in failed_lots:
            retry_url = f"https://www.copart.com/lot/{lot_id}"
            success = download_images(retry_url)
            if success:
                print(f"✅ Retry succeeded for {lot_id}")
                retry_success.append(lot_id)
            else:
                print(f"❌ Retry failed for {lot_id}")
                retry_fail.append(lot_id)

        # Write remaining failures to file
        if retry_fail:
            fail_path = os.path.join(BASE_DIR, "failed_lots.txt")
            with open(fail_path, "w") as f:
                f.write("\n".join(retry_fail))
            print(f"📄 Saved {len(retry_fail)} unrecoverable failures to {fail_path}")
        else:
            print("🎉 All failed lots succeeded on retry!")

    print("\n✅ All downloads complete.")


# --------------------------------------------------

if __name__ == "__main__":
    main()
