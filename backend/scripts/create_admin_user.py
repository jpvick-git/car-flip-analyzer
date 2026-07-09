"""Create or update an admin user (same privileges as UPLOAD_EXEMPT accounts)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import text
from passlib.context import CryptContext
from db import engine

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

EMAIL = os.getenv("NEW_ADMIN_EMAIL", "mtbramlett25@gmail.com")
PASSWORD = os.getenv("NEW_ADMIN_PASSWORD", "AIisGoingToKillUsAll")
TEMPLATE_EMAIL = os.getenv("TEMPLATE_ADMIN_EMAIL", "jpvick@gmail.com")


def hash_password(password: str) -> str:
    return pwd_context.hash(password[:72])


with engine.connect() as conn:
    template = conn.execute(
        text("""
            SELECT id, email, username, is_demo,
                   name, street, city, state_code, zip_code, phone,
                   default_margin_percent, default_transport_type, shop_location
            FROM users
            WHERE email = :email
        """),
        {"email": TEMPLATE_EMAIL},
    ).fetchone()

    if not template:
        print(f"Template user not found: {TEMPLATE_EMAIL}")
        sys.exit(1)

    template = dict(template._mapping)
    print(f"Template user: id={template['id']} email={template['email']} is_demo={template['is_demo']}")

    existing = conn.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": EMAIL},
    ).fetchone()

with engine.begin() as conn:
    hashed = hash_password(PASSWORD)

    if existing:
        conn.execute(
            text("""
                UPDATE users
                SET username = :u,
                    password_hash = :p,
                    is_demo = FALSE
                WHERE email = :e
            """),
            {"u": EMAIL, "e": EMAIL, "p": hashed},
        )
        print(f"Updated existing user id={existing[0]}")
    else:
        conn.execute(
            text("""
                INSERT INTO users (
                    username, email, password_hash, is_demo, created_at,
                    name, street, city, state_code, zip_code, phone,
                    default_margin_percent, default_transport_type, shop_location
                ) VALUES (
                    :u, :e, :p, FALSE, NOW(),
                    :name, :street, :city, :state_code, :zip_code, :phone,
                    :default_margin_percent, :default_transport_type, :shop_location
                )
            """),
            {
                "u": EMAIL,
                "e": EMAIL,
                "p": hashed,
                "name": template.get("name"),
                "street": template.get("street"),
                "city": template.get("city"),
                "state_code": template.get("state_code"),
                "zip_code": template.get("zip_code"),
                "phone": template.get("phone"),
                "default_margin_percent": template.get("default_margin_percent"),
                "default_transport_type": template.get("default_transport_type"),
                "shop_location": template.get("shop_location"),
            },
        )
        print("Created new admin user")

with engine.connect() as conn:
    row = conn.execute(
        text("SELECT id, email, username, is_demo FROM users WHERE email = :email"),
        {"email": EMAIL},
    ).fetchone()
    print(f"Result: {dict(row._mapping)}")

print()
print("Login credentials:")
print(f"  Email:    {EMAIL}")
print(f"  Password: {PASSWORD}")
print()
print("Remember to add this email to UPLOAD_EXEMPT_EMAIL in backend/.env")
