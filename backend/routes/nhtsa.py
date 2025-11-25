from fastapi import APIRouter
import requests

router = APIRouter()

NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles"

# Only real passenger car brands
VALID_CAR_MAKES = {
    "ACURA", "ALFA ROMEO", "ASTON MARTIN",
    "AUDI", "BENTLEY", "BMW", "BUICK", "CADILLAC",
    "CHEVROLET", "CHRYSLER", "DODGE", "FERRARI",
    "FIAT", "FORD", "GENESIS", "GMC", "HONDA",
    "HYUNDAI", "INFINITI", "JAGUAR", "JEEP",
    "KIA", "LAMBORGHINI", "LAND ROVER", "LEXUS",
    "LINCOLN", "LOTUS", "LUCID", "MASERATI",
    "MAZDA", "MCLAREN", "MERCEDES-BENZ", "MINI",
    "MITSUBISHI", "NISSAN", "POLESTAR", "PORSCHE",
    "RAM", "RIVIAN", "ROLLS-ROYCE", "SAAB",
    "SCION", "SUBARU", "TESLA", "TOYOTA",
    "VOLKSWAGEN", "VOLVO"
}


@router.get("/nhtsa/makes")
def get_makes():
    """
    Consumer-facing makes like BMW, Honda, Ford, Toyota, etc.
    """
    try:
        url = f"{NHTSA_BASE}/getallmakes?format=json"
        r = requests.get(url, timeout=20)
        results = r.json().get("Results", [])

        makes = []
        for m in results:
            name = (m.get("Make_Name") or "").upper()
            name = name.replace(",", "").strip()

            if name in VALID_CAR_MAKES:
                makes.append(name)

        return {"makes": sorted(set(makes))}

    except Exception as e:
        return {"makes": [], "error": str(e)}


@router.get("/nhtsa/models")
def get_models(make: str):
    """
    Consumer-facing models for selected make.
    """
    try:
        url = f"{NHTSA_BASE}/getmodelsformake/{make}?format=json"
        r = requests.get(url, timeout=20)
        results = r.json().get("Results", [])

        models = sorted({
            x.get("Model_Name")
            for x in results
            if x.get("Model_Name")
        })

        return {"models": models}

    except Exception as e:
        return {"models": [], "error": str(e)}


@router.get("/nhtsa/trims")
def get_trims(make: str, model: str, year: int):
    """
    Trim list for make + model + year.
    """
    try:
        url = f"{NHTSA_BASE}/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json"
        r = requests.get(url, timeout=20)
        results = r.json().get("Results", [])

        # filter just matches for the model
        trims = sorted({
            x.get("ModelTrim")
            for x in results
            if x.get("Make_Name", "").upper() == make.upper()
            and x.get("Model_Name", "").lower() == model.lower()
            and x.get("ModelTrim") not in ["", "0", None]
        })

        return {"trims": trims}

    except Exception as e:
        return {"trims": [], "error": str(e)}
