from fastapi import APIRouter, File, UploadFile, Form, Depends
from fastapi.responses import JSONResponse
import os
import shutil
import traceback
from sqlalchemy import text

from ..db import get_engine
engine = get_engine()

from ..auth import get_current_user
from ..ai_estimator import estimate_repair_cost, estimate_resale_value

router = APIRouter()

# Folder where images are stored
MANUAL_UPLOAD_DIR = "/root/car-flip-analyzer/backend/downloads"


@router.post("/add_manual_vehicle")
async def add_manual_vehicle(
    year: int = Form(...),
    make: str = Form(...),
    model: str = Form(...),
    trim: str = Form(""),
    mileage: int = Form(None),
    damage_description: str = Form(""),
    title_status: str = Form(""),
    asking_price: float = Form(None),
    location: str = Form(""),
    listing_url: str = Form(""),
    description: str = Form(""),
    vin: str = Form(""),

    front_image: UploadFile = File(None),
    driver_image: UploadFile = File(None),
    passenger_image: UploadFile = File(None),
    rear_image: UploadFile = File(None),
    interior_image: UploadFile = File(None),
    dash_image: UploadFile = File(None),

    user=Depends(get_current_user),
):

    print("➡️ ENTERED /add_manual_vehicle ENDPOINT", flush=True)

    try:
        user_id = user["id"]

        # ---------------------------------------------
        # 1. INSERT BASE VEHICLE RECORD
        # ---------------------------------------------
        with engine.begin() as conn:
            new_id = conn.execute(
                text("""
                    INSERT INTO user_manual_vehicles (
                        user_id, year, make, model, trim, mileage,
                        damage_description, title_status, asking_price,
                        location, listing_url, description, vin
                    )
                    VALUES (
                        :uid, :yr, :mk, :md, :tm, :mi,
                        :dg, :ts, :ap, :lc, :url, :ds, :vin
                    )
                    RETURNING id;
                """),
                {
                    "uid": user_id,
                    "yr": year,
                    "mk": make,
                    "md": model,
                    "tm": trim,
                    "mi": mileage,
                    "dg": damage_description,
                    "ts": title_status,
                    "ap": asking_price,
                    "lc": location,
                    "url": listing_url,
                    "ds": description,
                    "vin": vin,
                }
            ).scalar()

        print(f"✔️ Inserted manual vehicle ID {new_id}", flush=True)

        # ---------------------------------------------
        # 2. SAVE IMAGES
        # ---------------------------------------------
        folder = os.path.join(MANUAL_UPLOAD_DIR, str(new_id))
        os.makedirs(folder, exist_ok=True)

        image_fields = [
            ("front_image", front_image),
            ("driver_image", driver_image),
            ("passenger_image", passenger_image),
            ("rear_image", rear_image),
            ("interior_image", interior_image),
            ("dash_image", dash_image),
        ]

        saved_image_urls = []

        for idx, (label, file) in enumerate(image_fields, start=1):
            if file is None:
                continue

            ext = os.path.splitext(file.filename)[-1] or ".jpg"
            filename = f"{new_id}_Image_{idx}{ext}"
            save_path = os.path.join(folder, filename)

            with open(save_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            public_url = f"https://api.carflipanalyzer.com/backend/downloads/{new_id}/{filename}"
            saved_image_urls.append(public_url)

            with engine.begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO manual_vehicle_images (vehicle_id, image_url)
                        VALUES (:vid, :url)
                    """),
                    {"vid": new_id, "url": public_url}
                )

        print(f"✔️ Saved {len(saved_image_urls)} images", flush=True)

        # ---------------------------------------------
        # 3. AI ESTIMATES
        # ---------------------------------------------
        front_url = saved_image_urls[0] if saved_image_urls else None

        ai_repair = await estimate_repair_cost(front_url)
        ai_resale = await estimate_resale_value(year, make, model, mileage)

        print(f"✔️ AI repair={ai_repair}, resale={ai_resale}", flush=True)

        # ---------------------------------------------
        # 4. TAX/TITLE FEES
        # ---------------------------------------------
        with engine.begin() as conn:
            row = conn.execute(
                text("""
                    SELECT avg_tax_rate, title_fee
                    FROM tax_title_fees
                    WHERE state_code = :sc
                """),
                {"sc": user["state_code"]}
            ).fetchone()

        tax_rate = row.avg_tax_rate if row else 0
        title_fee = row.title_fee if row else 0
        tax_amount = (ai_resale * tax_rate) / 100

        # ---------------------------------------------
        # 5. MAX BID CALC
        # ---------------------------------------------
        max_bid = int(ai_resale - ai_repair - tax_amount - title_fee)
        if max_bid < 0:
            max_bid = 0

        # ---------------------------------------------
        # 6. UPDATE VEHICLE RECORD
        # ---------------------------------------------
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE user_manual_vehicles
                    SET ai_repair_estimate = :r,
                        ai_resale_estimate = :re,
                        tax_amount = :tx,
                        title_fee = :tf,
                        max_bid = :mb
                    WHERE id = :id
                """),
                {
                    "r": ai_repair,
                    "re": ai_resale,
                    "tx": tax_amount,
                    "tf": title_fee,
                    "mb": max_bid,
                    "id": new_id,
                },
            )

        print("✔️ Manual vehicle successfully saved & updated", flush=True)

        return {
            "vehicle_id": new_id,
            "images": saved_image_urls,
            "ai_repair_estimate": ai_repair,
            "ai_resale_estimate": ai_resale,
            "max_bid": max_bid,
        }

    # ---------------------------------------------
    # GLOBAL ERROR HANDLER
    # ---------------------------------------------
    except Exception as e:
        print("❌ ERROR IN /add_manual_vehicle", flush=True)
        print(str(e), flush=True)
        print(traceback.format_exc(), flush=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to add vehicle", "details": str(e)},
        )
