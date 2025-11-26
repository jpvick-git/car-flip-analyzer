from fastapi import APIRouter
import requests
import json
import re
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
def get_trims(make: str, year: int | None = None, model: str | None = None, model_name: str | None = None):
    input_model = (model_name or model or "").strip()
    if not input_model:
        return {"error": "Missing model or model_name"}

    # -------------------------------------------
    # STEP 1 — Fetch models
    # -------------------------------------------
    models_url = f"{CARQUERY}?cmd=getModels&make={make}&callback="
    r_models = requests.get(models_url, timeout=20)
    data_models = extract_json(r_models.text)
    model_list = data_models.get("Models", [])

    # Helper: normalize whitespace including unicode
    def clean(val: str):
        return re.sub(r"\s+", " ", val or "").strip()

    cleaned_input = clean(input_model).lower()

    # -------------------------------------------
    # STEP 2 — Clean each model_name and compare
    # -------------------------------------------
    normalized_model = None

    for m in model_list:
        raw_name = m.get("model_name", "")
        clean_name = clean(raw_name)

        if clean_name.lower() == cleaned_input:
            normalized_model = clean_name
            break

        # partial match fallback ("equinox" matches "Equinox AWD" etc.)
        if cleaned_input in clean_name.lower():
            normalized_model = clean_name
            # don't break yet: prefer exact match if found later

    # fallback: what user sent
    normalized_model = normalized_model or clean(input_model)

    # -------------------------------------------
    # STEP 3 — ALWAYS fetch trims without year first
    # -------------------------------------------
    url_no_year = (
        f"{CARQUERY}?cmd=getTrims"
        f"&make={make}"
        f"&model={normalized_model}"
        f"&callback="
    )

    r = requests.get(url_no_year, timeout=20)
    data = extract_json(r.text)
    trims_raw = data.get("Trims", [])

    # -------------------------------------------
    # STEP 4 — Filter by year if requested
    # -------------------------------------------
    if year:
        year_str = str(year)
        filtered = [t for t in trims_raw if str(t.get("model_year")) == year_str]
        if filtered:
            trims_raw = filtered

    # -------------------------------------------
    # STEP 5 — Extract trim names
    # -------------------------------------------
    trims = sorted({
        t.get("model_trim")
        for t in trims_raw
        if t.get("model_trim")
    })

    return {
        "input_model": input_model,
        "normalized_model": normalized_model,
        "total_trims_found": len(trims),
        "trims": trims
    }
