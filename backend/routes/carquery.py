import json
import requests
from fastapi import APIRouter

router = APIRouter()

CARQUERY_BASE = "https://www.carqueryapi.com/api/0.3/"


def safe_load_json(possible_json):
    """
    CarQuery wraps JSON inside a string.
    This function safely parses it and never throws.
    """
    if not possible_json:
        return []

    if isinstance(possible_json, list):
        return possible_json

    if not isinstance(possible_json, str):
        return []

    possible_json = possible_json.strip()

    if not possible_json or possible_json in ["null", "None"]:
        return []

    try:
        return json.loads(possible_json)
    except Exception:
        return []


@router.get("/carquery/trims")
def get_trims(make: str, model: str, year: int):
    import requests

    url = (
        "https://www.carqueryapi.com/api/0.3/"
        f"?cmd=getTrims&make={make.lower()}&model={model.lower()}&year={year}&sold_in_us=1"
    )

    try:
        r = requests.get(url, timeout=12)
        data = r.json()   # <-- PURE JSON, not JSONP
    except Exception as e:
        print("CarQuery trim error:", e)
        return {"trims": []}

    trims_raw = data.get("Trims") or []

    # Extract trim names
    trims = sorted({
        t.get("model_trim")
        for t in trims_raw
        if t.get("model_trim")
           and t.get("model_trim").strip() not in ["", "0"]
    })

    return {"trims": trims}
