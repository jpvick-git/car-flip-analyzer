# auth.py
from fastapi import APIRouter, Depends, HTTPException, status
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

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def hash_password(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    data.update({"exp": expire})
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

def get_user_by_email(email):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, email, password_hash
            FROM users
            WHERE email = :email
        """), {"email": email}).fetchone()

        if not row:
            return None

        return dict(row._mapping)

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

    # ✅ Explicitly return only these fields
    return {"id": user["id"], "email": user["email"]}


@router.post("/register")
def register(form: OAuth2PasswordRequestForm = Depends()):
    with engine.begin() as conn:
        existing = conn.execute(text("SELECT 1 FROM users WHERE email=:email"), {"email": form.username}).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="User already exists")
        conn.execute(
            text("INSERT INTO users (username,email,password_hash) VALUES (:u,:e,:p)"),
            {"u": form.username, "e": form.username, "p": hash_password(form.password)},
        )
    return {"message": "User created successfully"}

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_email(form.username)
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # ✅ include both id and email in the token
    token = create_access_token({"sub": user["email"], "id": user["id"]})
    return {"access_token": token, "token_type": "bearer"}

