from flask import Flask, request
import subprocess
import threading
import os

app = Flask(__name__)

@app.route("/trigger", methods=["POST"])
def trigger_download():
    data = request.json
    csv_path = data.get("csv_path")
    user_id = data.get("user_id", 2)

    # --- Fix: Convert Ubuntu path to Windows path ---
    if csv_path.startswith("/root/car-flip-analyzer/"):
        csv_path = csv_path.replace("/root/car-flip-analyzer/", "C:/car-flip-analyzer/").replace("/", "\\")

    print(f"🚀 Received trigger for CSV: {csv_path}")

    def run_scraper():
        subprocess.run([
            "python", "copart_download_parallel.py",
            csv_path, str(user_id)
        ], cwd=r"C:\car-flip-analyzer\backend")

    threading.Thread(target=run_scraper).start()
    return {"status": "started"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
