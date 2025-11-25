import requests
import pyodbc
import time

# ---------------------------------------------------------
# SQL SERVER CONNECTION (LOCAL SQLEXPRESS)
# ---------------------------------------------------------
conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 18 for SQL Server};"
    r"SERVER=DUNDER\SQLEXPRESS;"
    r"DATABASE=master;"
    r"Trusted_Connection=yes;"
    r"Encrypt=no;"
)
conn.autocommit = True
cursor = conn.cursor()

print("Connected to SQL Server DUNDER\\SQLEXPRESS")

# ---------------------------------------------------------
# CREATE DATABASE IF NOT EXISTS
# ---------------------------------------------------------
DB_NAME = "NHTSA"

cursor.execute(f"""
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '{DB_NAME}')
BEGIN
    CREATE DATABASE {DB_NAME}
END
""")
print(f"Database ensured: {DB_NAME}")

cursor.close()
conn.close()

# Reconnect to the new database
conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 18 for SQL Server};"
    r"SERVER=DUNDER\SQLEXPRESS;"
    r"DATABASE=NHTSA;"
    r"Trusted_Connection=yes;"
    r"Encrypt=no;"
)
cursor = conn.cursor()

# ---------------------------------------------------------
# CREATE TABLES
# ---------------------------------------------------------
cursor.execute("""
IF OBJECT_ID('nhtsa_makes', 'U') IS NOT NULL DROP TABLE nhtsa_makes;
CREATE TABLE nhtsa_makes (
    make_name VARCHAR(100) PRIMARY KEY
);
""")

cursor.execute("""
IF OBJECT_ID('nhtsa_models', 'U') IS NOT NULL DROP TABLE nhtsa_models;
CREATE TABLE nhtsa_models (
    make_name VARCHAR(100),
    model_name VARCHAR(200),
    PRIMARY KEY (make_name, model_name)
);
""")

cursor.execute("""
IF OBJECT_ID('nhtsa_trims', 'U') IS NOT NULL DROP TABLE nhtsa_trims;
CREATE TABLE nhtsa_trims (
    make_name VARCHAR(100),
    model_name VARCHAR(200),
    year INT,
    trim VARCHAR(200),
    PRIMARY KEY (make_name, model_name, year, trim)
);
""")

conn.commit()
print("Tables created successfully.")

# ---------------------------------------------------------
# NHTSA ENDPOINTS
# ---------------------------------------------------------
BASE = "https://vpic.nhtsa.dot.gov/api/vehicles"

VALID_CAR_MAKES = {
    "ACURA", "ALFA ROMEO", "ASTON MARTIN", "AUDI", "BENTLEY", "BMW", "BUICK",
    "CADILLAC", "CHEVROLET", "CHRYSLER", "DODGE", "FERRARI", "FIAT", "FORD",
    "GENESIS", "GMC", "HONDA", "HYUNDAI", "INFINITI", "JAGUAR", "JEEP", "KIA",
    "LAMBORGHINI", "LAND ROVER", "LEXUS", "LINCOLN", "LOTUS", "LUCID",
    "MASERATI", "MAZDA", "MCLAREN", "MERCEDES-BENZ", "MINI", "MITSUBISHI",
    "NISSAN", "POLESTAR", "PORSCHE", "RAM", "RIVIAN", "ROLLS-ROYCE", "SAAB",
    "SCION", "SUBARU", "TESLA", "TOYOTA", "VOLKSWAGEN", "VOLVO"
}

def fetch(url):
    """Safely fetch from NHTSA."""
    try:
        return requests.get(url, timeout=20).json().get("Results", [])
    except:
        return []

# ---------------------------------------------------------
# LOAD MAKES
# ---------------------------------------------------------
print("\nLoading makes...")

results = fetch(f"{BASE}/getallmanufacturers?format=json")

makes = []
for item in results:
    name = (item.get("Mfr_CommonName") or item.get("MfrName") or item.get("Mfr_Name") or "").upper()
    name = name.replace(",", "").strip()
    if name in VALID_CAR_MAKES:
        makes.append(name)

makes = sorted(set(makes))

for make in makes:
    cursor.execute("INSERT INTO nhtsa_makes (make_name) VALUES (?)", make)

conn.commit()
print(f"Loaded {len(makes)} makes.")

# ---------------------------------------------------------
# LOAD MODELS
# ---------------------------------------------------------
models_by_make = {}

print("\nLoading models...")
for make in makes:
    url = f"{BASE}/getmodelsformake/{make}?format=json"
    results = fetch(url)

    models = sorted({m["Model_Name"] for m in results if m.get("Model_Name")})
    models_by_make[make] = models

    for model in models:
        cursor.execute(
            "INSERT INTO nhtsa_models (make_name, model_name) VALUES (?, ?)",
            make, model
        )

    print(f"{make}: {len(models)} models")

conn.commit()

# ---------------------------------------------------------
# LOAD TRIMS
# ---------------------------------------------------------
years = list(range(1980, 2026))

print("\nLoading trims (this takes time)...")

for make, models in models_by_make.items():
    for model in models:
        for year in years:
            url = f"{BASE}/GetVehiclesForMakeModelYear/make/{make}/model/{model}/modelyear/{year}?format=json"
            results = fetch(url)

            trims = sorted({
                r["Trim"]
                for r in results
                if r.get("Trim") and r["Trim"].strip() not in ["", "0"]
            })

            for trim in trims:
                cursor.execute(
                    "INSERT INTO nhtsa_trims (make_name, model_name, year, trim) VALUES (?, ?, ?, ?)",
                    make, model, year, trim
                )

            if trims:
                print(f"{make} → {model} → {year}: {len(trims)} trims")

conn.commit()

print("\n🎉 DONE! NHTSA Database Fully Loaded into SQL Server ✔")
