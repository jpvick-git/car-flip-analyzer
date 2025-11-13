from flask import Flask, request
import os
import subprocess
import threading

app = Flask(__name__)

UPLOAD_DIR = r"C:\car-flip-analyzer\user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.route("/trigger", methods=["POST"])
def trigger_download():
    data = request.get_json(silent=True)
    if not data:
        return {"error": "Invalid JSON payload"}, 400

    user_id = str(data.get("user_id", "2"))
    new_lots = data.get("new_lots", [])

    if not new_lots:
        return {"error": "No lot numbers provided"}, 400

    print(f"🚀 Received trigger for user {user_id} with lots: {new_lots}")

    # Start the Copart download script in a background thread
    def run_scraper():
        try:
            print(f"▶️ Starting Copart download for user {user_id}")
            subprocess.run(
                [
                    "python",
                    "copart_download_parallel.py",
                    str(user_id),
                    "--lots",
                    ",".join(new_lots),
                    "--download",
                ],
                cwd=r"C:\car-flip-analyzer\backend",
            )
            print("✅ Copart download completed.")
        except Exception as e:
            print(f"❌ Error in run_scraper: {e}")

    threading.Thread(target=run_scraper).start()

    return {"status": "success", "lots": new_lots}


if __name__ == "__main__":
    app.run(port=5001)
