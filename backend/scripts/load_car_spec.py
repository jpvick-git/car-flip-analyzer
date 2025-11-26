import asyncio
import aiohttp
import asyncpg
import json
import re
import time
from aiolimiter import AsyncLimiter
import ssl

CARQUERY = "https://www.carqueryapi.com/api/0.3/"
RATE_LIMIT = AsyncLimiter(3, 1)  # Up to 3 requests per second


# ---------------------------------------------------------
# CLEAN HELPERS
# ---------------------------------------------------------
def extract_json(body):
    """Extract JSON even if wrapped in JS or HTML."""
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


def clean(s):
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------
# FAST ASYNC FETCH
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
                await asyncio.sleep(0.2)

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
        if len(self.rows) == 0:
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
# MAIN LOADER LOGIC
# ---------------------------------------------------------
async def load():
    # -----------------------------------------------
    # CREATE WINDOWS-FRIENDLY SSL CONTEXT
    # -----------------------------------------------
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE  # Required for Windows + DO

    # -----------------------------------------------
    # CONNECT TO DIGITALOCEAN POSTGRES
    # -----------------------------------------------
    pool = await asyncpg.create_pool(
        user="postgres",
        password="AVNS_KMNjNg_8wx4vECPoFfh",
        database="carflip",
        host="carflip-db-do-user-28471662-0.i.db.ondigitalocean.com",
        port=2500,
        ssl=ssl_ctx,
        min_size=2,
        max_size=10
    )

    buffer = BulkBuffer(pool)

    # -----------------------------------------------
    # ASYNC SESSION
    # -----------------------------------------------
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://www.carqueryapi.com/",
    }

    async with aiohttp.ClientSession(headers=headers) as session:

        # -----------------------------------------------
        # 1. FETCH MAKES
        # -----------------------------------------------
        makes_url = f"{CARQUERY}?cmd=getMakes&sold_in_us=1"
        print("Fetching makes…", makes_url)

        makes_json = await fetch_json(session, makes_url)
        makes = makes_json.get("Makes", [])

        print("Makes found:", len(makes))
        if not makes:
            print("❌ No makes returned. API likely blocked.")
            return

        # -----------------------------------------------
        # 2. PROCESS MAKES CONCURRENTLY
        # -----------------------------------------------
        async def process_make(mk):
            raw_make = mk.get("make_display") or mk.get("make_name")
            make_cleaned = clean(raw_make)

            models_url = f"{CARQUERY}?cmd=getModels&make={make_cleaned}&sold_in_us=1"
            models_json = await fetch_json(session, models_url)
            models = models_json.get("Models", [])

            tasks = []
            for md in models:
                tasks.append(process_model(make_cleaned, raw_make, md))

            await asyncio.gather(*tasks)

        # -----------------------------------------------
        # 3. PROCESS MODEL
        # -----------------------------------------------
        async def process_model(make_cleaned, raw_make, md):
            raw_model = md.get("model_name", "")
            model_cleaned = clean(raw_model)

            trims_url = (
                f"{CARQUERY}?cmd=getTrims&make={make_cleaned}&model={raw_model}"
            )
            trims_json = await fetch_json(session, trims_url)
            trims = trims_json.get("Trims", [])

            for t in trims:
                await buffer.add((
                    make_cleaned,
                    model_cleaned,
                    clean(t.get("model_trim")),
                    t.get("model_year"),
                    raw_make,
                    raw_model,
                    t.get("model_trim"),
                    t.get("model_body"),
                    t.get("model_engine_fuel"),
                    t.get("model_engine_cyl"),
                    t.get("model_transmission_type"),
                    t.get("model_drive"),
                    t.get("model_doors")
                ))

        # -----------------------------------------------
        # RUN ALL MAKES CONCURRENTLY
        # -----------------------------------------------
        await asyncio.gather(*(process_make(mk) for mk in makes))

        # final flush
        await buffer.flush()

    await pool.close()
    print("\n🎉 DONE — FAST LOAD COMPLETE!\n")


# ---------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------
if __name__ == "__main__":
    start = time.time()
    asyncio.run(load())
    print(f"⏱ Total time: {time.time() - start:.2f} seconds")
