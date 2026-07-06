"""Source-agnostic vehicle model helpers."""

import re

SOURCE_SALVAGE_AUCTION = "salvage_auction"
SOURCE_PRIVATE_PARTY = "private_party"

SOURCE_TYPES = (SOURCE_SALVAGE_AUCTION, SOURCE_PRIVATE_PARTY)

# Copart buyer premium — not applied to private-party acquisitions
AUCTION_BUYER_FEE_RATE = 0.075


def is_private_party(vehicle: dict) -> bool:
    return (vehicle.get("source_type") or SOURCE_SALVAGE_AUCTION) == SOURCE_PRIVATE_PARTY


def is_salvage_auction(vehicle: dict) -> bool:
    return not is_private_party(vehicle)


def buyer_fee_rate(vehicle: dict) -> float:
    return 0.0 if is_private_party(vehicle) else AUCTION_BUYER_FEE_RATE


def parse_money(val) -> int | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    digits = re.sub(r"[^\d.]", "", s)
    if not digits:
        return None
    try:
        return int(float(digits))
    except (TypeError, ValueError):
        return None


def infer_source_type(vehicle: dict) -> str:
    explicit = vehicle.get("source_type")
    if explicit in SOURCE_TYPES:
        return explicit
    lot = str(vehicle.get("lot_number") or "")
    if lot.startswith("MANUAL-"):
        return SOURCE_PRIVATE_PARTY
    return SOURCE_SALVAGE_AUCTION


def acquisition_cost(vehicle: dict) -> int:
    """Best available purchase price for flip math."""
    if is_private_party(vehicle):
        asking = parse_money(vehicle.get("asking_price"))
        if asking is not None:
            return asking
        return parse_money(vehicle.get("est_retail_value")) or 0

    bid = parse_money(vehicle.get("current_bid"))
    if bid is not None:
        return bid
    return parse_money(vehicle.get("my_bid")) or 0


def normalize_vehicle(vehicle: dict) -> dict:
    """Fill defaults and derived fields on a vehicle record."""
    if not vehicle:
        return vehicle

    out = dict(vehicle)
    out["source_type"] = infer_source_type(out)

    if out["source_type"] == SOURCE_PRIVATE_PARTY and out.get("asking_price") is None:
        parsed = parse_money(out.get("est_retail_value"))
        if parsed is not None:
            out["asking_price"] = parsed

    if not out.get("listing_description") and out.get("description"):
        out["listing_description"] = out["description"]

    return out
