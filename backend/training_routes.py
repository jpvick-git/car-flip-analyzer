from fastapi import APIRouter
from damage_embeddings import save_damage_label

router_training = APIRouter()

@router_training.post("/save_damage_label")
async def save_damage_label_route(payload: dict):
    save_damage_label(
        lot_number=payload.get("lot_number"),
        year=payload.get("year"),
        make=payload.get("make"),
        model=payload.get("model"),
        damage_main=payload.get("damage_main"),
        damage_severity=payload.get("damage_severity"),
        damage_notes=payload.get("damage_notes"),
        repair_cost_range=payload.get("repair_cost_range"),
    )
    return {"status": "ok", "message": "Training example saved."}
