import os

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
BASE_DIR = r"C:\car-flip-analyzer\backend"
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

# --------------------------------------------------
# DELETE .TXT FILES
# --------------------------------------------------
def delete_txt_files(directory):
    deleted_count = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(".txt"):
                file_path = os.path.join(root, file)
                try:
                    os.remove(file_path)
                    print(f"🗑️ Deleted: {file_path}")
                    deleted_count += 1
                except Exception as e:
                    print(f"⚠️ Error deleting {file_path}: {e}")
    print(f"\n✅ Done. Deleted {deleted_count} .txt file(s).")

# --------------------------------------------------
# RUN
# --------------------------------------------------
if __name__ == "__main__":
    if os.path.exists(DOWNLOAD_DIR):
        delete_txt_files(DOWNLOAD_DIR)
    else:
        print(f"❌ Folder not found: {DOWNLOAD_DIR}")
