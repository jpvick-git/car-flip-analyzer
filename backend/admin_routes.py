# backend/admin_routes.py
"""Super-admin-only API. Every route depends on require_super_admin (403 otherwise).

Server-side pagination/filtering/sorting; password hashes are never returned.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text

from .db import get_engine
from .auth import require_super_admin
from .activity import (
    log_activity,
    ensure_admin_schema,  # noqa: F401  (import ensures migrations ran at startup)
    ROLES,
    ACCOUNT_STATUSES,
    SUBSCRIPTION_STATUSES,
)
from .user_vehicles import _realized_profit
from .vehicle_model import normalize_vehicle
from .copart_utils import enrich_vehicle

router = APIRouter()
engine = get_engine()

# Vehicles that have received an AI valuation count as "evaluations".
EVAL_CONDITION = "resale_estimate IS NOT NULL AND resale_estimate > 0"

# flip_recommendation is computed on the frontend and not stored, so the
# admin "decision" is derived from the persisted deal_status instead.
ACQUIRED = ("bought", "in_repair", "listed", "sold")


def _decision_case(col="deal_status"):
    return (
        f"CASE WHEN {col} IN ('bought','in_repair','listed','sold') THEN 'BUY' "
        f"WHEN {col} = 'passed' THEN 'PASS' ELSE 'PENDING' END"
    )


def _decision_label(deal_status):
    ds = (deal_status or "").lower()
    if ds in ACQUIRED:
        return "BUY"
    if ds == "passed":
        return "PASS"
    return "PENDING"

# SQL expression for a rough realized profit (admin filtering/sorting only; the
# precise, buyer-fee-aware figure is computed in Python for detail views).
PROFIT_EXPR = (
    "(COALESCE(v.actual_sale_price,0) + COALESCE(v.backend_gross,0) "
    "- COALESCE(v.actual_purchase_price,0) - COALESCE(v.actual_repair_cost,0) "
    "- COALESCE(v.actual_transport_cost,0) - COALESCE(v.buy_auction_fee,0) "
    "- COALESCE(v.buy_deal_shield,0))"
)


def _clamp_page(page: int, page_size: int) -> tuple[int, int, int]:
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    return page, page_size, (page - 1) * page_size


# ==============================================================
# OVERVIEW
# ==============================================================
@router.get("/admin/overview")
def admin_overview(current_user: dict = Depends(require_super_admin)):
    with engine.connect() as conn:
        totals = conn.execute(text("""
            SELECT
                COUNT(*) AS total_users,
                COUNT(*) FILTER (
                    WHERE last_activity_at >= NOW() - INTERVAL '30 days'
                ) AS active_users
            FROM users
        """)).fetchone()
        total_users = int(totals.total_users or 0)
        active_users = int(totals.active_users or 0)

        veh = conn.execute(text(f"""
            SELECT
                COUNT(*) AS total_vehicles,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')
                    AS vehicles_added_30d,
                COUNT(*) FILTER (WHERE {EVAL_CONDITION}) AS total_evaluations
            FROM user_vehicles
            WHERE archived_at IS NULL
        """)).fetchone()
        total_vehicles = int(veh.total_vehicles or 0)

        most_active = conn.execute(text("""
            SELECT u.id, u.name, u.email, u.login_count,
                   COUNT(v.id) FILTER (WHERE v.archived_at IS NULL) AS vehicle_count
            FROM users u
            LEFT JOIN user_vehicles v ON v.user_id = u.id
            GROUP BY u.id, u.name, u.email, u.login_count
            ORDER BY vehicle_count DESC, u.login_count DESC NULLS LAST
            LIMIT 8
        """)).fetchall()

        makes = conn.execute(text("""
            SELECT make AS label, COUNT(*) AS count
            FROM user_vehicles
            WHERE archived_at IS NULL AND make IS NOT NULL AND make <> ''
            GROUP BY make ORDER BY count DESC LIMIT 10
        """)).fetchall()

        models = conn.execute(text("""
            SELECT TRIM(CONCAT(make, ' ', model)) AS label, COUNT(*) AS count
            FROM user_vehicles
            WHERE archived_at IS NULL AND model IS NOT NULL AND model <> ''
            GROUP BY TRIM(CONCAT(make, ' ', model))
            ORDER BY count DESC LIMIT 10
        """)).fetchall()

        decisions = conn.execute(text(f"""
            SELECT {_decision_case()} AS label, COUNT(*) AS count
            FROM user_vehicles
            WHERE archived_at IS NULL
            GROUP BY label
        """)).fetchall()

    most_active_user = None
    if most_active:
        top = most_active[0]
        most_active_user = {
            "id": top.id,
            "name": top.name,
            "email": top.email,
            "vehicle_count": int(top.vehicle_count or 0),
        }

    avg_vehicles = round(total_vehicles / total_users, 1) if total_users else 0

    return {
        "cards": {
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": total_users - active_users,
            "total_vehicles": total_vehicles,
            "vehicles_added_30d": int(veh.vehicles_added_30d or 0),
            "total_evaluations": int(veh.total_evaluations or 0),
            "avg_vehicles_per_user": avg_vehicles,
            "most_active_user": most_active_user,
        },
        "most_active_users": [
            {
                "id": r.id,
                "name": r.name,
                "email": r.email,
                "vehicle_count": int(r.vehicle_count or 0),
                "login_count": int(r.login_count or 0),
            }
            for r in most_active
        ],
        "common_makes": [{"label": r.label, "count": int(r.count)} for r in makes],
        "common_models": [{"label": r.label, "count": int(r.count)} for r in models],
        "decisions": [{"label": r.label, "count": int(r.count)} for r in decisions],
    }


# ==============================================================
# ANALYTICS (time-series for charts)
# ==============================================================
def _daily_series(sql: str, days: int) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text(sql), {"days": days}).fetchall()
    return [{"date": r.day.strftime("%Y-%m-%d"), "count": int(r.count)} for r in rows]


@router.get("/admin/analytics/users")
def analytics_users(days: int = Query(30, ge=1, le=365),
                    current_user: dict = Depends(require_super_admin)):
    registrations = _daily_series("""
        SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
        FROM users
        WHERE created_at >= NOW() - make_interval(days => :days)
        GROUP BY day ORDER BY day
    """, days)
    activity = _daily_series("""
        SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
        FROM user_activity_logs
        WHERE created_at >= NOW() - make_interval(days => :days)
        GROUP BY day ORDER BY day
    """, days)
    return {"registrations": registrations, "activity": activity}


@router.get("/admin/analytics/vehicles")
def analytics_vehicles(days: int = Query(30, ge=1, le=365),
                       current_user: dict = Depends(require_super_admin)):
    added = _daily_series("""
        SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
        FROM user_vehicles
        WHERE created_at >= NOW() - make_interval(days => :days)
        GROUP BY day ORDER BY day
    """, days)
    return {"added": added}


@router.get("/admin/analytics/evaluations")
def analytics_evaluations(days: int = Query(30, ge=1, le=365),
                          current_user: dict = Depends(require_super_admin)):
    evaluations = _daily_series(f"""
        SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
        FROM user_vehicles
        WHERE {EVAL_CONDITION}
          AND created_at >= NOW() - make_interval(days => :days)
        GROUP BY day ORDER BY day
    """, days)
    return {"evaluations": evaluations}


# ==============================================================
# USERS
# ==============================================================
USER_SORT_COLUMNS = {
    "created_at": "u.created_at",
    "last_login_at": "u.last_login_at",
    "last_activity_at": "u.last_activity_at",
    "login_count": "u.login_count",
    "total_vehicles": "total_vehicles",
    "total_evaluations": "total_evaluations",
    "name": "u.name",
    "email": "u.email",
}


@router.get("/admin/users")
def admin_users(
    current_user: dict = Depends(require_super_admin),
    search: str | None = None,
    role: str | None = None,
    account_status: str | None = None,
    subscription_status: str | None = None,
    last_login_from: str | None = None,
    last_login_to: str | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    page, page_size, offset = _clamp_page(page, page_size)
    sort_col = USER_SORT_COLUMNS.get(sort_by, "u.created_at")
    direction = "ASC" if sort_dir.lower() == "asc" else "DESC"

    where = ["1=1"]
    params: dict = {}
    if search:
        where.append("(u.name ILIKE :search OR u.email ILIKE :search)")
        params["search"] = f"%{search.strip()}%"
    if role:
        where.append("u.role = :role")
        params["role"] = role
    if account_status:
        where.append("u.account_status = :acct")
        params["acct"] = account_status
    if subscription_status:
        where.append("u.subscription_status = :sub")
        params["sub"] = subscription_status
    if last_login_from:
        where.append("u.last_login_at >= :ll_from")
        params["ll_from"] = last_login_from
    if last_login_to:
        where.append("u.last_login_at <= :ll_to")
        params["ll_to"] = last_login_to

    where_sql = " AND ".join(where)

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM users u WHERE {where_sql}"), params
        ).scalar()

        rows = conn.execute(text(f"""
            SELECT u.id, u.name, u.email, u.role, u.account_status,
                   u.subscription_status, u.business_type, u.created_at,
                   u.last_login_at, u.last_activity_at, u.login_count,
                   COUNT(v.id) FILTER (WHERE v.archived_at IS NULL) AS total_vehicles,
                   COUNT(v.id) FILTER (
                       WHERE v.archived_at IS NULL AND {EVAL_CONDITION}
                   ) AS total_evaluations
            FROM users u
            LEFT JOIN user_vehicles v ON v.user_id = u.id
            WHERE {where_sql}
            GROUP BY u.id, u.name, u.email, u.role, u.account_status,
                     u.subscription_status, u.business_type, u.created_at,
                     u.last_login_at, u.last_activity_at, u.login_count
            ORDER BY {sort_col} {direction} NULLS LAST
            LIMIT :limit OFFSET :offset
        """), {**params, "limit": page_size, "offset": offset}).fetchall()

    return {
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
        "users": [_user_row(r) for r in rows],
    }


def _user_row(r) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "email": r.email,
        "role": r.role,
        "account_status": r.account_status,
        "subscription_status": r.subscription_status,
        "business_type": r.business_type,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "last_login_at": r.last_login_at.isoformat() if r.last_login_at else None,
        "last_activity_at": r.last_activity_at.isoformat() if r.last_activity_at else None,
        "login_count": int(r.login_count or 0),
        "total_vehicles": int(r.total_vehicles or 0),
        "total_evaluations": int(r.total_evaluations or 0),
    }


@router.get("/admin/users/{user_id}")
def admin_user_detail(user_id: int, current_user: dict = Depends(require_super_admin)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, name, email, username, role, account_status, subscription_status,
                   business_type, phone, street, city, state_code, zip_code,
                   created_at, last_login_at, last_activity_at, login_count
            FROM users WHERE id = :id
        """), {"id": user_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        stats = conn.execute(text(f"""
            SELECT
                COUNT(*) FILTER (WHERE archived_at IS NULL) AS total_vehicles,
                COUNT(*) FILTER (WHERE archived_at IS NULL AND {EVAL_CONDITION})
                    AS total_evaluations,
                COUNT(*) FILTER (WHERE deal_status = 'sold') AS sold_count,
                COUNT(*) FILTER (WHERE deal_status IN ('bought','in_repair','listed','sold'))
                    AS buy_count,
                COUNT(*) FILTER (WHERE deal_status = 'passed') AS pass_count
            FROM user_vehicles WHERE user_id = :id
        """), {"id": user_id}).fetchone()

        sold_rows = conn.execute(text("""
            SELECT * FROM user_vehicles
            WHERE user_id = :id AND deal_status = 'sold'
        """), {"id": user_id}).fetchall()

    realized_total = 0
    realized_count = 0
    for sr in sold_rows:
        rp = _realized_profit(dict(sr._mapping))
        if rp is not None:
            realized_total += rp
            realized_count += 1

    user = dict(row._mapping)
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "username": user["username"],
        "role": user["role"],
        "account_status": user["account_status"],
        "subscription_status": user["subscription_status"],
        "business_type": user["business_type"],
        "phone": user["phone"],
        "location": ", ".join(
            [p for p in [user.get("city"), user.get("state_code")] if p]
        ),
        "created_at": user["created_at"].isoformat() if user["created_at"] else None,
        "last_login_at": user["last_login_at"].isoformat() if user["last_login_at"] else None,
        "last_activity_at": user["last_activity_at"].isoformat() if user["last_activity_at"] else None,
        "login_count": int(user["login_count"] or 0),
        "activity_summary": {
            "total_vehicles": int(stats.total_vehicles or 0),
            "total_evaluations": int(stats.total_evaluations or 0),
            "sold_count": int(stats.sold_count or 0),
            "buy_count": int(stats.buy_count or 0),
            "pass_count": int(stats.pass_count or 0),
            "realized_profit_total": realized_total,
            "avg_realized_profit": round(realized_total / realized_count, 1) if realized_count else None,
        },
    }


