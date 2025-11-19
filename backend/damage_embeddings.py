# damage_embeddings.py

import json
import numpy as np
from sqlalchemy import create_engine, text
from openai import OpenAI

# ------------------------------------------
# DB CONNECTION (use your existing RDS)
# ------------------------------------------
engine = create_engine(
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com:1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)

client = OpenAI()

# ------------------------------------------
# Convert numpy array → bytes for SQL
# ------------------------------------------
def to_bytes(array):
    return array.astype(np.float32).tobytes()

# ------------------------------------------
# EMBEDDING GENERATOR
# ------------------------------------------
def generate_damage_embedding(damage_text: str):
    response = client.embeddings.create(
        model="text-embedding-3-large",
        input=damage_text,
    )
    return np.array(response.data[0].embedding, dtype=np.float32)


# ------------------------------------------
# SAVE LABELED DAMAGE EXAMPLE
# ------------------------------------------
def save_damage_label(
    lot_number,
    year,
    make,
    model,
    damage_main,
    damage_severity,
    damage_notes,
    repair_cost_range,
):
    # Combine everything into one text sample
    damage_text = f"""
    Lot: {lot_number}
    {year} {make} {model}
    Damage: {damage_main} ({damage_severity})
    Notes: {damage_notes}
    Repair Range: {repair_cost_range}
    """

    embedding = generate_damage_embedding(damage_text)

    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO vehicle_damage_labels
                    (lot_number, year, make, model,
                     damage_main, damage_severity, damage_notes,
                     repair_cost_range, embedding_vector)
                VALUES
                    (:lot, :year, :make, :model,
                     :dmain, :severity, :notes,
                     :repair, :embed)
            """),
            {
                "lot": lot_number,
                "year": year,
                "make": make,
                "model": model,
                "dmain": damage_main,
                "severity": damage_severity,
                "notes": damage_notes,
                "repair": repair_cost_range,
                "embed": to_bytes(embedding),
            },
        )

    print(f"✔ Saved label for lot {lot_number}")
