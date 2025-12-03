from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from fastapi.responses import JSONResponse
import os
import shutil
import time
import traceback
from sqlalchemy import text

from ..db import get_engine
engine = get_engine()

from ..auth import get_current_user
from ..ai_estimator import estimate_repair_cost, estimate_resale_value  # unchanged

router = APIRouter()

DOWNLOAD_DIR = "/root/car-flip-analyzer/backend/downloads"


@router.post("/add_manual_vehicle")
async def add_manual_vehicle(
    year: str = Form(None),
    make: str = Form(None),
    model: str = Form(None),
    trim: str = Form(""),
    mileage: str = Form(None),
    damage_description: str = Form("Manual Listing"),
    title_status: str = Form(""),
    asking_price: str = Form(None),
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

    current_user=Depends(get_current_user),
):
    print("➡️ /add_manual_vehicle called", flush=True)

    try:
        user_id = current_user["id"]

        # ---------------------------------------
        # 1. Generate a manual lot number
        # ---------------------------------------
        lot_number = f"MANUAL-{int(time.time())}"

        # ---------------------------------------
        # 2. Create folder for images
        # ---------------------------------------
        lot_dir = os.path.join(DOWNLOAD_DIR, lot_number)
        os.makedirs(lot_dir, exist_ok=True)

        # ---------------------------------------
        # 3. Save images (whatever exists)
        # ---------------------------------------
        image_inputs = [
            front_image,
            driver_image,
            passenger_image,
            rear_image,
            interior_image,
            dash_image,
        ]

        saved_images = []
        img_index = 1

        for file in image_inputs:
            if file:
                ext = os.path.splitext(file.filename)[-1] or ".jpg"
                filename = f"{lot_number}_Image_{img_index}{ext}"
                path = os.path.join(lot_dir, filename)

                with open(path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                url = f"https://api.carflipanalyzer.com/backend/downloads/{lot_number}/{filename}"
                saved_images.append(url)
                img_index += 1

        primary_image = saved_images[0] if saved_images else None

        # ---------------------------------------
        # 4. Insert initial record into user_vehicles
        # ---------------------------------------
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO user_vehicles (
                        user_id,
                        lot_url,
                        lot_number,
                        est_retail_value,
                        sale_date,
                        year,
                        make,
                        model,
                        engine_type,
                        cylinders,
                        vin,
                        title_code,
                        odometer,
                        odometer_description,
                        damage_description,
                        current_bid,
                        my_bid,
                        item_number,
                        sale_name,
                        repair_estimate,
                        resale_estimate,
                        repair_details,
                        resale_details,
                        image_url
                    )
                    VALUES (
                        :uid,
                        :lot_url,
                        :lot,
                        :retail,
                        'Manual Entry',
                        :year,
                        :make,
                        :model,
                        :engine,
                        '',
                        :vin,
                        :title,
                        :odometer,
                        'NOT ACTUAL',
                        :damage,
                        0,
                        0,
                        0,
                        :location,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        :image_url
                    )
                """),
                {
                    "uid": user_id,
                    "lot_url": listing_url,
                    "lot": lot_number,
                    "retail": asking_price or "0 USD",
                    "year": year,
                    "make": make,
                    "model": model,
                    "engine": trim,
                    "vin": vin,
                    "title": title_status,
                    "odometer": f"{mileage or 0} N",
                    "damage": damage_description,
                    "location": location,
                    "image_url": primary_image
                }
            )

        print("✔️ Manual vehicle base record inserted.", flush=True)

        # ---------------------------------------
        # 5. Run AI estimator with whatever data exists
        # ---------------------------------------
        ai_image = primary_image if primary_image else None

        ai_repair, ai_repair_details = await estimate_repair_cost(ai_image)
        ai_resale, ai_resale_details = await estimate_resale_value(year, make, model, mileage)

        print("✔️ AI:", ai_repair, ai_resale, flush=True)

        # ---------------------------------------
        # 6. Get tax & title fee for user
        # ---------------------------------------
        with engine.connect() as conn:
            user_row = conn.execute(
                text("SELECT state_code FROM users WHERE id = :uid"),
                {"uid": user_id}
            ).fetchone()

        # prevent 'state_code' KeyError
        state_code = user_row.state_code if user_row and user_row.state_code else None

        # -------------------------------------------------------
        # GET TAX/TITLE FEES
        # -------------------------------------------------------
        with engine.connect() as conn:
            fee_row = conn.execute(
                text("""
                    SELECT avg_tax_rate, title_fee
                    FROM tax_title_fees
                    WHERE state_code = :sc
                """),
                {"sc": state_code}
            ).fetchone()

        tax_rate = fee_row.avg_tax_rate if fee_row else 0
        title_fee = fee_row.title_fee if fee_row else 0

        tax_amt = (ai_resale * tax_rate) / 100 if ai_resale else 0

        # ---------------------------------------
        # 7. Max bid calculation
        # ---------------------------------------
        max_bid = 0
        if ai_resale and ai_repair is not None:
            max_bid = ai_resale - ai_repair - tax_amt - title_fee
            if max_bid < 0:
                max_bid = 0
        max_bid = int(max_bid)

        # ---------------------------------------
        # 8. Update user_vehicles with AI results
        # ---------------------------------------
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE user_vehicles
                    SET 
                        repair_estimate = :rep,
                        resale_estimate = :res,
                        repair_details = :repd,
                        resale_details = :resd,
                        title_fee = :tf,
                        avg_tax_rate = :tr,
                        max_bid = :mb,
                        updated_at = NOW()
                    WHERE lot_number = :lot
                """),
                {
                    "rep": ai_repair,
                    "res": ai_resale,
                    "repd": ai_repair_details,
                    "resd": ai_resale_details,
                    "tf": title_fee,
                    "tr": tax_rate,
                    "mb": max_bid,
                    "lot": lot_number,
                }
            )

        print("✔️ Manual vehicle updated with AI", flush=True)

        return {
            "status": "success",
            "lot_number": lot_number,
            "image_urls": saved_images,
            "ai_repair_estimate": ai_repair,
            "ai_resale_estimate": ai_resale,
            "repair_details": ai_repair_details,
            "resale_details": ai_resale_details,
            "max_bid": max_bid,
        }

    except Exception as e:
        print("❌ ERROR in add_manual_vehicle:", flush=True)
        print(e, flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(status_code=500, detail=str(e))
