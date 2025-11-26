from fastapi import APIRouter
from sqlalchemy import text
from ..db import get_engine

router = APIRouter()
engine = get_engine()

# -----------------------------
#    VEHICLE SPECS ENDPOINTS
# -----------------------------

@router.get("/specs/years")
def get_years():
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT year 
            FROM car_specs
            ORDER BY year DESC
        """))
        return [row[0] for row in result]


@router.get("/specs/makes/{year}")
def get_makes(year: int):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT make
            FROM car_specs
            WHERE year = :yr
            ORDER BY make
        """), {"yr": year})
        return [row[0] for row in result]


@router.get("/specs/models/{year}/{make}")
def get_models(year: int, make: str):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT model
            FROM car_specs
            WHERE year = :yr AND make = :mk
            ORDER BY model
        """), {"yr": year, "mk": make})
        return [row[0] for row in result]


@router.get("/specs/trims/{year}/{make}/{model}")
def get_trims(year: int, make: str, model: str):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT trim
            FROM car_specs
            WHERE year = :yr AND make = :mk AND model = :md
            ORDER BY trim
        """), {"yr": year, "mk": make, "md": model})
        return [row[0] for row in result]
