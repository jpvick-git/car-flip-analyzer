# backend/activity.py
"""Login tracking, activity logging, and the admin-related schema migrations.

Imported at startup by auth.py and admin_routes.py so the ALTER/CREATE statements
run once when the API boots (same self-migrating pattern as user_settings.py).
"""

import json
import os
import threading
from sqlalchemy import text
from .db import get_engine

engine = get_engine()

# Offline IP geolocation (DB-IP Lite / GeoLite2 .mmdb). Zero ongoing cost:
# no API calls, no license key needed for DB-IP Lite. Degrades gracefully to
# no location when the DB file or geoip2 library is missing.
GEOIP_DB_PATH = os.getenv("GEOIP_DB_PATH", "/opt/carflip/geoip/city.mmdb")
_geo_reader = None
_geo_disabled = False
_geo_lock = threading.Lock()

# Role vocabulary. Dealership tier intentionally omitted for now.
ROLE_SUPER_ADMIN = "super_admin"
ROLE_USER = "user"
ROLES = frozenset({ROLE_SUPER_ADMIN, ROLE_USER})

ACCOUNT_STATUSES = frozenset(
    {"active", "inactive", "suspended", "pending", "disabled"}
)
# Statuses that block sign-in.
BLOCKED_LOGIN_STATUSES = frozenset({"suspended", "disabled"})

SUBSCRIPTION_STATUSES = frozenset({"free", "trial", "active", "past_due", "canceled"})


# Column/table DDL — must succeed (all use IF NOT EXISTS, so they are idempotent).
_CORE_DDL = (
    # users: roles, status, login tracking
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP",
    # soft archive for vehicles
    "ALTER TABLE user_vehicles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP",
    # login history
    """
    CREATE TABLE IF NOT EXISTS user_login_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        logged_in_at TIMESTAMP DEFAULT NOW(),
        ip_address TEXT,
        user_agent TEXT,
        browser TEXT,
        device_type TEXT,
        operating_system TEXT,
        success BOOLEAN DEFAULT TRUE,
        failure_reason TEXT,
        session_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,
    # activity log
    """
    CREATE TABLE IF NOT EXISTS user_activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        description TEXT,
        metadata JSONB,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,
    # approximate IP geolocation (offline lookup; nullable, best-effort)
    "ALTER TABLE user_login_history ADD COLUMN IF NOT EXISTS city TEXT",
    "ALTER TABLE user_login_history ADD COLUMN IF NOT EXISTS region TEXT",
    "ALTER TABLE user_login_history ADD COLUMN IF NOT EXISTS country TEXT",
    "ALTER TABLE user_activity_logs ADD COLUMN IF NOT EXISTS city TEXT",
    "ALTER TABLE user_activity_logs ADD COLUMN IF NOT EXISTS region TEXT",
    "ALTER TABLE user_activity_logs ADD COLUMN IF NOT EXISTS country TEXT",
)

# Indexes — best-effort. Some depend on columns created by other modules
# (e.g. user_vehicles.deal_status), so we tolerate failures and skip rather
# than take the whole service down on startup.
_INDEX_DDL = (
    "CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)",
    "CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status)",
    "CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users (last_login_at)",
    "CREATE INDEX IF NOT EXISTS idx_users_last_activity_at ON users (last_activity_at)",
    "CREATE INDEX IF NOT EXISTS idx_uv_user_id ON user_vehicles (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_uv_deal_status ON user_vehicles (deal_status)",
    "CREATE INDEX IF NOT EXISTS idx_uv_created_at ON user_vehicles (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_uv_archived_at ON user_vehicles (archived_at)",
    "CREATE INDEX IF NOT EXISTS idx_login_hist_user ON user_login_history (user_id, logged_in_at)",
    "CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_logs (user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_activity_action ON user_activity_logs (action_type, created_at)",
)


def ensure_admin_schema():
    # Each statement runs in its own transaction so one failure never rolls
    # back the others (and never crash-loops the API on startup).
    for stmt in _CORE_DDL:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception as e:  # pragma: no cover
            print(f"⚠️ admin schema DDL failed: {e}")
    for stmt in _INDEX_DDL:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception as e:  # pragma: no cover
            print(f"⚠️ admin index skipped: {e}")


ensure_admin_schema()


# --------------------------------------------------------------
# User-agent parsing (heuristic, no external dependency)
# --------------------------------------------------------------
def parse_user_agent(ua: str | None) -> dict:
    ua = ua or ""
    lower = ua.lower()

    # Browser
    if "edg/" in lower or "edga" in lower or "edgios" in lower:
        browser = "Edge"
    elif "opr/" in lower or "opera" in lower:
        browser = "Opera"
    elif "chrome" in lower and "chromium" not in lower:
        browser = "Chrome"
    elif "chromium" in lower:
        browser = "Chromium"
    elif "firefox" in lower:
        browser = "Firefox"
    elif "safari" in lower:
        browser = "Safari"
    else:
        browser = "Unknown"

    # OS
    if "windows" in lower:
        os_name = "Windows"
    elif "iphone" in lower or "ipad" in lower or "ios" in lower:
        os_name = "iOS"
    elif "mac os" in lower or "macintosh" in lower:
        os_name = "macOS"
    elif "android" in lower:
        os_name = "Android"
    elif "linux" in lower:
        os_name = "Linux"
    else:
        os_name = "Unknown"

    # Device type
    if "mobile" in lower or "iphone" in lower or "android" in lower:
        device = "Mobile"
    elif "ipad" in lower or "tablet" in lower:
        device = "Tablet"
    else:
        device = "Desktop"

    return {"browser": browser, "operating_system": os_name, "device_type": device}


