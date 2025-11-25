from fastapi import APIRouter
import requests

router = APIRouter()

NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles"

# Real consumer-facing car brands (clean names)
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

# --------------------------------------------------------
# GET MAKES  (clean consumer names only)
# --------------------------------------------------------
@router.get("/nhtsa/makes")
def get_filtered_makes():
    # USE CORRECT ENDPOINT
    url = f"{NHTSA_BASE}/getallmakes?format=json"
    r = requests.get(url, timeout=20)
    data = r.json().get("Results", [])

    filtered = []

    for item in data:
        name = item.get("Make_Name", "").upper().strip()

        # Return ONLY valid consumer-facing makes
        if name in VALID_CAR_MAKES:
            filtered.append(name)

    filtered = sorted(list(set(filtered)))

    return {"makes": filtered}


# --------------------------------------------------------
# GET MODELS  (this part was correct)
# --------------------------------------------------------
@router.get("/nhtsa/models")
def get_models(make: str):
    url = f"{NHTSA_BASE}/getmodelsformake/{make}?format=json"
    r = requests.get(url, timeout=20)
    results = r.json().get("Results", [])

    models = sorted({
        x.get("Model_Name")
        for x in results
        if x.get("Model_Name")
    })

    return {"models": models}


# --------------------------------------------------------
# GET TRIMS  (this part was correct)
# --------------------------------------------------------
@router.get("/nhtsa/trims")
def get_trims(make: str, model: str, year: int):
    url = (
        f"{NHTSA_BASE}/GetVehiclesForMakeModelYear/"
        f"make/{make}/model/{model}/modelyear/{year}?format=json"
    )
    r = requests.get(url, timeout=20)
    results = r.json().get("Results", [])

    trims = sorted({
        x.get("Trim")
        for x in results
        if x.get("Trim") and x.get("Trim").strip() not in ["", "0"]
    })

    return {"trims": trims}
