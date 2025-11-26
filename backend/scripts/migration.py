import pyodbc
import psycopg2
from psycopg2.extras import execute_values

# -----------------------------
# CONFIGURATION
# -----------------------------

SQLSERVER_CONN = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433;"
    "DATABASE=cars;"
    "UID=jpvick-git;"
    "PWD=Nk^+Cq4MfUNt%8q;"
    "Encrypt=yes;TrustServerCertificate=yes;"
)

POSTGRES_CONN = {
    "host": "carflip-db-do-user-28471662-0.i.db.ondigitalocean.com",
    "port": 25060,
    "dbname": "carflip",
    "user": "carflip_user",
    "password": "AVNS_KMNjNg_8wx4vECPoFfh",
    "sslmode": "require"
}

TABLES = [
    "users",
    "user_vehicles",
    "tax_title_fees",
    "car_specs"
]

# -----------------------------
# MIGRATION LOGIC
# -----------------------------

def migrate_table(table):
    print(f"\n=== Migrating {table} ===")

    # Connect to SQL Server
    src = pyodbc.connect(SQLSERVER_CONN)
    src_cursor = src.cursor()

    # Connect to PostgreSQL
    dest = psycopg2.connect(**POSTGRES_CONN)
    dest_cursor = dest.cursor()

    # Get rows from SQL Server
    src_cursor.execute(f"SELECT * FROM {table}")
    rows = src_cursor.fetchall()

    if not rows:
        print(f"{table}: No data found. Skipping.")
        return

    # Get column names
    columns = [col[0] for col in src_cursor.description]
    col_list = ", ".join(columns)
    placeholder = ", ".join(["%s"] * len(columns))

    print(f"{table}: {len(rows)} rows found.")

    # Insert into PostgreSQL
    insert_query = f"INSERT INTO {table} ({col_list}) VALUES %s"

    # Convert pyodbc Row objects → tuples
    values = [tuple(r) for r in rows]

    execute_values(dest_cursor, insert_query, values)
    dest.commit()

    print(f"{table}: MIGRATION COMPLETE.")

    src.close()
    dest.close()


def main():
    print("🚀 Starting Migration...")

    for table in TABLES:
        migrate_table(table)

    print("\n🎉 ALL TABLES MIGRATED SUCCESSFULLY!")


if __name__ == "__main__":
    main()
