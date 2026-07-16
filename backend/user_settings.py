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

BUSINESS_TYPES = frozenset({"flipper", "dealer"})
DEFAULT_BUSINESS_TYPE = "flipper"

# Lot cost-profile defaults (dealer mode). Seeded from a real small-lot buyer's numbers.
LOT_PROFILE_DEFAULTS = {
    "target_front_gross": 2500,
    "auction_fee_default": 550,
    "transport_cost_default": 700,
    "deal_shield_fee": 365,
    "default_recon": 1200,
    "floor_plan_cost_per_day": 12,
    "target_turn_days": 60,
    "max_turn_days": 90,
}

# Settings columns selected/returned everywhere
SETTINGS_COLUMNS = (
    "default_margin_percent",
    "default_transport_type",
    "shop_location",
    "business_type",
    *LOT_PROFILE_DEFAULTS.keys(),
)

_SELECT_SETTINGS = ", ".join(SETTINGS_COLUMNS)


def ensure_user_settings_schema():
    with engine.begin() as conn:
        stmts = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_margin_percent INTEGER DEFAULT 15",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_transport_type TEXT DEFAULT 'local_tow'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_location TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'flipper'",
        ]
        for col, default in LOT_PROFILE_DEFAULTS.items():
            stmts.append(
                f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} INTEGER DEFAULT {default}"
            )
        for stmt in stmts:
            conn.execute(text(stmt))


ensure_user_settings_schema()


class SettingsUpdatePayload(BaseModel):
    default_margin_percent: int | None = Field(None, ge=0, le=90)
    default_transport_type: str | None = None
    shop_location: str | None = None
    business_type: str | None = None
    target_front_gross: int | None = Field(None, ge=0, le=1_000_000)
    auction_fee_default: int | None = Field(None, ge=0, le=100_000)
    transport_cost_default: int | None = Field(None, ge=0, le=100_000)
    deal_shield_fee: int | None = Field(None, ge=0, le=100_000)
    default_recon: int | None = Field(None, ge=0, le=1_000_000)
    floor_plan_cost_per_day: int | None = Field(None, ge=0, le=100_000)
    target_turn_days: int | None = Field(None, ge=0, le=3650)
    max_turn_days: int | None = Field(None, ge=0, le=3650)


def _row_to_settings(row) -> dict:
    data = dict(row._mapping)
    margin = data.get("default_margin_percent")
    if margin is None:
        margin = DEFAULT_MARGIN
    transport = data.get("default_transport_type") or DEFAULT_TRANSPORT
    if transport not in TRANSPORT_TYPES:
        transport = DEFAULT_TRANSPORT
    business = data.get("business_type") or DEFAULT_BUSINESS_TYPE
    if business not in BUSINESS_TYPES:
        business = DEFAULT_BUSINESS_TYPE

    result = {
        "default_margin_percent": int(margin),
        "default_transport_type": transport,
        "shop_location": data.get("shop_location") or "",
        "business_type": business,
    }
    for col, default in LOT_PROFILE_DEFAULTS.items():
        val = data.get(col)
        result[col] = int(val) if val is not None else default
    return result


@router.get("/settings")
def get_settings(current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(
            text(f"SELECT {_SELECT_SETTINGS} FROM users WHERE id = :id"),
            {"id": current_user["id"]},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    result = _row_to_settings(row)
    result["role"] = current_user.get("role", "user")
    return result


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

    if payload.business_type is not None and payload.business_type not in BUSINESS_TYPES:
        raise HTTPException(status_code=400, detail="Invalid business type")

    fields = {}
    if payload.default_margin_percent is not None:
        fields["default_margin_percent"] = payload.default_margin_percent
    if payload.default_transport_type is not None:
        fields["default_transport_type"] = payload.default_transport_type
    if payload.shop_location is not None:
        fields["shop_location"] = payload.shop_location.strip()
    if payload.business_type is not None:
        fields["business_type"] = payload.business_type
    for col in LOT_PROFILE_DEFAULTS:
        val = getattr(payload, col)
        if val is not None:
            fields[col] = val

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
            text(f"SELECT {_SELECT_SETTINGS} FROM users WHERE id = :id"),
            {"id": current_user["id"]},
        ).fetchone()

    return _row_to_settings(row)
