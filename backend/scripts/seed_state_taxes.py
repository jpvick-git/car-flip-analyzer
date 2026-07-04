"""Run once on the Droplet to create and seed the tax_title_fees table in PostgreSQL."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import engine
from sqlalchemy import text

STATES = [
    ("AL", 150.00, 2.00, "Alabama avg county tax ~2%"),
    ("AK",  75.00, 0.00, "No state sales tax"),
    ("AZ", 400.00, 6.60, "Arizona state + avg county"),
    ("AR", 100.00, 6.50, "Arkansas"),
    ("CA", 325.00, 7.25, "California base rate"),
    ("CO", 400.00, 2.90, "Colorado state rate"),
    ("CT", 250.00, 6.35, "Connecticut"),
    ("DE",  35.00, 0.00, "No sales tax; doc fee applies"),
    ("FL", 225.00, 6.00, "Florida base rate"),
    ("GA", 175.00, 7.00, "Georgia TAVT ~7%"),
    ("HI",  45.00, 4.00, "Hawaii"),
    ("ID", 100.00, 6.00, "Idaho"),
    ("IL", 150.00, 6.25, "Illinois state rate"),
    ("IN", 150.00, 7.00, "Indiana"),
    ("IA", 130.00, 5.00, "Iowa"),
    ("KS", 175.00, 6.50, "Kansas avg"),
    ("KY", 200.00, 6.00, "Kentucky"),
    ("LA", 125.00, 4.45, "Louisiana state rate"),
    ("ME",  33.00, 5.50, "Maine"),
    ("MD", 300.00, 6.00, "Maryland"),
    ("MA", 150.00, 6.25, "Massachusetts"),
    ("MI", 175.00, 6.00, "Michigan"),
    ("MN", 325.00, 6.50, "Minnesota"),
    ("MS", 125.00, 5.00, "Mississippi"),
    ("MO", 100.00, 4.23, "Missouri avg"),
    ("MT",  35.00, 0.00, "No sales tax"),
    ("NE", 100.00, 5.50, "Nebraska avg"),
    ("NV", 150.00, 6.85, "Nevada avg"),
    ("NH",  25.00, 0.00, "No sales tax"),
    ("NJ", 200.00, 6.63, "New Jersey"),
    ("NM", 100.00, 4.00, "New Mexico avg"),
    ("NY", 175.00, 8.00, "New York avg with NYC"),
    ("NC", 100.00, 3.00, "North Carolina highway use tax 3%"),
    ("ND",  75.00, 5.00, "North Dakota"),
    ("OH", 100.00, 5.75, "Ohio"),
    ("OK", 175.00, 3.25, "Oklahoma excise tax ~3.25%"),
    ("OR",  77.00, 0.00, "No sales tax"),
    ("PA", 325.00, 6.00, "Pennsylvania"),
    ("RI", 150.00, 7.00, "Rhode Island"),
    ("SC", 250.00, 5.00, "South Carolina max $500 cap"),
    ("SD",  45.00, 4.00, "South Dakota"),
    ("TN", 100.00, 7.00, "Tennessee avg"),
    ("TX", 165.00, 6.25, "Texas"),
    ("UT", 150.00, 6.85, "Utah avg"),
    ("VT",  35.00, 6.00, "Vermont"),
    ("VA", 100.00, 4.15, "Virginia avg"),
    ("WA", 175.00, 6.50, "Washington avg"),
    ("WV",  35.00, 6.00, "West Virginia"),
    ("WI", 165.00, 5.00, "Wisconsin"),
    ("WY",  30.00, 4.00, "Wyoming"),
]

STATE_NAMES = {
    "AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California",
    "CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia",
    "HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa",
    "KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland",
    "MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri",
    "MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey",
    "NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio",
    "OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina",
    "SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont",
    "VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming",
}

with engine.begin() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS tax_title_fees (
            state_code CHAR(2) PRIMARY KEY,
            state_name VARCHAR(50),
            title_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
            avg_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
            notes TEXT,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """))
    print("Table ready.")

    for code, fee, tax, notes in STATES:
        conn.execute(text("""
            INSERT INTO tax_title_fees (state_code, state_name, title_fee, avg_tax_rate, notes)
            VALUES (:code, :name, :fee, :tax, :notes)
            ON CONFLICT (state_code) DO UPDATE
              SET state_name=EXCLUDED.state_name,
                  title_fee=EXCLUDED.title_fee,
                  avg_tax_rate=EXCLUDED.avg_tax_rate,
                  notes=EXCLUDED.notes
        """), {"code": code, "name": STATE_NAMES[code], "fee": fee, "tax": tax, "notes": notes})

    print(f"Seeded {len(STATES)} states.")