def client_ip(request) -> str | None:
    if request is None:
        return None
    # Respect reverse-proxy headers (nginx) then fall back to socket peer.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    client = getattr(request, "client", None)
    return client.host if client else None


# --------------------------------------------------------------
# Offline IP geolocation
# --------------------------------------------------------------
def _get_geo_reader():
    """Lazily open the mmdb reader once; disable cleanly if unavailable."""
    global _geo_reader, _geo_disabled
    if _geo_reader is not None or _geo_disabled:
        return _geo_reader
    with _geo_lock:
        if _geo_reader is None and not _geo_disabled:
            try:
                import geoip2.database  # noqa: WPS433 (optional dependency)

                _geo_reader = geoip2.database.Reader(GEOIP_DB_PATH)
                print(f"[geoip] enabled ({GEOIP_DB_PATH})")
            except Exception as e:
                _geo_disabled = True
                print(f"[geoip] disabled ({e}); locations will be blank")
    return _geo_reader


def geolocate(ip: str | None) -> dict:
    """Return {city, region, country} for an IP, or empty dict if unknown.

    Private/loopback IPs and lookups that miss simply return {}.
    """
    if not ip:
        return {}
    reader = _get_geo_reader()
    if reader is None:
        return {}
    try:
        r = reader.city(ip)
        region = None
        try:
            sub = r.subdivisions.most_specific
            region = sub.iso_code or sub.name
        except Exception:
            region = None
        return {
            "city": r.city.name,
            "region": region,
            "country": r.country.iso_code,
        }
    except Exception:
        # AddressNotFoundError (private/unknown IP) and any parse error.
        return {}


# --------------------------------------------------------------
# Login history + activity logging
# --------------------------------------------------------------
def record_login(user_id, request, success: bool, failure_reason: str | None = None,
                 session_id: str | None = None):
    """Insert a login-history row. Best-effort; never raises to the caller."""
    try:
        ua = request.headers.get("user-agent") if request is not None else None
        parsed = parse_user_agent(ua)
        ip = client_ip(request)
        geo = geolocate(ip)
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO user_login_history
                        (user_id, ip_address, user_agent, browser, device_type,
                         operating_system, success, failure_reason, session_id,
                         city, region, country)
                    VALUES
                        (:uid, :ip, :ua, :browser, :device, :os, :success, :reason, :sid,
                         :city, :region, :country)
                """),
                {
                    "uid": user_id,
                    "ip": ip,
                    "ua": ua,
                    "browser": parsed["browser"],
                    "device": parsed["device_type"],
                    "os": parsed["operating_system"],
                    "success": success,
                    "reason": failure_reason,
                    "sid": session_id,
                    "city": geo.get("city"),
                    "region": geo.get("region"),
                    "country": geo.get("country"),
                },
            )
    except Exception as e:  # pragma: no cover - logging must not break auth
        print(f"⚠️ record_login failed: {e}")


def log_activity(user_id, action_type, *, entity_type=None, entity_id=None,
                 description=None, metadata=None, request=None):
    """Insert an activity-log row and bump users.last_activity_at.

    Best-effort: swallows errors so instrumentation never breaks a request.
    """
    try:
        ua = request.headers.get("user-agent") if request is not None else None
        meta_json = json.dumps(metadata) if metadata is not None else None
        ip = client_ip(request)
        geo = geolocate(ip)
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO user_activity_logs
                        (user_id, action_type, entity_type, entity_id, description,
                         metadata, ip_address, user_agent, city, region, country)
                    VALUES
                        (:uid, :action, :etype, :eid, :desc,
                         CAST(:meta AS JSONB), :ip, :ua, :city, :region, :country)
                """),
                {
                    "uid": user_id,
                    "action": action_type,
                    "etype": entity_type,
                    "eid": str(entity_id) if entity_id is not None else None,
                    "desc": description,
                    "meta": meta_json,
                    "ip": ip,
                    "ua": ua,
                    "city": geo.get("city"),
                    "region": geo.get("region"),
                    "country": geo.get("country"),
                },
            )
            if user_id is not None:
                conn.execute(
                    text("UPDATE users SET last_activity_at = NOW() WHERE id = :uid"),
                    {"uid": user_id},
                )
    except Exception as e:  # pragma: no cover
        print(f"⚠️ log_activity failed: {e}")
