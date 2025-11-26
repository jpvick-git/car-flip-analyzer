from fastapi import APIRouter
import requests
import json

router = APIRouter()

CARQUERY_BASE = "https://www.carqueryapi.com/api/0.3/"


# ---------------------------------------------------------
# 1. MAKES
# ---------------------------------------------------------
@router.get("/carquery/makes")
def get_makes():
    """
    Returns all U.S.-sold consumer makes using CarQuery.
    """
    url = f"{CARQUERY_BASE}?cmd=getMakes&sold_in_us=1"

    r = requests.get(url, timeout=15)
    raw = r.json()

    # CarQuery wraps JSON inside a string
    json_str = raw.get("Makes", "[]")
    makes_raw = json.loads(json_str)

    makes = sorted({
        m.get("make_display")
        for m in makes_raw
        if m.get("make_display")
    })

    return {"makes": makes}


# ---------------------------------------------------------
# 2. MODELS
# ---------------------------------------------------------
@router.get("/carquery/models")
def get_models(make: str):
    """
    Returns all models for a given make.
    CarQuery requires lowercase + sold_in_us flag.
    """
    make = make.lower()

    url = (
        f"{CARQUERY_BASE}?cmd=getModels"
        f"&make={make}"
        "&sold_in_us=1"
    )

    r = requests.get(url, timeout=15)
    raw = r.json()

    json_str = raw.get("Models", "[]")
    models_raw = json.loads(json_str)

    models = sorted({
        m.get("model_name")
        for m in models_raw
        if m.get("model_name")
    })

    return {"models": models}


# ---------------------------------------------------------
# 3. TRIMS (THIS IS THE IMPORTANT ONE)
# ---------------------------------------------------------
@router.get("/carquery/trims")
def get_trims(make: str, model: str, year: int):
    """
    Returns all trims for a given make/model/year.
    CarQuery trims endpoint ONLY works correctly with:
    - lowercase make + model
    - sold_in_us flag
    - empty parameters for body & keywords
    """
    make = make.lower()
    model = model.lower()

    url = (
        f"{CARQUERY_BASE}?cmd=getTrims"
        f"&make={make}"
        f"&model={model}"
        f"&year={year}"
        "&sold_in_us=1"
        "&body="
        "&keywords="
    )

    r = requests.get(url, timeout=15)
    raw = r.json()

    # Trim list is also returned inside a JSON string
    json_str = raw.get("Trims", "[]")
    trims_raw = json.loads(json_str)

    trims = sorted({
        t.get("model_trim")
        for t in trims_raw
        if t.get("model_trim") and t.get("model_trim").strip() not in ["", "0"]
    })

    return {"trims": trims}
