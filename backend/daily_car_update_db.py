import os
import pandas as pd
import sqlite3
from datetime import datetime

# --- CONFIGURATION ---
CSV_DIR = r"C:\car-flip-analyzer\backend"
DB_PATH = r"C:\sqlite\cars.db"
TABLE_NAME = "cars"
UNIQUE_KEY = "vin"  # or "lot_inv_num" if VIN is missing

def clean_column_names(df):
    """Standardize CSV column names to SQLite-safe format"""
    df.columns = (
        df.columns.str.strip()
        .str.lower()
        .str.replace(r"[^0-9a-zA-Z]+", "_", regex=True)
    )
    return df

def ensure_repair_columns(df):
    """Add AI repair columns if missing"""
    if "repair_estimate" not in df.columns:
        df["repair_estimate"] = None
    if "repair_details" not in df.columns:
        df["repair_details"] = None
    return df

def import_csv_to_sqlite(csv_path, conn):
    print(f"📄 Importing: {os.path.basename(csv_path)}")

    df = pd.read_csv(csv_path)
    df = clean_column_names(df)
    df = ensure_repair_columns(df)

    # Convert numeric columns if they exist
    numeric_cols = ["est_retail_value", "year", "cylinders", "odometer", "current_bid", "my_bid", "repair_estimate"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Create table if it doesn't exist
    df.head(0).to_sql(TABLE_NAME, conn, if_exists="append", index=False)

    # Load existing VINs to avoid duplicates
    existing_vins = set()
    try:
        existing_vins = set(pd.read_sql(f"SELECT {UNIQUE_KEY} FROM {TABLE_NAME}", conn)[UNIQUE_KEY].dropna().unique())
    except Exception:
        pass  # first run

    # Filter new rows
    if UNIQUE_KEY in df.columns:
        df = df[~df[UNIQUE_KEY].isin(existing_vins)]

    if len(df) > 0:
        df.to_sql(TABLE_NAME, conn, if_exists="append", index=False)
        print(f"✅ Imported {len(df)} new rows.")
    else:
        print("⚠️ No new rows to import.")

def main():
    conn = sqlite3.connect(DB_PATH)
    csv_files = [f for f in os.listdir(CSV_DIR) if f.lower().endswith(".csv")]

    if not csv_files:
        print("⚠️ No CSV files found.")
        return

    for csv_file in csv_files:
        csv_path = os.path.join(CSV_DIR, csv_file)
        try:
            import_csv_to_sqlite(csv_path, conn)
        except Exception as e:
            print(f"❌ Failed to import {csv_file}: {e}")

    conn.close()
    print("🏁 Done with daily import.")

if __name__ == "__main__":
    main()
