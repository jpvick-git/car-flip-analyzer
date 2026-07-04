"""Create or update the read-only demo user. Run once on the Droplet."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import text
from passlib.context import CryptContext
from db import engine

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password[:72])

DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@carflipanalyzer.com")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "DemoView2026!")
# User id whose vehicles the demo account can browse (your main account)
DEMO_VEHICLE_USER_ID = os.getenv("DEMO_VEHICLE_USER_ID", "2")

with engine.begin() as conn:
    conn.execute(text("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE
    """))
print("Added is_demo column (if missing)")

with engine.begin() as conn:
    existing = conn.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": DEMO_EMAIL},
    ).fetchone()

    if existing:
        conn.execute(
            text("""
                UPDATE users
                SET is_demo = TRUE, password_hash = :pw
                WHERE email = :email
            """),
            {"email": DEMO_EMAIL, "pw": hash_password(DEMO_PASSWORD)},
        )
        print(f"Updated demo user (id={existing[0]})")
    else:
        conn.execute(text("""
            SELECT setval(
                pg_get_serial_sequence('users', 'id'),
                COALESCE((SELECT MAX(id) FROM users), 0)
            )
        """))
        conn.execute(
            text("""
                INSERT INTO users (username, email, password_hash, is_demo, created_at)
                VALUES (:u, :e, :p, TRUE, NOW())
            """),
            {"u": DEMO_EMAIL, "e": DEMO_EMAIL, "p": hash_password(DEMO_PASSWORD)},
        )
        print("Created demo user")

print()
print("Demo login credentials:")
print(f"  Email:    {DEMO_EMAIL}")
print(f"  Password: {DEMO_PASSWORD}")
print()
print("Set on the Droplet in backend/.env:")
print(f"  DEMO_VEHICLE_USER_ID={DEMO_VEHICLE_USER_ID}")
print("  (id of the account whose cars demo users can view)")
