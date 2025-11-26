from flask import Flask, request, jsonify
import subprocess
import os
import shutil
from datetime import datetime
import requests
import json

app = Flask(__name__)

# === CONFIG ===
ROOT = r"C:\car-flip-analyzer"
BACKEND_DIR = os.path.join(ROOT, "backend")

PYTHON_PATH = os.path.join(ROOT, "venv", "Scripts", "python.exe")
AI_SCRIPT = os.path.join(BACKEND_DIR, "ai_repair_estimator.py")
COPART_SCRIPT = os.path.join(BACKEND_DIR, "copart_download_parallel.py")

DOWNLOADS = os.path.join(ROOT, "downloads")             # mirror Linux backend
MANUAL_UPLOADS = os.path.join(ROOT, "manual_uploads")   # raw files storage
LOGS_DIR = os.path.join(BACKEND_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)


def get_log_file(task_name, ident):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(LOGS_DIR, f"{task_name}_{ident}_{timestamp}.log")


# ---------------------------------------------------------------------
# MANUAL AI PROCESSING
# ---------------------------------------------------------------------
@app.route("/manual_ai", methods=["POST"])
def manual_ai():
    try:
        data = request.get_json(force=True)
        print(f"📦 Received MANUAL AI payload: {data}")

        vehicle_id = data.get("vehicle_id")
        images = data.get("image_urls", {})

        if not vehicle_id:
            return jsonify({"error": "Missing vehicle_id"}), 400

        if not images:
            return jsonify({"error": "No image URLs provided"}), 400

        # === Prepare folder ===
        folder = os.path.join(BASE_DIR, "manual_uploads", str(vehicle_id))
        os.makedirs(folder, exist_ok=True)

        # === Download each image ===
        import requests

        for label, url in images.items():
            response = requests.get(url, stream=True)
            ext = ".jpg"
            filename = f"{vehicle_id}_{label}{ext}"
            save_path = os.path.join(folder, filename)

            with open(save_path, "wb") as f:
                shutil.copyfileobj(response.raw, f)

        # === Run the AI tool ===
        ai_log_file = get_log_file(vehicle_id, "manual_ai")

        with open(ai_log_file, "w") as log_file:
            subprocess.Popen(
                [
                    PYTHON_PATH,
                    AI_SCRIPT,
                    "--manual",
                    str(vehicle_id),
                    "--folder",
                    folder
                ],
                cwd=BASE_DIR,
                stdout=log_file,
                stderr=log_file
            )

        return jsonify({
            "status": "manual_ai_started",
            "vehicle_id": vehicle_id,
            "images": list(images.keys())
        })

    except Exception as e:
        print(f"❌ Error in manual_ai: {e}")
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------
# COPART / AI TRIGGER (unchanged)
# ---------------------------------------------------------------------
@app.route("/trigger", methods=["POST"])
def trigger():
    try:
        data = request.get_json(force=True)
        print("📦 Received Trigger:", data)

        user_id = data.get("user_id")
        ai_lots = data.get("ai_lots", [])
        copart_lots = data.get("copart_lots", [])

        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400

        # === Copart ===
        if copart_lots:
            log_file = get_log_file("copart", user_id)
            with open(log_file, "w") as lf:
                subprocess.Popen(
                    [
                        PYTHON_PATH,
                        COPART_SCRIPT,
                        str(user_id),
                        "--lots", ",".join(map(str, copart_lots)),
                        "--download"
                    ],
                    cwd=BACKEND_DIR,
                    stdout=lf,
                    stderr=lf
                )

        # === AI Estimator ===
        if ai_lots:
            log_file = get_log_file("ai", user_id)
            with open(log_file, "w") as lf:
                subprocess.Popen(
                    [
                        PYTHON_PATH,
                        AI_SCRIPT,
                        str(user_id),
                        "--lots", ",".join(map(str, ai_lots))
                    ],
                    cwd=BACKEND_DIR,
                    stdout=lf,
                    stderr=lf
                )

        return jsonify({
            "status": "success",
            "user_id": user_id,
            "ai_lots": ai_lots,
            "copart_lots": copart_lots
        })

    except Exception as e:
        print("❌ trigger ERROR:", e)
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------
# START SERVER
# ---------------------------------------------------------------------
if __name__ == "__main__":
    print("🚀 Local Listener Running at http://127.0.0.1:5001")
    app.run(host="127.0.0.1", port=5001)
