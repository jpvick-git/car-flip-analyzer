from fastapi import APIRouter
import requests

router = APIRouter()

NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles"

# These are the vehicle types we keep (cars/SUVs/light trucks)
ALLOWED_TYPES = {
    "PASSENGER CAR",
    "MULTIPURPOSE PASSENGER VEHICLE",
    "SPORT UTILITY VEHICLE",
    "TRUCK",
    "PICKUP",
    "STATION WAGON",
    "VAN",
    "MINIVAN",
    "LIGHT TRUCK"
}

@router.get("/nhtsa/makes")
def get_filtered_makes():
    url = f"{NHTSA_BASE}/getallmanufacturers?format=json"
    r = requests.get(url, timeout=20)

    data = r.json().get("Results", [])
    filtered = []

    for item in data:
        make = item.get("Mfr_CommonName") or item.get("Mfr_Name")
        vehicle_types = item.get("VehicleTypes", [])

        if not make:
            continue

        keep = False
        for vt in vehicle_types:
            vt_name = (vt.get("Name") or "").upper()
            if vt_name in ALLOWED_TYPES:
                keep = True
                break

        if keep:
            filtered.append({
                "make": make.upper().replace(",", ""),  # Clean names
            })

    # Remove duplicates and sort
    filtered = sorted(
        list({m["make"] for m in filtered})
    )

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
