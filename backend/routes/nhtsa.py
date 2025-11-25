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
def get_filtered_makes():
    url = f"{NHTSA_BASE}/getallmanufacturers?format=json"
    r = requests.get(url, timeout=20)

    data = r.json().get("Results", [])
    filtered = []

    for item in data:
        name = (item.get("Mfr_CommonName") or item.get("Mfr_Name") or "").upper()
        name = name.replace(",", "").strip()

        # return ONLY valid real automotive makes
        if name in VALID_CAR_MAKES:
            filtered.append(name)

    filtered = sorted(list(set(filtered)))
    return {"makes": filtered}


@router.get("/nhtsa/models")
def get_models(make: str):
    url = f"{NHTSA_BASE}/getmodelsformake/{make}?format=json"
    r = requests.get(url, timeout=20)
    results = r.json().get("Results", [])

    models = sorted({
        x.get("Model_Name")
        for x in results if x.get("Model_Name")
    })

    return {"models": models}


@router.get("/nhtsa/trims")
def get_trims(make: str, model: str, year: int):
    url = f"{NHTSA_BASE}/GetVehiclesForMakeModelYear/make/{make}/model/{model}/modelyear/{year}?format=json"
    r = requests.get(url, timeout=20)
    results = r.json().get("Results", [])

    trims = sorted({
        x.get("Trim")
        for x in results
        if x.get("Trim") and x.get("Trim").strip() not in ["", "0"]
    })

    return {"trims": trims}
