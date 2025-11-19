# damage_similarity.py

import numpy as np
from sqlalchemy import create_engine, text
from openai import OpenAI
import struct

# ------------------------------------------
# DB
# ------------------------------------------
engine = create_engine(
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com:1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)

client = OpenAI()

# ------------------------------------------
# Bytes → numpy array
# ------------------------------------------
def from_bytes(b):
    return np.frombuffer(b, dtype=np.float32)

# ------------------------------------------
# Cosine similarity
# ------------------------------------------
def cosine_sim(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# ------------------------------------------
# Get embedding for new damage description
# ------------------------------------------
def embed_description(text):
    response = client.embeddings.create(
        model="text-embedding-3-large",
        input=text,
    )
    return np.array(response.data[0].embedding, dtype=np.float32)

# ------------------------------------------
# Retrieve top N similar cases
# ------------------------------------------
def get_similar_damage_cases(damage_text, top_n=5):
    query_embedding = embed_description(damage_text)

    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, lot_number, year, make, model,
                   damage_main, damage_severity, damage_notes,
                   repair_cost_range, embedding_vector
            FROM vehicle_damage_labels
        """)).fetchall()

    scored = []
    for row in result:
        stored_emb = from_bytes(row.embedding_vector)
        score = cosine_sim(query_embedding, stored_emb)

        scored.append((score, row))

    # Sort by highest similarity
    scored.sort(key=lambda x: x[0], reverse=True)

    return scored[:top_n]
