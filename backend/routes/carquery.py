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
def get_trims(make: str, year: int, model: str | None = None, model_name: str | None = None):
    input_model = (model_name or model or "").strip()
    if not input_model:
        return {"error": "Missing model or model_name"}

    # ---------------------------------------
    # GET ALL MODELS (to normalize properly)
    # ---------------------------------------
    models_url = f"{CARQUERY}?cmd=getModels&make={make}&callback="
    r_models = requests.get(models_url, timeout=20)
    data_models = extract_json(r_models.text)
    model_list = data_models.get("Models", [])

    # Clean function
    def clean(val: str):
        return (val or "").strip()

    cleaned_input = clean(input_model).lower()

    # ---------------------------------------
    # Normalize (Title Case + match CarQuery's spelling)
    # ---------------------------------------
    normalized_model = None

    for m in model_list:
        raw = m.get("model_name", "")
        cleaned = clean(raw)

        if cleaned.lower() == cleaned_input:
            normalized_model = cleaned.title()
            break

    # Fallback to user input
    normalized_model = normalized_model or clean(input_model).title()

    # ---------------------------------------
    # 1️⃣ TRY WITH YEAR FIRST  (Equinox requires this)
    # ---------------------------------------
    url_with_year = (
        f"{CARQUERY}?cmd=getTrims"
        f"&make={make}"
        f"&model={normalized_model}"
        f"&year={year}"
        f"&callback="
    )

    r1 = requests.get(url_with_year, timeout=20)
    data1 = extract_json(r1.text)
    trims_raw = data1.get("Trims", [])

    # ---------------------------------------
    # 2️⃣ IF NO TRIMS → fall back to no-year
    # ---------------------------------------
    if not trims_raw:
        url_no_year = (
            f"{CARQUERY}?cmd=getTrims"
            f"&make={make}"
            f"&model={normalized_model}"
            f"&callback="
        )
        r2 = requests.get(url_no_year, timeout=20)
        data2 = extract_json(r2.text)
        trims_raw = data2.get("Trims", [])

        # Manually filter by year
        trims_raw = [
            t for t in trims_raw
            if str(t.get("model_year")) == str(year)
        ]

    # ---------------------------------------
    # Extract trims
    # ---------------------------------------
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
