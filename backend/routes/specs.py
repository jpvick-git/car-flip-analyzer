from datetime import datetime

import requests
from fastapi import APIRouter
from sqlalchemy import text

from ..db import get_engine

router = APIRouter()
engine = get_engine()

MIN_YEAR = 1970
NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles"

VALID_CAR_MAKES = {
    "ACURA", "ALFA ROMEO", "ASTON MARTIN", "AUDI", "BENTLEY", "BMW", "BUICK",
    "CADILLAC", "CHEVROLET", "CHRYSLER", "DODGE", "FERRARI", "FIAT", "FORD",
    "GENESIS", "GMC", "HONDA", "HYUNDAI", "INFINITI", "JAGUAR", "JEEP", "KIA",
    "LAMBORGHINI", "LAND ROVER", "LEXUS", "LINCOLN", "LOTUS", "LUCID",
    "MASERATI", "MAZDA", "MCLAREN", "MERCEDES-BENZ", "MINI", "MITSUBISHI",
    "NISSAN", "POLESTAR", "PORSCHE", "RAM", "RIVIAN", "ROLLS-ROYCE", "SAAB",
    "SCION", "SUBARU", "TESLA", "TOYOTA", "VOLKSWAGEN", "VOLVO",
}

MAKE_DISPLAY = {
    "MERCEDES-BENZ": "Mercedes-Benz",
    "LAND ROVER": "Land Rover",
    "ALFA ROMEO": "Alfa Romeo",
    "ASTON MARTIN": "Aston Martin",
    "ROLLS-ROYCE": "Rolls-Royce",
}

UPPERCASE_ONLY = {"BMW", "GMC", "RAM", "KIA", "MINI"}


def format_make_name(name: str) -> str:
    if not name:
        return ""
    upper = name.upper().strip()
    if upper in MAKE_DISPLAY:
        return MAKE_DISPLAY[upper]
    if upper in UPPERCASE_ONLY:
        return upper
    return " ".join(
        w if w.upper() in UPPERCASE_ONLY else w.capitalize()
        for w in name.split()
    )


def nhtsa_get(url: str, timeout: int = 20) -> list:
    try:
        response = requests.get(url, timeout=timeout)
        return response.json().get("Results", [])
    except Exception:
        return []


def nhtsa_makes() -> list[str]:
    results = nhtsa_get(f"{NHTSA_BASE}/getallmakes?format=json")
    makes = []
    for item in results:
        name = (item.get("Make_Name") or "").upper().replace(",", "").strip()
        if name in VALID_CAR_MAKES:
            makes.append(format_make_name(name))
    return sorted(set(makes), key=str.lower)


def nhtsa_models(make: str, year: int) -> list[str]:
    url = (
        f"{NHTSA_BASE}/GetModelsForMakeYear/make/{make}"
        f"/modelyear/{year}?format=json"
    )
    results = nhtsa_get(url)
    return sorted({
        item.get("Model_Name")
        for item in results
        if item.get("Model_Name")
    })


def nhtsa_trims(make: str, model: str, year: int) -> list[str]:
    url = (
        f"{NHTSA_BASE}/GetVehiclesForMakeModelYear/make/{make}"
        f"/model/{model}/modelyear/{year}?format=json"
    )
    results = nhtsa_get(url)
    return sorted({
        item.get("Trim")
        for item in results
        if item.get("Trim") and item.get("Trim").strip() not in ("", "0")
    })


# -----------------------------
#   Vehicle Specs Endpoints
# -----------------------------

@router.get("/specs/years")
def get_years():
    current_year = datetime.now().year
    return list(range(current_year, MIN_YEAR - 1, -1))


@router.get("/specs/makes/{year}")
def get_makes(year: int):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT COALESCE(NULLIF(TRIM(raw_make), ''), make) AS make_name
            FROM car_specs
            WHERE model_year = :yr
            ORDER BY make_name;
        """), {"yr": year})
        makes = [format_make_name(row[0]) for row in result if row[0]]

    if not makes:
        makes = nhtsa_makes()

    return sorted(set(makes), key=str.lower)


@router.get("/specs/models/{year}/{make}")
def get_models(year: int, make: str):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT COALESCE(NULLIF(TRIM(raw_model), ''), model) AS model_name
            FROM car_specs
            WHERE model_year = :yr
              AND (
                LOWER(make) = LOWER(:mk)
                OR LOWER(raw_make) = LOWER(:mk)
              )
            ORDER BY model_name;
        """), {"yr": year, "mk": make})
        models = [row[0] for row in result if row[0]]

    if not models:
        models = nhtsa_models(make, year)

    return models


@router.get("/specs/trims/{year}/{make}/{model}")
def get_trims(year: int, make: str, model: str):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT COALESCE(NULLIF(TRIM(raw_trim), ''), trim) AS trim_name
            FROM car_specs
            WHERE model_year = :yr
              AND (
                LOWER(make) = LOWER(:mk)
                OR LOWER(raw_make) = LOWER(:mk)
              )
              AND (
                LOWER(model) = LOWER(:md)
                OR LOWER(raw_model) = LOWER(:md)
              )
            ORDER BY trim_name;
        """), {
            "yr": year,
            "mk": make.strip(),
            "md": model.strip(),
        })
        trims = [row[0] for row in result if row[0]]

    if not trims:
        trims = nhtsa_trims(make, model, year)

    return trims
