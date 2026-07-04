# auth.py
from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from sqlalchemy import text
import os
from .db import get_engine

router = APIRouter()
engine = get_engine()

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 1 day
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@carflipanalyzer.com")

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
            SELECT id, email, password_hash
            FROM users
            WHERE email = :email
        """), {"email": email}).fetchone()
        if not row:
            return None
        user = dict(row._mapping)
        try:
            demo = conn.execute(
                text("SELECT COALESCE(is_demo, false) FROM users WHERE email = :email"),
                {"email": email},
            ).scalar()
            user["is_demo"] = bool(demo)
        except Exception:
            user["is_demo"] = email.lower() == DEMO_EMAIL.lower()
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

    return {"id": user["id"], "email": user["email"], "is_demo": bool(user.get("is_demo"))}

# --------------------------------------------------
# ROUTES
# --------------------------------------------------
@router.post("/register")
def register(
    username: str = Form(...),
    password: str = Form(...),
    name: str = Form(None),
    street: str = Form(None),
    city: str = Form(None),
    state_code: str = Form(None),
    zip_code: str = Form(None),
    phone: str = Form(None),
):
    with engine.begin() as conn:
        # Prevent duplicate accounts
        existing = conn.execute(
            text("SELECT 1 FROM users WHERE email = :email"),
            {"email": username}
        ).fetchone()

        if existing:
            raise HTTPException(status_code=400, detail="User already exists")

        conn.execute(
            text("""
                INSERT INTO users (
                    username, email, password_hash, created_at,
                    name, street, city, state_code, zip_code, phone
                ) VALUES (
                    :u, :e, :p, NOW(),
                    :name, :street, :city, :state_code, :zip_code, :phone
                )
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
                "phone": phone
            }
        )

    return {"message": "User created successfully"}

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_email(form.username)
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user["email"], "id": user["id"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "is_demo": bool(user.get("is_demo")),
    }
