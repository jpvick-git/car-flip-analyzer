# backend/routes/manual_vehicle.py

from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from fastapi.responses import JSONResponse
import os
import shutil
import time
import traceback
from sqlalchemy import text

from ..db import get_engine
engine = get_engine()

from ..auth import get_current_user, require_not_demo

router = APIRouter()

DOWNLOAD_DIR = "/root/car-flip-analyzer/backend/downloads"


@router.post("/add_manual_vehicle")
async def add_manual_vehicle(
    year: str = Form(None),
    make: str = Form(None),
    model: str = Form(None),
    trim: str = Form(None),
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
    require_not_demo(current_user)

    try:
        user_id = current_user["id"]

        # -------------------------------------------------------
        # 1. Create a MANUAL lot number
        # -------------------------------------------------------
        lot_number = f"MANUAL-{int(time.time())}"

        # -------------------------------------------------------
        # 2. Create download folder for this lot
        # -------------------------------------------------------
        lot_dir = os.path.join(DOWNLOAD_DIR, lot_number)
        os.makedirs(lot_dir, exist_ok=True)

        # -------------------------------------------------------
        # 3. Save any uploaded images
        # -------------------------------------------------------
        image_inputs = [
            front_image, driver_image, passenger_image,
            rear_image, interior_image, dash_image
        ]

        saved_image_urls = []
        idx = 1

        for file in image_inputs:
            if file:
                ext = os.path.splitext(file.filename)[1] or ".jpg"
                name = f"{lot_number}_Image_{idx}{ext}"
                save_path = os.path.join(lot_dir, name)

                with open(save_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                url = f"https://api.carflipanalyzer.com/backend/downloads/{lot_number}/{name}"
                saved_image_urls.append(url)
                idx += 1

        primary_image = saved_image_urls[0] if saved_image_urls else None

        # -------------------------------------------------------
        # 4. Insert into user_vehicles (same structure as Copart)
        # -------------------------------------------------------
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
                        image_url,
                        resale_details,
                        repair_details
                    )
                    VALUES (
                        :uid,
                        :url,
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
                        :odo,
                        'NOT ACTUAL',
                        :damage,
                        0,
                        0,
                        0,
                        :location,
                        NULL,
                        NULL,
                        :image,
                        NULL,
                        NULL
                    )
                """),
                {
                    "uid": user_id,
                    "url": listing_url,
                    "lot": lot_number,
                    "retail": asking_price or "0 USD",
                    "year": year,
                    "make": make,
                    "model": model,
                    "engine": trim or "",
                    "vin": vin,
                    "title": title_status,
                    "odo": f"{mileage or 0} N",
                    "damage": damage_description,
                    "location": location,
                    "image": primary_image
                }
            )

        print("✔️ Manual vehicle inserted.", flush=True)

        return {
            "status": "success",
            "lot_number": lot_number,
            "image_urls": saved_image_urls
        }

    except Exception as e:
        print("❌ ERROR in add_manual_vehicle:", flush=True)
        print(e, flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(status_code=500, detail=str(e))
