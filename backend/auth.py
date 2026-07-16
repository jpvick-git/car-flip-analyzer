# auth.py
from fastapi import APIRouter, Depends, HTTPException, Form, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from sqlalchemy import text
import os
from .db import get_engine
from .activity import (
    record_login,
    log_activity,
    ROLE_SUPER_ADMIN,
    BLOCKED_LOGIN_STATUSES,
)

router = APIRouter()
engine = get_engine()

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 1 day
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@carflipanalyzer.com")
DAILY_VEHICLE_LIMIT = int(os.getenv("DAILY_VEHICLE_LIMIT", "2"))
UPLOAD_EXEMPT_EMAILS = {
    e.strip().lower()
    for e in os.getenv("UPLOAD_EXEMPT_EMAIL", "jpvick@gmail.com").split(",")
    if e.strip()
}

# --------------------------------------------------
# PASSWORD HELPERS
# --------------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Safely verify a password without triggering bcrypt 72-byte errors."""
    if not hashed_password or not plain_password:
        return False
    try:
        # bcrypt only supports up to 72 bytes; truncate if longer
        return pwd_context.verify(plain_password[:72], hashed_password)
    except ValueError as e:
        print(f"⚠️ bcrypt verify error: {e}")
        return False

def hash_password(password: str) -> str:
    """Generate bcrypt hash (auto-handled by passlib)."""
    return pwd_context.hash(password[:72])

# --------------------------------------------------
# TOKEN HELPERS
# --------------------------------------------------
def create_access_token(data: dict):
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = data.copy()
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --------------------------------------------------
# DATABASE HELPERS
# --------------------------------------------------
def get_user_by_email(email):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, email, password_hash,
                   COALESCE(is_demo, false) AS is_demo,
                   COALESCE(role, 'user') AS role,
                   COALESCE(account_status, 'active') AS account_status
            FROM users
            WHERE email = :email
        """), {"email": email}).fetchone()
        if not row:
            return None
        user = dict(row._mapping)
        user["is_demo"] = bool(user.get("is_demo"))
        return user

def get_vehicle_owner_id(current_user: dict) -> int:
    """User id whose vehicles this account may view."""
    if current_user.get("is_demo"):
        owner = os.getenv("DEMO_VEHICLE_USER_ID")
        if not owner:
            raise HTTPException(status_code=503, detail="Demo account is not configured")
        return int(owner)
    return current_user["id"]

def require_not_demo(current_user: dict):
    if current_user.get("is_demo"):
        raise HTTPException(status_code=403, detail="Demo account is read-only")

def is_upload_exempt(current_user: dict) -> bool:
    email = (current_user.get("email") or "").lower()
    return email in UPLOAD_EXEMPT_EMAILS

def count_vehicles_added_today(user_id: int) -> int:
    with engine.connect() as conn:
        count = conn.execute(
            text("""
                SELECT COUNT(*) FROM user_vehicles
                WHERE user_id = :uid
                  AND created_at >= CURRENT_DATE
            """),
            {"uid": user_id},
        ).scalar()
    return int(count or 0)

def require_daily_vehicle_quota(current_user: dict, additional: int = 1):
    """Reject if user would exceed the daily new-vehicle limit (exempt admin excluded)."""
    if additional <= 0 or is_upload_exempt(current_user):
        return

    today_count = count_vehicles_added_today(current_user["id"])
    if today_count + additional > DAILY_VEHICLE_LIMIT:
        remaining = max(0, DAILY_VEHICLE_LIMIT - today_count)
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily vehicle limit reached ({DAILY_VEHICLE_LIMIT} per day). "
                f"You can add {remaining} more vehicle(s) today."
            ),
        )

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("account_status") in BLOCKED_LOGIN_STATUSES:
        raise HTTPException(status_code=403, detail="Account is suspended or disabled")

    return {
        "id": user["id"],
        "email": user["email"],
        "is_demo": bool(user.get("is_demo")),
        "role": user.get("role", "user"),
        "account_status": user.get("account_status", "active"),
    }


def require_super_admin(current_user: dict = Depends(get_current_user)):
    """Dependency that enforces the super_admin role (403 otherwise)."""
    if current_user.get("role") != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user

# --------------------------------------------------
# ROUTES
# --------------------------------------------------
@router.post("/register")
def register(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    name: str = Form(None),
    street: str = Form(None),
    city: str = Form(None),
    state_code: str = Form(None),
    zip_code: str = Form(None),
    phone: str = Form(None),
    business_type: str = Form("flipper"),
):
    # Account type chosen at sign-up (flipper vs used-car-lot/dealer).
    business_type = (business_type or "flipper").strip().lower()
    if business_type not in ("flipper", "dealer"):
        business_type = "flipper"

    with engine.begin() as conn:
        # Prevent duplicate accounts
        existing = conn.execute(
            text("SELECT 1 FROM users WHERE email = :email"),
            {"email": username}
        ).fetchone()

        if existing:
            raise HTTPException(status_code=400, detail="User already exists")

        new_id = conn.execute(
            text("""
                INSERT INTO users (
                    username, email, password_hash, created_at,
                    name, street, city, state_code, zip_code, phone, business_type
                ) VALUES (
                    :u, :e, :p, NOW(),
                    :name, :street, :city, :state_code, :zip_code, :phone, :business_type
                )
                RETURNING id
            """),
            {
                "u": username,
                "e": username,
                "p": hash_password(password),
                "name": name,
                "street": street,
                "city": city,
                "state_code": state_code,
                "zip_code": zip_code,
                "phone": phone,
                "business_type": business_type,
            }
        ).scalar()

    log_activity(
        new_id, "register", entity_type="user", entity_id=new_id,
        description=f"New account registered: {username}",
        metadata={"business_type": business_type}, request=request,
    )
    return {"message": "User created successfully"}

@router.post("/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_email(form.username)
    if not user or not verify_password(form.password, user["password_hash"]):
        record_login(
            user["id"] if user else None, request, success=False,
            failure_reason="invalid_credentials",
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("account_status") in BLOCKED_LOGIN_STATUSES:
        record_login(
            user["id"], request, success=False,
            failure_reason=f"account_{user.get('account_status')}",
        )
        raise HTTPException(status_code=403, detail="Account is suspended or disabled")

    token = create_access_token({"sub": user["email"], "id": user["id"]})

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE users
                SET last_login_at = NOW(),
                    last_activity_at = NOW(),
                    login_count = COALESCE(login_count, 0) + 1
                WHERE id = :uid
            """),
            {"uid": user["id"]},
        )
    record_login(user["id"], request, success=True, session_id=token[-16:])
    log_activity(
        user["id"], "login", entity_type="user", entity_id=user["id"],
        description="User logged in", request=request,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "is_demo": bool(user.get("is_demo")),
        "role": user.get("role", "user"),
    }


@router.post("/logout")
def logout(request: Request, current_user: dict = Depends(get_current_user)):
    log_activity(
        current_user["id"], "logout", entity_type="user",
        entity_id=current_user["id"], description="User logged out", request=request,
    )
    return {"message": "Logged out"}
