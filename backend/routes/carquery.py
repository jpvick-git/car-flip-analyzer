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
def get_trims(make: str, year: int, model: str | None = None, model_name: str | None = None):
    # Pick whichever was sent
    input_model = (model_name or model or "").strip()

    if not input_model:
        return {"error": "Missing model or model_name"}

    # --------------------------------------------
    # STEP 1: Normalize model using CarQuery getModels
    # --------------------------------------------
    models_url = f"{CARQUERY}?cmd=getModels&make={make}&sold_in_us=1&callback="
    r_models = requests.get(models_url, timeout=20)
    data_models = extract_json(r_models.text)
    model_list = data_models.get("Models", [])

    # Try to find the correct CarQuery model_name
    normalized_model = None
    for m in model_list:
        name = m.get("model_name", "")
        if name.lower() == input_model.lower():   # ← case-insensitive match
            normalized_model = name
            break

    # If still not found, fall back to input (may still work)
    normalized_model = normalized_model or input_model

    # --------------------------------------------
    # STEP 2: Get trims using proper CarQuery model name
    # --------------------------------------------
    url = (
        f"{CARQUERY}?cmd=getTrims"
        f"&make={make}"
        f"&model={normalized_model}"
        f"&year={year}"
        f"&sold_in_us=1"
        f"&callback="
    )

    r = requests.get(url, timeout=20)
    data = extract_json(r.text)

    trims_raw = data.get("Trims", [])

    trims = sorted({
        t.get("model_trim")
        for t in trims_raw
        if t.get("model_trim")
    })

    return {
        "input_model": input_model,
        "normalized_model": normalized_model,
        "trims": trims
    }

