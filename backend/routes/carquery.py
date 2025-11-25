from fastapi import APIRouter
import requests
import json

router = APIRouter()

def parse_carquery(data: str):
    # Ensure response contains JSON
    if "{" not in data:
        print("CarQuery INVALID RESPONSE:", data[:200])
        return {}
    try:
        json_str = data[data.index("{"): data.rindex("}") + 1]
        return json.loads(json_str)
    except Exception as e:
        print("CarQuery parse error:", e)
        return {}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "*/*",
    "Connection": "keep-alive"
}

@router.get("/carquery/makes")
def get_car_makes():
    url = "https://www.carqueryapi.com/api/0.3/?cmd=getMakes"
    r = requests.get(url, headers=HEADERS, timeout=10)

    parsed = parse_carquery(r.text)
    makes = parsed.get("Makes", [])

    # Common automotive makes only
    makes = [m for m in makes if m.get("make_is_common") == 1]

    makes.sort(key=lambda m: m.get("make_display", ""))

    return {"makes": makes}

@router.get("/carquery/models")
def get_car_models(make: str):
    url = f"https://www.carqueryapi.com/api/0.3/?cmd=getModels&make={make}"
    r = requests.get(url, headers=HEADERS, timeout=10)

    parsed = parse_carquery(r.text)
    models = parsed.get("Models", [])

    models.sort(key=lambda m: m.get("model_name", ""))

    return {"models": models}

@router.get("/carquery/trims")
def get_car_trims(make: str, model: str, year: int):
    url = f"https://www.carqueryapi.com/api/0.3/?cmd=getTrims&make={make}&model={model}&year={year}"
    r = requests.get(url, headers=HEADERS, timeout=10)

    parsed = parse_carquery(r.text)
    trims = parsed.get("Trims", [])

    trim_names = sorted(
        list({t.get("model_trim") for t in trims if t.get("model_trim")})
    )

    return {"trims": trim_names}
