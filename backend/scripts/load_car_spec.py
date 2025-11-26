import asyncio
import aiohttp
import asyncpg
import json
import re
import time
from aiolimiter import AsyncLimiter
import ssl

# ---------------------------------------------------------
# CARQUERY SETUP
# ---------------------------------------------------------
CARQUERY = "https://www.carqueryapi.com/api/0.3/"
RATE_LIMIT = AsyncLimiter(3, 1)  # safe rate limiting for CarQuery API


# ---------------------------------------------------------
# UTILITY FUNCTIONS
# ---------------------------------------------------------
def extract_json(body):
    """Extract JSON even if wrapped in JS, JSONP, or HTML."""
    try:
        return json.loads(body)
    except:
        pass

    try:
        i = body.index("{")
        j = body.rindex("}") + 1
        return json.loads(body[i:j])
    except:
        return {}


def clean(value):
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


# ---------------------------------------------------------
# ASYNC FETCH
# ---------------------------------------------------------
async def fetch_json(session, url):
    attempts = [
        url,
        url + "&callback=?",
        url.replace("&callback=", ""),
        url.replace("?callback=", "?"),
    ]

    for attempt in attempts:
        async with RATE_LIMIT:
            try:
                async with session.get(attempt, timeout=15) as resp:
                    if resp.status == 200:
                        text = await resp.text()
                        data = extract_json(text)
                        if data:
                            return data
            except:
                await asyncio.sleep(0.3)

    return {}


# ---------------------------------------------------------
# BULK INSERT BUFFER
# ---------------------------------------------------------
class BulkBuffer:
    def __init__(self, pool, batch_size=5000):
        self.pool = pool
        self.batch_size = batch_size
        self.rows = []

    async def add(self, row):
        self.rows.append(row)
        if len(self.rows) >= self.batch_size:
            await self.flush()

    async def flush(self):
        if not self.rows:
            return

        insert_sql = """
            INSERT INTO car_specs(
                make, model, trim, model_year,
                raw_make, raw_model, raw_trim,
                body_style, engine_fuel, engine_cylinders,
                transmission, drive, doors
            )
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        """

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.executemany(insert_sql, self.rows)

        print(f"✨ Flushed {len(self.rows)} rows")
        self.rows = []


# ---------------------------------------------------------
# MAIN LOAD FUNCTION
# ---------------------------------------------------------
async def load():
    # -----------------------------------------------
    # SSL CONTEXT (REQUIRED BY DIGITALOCEAN)
    # -----------------------------------------------
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    # -----------------------------------------------
    # CONNECT TO DIGITALOCEAN POSTGRES (VPC PRIVATE HOST)
    # -----------------------------------------------
    print("Connecting to DigitalOcean Managed Postgres...")

    pool = await asyncpg.create_pool(
        user="carflip_user",
        password="AVNS_KMNjNg_8wx4vECPoFfh",
        database="carflip",
        host="private-carflip-db-do-user-28471662-0.i.db.ondigitalocean.com",
        port=25060,
        ssl=ssl_ctx,
        min_size=2,
        max_size=10
    )

    print("✅ Connected using VPC private network")

    buffer = BulkBuffer(pool)

    # -----------------------------------------------
    # HTTP CLIENT FOR CARQUERY
    # -----------------------------------------------
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
    }

    async with aiohttp.ClientSession(headers=headers) as session:

        # ----------------------
        # FETCH MAKES
        # ----------------------
        print("Fetching makes...")
        makes_json = await fetch_json(session, f"{CARQUERY}?cmd=getMakes&sold_in_us=1")
        makes = makes_json.get("Makes", [])

        print("Found makes:", len(makes))
        if not makes:
            print("❌ No makes returned — API blocked or down")
            return

        # ---------------------------------------------------
        # PROCESS EACH MAKE (CONCURRENTLY)
        # ---------------------------------------------------
        async def process_make(mk):
            raw_make = mk.get("make_display") or mk.get("make_name")
            make_cleaned = clean(raw_make)

            models_json = await fetch_json(
                session, f"{CARQUERY}?cmd=getModels&make={make_cleaned}&sold_in_us=1"
            )
            models = models_json.get("Models", [])

            tasks = []
            for md in models:
                tasks.append(process_model(make_cleaned, raw_make, md))

            await asyncio.gather(*tasks)

        # ------------------------------------------------
