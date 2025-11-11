from flask import Flask, request
import os
import subprocess
import threading

app = Flask(__name__)

UPLOAD_DIR = r"C:\car-flip-analyzer\user_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.route("/trigger", methods=["POST"])
def trigger_download():
    user_id = request.form.get("user_id", "2")
    uploaded_file = request.files.get("file")

    if not uploaded_file:
        return {"error": "No file received"}, 400

    # Save the uploaded CSV locally
    file_path = os.path.join(UPLOAD_DIR, uploaded_file.filename)
    uploaded_file.save(file_path)
    print(f"📄 Received and saved CSV: {file_path}")

    # Start the Copart download script in a background thread
    def run_scraper():
        print(f"🚀 Starting Copart download for user {user_id}")
        subprocess.run([
            "python", "copart_download_parallel.py",
            str(user_id), file_path  # ✅ swapped order
        ], cwd=r"C:\car-flip-analyzer\backend")

    threading.Thread(target=run_scraper).start()

    return {"status": "success", "saved": file_path}

if __name__ == "__main__":
    app.run(port=5001)
