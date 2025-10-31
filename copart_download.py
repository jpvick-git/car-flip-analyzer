"""
copart_download.py — Edge Human Mode (Auto-Unzip + Auto-Close Edition)
---------------------------------------------------------------------
Attaches Playwright to your real Edge profile (bypasses Copart automation blocking),
downloads the ZIP of listing images, extracts them, and closes the Edge window automatically.

Folders:
  ./downloads/
  ./debug_screenshots/
"""
print(">>> copart_download.py started <<<")

import asyncio
import os
import time
import subprocess
import zipfile
from urllib.parse import urlparse
from playwright.async_api import async_playwright

# ------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
DEBUG_DIR = os.path.join(BASE_DIR, "debug_screenshots")

EDGE_EXECUTABLE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
USER_DATA_DIR = r"C:\Users\Jason\AppData\Local\Microsoft\Edge\User Data\Default"
REMOTE_DEBUG_PORT = 9222

os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)

# ------------------------------------------------------
# HELPERS
# ------------------------------------------------------
def _lot_id_from_url(url: str) -> str:
    """Extract Copart lot number from URL."""
    parts = urlparse(url).path.split("/")
    if "lot" in parts:
        return parts[parts.index("lot") + 1]
    return str(int(time.time()))


async def _take_debug_screenshot(page, lot_id: str, tag="debug"):
    """Capture screenshot for debugging."""
    path = os.path.join(DEBUG_DIR, f"{tag}_{lot_id}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[debug] saved screenshot → {path}")
    except Exception as e:
        print(f"[debug] screenshot failed: {e}")


def _safe_folder_name(*parts):
    """Combine parts (e.g. lot, year, make, model) safely for folder names."""
    text = "_".join(str(p) for p in parts if p).strip()
    return "".join(c for c in text if c.isalnum() or c in ("_", "-", " ")).replace(" ", "_")