class UserUpdatePayload(BaseModel):
    role: str | None = None
    account_status: str | None = None
    subscription_status: str | None = None


@router.patch("/admin/users/{user_id}")
def admin_update_user(
    user_id: int,
    payload: UserUpdatePayload,
    request: Request,
    current_user: dict = Depends(require_super_admin),
):
    if payload.role is not None and payload.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if payload.account_status is not None and payload.account_status not in ACCOUNT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid account status")
    if (payload.subscription_status is not None
            and payload.subscription_status not in SUBSCRIPTION_STATUSES):
        raise HTTPException(status_code=400, detail="Invalid subscription status")

    # Guard: a super admin cannot demote or disable their own account (avoids lockout).
    if user_id == current_user["id"]:
        if payload.role is not None and payload.role != "super_admin":
            raise HTTPException(status_code=400, detail="You cannot remove your own super admin role")
        if payload.account_status is not None and payload.account_status != "active":
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    fields = {}
    if payload.role is not None:
        fields["role"] = payload.role
    if payload.account_status is not None:
        fields["account_status"] = payload.account_status
    if payload.subscription_status is not None:
        fields["subscription_status"] = payload.subscription_status
    if not fields:
        raise HTTPException(status_code=400, detail="No changes provided")

    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    with engine.begin() as conn:
        result = conn.execute(
            text(f"UPDATE users SET {set_clause} WHERE id = :id"),
            {**fields, "id": user_id},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")

    log_activity(
        current_user["id"], "admin_update_user", entity_type="user",
        entity_id=user_id, description=f"Admin updated user {user_id}",
        metadata=fields, request=request,
    )
    return admin_user_detail(user_id, current_user)


@router.get("/admin/users/{user_id}/vehicles")
def admin_user_vehicles(
    user_id: int,
    current_user: dict = Depends(require_super_admin),
    page: int = 1,
    page_size: int = 25,
):
    page, page_size, offset = _clamp_page(page, page_size)
    with engine.connect() as conn:
        total = conn.execute(
            text("SELECT COUNT(*) FROM user_vehicles WHERE user_id = :id"),
            {"id": user_id},
        ).scalar()
        rows = conn.execute(text("""
            SELECT * FROM user_vehicles
            WHERE user_id = :id
            ORDER BY id DESC
            LIMIT :limit OFFSET :offset
        """), {"id": user_id, "limit": page_size, "offset": offset}).fetchall()

    return {
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
        "vehicles": [_vehicle_row(dict(r._mapping)) for r in rows],
    }


@router.get("/admin/users/{user_id}/activity")
def admin_user_activity(
    user_id: int,
    current_user: dict = Depends(require_super_admin),
    page: int = 1,
    page_size: int = 50,
):
    page, page_size, offset = _clamp_page(page, page_size)
    with engine.connect() as conn:
        total = conn.execute(
            text("SELECT COUNT(*) FROM user_activity_logs WHERE user_id = :id"),
            {"id": user_id},
        ).scalar()
        rows = conn.execute(text("""
            SELECT id, action_type, entity_type, entity_id, description,
                   metadata, ip_address, created_at
            FROM user_activity_logs
            WHERE user_id = :id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """), {"id": user_id, "limit": page_size, "offset": offset}).fetchall()

    return {
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
        "activity": [_activity_row(r) for r in rows],
    }


# ==============================================================
# VEHICLES
# ==============================================================
VEHICLE_SORT_COLUMNS = {
    "created_at": "v.created_at",
    "profit": "est_profit",
    "sale_price": "v.actual_sale_price",
    "make": "v.make",
    "year": "v.year",
}


def _vehicle_row(v: dict) -> dict:
    return {
        "id": v.get("id"),
        "public_id": v.get("public_id"),
        "user_id": v.get("user_id"),
        "year": v.get("year"),
        "make": v.get("make"),
        "model": v.get("model"),
        "vin": v.get("vin"),
        "image_url": v.get("image_url"),
        "deal_status": v.get("deal_status"),
        "flip_recommendation": _decision_label(v.get("deal_status")),
        "est_retail_value": v.get("est_retail_value"),
        "repair_estimate": v.get("repair_estimate"),
        "resale_estimate": v.get("resale_estimate"),
        "actual_purchase_price": v.get("actual_purchase_price"),
        "actual_repair_cost": v.get("actual_repair_cost"),
        "actual_sale_price": v.get("actual_sale_price"),
        "realized_profit": _realized_profit(v),
        "created_at": v.get("created_at").isoformat() if v.get("created_at") else None,
        "archived_at": v.get("archived_at").isoformat() if v.get("archived_at") else None,
    }


@router.get("/admin/vehicles")
def admin_vehicles(
    current_user: dict = Depends(require_super_admin),
    search: str | None = None,
    user_id: int | None = None,
    deal_status: str | None = None,
    decision: str | None = None,
    profit_min: int | None = None,
    profit_max: int | None = None,
    include_archived: bool = False,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    page, page_size, offset = _clamp_page(page, page_size)
    sort_col = VEHICLE_SORT_COLUMNS.get(sort_by, "v.created_at")
    direction = "ASC" if sort_dir.lower() == "asc" else "DESC"

    where = ["1=1"]
    params: dict = {}
    if not include_archived:
        where.append("v.archived_at IS NULL")
    if search:
        where.append(
            "(v.vin ILIKE :search OR v.make ILIKE :search OR v.model ILIKE :search "
            "OR u.name ILIKE :search OR u.email ILIKE :search)"
        )
        params["search"] = f"%{search.strip()}%"
    if user_id is not None:
        where.append("v.user_id = :uid")
        params["uid"] = user_id
    if deal_status:
        where.append("v.deal_status = :ds")
        params["ds"] = deal_status
    if decision:
        where.append(f"{_decision_case('v.deal_status')} = :dec")
        params["dec"] = decision.upper()
    if profit_min is not None:
        where.append(f"{PROFIT_EXPR} >= :pmin")
        params["pmin"] = profit_min
    if profit_max is not None:
        where.append(f"{PROFIT_EXPR} <= :pmax")
        params["pmax"] = profit_max

    where_sql = " AND ".join(where)

    with engine.connect() as conn:
        total = conn.execute(text(f"""
            SELECT COUNT(*) FROM user_vehicles v
            LEFT JOIN users u ON u.id = v.user_id
            WHERE {where_sql}
        """), params).scalar()

        summary = conn.execute(text(f"""
            SELECT
                COUNT(*) AS count,
                COUNT(*) FILTER (WHERE v.deal_status = 'sold') AS sold,
                COALESCE(SUM({PROFIT_EXPR}) FILTER (WHERE v.deal_status = 'sold'), 0)
                    AS realized_profit_total,
                COALESCE(AVG({PROFIT_EXPR}) FILTER (WHERE v.deal_status = 'sold'), 0)
                    AS avg_profit
            FROM user_vehicles v
            LEFT JOIN users u ON u.id = v.user_id
            WHERE {where_sql}
        """), params).fetchone()

        rows = conn.execute(text(f"""
            SELECT v.*, {PROFIT_EXPR} AS est_profit,
                   u.name AS owner_name, u.email AS owner_email
            FROM user_vehicles v
            LEFT JOIN users u ON u.id = v.user_id
            WHERE {where_sql}
            ORDER BY {sort_col} {direction} NULLS LAST
            LIMIT :limit OFFSET :offset
        """), {**params, "limit": page_size, "offset": offset}).fetchall()

    vehicles = []
    for r in rows:
        m = dict(r._mapping)
        row = _vehicle_row(m)
        row["owner_name"] = m.get("owner_name")
        row["owner_email"] = m.get("owner_email")
        vehicles.append(row)

    return {
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
        "summary": {
            "count": int(summary.count or 0),
            "sold": int(summary.sold or 0),
            "realized_profit_total": int(summary.realized_profit_total or 0),
            "avg_profit": round(float(summary.avg_profit or 0), 1),
        },
        "vehicles": vehicles,
    }


@router.get("/admin/vehicles/{public_id}")
def admin_vehicle_detail(public_id: str, current_user: dict = Depends(require_super_admin)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT v.*, u.name AS owner_name, u.email AS owner_email
            FROM user_vehicles v
            LEFT JOIN users u ON u.id = v.user_id
            WHERE v.public_id = :pid
        """), {"pid": public_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    m = dict(row._mapping)
    result = normalize_vehicle(enrich_vehicle(m))
    result["owner_name"] = m.get("owner_name")
    result["owner_email"] = m.get("owner_email")
    result["realized_profit"] = _realized_profit(m)
    return result


@router.post("/admin/vehicles/{public_id}/archive")
def admin_archive_vehicle(
    public_id: str, request: Request,
    current_user: dict = Depends(require_super_admin),
):
    with engine.begin() as conn:
        result = conn.execute(text("""
            UPDATE user_vehicles SET archived_at = NOW()
            WHERE public_id = :pid AND archived_at IS NULL
        """), {"pid": public_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found or already archived")
    log_activity(
        current_user["id"], "admin_archive_vehicle", entity_type="vehicle",
        entity_id=public_id, description=f"Admin archived vehicle {public_id}",
        request=request,
    )
    return {"status": "archived"}


@router.post("/admin/vehicles/{public_id}/restore")
def admin_restore_vehicle(
    public_id: str, request: Request,
    current_user: dict = Depends(require_super_admin),
):
    with engine.begin() as conn:
        result = conn.execute(text("""
            UPDATE user_vehicles SET archived_at = NULL
            WHERE public_id = :pid AND archived_at IS NOT NULL
        """), {"pid": public_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vehicle not found or not archived")
    log_activity(
        current_user["id"], "admin_restore_vehicle", entity_type="vehicle",
        entity_id=public_id, description=f"Admin restored vehicle {public_id}",
        request=request,
    )
    return {"status": "restored"}


# ==============================================================
# ACTIVITY LOG
# ==============================================================
def _activity_row(r) -> dict:
    return {
        "id": r.id,
        "action_type": r.action_type,
        "entity_type": r.entity_type,
        "entity_id": r.entity_id,
        "description": r.description,
        "metadata": r.metadata,
        "ip_address": r.ip_address,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/admin/activity")
def admin_activity(
    current_user: dict = Depends(require_super_admin),
    user_id: int | None = None,
    action_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    page, page_size, offset = _clamp_page(page, page_size)
    where = ["1=1"]
    params: dict = {}
    if user_id is not None:
        where.append("a.user_id = :uid")
        params["uid"] = user_id
    if action_type:
        where.append("a.action_type = :atype")
        params["atype"] = action_type
    if date_from:
        where.append("a.created_at >= :dfrom")
        params["dfrom"] = date_from
    if date_to:
        where.append("a.created_at <= :dto")
        params["dto"] = date_to
    where_sql = " AND ".join(where)

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM user_activity_logs a WHERE {where_sql}"),
            params,
        ).scalar()
        rows = conn.execute(text(f"""
            SELECT a.id, a.user_id, a.action_type, a.entity_type, a.entity_id,
                   a.description, a.metadata, a.ip_address, a.created_at,
                   u.name AS user_name, u.email AS user_email
            FROM user_activity_logs a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE {where_sql}
            ORDER BY a.created_at DESC
            LIMIT :limit OFFSET :offset
        """), {**params, "limit": page_size, "offset": offset}).fetchall()

        action_types = conn.execute(text("""
            SELECT DISTINCT action_type FROM user_activity_logs ORDER BY action_type
        """)).fetchall()

    activity = []
    for r in rows:
        row = _activity_row(r)
        row["user_id"] = r.user_id
        row["user_name"] = r.user_name
        row["user_email"] = r.user_email
        activity.append(row)

    return {
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
        "activity": activity,
        "action_types": [r.action_type for r in action_types],
    }
