import json
from openai import OpenAI
from sqlalchemy import create_engine, text

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
RDS_CONN = (
    "mssql+pyodbc://jpvick-git:Nk^+Cq4MfUNt%8q@carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433/cars"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=yes"
)
engine = create_engine(RDS_CONN, pool_pre_ping=True)
client = OpenAI()

# --------------------------------------------------
# PROMPT TO GPT
# --------------------------------------------------
prompt = """
Generate a full list of estimated average vehicle title fees and sales tax rates
for all 50 U.S. states. Return ONLY valid JSON in this exact format:

[
  {"state_code": "AL", "title_fee": 150.00, "avg_tax_rate": 2.50, "notes": "Alabama average title fee and vehicle tax rate"},
  {"state_code": "AK", "title_fee": 100.00, "avg_tax_rate": 0.00, "notes": "No state sales tax on vehicles"},
  ...
]

Guidelines:
- Include all 50 states, no DC or territories.
- Use realistic averages (rounded estimates) from DMV or government data.
- 'title_fee' = one-time registration/title fee.
- 'avg_tax_rate' = percentage of vehicle price (approx statewide average).
- Keep all numeric values as decimals (no strings, no $ signs).
"""

# --------------------------------------------------
# FUNCTIONS
# --------------------------------------------------
def create_table_if_missing():
    """Ensure the tax_title_fees table exists."""
    with engine.begin() as conn:
        conn.execute(text("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tax_title_fees' AND xtype='U')
            CREATE TABLE tax_title_fees (
                state_code CHAR(2) PRIMARY KEY,
                title_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
                avg_tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
                notes NVARCHAR(255),
                updated_at DATETIME DEFAULT GETDATE()
            );
        """))
    print("✅ Verified tax_title_fees table exists or created new.")


def generate_and_upload():
    """Fetch data from OpenAI and upload to RDS."""
    print("📡 Requesting tax/title fee data from OpenAI...")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.replace("```json", "").replace("```", "").strip()

    data = json.loads(content)
    print(f"✅ Retrieved {len(data)} state records from OpenAI")

    with engine.begin() as conn:
        conn.execute(text("DELETE FROM tax_title_fees"))  # clear old data
        for row in data:
            conn.execute(
                text("""
                    INSERT INTO tax_title_fees (state_code, title_fee, avg_tax_rate, notes)
                    VALUES (:state_code, :title_fee, :avg_tax_rate, :notes)
                """),
                row,
            )

    print(f"✅ Uploaded {len(data)} records to RDS tax_title_fees table.")


# --------------------------------------------------
# RUN SCRIPT
# --------------------------------------------------
if __name__ == "__main__":
    create_table_if_missing()
    generate_and_upload()
    print("🎯 Done! All 50 states uploaded successfully.")
