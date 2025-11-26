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
def get_trims(make: str, year: int | None = None, model: str | None = None, model_name: str | None = None):
    input_model = (model_name or model or "").strip()
    if not input_model:
        return {"error": "Missing model or model_name"}

    # -------------------------------------------------
    # STEP 1: Normalize the model name (case-insensitive)
    # -------------------------------------------------
    models_url = f"{CARQUERY}?cmd=getModels&make={make}&callback="
    r_models = requests.get(models_url, timeout=20)
    data_models = extract_json(r_models.text)
    model_list = data_models.get("Models", [])

    normalized_model = None
    for m in model_list:
        name = m.get("model_name", "")
        if name.lower() == input_model.lower():
            normalized_model = name
            break

    # fallback to what the user typed
    normalized_model = normalized_model or input_model

    # -------------------------------------------------
    # STEP 2: ALWAYS GET TRIMS WITHOUT YEAR FIRST
    # -------------------------------------------------
    url_no_year = (
        f"{CARQUERY}?cmd=getTrims"
        f"&make={make}"
        f"&model={normalized_model}"
        f"&callback="
    )

    r = requests.get(url_no_year, timeout=20)
    data = extract_json(r.text)
    trims_raw = data.get("Trims", [])

    # -------------------------------------------------
    # STEP 3: If year provided, filter by year
    # -------------------------------------------------
    if year is not None:
        year_str = str(year)
        filtered = [t for t in trims_raw if str(t.get("model_year")) == year_str]

        # If filtering returned something, use it
        if filtered:
            trims_raw = filtered
        # Otherwise fallback to all-year trims (your dataset stays full)

    # -------------------------------------------------
    # STEP 4: Extract unique trim names
    # -------------------------------------------------
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
