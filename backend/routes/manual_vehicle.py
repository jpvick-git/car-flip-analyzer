from fastapi import APIRouter, File, UploadFile, Form, Depends
from fastapi.responses import JSONResponse
import os
import shutil
from sqlalchemy import text
from ..db import engine
from ..auth_utils import get_current_user
from ..ai_estimator import estimate_repair_cost, estimate_resale_value

router = APIRouter()

MANUAL_UPLOAD_DIR = "/root/car-flip-analyzer/backend/manual_uploads"


@router.post("/add_manual_vehicle")
async def add_manual_vehicle(
    year: int = Form(None),
    make: str = Form(None),
    model: str = Form(None),
    trim: str = Form(None),
    mileage: int = Form(None),
    damage_description: str = Form(None),
    title_status: str = Form(None),
    asking_price: float = Form(None),
    location: str = Form(None),
    listing_url: str = Form(None),
    description: str = Form(None),
    vin: str = Form(None),
    files: list[UploadFile] = File(None),
    user=Depends(get_current_user),
):
    user_id = user["id"]

    # ----------------------------------------------------
    # 1. Insert base vehicle record
    # ----------------------------------------------------
    with engine.begin() as conn:
        insert_sql = text("""
            INSERT INTO user_manual_vehicles (
                user_id, year, make, model, trim, mileage, damage_description,
                title_status, asking_price, location, listing_url, description, vin
            )
            OUTPUT INSERTED.id
            VALUES (
                :user_id, :year, :make, :model, :trim, :mileage, :damage,
                :title, :price, :loc, :url, :desc, :vin
            )
        """)

        new_id = conn.execute(insert_sql, {
            "user_id": user_id,
            "year": year,
            "make": make,
            "model": model,
            "trim": trim,
            "mileage": mileage,
            "damage": damage_description,
            "title": title_status,
            "price": asking_price,
            "loc": location,
            "url": listing_url,
            "desc": description,
            "vin": vin
        }).scalar()

    # ----------------------------------------------------
    # 2. Save photos to folder /manual_uploads/{id}
    # ----------------------------------------------------
    folder = os.path.join(MANUAL_UPLOAD_DIR, str(new_id))
    os.makedirs(folder, exist_ok=True)

    image_urls = []

    if files:
        for idx, file in enumerate(files, start=1):
            ext = os.path.splitext(file.filename)[-1]
            filename = f"{new_id}_Image_{idx}{ext}"
            save_path = os.path.join(folder, filename)

            with open(save_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            image_url = f"https://api.carflipanalyzer.com/backend/manual_uploads/{new_id}/{filename}"
            image_urls.append(image_url)

            # Insert into manual_vehicle_images
            with engine.begin() as conn:
                conn.execute(
                    text("INSERT INTO manual_vehicle_images (vehicle_id, image_url) VALUES (:vid, :img)"),
                    {"vid": new_id, "img": image_url}
                )

    # ----------------------------------------------------
    # 3. AI Repair & Resale Estimates
    # ----------------------------------------------------
    first_image = image_urls[0] if image_urls else None

    ai_repair = await estimate_repair_cost(first_image)
    ai_resale = await estimate_resale_value(year, make, model, mileage)

    # ----------------------------------------------------
    # 4. Get user state → tax/title fees
    # ----------------------------------------------------
    with engine.begin() as conn:
        fee_row = conn.execute(
            text("SELECT avg_tax_rate, title_fee FROM tax_title_fees WHERE state_code = :sc"),
            {"sc": user["state_code"]}
        ).fetchone()

    tax_rate = fee_row.avg_tax_rate if fee_row else 0
    title_fee = fee_row.title_fee if fee_row else 0

    tax_amount = (ai_resale * tax_rate) / 100

    # ----------------------------------------------------
    # 5. Max Bid Formula
    # ----------------------------------------------------
    max_bid = int(ai_resale - ai_repair - tax_amount - title_fee)

    # ----------------------------------------------------
    # 6. Update the vehicle with AI values + final max bid
    # ----------------------------------------------------
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE user_manual_vehicles
            SET ai_repair_estimate = :r,
                ai_resale_estimate = :re,
                tax_amount = :t,
                title_fee = :tf,
                max_bid = :mb
            WHERE id = :id
        """), {
            "r": ai_repair,
            "re": ai_resale,
            "t": tax_amount,
            "tf": title_fee,
            "mb": max_bid,
            "id": new_id
        })

    return JSONResponse({
        "vehicle_id": new_id,
        "images": image_urls,
        "ai_repair_estimate": ai_repair,
        "ai_resale_estimate": ai_resale,
        "max_bid": max_bid
    })
