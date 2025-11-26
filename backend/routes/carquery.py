from fastapi import APIRouter
import requests
import json

router = APIRouter()

CARQUERY = "https://www.carqueryapi.com/api/0.3/"


def extract_json(body: str):
    """
    CarQuery returns JSONP sometimes. This safely extracts JSON every time.
    """
    try:
        # Try direct JSON first
        return json.loads(body)
    except:
        pass

    # If JSON-P → strip everything before first '{' and after last '}'
    try:
        start = body.index("{")
        end = body.rindex("}") + 1
        return json.loads(body[start:end])
    except:
        return {}


@router.get("/carquery/makes")
def get_makes():
    url = f"{CARQUERY}?cmd=getMakes&sold_in_us=1"
    r = requests.get(url, timeout=20)
    data = extract_json(r.text)
    makes = data.get("Makes", [])
    return {"makes": makes}


@router.get("/carquery/models")
def get_models(make: str):
    url = f"{CARQUERY}?cmd=getModels&make={make}&sold_in_us=1"
    r = requests.get(url, timeout=20)
    data = extract_json(r.text)
    models = data.get("Models", [])
    return {"models": models}


@router.get("/carquery/trims")
def get_trims(make: str, model: str, year: int):
    url = (
        f"{CARQUERY}?cmd=getTrims"
        f"&make={make}"
        f"&model={model}"
        f"&year={year}"
        f"&sold_in_us=1"
        f"&callback="    # ← forces clean JSON, no JSON-P
    )

    r = requests.get(url, timeout=20)
    data = extract_json(r.text)

    trims_raw = data.get("Trims", [])

    trims = sorted({
        t.get("model_trim")
        for t in trims_raw
        if t.get("model_trim") not in ["", None]
    })

    return {"trims": trims}
