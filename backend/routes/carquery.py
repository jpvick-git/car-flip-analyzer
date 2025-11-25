# -------------------------------------------------------------
# CarQuery API Proxy (Fixes CORS + JSONP)
# -------------------------------------------------------------
from fastapi import APIRouter
import requests
import json

router = APIRouter()

def parse_carquery(data: str):
    """
    Removes JSON-P wrapper: callback({...});
    """
    try:
        json_str = data[data.index("{"): data.rindex("}") + 1]
        return json.loads(json_str)
    except Exception as e:
        print("Parse error:", e)
        return {}

@router.get("/carquery/makes")
def get_car_makes():
    url = "https://www.carqueryapi.com/api/0.3/?cmd=getMakes"
    r = requests.get(url)
    parsed = parse_carquery(r.text)
    makes = parsed.get("Makes", [])

    # Only common automotive manufacturers
    makes = [m for m in makes if m.get("make_is_common") == 1]

    makes.sort(key=lambda m: m.get("make_display", ""))

    return {"makes": makes}

@router.get("/carquery/models")
def get_car_models(make: str):
    url = f"https://www.carqueryapi.com/api/0.3/?cmd=getModels&make={make}"
    r = requests.get(url)
    parsed = parse_carquery(r.text)
    models = parsed.get("Models", [])

    models.sort(key=lambda m: m.get("model_name", ""))

    return {"models": models}

@router.get("/carquery/trims")
def get_car_trims(make: str, model: str, year: int):
    url = (
        f"https://www.carqueryapi.com/api/0.3/?cmd=getTrims"
        f"&make={make}&model={model}&year={year}"
    )
    r = requests.get(url)
    parsed = parse_carquery(r.text)
    trims = parsed.get("Trims", [])

    trim_names = sorted(
        list({
            t.get("model_trim")
            for t in trims if t.get("model_trim")
        })
    )

    return {"trims": trim_names}
