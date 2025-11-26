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
def get_trims(make: str, model: str, year: int):
    make = make.lower()
    model = model.lower()

    url = (
        "https://www.carqueryapi.com/api/0.3/"
        f"?cmd=getTrims&make={make}&model={model}&year={year}"
        "&sold_in_us=1&body=&keywords="
    )

    r = requests.get(url)
    raw = r.json()

    # CarQuery wraps JSON inside a string for this endpoint
    json_str = raw.get("Trims", "[]")
    trims_list = json.loads(json_str)

    trims = sorted({
        t.get("model_trim")
        for t in trims_list
        if t.get("model_trim") and t.get("model_trim").strip() not in ["", "0"]
    })

    return {"trims": trims}

