from fastapi import APIRouter
from sqlalchemy import text
from ..db import get_engine

router = APIRouter()
engine = get_engine()


# -----------------------------
#   Vehicle Specs Endpoints
# -----------------------------

@router.get("/specs/years")
def get_years():
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT model_year
            FROM car_specs
            WHERE model_year IS NOT NULL
            ORDER BY model_year DESC;
        """))
        return [row[0] for row in result]


@router.get("/specs/makes/{year}")
def get_makes(year: int):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT make
            FROM car_specs
            WHERE model_year = :yr
            ORDER BY make;
        """), {"yr": year})
        return [row[0] for row in result]


@router.get("/specs/models/{year}/{make}")
def get_models(year: int, make: str):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT model
            FROM car_specs
            WHERE model_year = :yr
              AND LOWER(make) = LOWER(:mk)
            ORDER BY model;
        """), {"yr": year, "mk": make})
        return [row[0] for row in result]


@router.get("/specs/trims/{year}/{make}/{model}")
def get_trims(year: int, make: str, model: str):
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT trim
            FROM car_specs
            WHERE model_year = :yr
              AND LOWER(make) = LOWER(:mk)
              AND LOWER(model) = LOWER(:md)
            ORDER BY trim;
        """), {
            "yr": year,
            "mk": make.strip(),
            "md": model.strip()
        })
        return [row[0] for row in result]
