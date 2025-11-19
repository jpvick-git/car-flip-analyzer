import os

# Define the target path
base_path = r"C:\car-flip-analyzer\backend\downloads"

# Walk the directory tree from bottom to top so subfolders get removed first
for root, dirs, files in os.walk(base_path, topdown=False):
    for d in dirs:
        folder_path = os.path.join(root, d)
        # Check if the folder is empty
        if not os.listdir(folder_path):
            try:
                os.rmdir(folder_path)
                print(f"✅ Deleted empty folder: {folder_path}")
            except Exception as e:
                print(f"⚠️ Could not delete {folder_path}: {e}")

print("Done cleaning up empty folders.")