# ------------------------------------------------------
# MAIN ASYNC FUNCTION
# ------------------------------------------------------
async def run_for_api(url: str, year=None, make=None, model=None):
    lot_id = _lot_id_from_url(url)
    print(f"🟢 Attaching to Edge session for lot {lot_id}...")

    # Launch Edge in remote debugging mode
    edge_cmd = [
        EDGE_EXECUTABLE,
        f"--remote-debugging-port={REMOTE_DEBUG_PORT}",
        f"--user-data-dir={USER_DATA_DIR}",
        "--start-minimized",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled"
    ]
    print("🚀 Launching Edge (keep it open)...")
    edge_proc = subprocess.Popen(edge_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(3)

    async with async_playwright() as p:
        print("🔗 Connecting to Edge...")
        browser = await p.chromium.connect_over_cdp(f"http://localhost:{REMOTE_DEBUG_PORT}")
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else await context.new_page()

        print(f"🌐 Opening {url} ...")
        await page.goto(url, wait_until="load", timeout=60000)

        # --- Confirm main content loaded ---
        try:
            await page.wait_for_selector("div.lot-details-header, div[data-testid='lotDetails']", timeout=60000)
            await page.wait_for_selector("img[src*='copart']", timeout=10000)
            print("✅ Page visuals loaded (main image found).")
        except Exception as e:
            print(f"⚠️ Page structure may have changed: {e}")
            await _take_debug_screenshot(page, lot_id, "load_fail")

        # --- Scroll to image gallery ---
        await page.mouse.wheel(0, 3000)
        await page.wait_for_timeout(1000)

        # --- Locate and click download icon ---
        possible_arrows = [
            "button:has(svg[aria-label='download'])",
            "span.download-image-sprite-icon",
            "div[role='button'] svg[aria-label*='Download']",
            "button[aria-label*='Download']",
            "text=Download Images",
        ]
        print("🔽 Searching for download arrow icon...")
        arrow_clicked = False
        for sel in possible_arrows:
            try:
                await page.wait_for_selector(sel, timeout=8000)
                await page.locator(sel).click(force=True)
                print(f"✅ Clicked download arrow using selector: {sel}")
                arrow_clicked = True
                break
            except Exception as e:
                print(f"⚠️ Selector '{sel}' not found or failed: {e}")

        if not arrow_clicked:
            print("❌ No download arrow found — taking screenshot.")
            await _take_debug_screenshot(page, lot_id, "arrow_fail")
            return

        # --- Click "Download all" and wait for ZIP ---
        print("📦 Searching for 'Download all' link...")
        selectors = [
            "a:has-text('Download all')",
            "text=Download all",
            "a[href*='Download']",
            "div.lot-details-header a",
            "//a[contains(text(), 'Download all')]"
        ]

        zip_path = None
        for sel in selectors:
            try:
                await page.wait_for_selector(sel, timeout=15000)
                async with page.expect_download() as dl_info:
                    await page.locator(sel).click(force=True)
                download = await dl_info.value

                filename = _safe_folder_name(lot_id, year, make, model) + ".zip"
                zip_path = os.path.join(DOWNLOAD_DIR, filename)
                await download.save_as(zip_path)
                print(f"✅ Downloaded ZIP: {zip_path}")
                break
            except Exception as e:
                print(f"⚠️ '{sel}' failed: {e}")

        if not zip_path:
            print("❌ Could not find or download ZIP.")
            await _take_debug_screenshot(page, lot_id, "download_fail")
            return

        # --- Unzip the downloaded file (with fallback) ---
        try:
            await asyncio.sleep(2)
            if not os.path.exists(zip_path):
                candidates = [f for f in os.listdir(DOWNLOAD_DIR) if f.lower().endswith(".zip")]
                if candidates:
                    latest = max(
                        [os.path.join(DOWNLOAD_DIR, f) for f in candidates],
                        key=os.path.getmtime
                    )
                    zip_path = latest
                    print(f"📁 Using latest ZIP found: {os.path.basename(zip_path)}")
                else:
                    print("⚠️ No ZIP file found to extract.")
                    return

            extract_dir = os.path.join(
                DOWNLOAD_DIR,
                _safe_folder_name(lot_id, year, make, model)
            )
            os.makedirs(extract_dir, exist_ok=True)

            print(f"📦 Extracting ZIP → {extract_dir}")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)

            files = os.listdir(extract_dir)
            if files:
                print(f"📂 Extracted {len(files)} files to: {extract_dir}")
            else:
                print("⚠️ No files found after extraction.")
        except zipfile.BadZipFile:
            print(f"⚠️ The downloaded file {zip_path} is not a valid ZIP.")
        except Exception as e:
            print(f"⚠️ Error while extracting {zip_path}: {e}")

        print("✅ Process complete.")

        # --- Auto-close Edge ---
        try:
            print("🧹 Closing browser window...")
            await browser.close()
            edge_proc.terminate()
            await asyncio.sleep(1)
            print("💨 Edge closed successfully.")
        except Exception as e:
            print(f"⚠️ Failed to close Edge: {e}")


# ------------------------------------------------------
# WRAPPER (for FastAPI or other callers)
# ------------------------------------------------------
def run_for_api_sync(url: str, year=None, make=None, model=None):
    asyncio.run(run_for_api(url, year, make, model))


# ------------------------------------------------------
# CLI ENTRYPOINT
# ------------------------------------------------------
if __name__ == "__main__":
    import sys
    args = sys.argv[1:]
    test_url = args[0] if args else \
        "https://www.copart.com/lot/81642565/clean-title-2023-ram-2500-big-horn-al-tanner"
    year = args[1] if len(args) > 1 else None
    make = args[2] if len(args) > 2 else None
    model = args[3] if len(args) > 3 else None

    print("=== Running copart_download.py (Human Mode) ===")
    run_for_api_sync(test_url, year, make, model)
