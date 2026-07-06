# backend/user_settings.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from .db import get_engine
from .auth import get_current_user, require_not_demo

router = APIRouter()
engine = get_engine()

TRANSPORT_TYPES = frozenset({
    "local_tow",
    "self_pickup",
    "open_carrier",
    "enclosed_carrier",
    "drive_home",
})

DEFAULT_MARGIN = 15
DEFAULT_TRANSPORT = "local_tow"


def ensure_user_settings_schema():
    with engine.begin() as conn:
        for stmt in (
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_margin_percent INTEGER DEFAULT 15",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_transport_type TEXT DEFAULT 'local_tow'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_location TEXT",
        ):
            conn.execute(text(stmt))


ensure_user_settings_schema()


class SettingsUpdatePayload(BaseModel):
    default_margin_percent: int | None = Field(None, ge=0, le=90)
    default_transport_type: str | None = None
    shop_location: str | None = None


def _row_to_settings(row) -> dict:
    margin = row.default_margin_percent
    if margin is None:
        margin = DEFAULT_MARGIN
    transport = row.default_transport_type or DEFAULT_TRANSPORT
    if transport not in TRANSPORT_TYPES:
        transport = DEFAULT_TRANSPORT
    return {
        "default_margin_percent": int(margin),
        "default_transport_type": transport,
        "shop_location": row.shop_location or "",
    }


@router.get("/settings")
def get_settings(current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT default_margin_percent, default_transport_type, shop_location
                FROM users
                WHERE id = :id
            """),
            {"id": current_user["id"]},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return _row_to_settings(row)


@router.patch("/settings")
def update_settings(
    payload: SettingsUpdatePayload,
    current_user: dict = Depends(get_current_user),
):
    require_not_demo(current_user)

    if (
        payload.default_transport_type is not None
        and payload.default_transport_type not in TRANSPORT_TYPES
    ):
        raise HTTPException(status_code=400, detail="Invalid transport type")

    fields = {}
    if payload.default_margin_percent is not None:
        fields["default_margin_percent"] = payload.default_margin_percent
    if payload.default_transport_type is not None:
        fields["default_transport_type"] = payload.default_transport_type
    if payload.shop_location is not None:
        fields["shop_location"] = payload.shop_location.strip()

    if not fields:
        return get_settings(current_user)

    set_clause = ", ".join(f"{col} = :{col}" for col in fields)
    fields["id"] = current_user["id"]

    with engine.begin() as conn:
        result = conn.execute(
            text(f"UPDATE users SET {set_clause} WHERE id = :id"),
            fields,
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")

        row = conn.execute(
            text("""
                SELECT default_margin_percent, default_transport_type, shop_location
                FROM users
                WHERE id = :id
            """),
            {"id": current_user["id"]},
        ).fetchone()

    return _row_to_settings(row)
