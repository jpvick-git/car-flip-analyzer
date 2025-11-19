from sqlalchemy import create_engine, text

DATABASE_URL = (
    "mssql+pyodbc:///?odbc_connect="
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=carflip-db.crqg0ema4vx8.us-east-2.rds.amazonaws.com,1433;"
    "Database=cars;"
    "Uid=admin;"  # <-- replace
    "Pwd=1K0xi*rfMR!r4VN7;"  # <-- replace
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
)

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    result = conn.execute(text("SELECT TOP 1 * FROM cars"))
    print(result.fetchone())
