# backend/routes/manual_vehicle.py

import os
import shutil
import time
import traceback
import threading
import requests
from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from sqlalchemy import text

from ..db import get_engine

engine = get_engine()

from ..auth import get_current_user, require_not_demo
from ..vehicle_model import SOURCE_PRIVATE_PARTY, parse_money

router = APIRouter()

DOWNLOAD_DIR = os.getenv("DOWNLOAD_DIR", "/opt/carflip/backend/downloads")
INTERNAL_TRIGGER_URL = os.getenv("INTERNAL_TRIGGER_URL", "http://localhost:8000/api/trigger")
IMAGE_BASE_URL = os.getenv("IMAGE_BASE_URL", "https://carflipanalyzer.com/downloads")


@router.post("/add_manual_vehicle")
async def add_manual_vehicle(
    year: str = Form(None),
    make: str = Form(None),
    model: str = Form(None),
    trim: str = Form(None),
    mileage: str = Form(None),
    damage_description: str = Form(""),
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
        lot_number = f"MANUAL-{int(time.time())}"
        lot_dir = os.path.join(DOWNLOAD_DIR, lot_number)
        os.makedirs(lot_dir, exist_ok=True)

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

                url = f"{IMAGE_BASE_URL.rstrip('/')}/{lot_number}/{name}"
                saved_image_urls.append(url)
                idx += 1

        primary_image = saved_image_urls[0] if saved_image_urls else None
        asking_price_int = parse_money(asking_price)
        listing_text = (description or damage_description or "").strip()

        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO user_vehicles (
                        user_id,
                        source_type,
                        lot_url,
                        lot_number,
                        est_retail_value,
                        asking_price,
                        listing_description,
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
                        :source_type,
                        :url,
                        :lot,
                        :retail,
                        :asking_price,
                        :listing_description,
                        NULL,
                        :year,
                        :make,
                        :model,
                        :engine,
                        '',
                        :vin,
                        :title,
                        :odo,
                        'ACTUAL',
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
                    "source_type": SOURCE_PRIVATE_PARTY,
                    "url": listing_url,
                    "lot": lot_number,
                    "retail": asking_price or "0",
                    "asking_price": asking_price_int,
                    "listing_description": listing_text or None,
                    "year": year,
                    "make": make,
                    "model": model,
                    "engine": trim or "",
                    "vin": vin,
                    "title": title_status,
                    "odo": f"{mileage or 0} N",
                    "damage": damage_description or listing_text or "Private listing",
                    "location": location,
                    "image": primary_image,
                }
            )

        print("✔️ Manual vehicle inserted.", flush=True)

        def fire_ai_trigger():
            try:
                resp = requests.post(
                    INTERNAL_TRIGGER_URL,
                    json={
                        "user_id": user_id,
                        "copart_lots": [],
                        "ai_lots": [lot_number],
                    },
                    timeout=300,
                )
                print("Private-party AI trigger response:", resp.status_code, flush=True)
            except Exception as e:
                print("Private-party AI trigger error:", e, flush=True)

        if saved_image_urls:
            threading.Thread(target=fire_ai_trigger, daemon=True).start()

        return {
            "status": "success",
            "lot_number": lot_number,
            "source_type": SOURCE_PRIVATE_PARTY,
            "image_urls": saved_image_urls,
        }

    except Exception as e:
        print("❌ ERROR in add_manual_vehicle:", flush=True)
        print(e, flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(status_code=500, detail=str(e))
