# db.py
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL not set in environment")

print(f"🌐 Connecting to database: {DATABASE_URL}")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"TrustServerCertificate": "yes"},
)

def get_engine():
    return engine
