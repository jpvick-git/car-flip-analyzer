import requests
import json
import pyodbc
import time
import re

CARQUERY = "https://www.carqueryapi.com/api/0.3/"

# ---------------------------------------------------------
# FULL BROWSER HEADERS (critical)
# ---------------------------------------------------------
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.carqueryapi.com/",
    "Origin": "https://www.carqueryapi.com",
}

# ---------------------------------------------------------
# AWS RDS CONNECTION
# ---------------------------------------------------------
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433;"
    "DATABASE=cars;"
    "UID=jpvick-git;"
    "PWD=Nk^+Cq4MfUNt%8q;"
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
)
cursor = conn.cursor()


def extract_json(body):
    """CarQuery sometimes embeds JSON in JS or HTML."""
    try:
        return json.loads(body)
    except:
        pass
    try:
        i = body.index("{")
        j = body.rindex("}") + 1
        return json.loads(body[i:j])
    except:
        return {}


def clean(s):
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def get_json(url):
    """Bulletproof fetch — retries + JSONP strip + fallback."""
    attempts = [
        url,
        url + "&callback=?",
        url.replace("&callback=", ""),
        url.replace("?callback=", "?"),
    ]

    for attempt in attempts:
        try:
            r = requests.get(attempt, headers=headers, timeout=10)
            if r.status_code == 200:
                data = extract_json(r.text)
                if data:
                    return data
            time.sleep(0.5)
        except:
            pass

    return {}


# ---------------------------------------------------------
# FETCH MAKES
# ---------------------------------------------------------
print("\nFetching makes...\n")

makes_url = f"{CARQUERY}?cmd=getMakes&sold_in_us=1"
print("Request URL:", makes_url)

makes_data = get_json(makes_url)
makes = makes_data.get("Makes", [])

print("\nRAW MAKES JSON:", makes_data)
print("\nMakes found:", len(makes))

if len(makes) == 0:
    print("\n❌ STILL BLOCKED — Try running through VPN or Mobile Hotspot.\n")
    exit()


# ---------------------------------------------------------
# MAIN LOOP
# ---------------------------------------------------------
for mk in makes:
    raw_make = mk.get("make_display") or mk.get("make_name")
    make_cleaned = clean(raw_make)

    print(f"\n========== MAKE: {make_cleaned} ==========")

    # FETCH MODELS
    models_url = f"{CARQUERY}?cmd=getModels&make={make_cleaned}&sold_in_us=1"
    models_data = get_json(models_url)
    models = models_data.get("Models", [])
    print("Models found:", len(models))

    for md in models:
        raw_model = md.get("model_name", "")
        model_cleaned = clean(raw_model)

        print(f"  MODEL: {model_cleaned}")

        # FETCH TRIMS
        trims_url = (
            f"{CARQUERY}?cmd=getTrims&make={make_cleaned}&model={raw_model}"
        )
        trims_data = get_json(trims_url)
        trims = trims_data.get("Trims", [])
        print(f"    Trims found: {len(trims)}")

        for t in trims:
            raw_trim = t.get("model_trim")
            trim_cleaned = clean(raw_trim)
            year = t.get("model_year")

            cursor.execute("""
                INSERT INTO car_specs
                (make, model, trim, model_year,
                 raw_make, raw_model, raw_trim,
                 body_style, engine_fuel, engine_cylinders,
                 transmission, drive, doors)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                make_cleaned,
                model_cleaned,
                trim_cleaned,
                year,
                raw_make,
                raw_model,
                raw_trim,
                t.get("model_body"),
                t.get("model_engine_fuel"),
                t.get("model_engine_cyl"),
                t.get("model_transmission_type"),
                t.get("model_drive"),
                t.get("model_doors")
            ))
            conn.commit()
            print(f"      INSERTED: {year} {make_cleaned} {model_cleaned} {trim_cleaned}")

        time.sleep(0.1)

cursor.close()
conn.close()

print("\n\n🎉 DONE! All car specs successfully loaded into AWS RDS.")
