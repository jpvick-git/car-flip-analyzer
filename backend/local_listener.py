from flask import Flask, request, jsonify
import subprocess
import os

app = Flask(__name__)

@app.route("/trigger", methods=["POST"])
def trigger():
    try:
        # ✅ Safely parse JSON body
        data = request.get_json(force=True)
        print(f"📦 Received trigger payload: {data}")

        user_id = data.get("user_id")
        ai_lots = data.get("ai_lots", [])
        copart_lots = data.get("copart_lots", [])

        # ✅ Validation
        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400
        if not ai_lots and not copart_lots:
            return jsonify({"error": "No lot numbers provided"}), 400

        # ✅ Trigger Copart downloader (new lots only)
        if copart_lots:
            print(f"🚗 Launching Copart downloader for lots: {copart_lots}")
            subprocess.Popen([
                "python", "/copart_download_parallel.py",
                str(user_id),
                "--lots", ",".join(map(str, copart_lots))
            ])

        # ✅ Trigger AI estimator (missing repair_estimates)
        if ai_lots:
            print(f"🤖 Launching AI estimator for lots: {ai_lots}")
            subprocess.Popen([
                "python", "ai_repair_estimator.py",
                str(user_id),
                "--lots", ",".join(map(str, ai_lots))
            ])

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
    app.run(host="127.0.0.1", port=5001)
