import os
import re
import pyodbc

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

# SQL Server connection info
SERVER = r"DUNDER\SQLEXPRESS"       # your SQL Server instance
DATABASE = "CarFlipAnalyzer"         # your database name
TABLE_NAME = "cars"                  # your table name

# Connect to SQL Server using Windows Authentication
def get_connection():
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={SERVER};"
        f"DATABASE={DATABASE};"
        f"Trusted_Connection=yes;"
    )
    return pyodbc.connect(conn_str)

# ------------------------------------------------------------

def extract_lot_id_from_folder(folder_name):
    """Return numeric lot ID from folder name if possible."""
    match = re.search(r"\d+", folder_name)
    return match.group(0) if match else None

def get_repair_data(lot_dir):
    """Read text files with repair details and estimate from each lot
