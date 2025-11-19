import subprocess
import os
import sys
import time

# Base directory — adjust if needed
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# File paths
COPART_SCRIPT = os.path.join(BASE_DIR, "copart_download_parallel.py")
DELETE_SCRIPT = os.path.join(BASE_DIR, "folder_delete.py")
AI_ESTIMATOR_SCRIPT = os.path.join(BASE_DIR, "ai_repair_estimator.py")

def run_script(script_path, label):
    """Run a Python script and stream its output live."""
    print(f"\n🚀 Starting {label}...\n{'-' * 60}")
    start = time.time()

    result = subprocess.run(
        [sys.executable, script_path],
        cwd=BASE_DIR,
        text=True,
        capture_output=False
    )

    elapsed = time.time() - start
    print(f"\n✅ Finished {label} in {elapsed/60:.1f} min\n{'=' * 60}\n")

def main():
    print("🧠 Beginning full Car Flip Analyzer DB update sequence...\n")

    try:
        # Step 1: Run Copart downloader (refresh CSV + download images)
        run_script(COPART_SCRIPT, "Copart Download & DB Refresh")

        # Step 2: Clean up expired lots BEFORE running AI
        run_script(DELETE_SCRIPT, "Expired Lot Cleanup (Folder & DB)")

        # Step 3: Run AI repair/resale estimator
        run_script(AI_ESTIMATOR_SCRIPT, "AI Repair & Resale Estimator")

        print("🎉 All update steps completed successfully!")

    except Exception as e:
        print(f"❌ Error running update sequence: {e}")

if __name__ == "__main__":
    main()
