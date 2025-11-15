from flask import Flask, request, jsonify
import subprocess
import os
from datetime import datetime

app = Flask(__name__)

# === CONFIG ===
BASE_DIR = r"C:\car-flip-analyzer\backend"
PYTHON_PATH = os.path.join(BASE_DIR, "..", "venv", "Scripts", "python.exe")
COPART_SCRIPT = os.path.join(BASE_DIR, "copart_download_parallel.py")
AI_SCRIPT = os.path.join(BASE_DIR, "ai_repair_estimator.py")
LOGS_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

def get_log_file(user_id, task_name):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(LOGS_DIR, f"{task_name}_user{user_id}_{timestamp}.log")

@app.route("/trigger", methods=["POST"])
def trigger():
    try:
        data = request.get_json(force=True)
        print(f"📦 Received trigger payload: {data}")

        user_id = data.get("user_id")
        ai_lots = data.get("ai_lots", [])
        copart_lots = data.get("copart_lots", [])

        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400
        if not ai_lots and not copart_lots:
            return jsonify({"error": "No lot numbers provided"}), 400

        # === Launch Copart Downloader ===
        if copart_lots:
            print(f"🚗 Launching Copart downloader for lots: {copart_lots}")
            copart_log_file = get_log_file(user_id, "copart")
            with open(copart_log_file, "w") as log_file:
                subprocess.Popen(
                    [
                        PYTHON_PATH,
                        COPART_SCRIPT,
                        str(user_id),
                        "--lots", ",".join(map(str, copart_lots)),
                        "--download"
                    ],
                    cwd=BASE_DIR,
                    stdout=log_file,
                    stderr=log_file
                )
                print(f"📝 Logging Copart output to: {copart_log_file}")

        # === Launch AI Estimator ===
        if ai_lots:
            print(f"🤖 Launching AI estimator for lots: {ai_lots}")
            ai_log_file = get_log_file(user_id, "ai")
            with open(ai_log_file, "w") as log_file:
                subprocess.Popen(
                    [
                        PYTHON_PATH,
                        AI_SCRIPT,
                        str(user_id),
                        "--lots", ",".join(map(str, ai_lots))
                    ],
                    cwd=BASE_DIR,
                    stdout=log_file,
                    stderr=log_file
                )
                print(f"📝 Logging AI output to: {ai_log_file}")

        return jsonify({
            "status": "success",
            "user_id": user_id,
            "ai_lots": ai_lots,
            "copart_lots": copart_lots
        }), 200

    except Exception as e:
        print(f"❌ Error in trigger: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("🚀 Starting Local Listener on http://127.0.0.1:5001")
    print(f"🗂️  Watching: {BASE_DIR}")
    app.run(host="127.0.0.1", port=5001)
