# --------------------------------------------------
# Car Flip Analyzer - User Vehicles API
# --------------------------------------------------
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from jose import jwt, JWTError
from .auth import get_current_user
from .db import get_engine
from .ai_repair_estimator import analyze_vehicle
import os

router = APIRouter()
engine = get_engine()

# --------------------------------------------------
# JWT CONFIG
# --------------------------------------------------
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def decode_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("id") or payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

# --------------------------------------------------
# 1️⃣ Upload a new vehicle for the logged-in user
# --------------------------------------------------
@router.post("/upload_vehicle")
def upload_vehicle(vehicle: dict, user=Depends(get_current_user)):
    """
    Insert a new vehicle tied to the logged-in user.
    """
    with engine.begin() as conn:
        result = conn.execute(
            text("""
                INSERT INTO user_vehicles (
                    user_id, lot_inv_num, lot_url, year, make, model, damage_description
                )
                OUTPUT INSERTED.id
                VALUES (:uid, :lot, :url, :year, :make, :model, :damage)
            """),
            {
                "uid": user["id"],
                "lot": vehicle["lot_inv_num"],
                "url": vehicle.get("lot_url"),
                "year": vehicle.get("year"),
                "make": vehicle.get("make"),
                "model": vehicle.get("model"),
                "damage": vehicle.get("damage_description", "")
            }
        )
        vehicle_id = result.scalar()

    return {"message": "✅ Vehicle uploaded successfully", "vehicle_id": vehicle_id}


# --------------------------------------------------
# 2️⃣ Get all vehicles for the logged-in user
# --------------------------------------------------
@router.get("/get_vehicles")
def get_user_vehicles(user=Depends(get_current_user)):
    """
    Returns all vehicles for the authenticated user.
    Ensures each vehicle includes a valid image_url.
    """
    from .backend_api import get_first_image
    engine = get_engine()
    user_id = user["id"]

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                uv.id,
                uv.lot_number,
                uv.lot_url,
                uv.year,
                uv.make,
                uv.model,
                uv.odometer,
                uv.damage_description,
                uv.repair_estimate,
                uv.resale_estimate,
                uv.repair_details,
                uv.resale_details,
                uv.created_at,
                uv.image_url,
                u.state_code,
                ttf.title_fee,
                ttf.avg_tax_rate
            FROM user_vehicles uv
            INNER JOIN users u ON uv.user_id = u.id
            LEFT JOIN tax_title_fees ttf ON ttf.state_code = u.state_code
            WHERE uv.user_id = :uid
            ORDER BY uv.created_at DESC
        """), {"uid": user_id}).fetchall()

    vehicles = []
    for r in rows:
        v = dict(r._mapping)

        # ✅ Correct key to use (matches SQL alias)
        lot_id = str(v.get("lot_number") or "").strip()

        # ✅ If DB has image_url already, use it
        img = v.get("image_url")

        # ✅ If image_url is missing, build fallback path
        if not img or img.lower() in ("", "none", "null"):
            local_img = get_first_image(lot_id)
            if local_img:
                v["image_url"] = local_img
            else:
                v["image_url"] = (
                    f"https://api.carflipanalyzer.com/backend/downloads/"
                    f"{lot_id}/{lot_id}_Image_1.jpg"
                )


        vehicles.append(v)

    return {"vehicles": vehicles}


# --------------------------------------------------
# 3️⃣ Analyze a specific vehicle (trigger AI estimator)
# --------------------------------------------------
@router.post("/analyze_vehicle/{vehicle_id}")
def analyze_vehicle_route(vehicle_id: int, user=Depends(get_current_user)):
    """
    Run the AI repair/resale analysis for one vehicle and update DB.
    """
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                SELECT lot_inv_num, year, make, model, damage_description
                FROM user_vehicles
                WHERE id = :id AND user_id = :uid
            """),
            {"id": vehicle_id, "uid": user["id"]}
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        vehicle = dict(row._mapping)
        ai_data = analyze_vehicle(vehicle)  # Calls your AI estimator

        conn.execute(
            text("""
                UPDATE user_vehicles
                SET repair_estimate = :repair_estimate,
                    resale_estimate = :resale_estimate,
                    repair_details = :repair_details,
                    resale_details = :resale_details
                WHERE id = :id
            """),
            {
                "id": vehicle_id,
                "repair_estimate": ai_data.get("repair_estimate"),
                "resale_estimate": ai_data.get("resale_estimate"),
                "repair_details": ai_data.get("repair_details"),
                "resale_details": ai_data.get("resale_details")
            }
        )

    return {"message": "✅ Vehicle analyzed successfully"}
