import os
import time
import re
import json
import base64
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from openai import OpenAI

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
if not os.path.exists(ENV_PATH):
    raise Exception(f".env file NOT FOUND at: {ENV_PATH}")

load_dotenv(ENV_PATH)

DOWNLOAD_DIR = os.getenv("DOWNLOAD_DIR", os.path.join(BASE_DIR, "downloads"))

MAX_WORKERS = 3
SLEEP_BETWEEN_LOTS = 2.0
MAX_IMAGES = int(os.getenv("AI_MAX_IMAGES", "12"))
IMAGE_DETAIL = os.getenv("AI_IMAGE_DETAIL", "high")
REPAIR_MODEL = os.getenv("AI_REPAIR_MODEL", "gpt-4o")
RESALE_MODEL = os.getenv("AI_RESALE_MODEL", "gpt-4.1-mini")

openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    raise Exception("OPENAI_API_KEY missing in backend/.env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in backend/.env")

rds_engine = create_engine(DATABASE_URL, pool_pre_ping=True)
client = OpenAI(api_key=openai_key)

# Static prefix first — eligible for OpenAI prompt caching on repeated batch runs.
REPAIR_SYSTEM_PROMPT = (
    "You are an experienced automotive appraiser and body shop estimator. "
    "You inspect vehicle photos and report only damage you can see. "
    "You never assume or invent damage that is not visible in the photos. "
    "When damage IS visible, you price repairs at realistic US body-shop out-the-door rates "
    "(parts + labor + paint + related hardware) — not DIY, not parts-only, not auction flip shortcuts."
)

REPAIR_RULES = """
Rules:
1. Default every body region (front, rear, left, right, roof, undercarriage) to UNDAMAGED unless photos show clear evidence.
2. Every damaged region must include photo evidence (e.g., "Photo 2: crease in hood").
3. Auction damage notes and title type are context only — not proof of visible damage.
4. If photos show a clean vehicle, report minimal or zero repair cost.
5. Do not invent crumpled panels, broken lights, deployed airbags, or missing parts unless clearly visible.
6. List parts_to_replace only for visibly damaged or missing components.
7. "Conservative" means do not invent damage — NOT cheap estimates. When damage is visible, err slightly HIGH on cost rather than low.
8. Each repair_items cost is ALL-IN (part + labor + paint/blend + clips/hardware). Never quote parts-only prices.

Pricing guidance (typical US body shop, per line item, all-in):
- Bumper cover replace + paint: economy car $900–1,400; sport/luxury (WRX, BMW, etc.) $1,200–2,000+.
- Missing bumper exposing reinforcement/foam/brackets: add separate line items for reinforcement bar, energy absorber, mounting brackets, and sensors if visible — typically $300–900+ combined before paint.
- Fender/quarter panel replace + paint: $800–1,800+ per panel depending on vehicle.
- Headlight/taillight assembly: $250–700+ installed.
- Hood/trunk replace + paint: $900–2,500+.
- Paint-only blend on one panel: $400–800+.
- Frame/unibody kinks or gap issues visible in photos: flag as structural concern and add $500–3,000+ if repair (not replace) is plausible from photos alone.

When a bumper is missing, torn off, or hanging: do NOT price only a cover. Include visible behind-bumper components and full refinish.

Return JSON with this exact structure:
{
  "regions": {
    "front": {"damaged": false, "evidence": ""},
    "rear": {"damaged": false, "evidence": ""},
    "left": {"damaged": false, "evidence": ""},
    "right": {"damaged": false, "evidence": ""},
    "roof": {"damaged": false, "evidence": ""},
    "undercarriage": {"damaged": false, "evidence": ""}
  },
  "parts_to_replace": [],
  "parts_to_repair": [],
  "labor_hours": 0,
  "interior_notes": "",
  "repair_items": [
    {"description": "Rear bumper cover, reinforcement, absorber, brackets — replace + paint (Photo 8)", "cost": 1850},
    {"description": "Front bumper cover — replace + paint (Photo 1)", "cost": 1350}
  ],
  "repair_estimate": 3200,
  "repair_details": "2-4 sentence summary citing photo evidence"
}

Rules for repair_items:
9. List each distinct visible repair as its own line item with description (include photo reference when possible) and all-in cost in USD.
10. repair_estimate MUST equal the sum of all repair_items costs.
11. If no visible damage, use repair_items: [] and repair_estimate: 0.
12. Multiple damaged regions (e.g. front AND rear) must each have their own line items — never combine into one low bumper-only total.
"""

RESALE_SYSTEM_PROMPT = (
    "You are an experienced used-car market analyst specializing in wholesale and auction resale values. "
    "You produce conservative wholesale resale estimates based on vehicle specs, title status, mileage, "
    "and any known repair summary — not photo inspection."
)

RESALE_RULES = """
Rules:
1. Use wholesale/auction pricing, not retail listing prices.
2. Apply title discounts: branded/salvage titles typically 30–50% below clean-title wholesale.
3. Mileage may vary ±10,000 miles internally; always cite the odometer value provided.
4. Factor repair cost and severity when a repair summary is provided.
5. Be conservative — understate rather than overstate value.

Return JSON with this exact structure:
{
  "resale_estimate": 0,
  "resale_details": "2-4 sentence wholesale value rationale"
}
"""

KNOWN_ISSUES_SYSTEM_PROMPT = (
    "You are an experienced independent mechanic and long-term ownership researcher. "
    "You report ONLY widely-documented, well-known reliability issues, common wear items, "
    "and maintenance patterns for a specific year/make/model/engine combination — the kind "
    "of things that show up repeatedly in owner forums, CarComplaints.com, NHTSA complaints, "
    "or manufacturer TSBs. You are not analyzing this specific vehicle's condition or photos — "
    "you have no visibility into whether THIS car has these issues, only what is typical for "
    "this generation of vehicle. You clearly separate 'known to happen on this platform' from "
    "'definitely wrong with this car.'"
)

KNOWN_ISSUES_RULES = """
Rules:
1. Only include issues you have reasonably high confidence are real, well-documented patterns for
   this specific year/make/model/engine/trim — not generic wear-and-tear that applies to all cars.
2. If you are not confident about a specific claim (exact TSB number, exact failure mileage, exact
   cost), say so in plain language rather than inventing false precision. It is fine to give a range
   or say "commonly reported in the X-X mile range" rather than a single invented number.
3. Split findings into two categories:
   - "known_issues": documented reliability problems / failure patterns for this platform
     (e.g. "ringland failure on high-mileage/modified FA20DIT engines", "air suspension compressor
     failure", "CVT overheating/failure").
   - "wear_items": normal maintenance/wear items that are due or coming due around this mileage
     for this platform (e.g. clutch, struts/shocks, timing belt/chain interval, spark plugs, battery).
4. For each item include: typical mileage or age range it tends to appear, a rough cost range if
   repaired at a competent independent shop (not dealer, not DIY), and a one-line description of
   why it matters for a buyer.
5. Do NOT include collision-related repairs — that is handled elsewhere. This is about pre-existing
   platform-level risk, independent of any accident damage.
6. Do NOT factor these into any repair or resale dollar total. This is buyer-diligence information only.
7. If this platform has an unusually strong or unusually poor reliability reputation overall, say so
   in "reliability_summary" in one or two sentences.
8. If you have low confidence about this specific year/model/engine combination (e.g. unfamiliar
   trim, very new model, or region-specific variant), say so explicitly rather than guessing.

Return JSON with this exact structure:
{
  "reliability_summary": "1-2 sentence overall reputation for this platform",
  "known_issues": [
    {"issue": "Ringland/piston failure on modified or high-boost FA20DIT engines", "typical_mileage": "any mileage if tuned; 80k+ if stock", "cost_range": "$3,000-6,000 (engine rebuild/replace)", "confidence": "high"}
  ],
  "wear_items": [
    {"item": "Clutch (manual)", "typical_mileage": "60k-90k depending on driving style", "cost_range": "$800-1,400 installed", "confidence": "high"}
  ]
}
"""

# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def extract_lot_number(value: str) -> str:
    """Extract numeric lot number from messy spreadsheet text."""
    match = re.search(r"\d{5,}", value)
    return match.group(0) if match else value.strip()


# Copart zip files use {lot}_Image_N.jpg — typical gallery order below.
# Manual uploads use the same Image_1..6 sequence (front, driver, passenger, rear, interior, dash).
COPART_INDEX_TO_ANGLE = {
    1: "front",
    2: "rear",
    3: "left",
    4: "right",
    5: "interior",
    6: "dashboard",
}

ANGLE_KEYWORDS = {
    "front": ("front", "fwd", "forward"),
    "rear": ("rear", "back", "tail"),
    "left": ("driver", "left", "ds", "lh"),
    "right": ("passenger", "right", "ps", "rh"),
    "interior": ("interior", "inside", "cabin", "seat"),
    "dashboard": ("dash", "dashboard", "odometer", "odo", "instrument"),
    "detail": ("detail", "damage", "close", "zoom", "engine", "undercarriage", "under"),
}

ANGLE_PRIORITY = ["front", "rear", "left", "right", "interior", "dashboard", "detail"]


def _parse_image_index(filename: str) -> int | None:
    name = filename.lower()
    for pattern in (
        r"image[_\-]?(\d+)",
        r"img[_\-]?(\d+)",
        r"[_\-](\d+)\.(?:jpe?g|png)$",
        r"^(\d+)\.(?:jpe?g|png)$",
    ):
        match = re.search(pattern, name)
        if match:
            return int(match.group(1))
    return None


def _detect_angle_from_filename(filename: str) -> str | None:
    name = filename.lower()
    for angle, keywords in ANGLE_KEYWORDS.items():
        if any(keyword in name for keyword in keywords):
            return angle
    return None


def _classify_image(filename: str) -> tuple[str, int]:
    """Return (angle_bucket, sort_index) for an image filename."""
    angle = _detect_angle_from_filename(filename)
    index = _parse_image_index(filename)

    if angle:
        return angle, index if index is not None else 9999
    if index is not None:
        if index in COPART_INDEX_TO_ANGLE:
            return COPART_INDEX_TO_ANGLE[index], index
        if index >= 7:
            return "detail", index
    return "extra", index if index is not None else 9999


def select_images_by_angle(lot_dir: str, max_images: int | None = None) -> tuple[list[dict], dict]:
    """
    Pick diverse inspection photos instead of the first N alphabetically.
    Returns ([{"path", "label", "filename"}, ...], debug_info).
    """
    limit = max_images if max_images is not None else MAX_IMAGES
    lot_dir = str(lot_dir)

    files = [
        f for f in os.listdir(lot_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]
    if not files:
        return [], {"total_available": 0, "selected": []}

    buckets: dict[str, list[tuple[int, str, str]]] = {angle: [] for angle in ANGLE_PRIORITY}
    buckets["extra"] = []

    for filename in files:
        angle, sort_index = _classify_image(filename)
        target = angle if angle in buckets else "extra"
        buckets[target].append((sort_index, filename, os.path.join(lot_dir, filename)))

    selected: list[dict] = []
    selected_debug: list[str] = []
    used_paths: set[str] = set()

    for angle in ANGLE_PRIORITY:
        if len(selected) >= limit:
            break
        for _, filename, path in sorted(buckets[angle], key=lambda item: item[0]):
            if path in used_paths:
                continue
            selected.append({"path": path, "label": angle, "filename": filename})
            selected_debug.append(f"{angle}: {filename}")
            used_paths.add(path)
            break

    if len(selected) < limit:
        extras = sorted(
            [
                (sort_index, filename, path)
                for angle in ANGLE_PRIORITY + ["extra"]
                for sort_index, filename, path in buckets.get(angle, [])
                if path not in used_paths
            ],
            key=lambda item: item[0],
        )
        for sort_index, filename, path in extras:
            if len(selected) >= limit:
                break
            if path in used_paths:
                continue
            angle, _ = _classify_image(filename)
            label = angle if angle != "extra" else f"extra_{sort_index}"
            selected.append({"path": path, "label": label, "filename": filename})
            selected_debug.append(f"{label}: {filename}")
            used_paths.add(path)

    return selected, {
        "total_available": len(files),
        "selected": selected_debug,
    }


def _photo_manifest(image_entries: list[dict]) -> str:
    if not image_entries:
        return ""
    lines = [
        f"Photo {idx}: {entry['label']} ({entry['filename']})"
        for idx, entry in enumerate(image_entries, start=1)
    ]
    return "Attached photos (use these labels when citing evidence):\n" + "\n".join(lines)


def _normalize_title_code(raw_title) -> str:
    title_code = str(raw_title).strip().title() if raw_title else "Unknown"
    lowered = title_code.lower()
    if any(term in lowered for term in ["salvage", "rebuilt", "junk", "flood", "lemon"]):
        return "Branded"
    if "clean" in lowered:
        return "Clean"
    if "unknown" in lowered or not title_code.strip():
        return "Unknown"
    return title_code


def _vehicle_context(vehicle) -> str:
    year = vehicle.get("year") or "Unknown"
    make = vehicle.get("make") or "Unknown"
    model = vehicle.get("model") or "Unknown"
    damage = vehicle.get("damage_description") or "None reported"
    odometer_display = vehicle.get("odometer", "Unknown")
    title_code = _normalize_title_code(vehicle.get("title_code", "Unknown"))

    return (
        "Vehicle context (identification and auction metadata — do not treat as proof of visible damage):\n"
        f"- Year: {year}\n"
        f"- Make: {make}\n"
        f"- Model: {model}\n"
        f"- Reported damage notes: {damage}\n"
        f"- Odometer: {odometer_display}\n"
        f"- Title type: {title_code}"
    )


def _extract_usage(label: str, response) -> dict:
    usage = getattr(response, "usage", None)
    if not usage:
        return {"label": label, "prompt": 0, "completion": 0, "cached": 0, "total": 0}

    cached_details = getattr(usage, "prompt_tokens_details", None)
    cached = getattr(cached_details, "cached_tokens", 0) if cached_details else 0
    return {
        "label": label,
        "prompt": usage.prompt_tokens or 0,
        "completion": usage.completion_tokens or 0,
        "cached": cached or 0,
        "total": usage.total_tokens or 0,
    }


def _log_token_usage(label: str, response) -> dict:
    stats = _extract_usage(label, response)
    print(
        f" [{stats['label']}] tokens: prompt={stats['prompt']}, "
        f"completion={stats['completion']}, cached={stats['cached']}, total={stats['total']}"
    )
    return stats


def _parse_json_response(raw: str, lot_number: str, fallback: dict) -> dict:
    clean = re.sub(r'(?<=\d),(?=\d)', '', raw.strip())
    clean = clean.replace("$", "").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        print(f" Invalid JSON for lot {lot_number}: {e}\nRaw:\n{raw[:500]}")
        return fallback


def _attach_images(messages, image_entries, lot_number: str) -> None:
    valid_entries = [
        entry for entry in image_entries[:MAX_IMAGES]
        if entry.get("path") and os.path.isfile(entry["path"])
    ]
    print(
        f" Attaching {len(valid_entries)} angle-selected images for lot {lot_number}: "
        + ", ".join(entry["label"] for entry in valid_entries)
    )
    for entry in valid_entries:
        img_path = entry["path"]
        try:
            with open(img_path, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode("utf-8")
            messages[1]["content"].append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{img_b64}",
                    "detail": IMAGE_DETAIL,
                },
            })
        except Exception as e:
            print(f" Failed to attach {img_path}: {e}")


def _normalize_repair_items(parsed: dict) -> list[dict]:
    items = parsed.get("repair_items") or []
    normalized = []

    for item in items:
        if not isinstance(item, dict):
            continue
        description = str(item.get("description") or "").strip()
        if not description:
            continue
        try:
            cost = int(float(item.get("cost") or 0))
        except (TypeError, ValueError):
            cost = 0
        normalized.append({"description": description, "cost": max(cost, 0)})

    if normalized:
        return normalized

    try:
        total = int(float(parsed.get("repair_estimate") or 0))
    except (TypeError, ValueError):
        total = 0

    parts = []
    for part in (parsed.get("parts_to_replace") or []) + (parsed.get("parts_to_repair") or []):
        part = str(part).strip()
        if part:
            parts.append(part)

    if parts:
        if total > 0:
            share = max(1, total // len(parts))
            remainder = total - share * (len(parts) - 1)
            return [
                {"description": part, "cost": remainder if idx == len(parts) - 1 else share}
                for idx, part in enumerate(parts)
            ]
        return [{"description": part, "cost": 0} for part in parts]

    details = (parsed.get("repair_details") or "").strip()
    if details:
        return [{"description": details, "cost": max(total, 0)}]
    return []


def _finalize_repair_fields(parsed: dict) -> dict:
    items = _normalize_repair_items(parsed)
    total = sum(item["cost"] for item in items)
    return {
        "repair_estimate": total,
        "repair_details": parsed.get("repair_details") or "No repair details available.",
        "repair_breakdown": json.dumps(items),
    }


def _empty_repair_result(reason: str) -> dict:
    return {
        "repair_estimate": 0,
        "repair_details": reason,
        "repair_breakdown": "[]",
    }


def _empty_resale_result(reason: str) -> dict:
    return {
        "resale_estimate": None,
        "resale_details": reason,
    }


# --------------------------------------------------
# CORE ANALYSIS FUNCTIONS
# --------------------------------------------------

def analyze_vehicle_repair(vehicle: dict) -> dict:
    """Vision-based repair assessment. Requires local image paths."""
    lot_number = vehicle.get("lot_number", "unknown")
    image_entries = vehicle.get("image_entries") or []
    if not image_entries and vehicle.get("images"):
        image_entries = [{"path": p, "label": "unknown", "filename": os.path.basename(p)} for p in vehicle["images"]]

    manifest = _photo_manifest(image_entries)
    user_prompt = f"{REPAIR_RULES.strip()}\n\n{_vehicle_context(vehicle)}"
    if manifest:
        user_prompt += f"\n\n{manifest}"

    messages = [
        {"role": "system", "content": REPAIR_SYSTEM_PROMPT},
        {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
    ]
    _attach_images(messages, image_entries, lot_number)

    if len(messages[1]["content"]) == 1:
        return _empty_repair_result("No usable photos attached for repair analysis.")

    response = client.chat.completions.create(
        model=REPAIR_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    usage = _log_token_usage("repair", response)

    raw = response.choices[0].message.content.strip()
    parsed = _parse_json_response(
        raw,
        lot_number,
        {"repair_estimate": None, "repair_details": raw[:800]},
    )
    repair_fields = _finalize_repair_fields(parsed)
    return {
        **repair_fields,
        "_repair_structured": parsed,
        "_usage": [usage],
    }


def analyze_vehicle_resale(vehicle: dict, repair_result: dict | None = None) -> dict:
    """Text-only wholesale resale estimate — no images."""
    lot_number = vehicle.get("lot_number", "unknown")
    odometer_display = vehicle.get("odometer", "Unknown")
    title_code = _normalize_title_code(vehicle.get("title_code", "Unknown"))

    repair_summary = ""
    if repair_result:
        estimate = repair_result.get("repair_estimate")
        details = repair_result.get("repair_details") or ""
        if estimate is not None or details:
            repair_summary = (
                "\nKnown repair assessment:\n"
                f"- Repair estimate: {estimate if estimate is not None else 'Unknown'}\n"
                f"- Summary: {details}"
            )

    user_prompt = (
        f"{RESALE_RULES.strip()}\n\n"
        f"{_vehicle_context(vehicle)}\n"
        f"{repair_summary}\n\n"
        f"Odometer for resale math: {odometer_display} miles (±10k internal range).\n"
        f"Title type for resale math: {title_code}."
    )

    response = client.chat.completions.create(
        model=RESALE_MODEL,
        messages=[
            {"role": "system", "content": RESALE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    usage = _log_token_usage("resale", response)

    raw = response.choices[0].message.content.strip()
    parsed = _parse_json_response(
        raw,
        lot_number,
        {"resale_estimate": None, "resale_details": raw[:800]},
    )
    return {
        "resale_estimate": parsed.get("resale_estimate"),
        "resale_details": parsed.get("resale_details") or "No resale details available.",
        "_usage": [usage],
    }


def analyze_vehicle_known_issues(vehicle: dict) -> dict:
    """
    Text-only, platform-level reliability lookup — no images, no odometer/title math.
    Purely 'what does this year/make/model/engine tend to need or fail at' — informational
    only, never rolled into repair_estimate or resale_estimate.
    """
    lot_number = vehicle.get("lot_number", "unknown")
    year = vehicle.get("year") or "Unknown"
    make = vehicle.get("make") or "Unknown"
    model = vehicle.get("model") or "Unknown"
    odometer_display = vehicle.get("odometer", "Unknown")

    user_prompt = (
        f"{KNOWN_ISSUES_RULES.strip()}\n\n"
        f"Vehicle: {year} {make} {model}\n"
        f"Current odometer: {odometer_display} miles "
        f"(use this to judge which wear items are already due vs. still ahead)."
    )

    response = client.chat.completions.create(
        model=RESALE_MODEL,  # cheap text-only model; no vision needed for this call
        messages=[
            {"role": "system", "content": KNOWN_ISSUES_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    usage = _log_token_usage("known_issues", response)

    raw = response.choices[0].message.content.strip()
    fallback = {
        "reliability_summary": "Unable to generate reliability summary.",
        "known_issues": [],
        "wear_items": [],
    }
    parsed = _parse_json_response(raw, lot_number, fallback)

    return {
        "reliability_summary": parsed.get("reliability_summary") or fallback["reliability_summary"],
        "known_issues": parsed.get("known_issues") or [],
        "wear_items": parsed.get("wear_items") or [],
        "_usage": [usage],
    }


def analyze_vehicle(vehicle, mode: str = "full") -> dict:
    """
    Analyze a vehicle with AI.

    mode:
      - "full": repair (if photos) + resale + known_issues
      - "repair": vision repair only
      - "resale": text resale only
      - "known_issues": text platform-reliability lookup only (no photos, no odometer/title math)
    """
    mode = vehicle.get("mode", mode)
    result = {}
    usages = []

    image_paths = [p for p in (vehicle.get("images") or []) if p and os.path.isfile(p)]
    has_images = bool(image_paths)

    if mode in ("full", "repair"):
        if has_images:
            repair_result = analyze_vehicle_repair(vehicle)
            usages.extend(repair_result.pop("_usage", []))
            result.update(repair_result)
        else:
            result.update(_empty_repair_result("No photos provided for repair analysis."))

    if mode in ("full", "resale"):
        repair_context = None
        if mode == "full" and has_images:
            repair_context = result
        elif vehicle.get("repair_context"):
            repair_context = vehicle["repair_context"]
        resale_result = analyze_vehicle_resale(vehicle, repair_context)
        usages.extend(resale_result.pop("_usage", []))
        result.update(resale_result)

    if mode in ("full", "known_issues"):
        known_issues_result = analyze_vehicle_known_issues(vehicle)
        usages.extend(known_issues_result.pop("_usage", []))
        result.update(known_issues_result)

    if usages:
        result["_usage"] = usages

    if not vehicle.get("keep_structured"):
        result.pop("_repair_structured", None)

    return result


# --------------------------------------------------
# LOT PROCESSING FUNCTION
# --------------------------------------------------

def _load_vehicle_for_lot(lot, rds_engine):
    """Load vehicle metadata and local image paths for a lot."""
    lot = str(lot).strip()
    with rds_engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT year, make, model, damage_description, odometer, title_code, repair_estimate
                FROM user_vehicles
                WHERE lot_number = :lot
                LIMIT 1
            """),
            {"lot": lot},
        ).fetchone()

    if not row:
        return None, f"No user_vehicles record found for lot {lot}"

    year, make, model, damage, odometer, title_code, existing_repair = row

    lot_dir = os.path.join(DOWNLOAD_DIR, lot)
    if not os.path.isdir(lot_dir):
        return None, f"No download folder for lot {lot}: {lot_dir}"

    image_entries, image_selection = select_images_by_angle(lot_dir, MAX_IMAGES)
    if not image_entries:
        return None, f"No images found for lot {lot} in {lot_dir}"

    vehicle = {
        "lot_number": lot,
        "year": year,
        "make": make,
        "model": model,
        "damage_description": damage,
        "images": [entry["path"] for entry in image_entries],
        "image_entries": image_entries,
        "odometer": odometer or "Unknown",
        "title_code": title_code if title_code else "Unknown",
        "keep_structured": True,
    }
    meta = {
        "year": year,
        "make": make,
        "model": model,
        "damage": damage,
        "existing_repair": existing_repair,
        "image_count": len(image_entries),
        "images_available": image_selection["total_available"],
        "image_selection": image_selection["selected"],
        "download_dir": lot_dir,
    }
    return vehicle, meta


def _print_dry_run_result(lot, meta, ai_result):
    usages = ai_result.pop("_usage", [])
    structured = ai_result.pop("_repair_structured", None)

    print("\n" + "=" * 72)
    print(f"DRY RUN — lot {lot}")
    print(f"Vehicle: {meta['year']} {meta['make']} {meta['model']}")
    print(f"Reported damage: {meta['damage']}")
    print(
        f"Images: {meta['image_count']} selected of {meta.get('images_available', meta['image_count'])} "
        f"available (max {MAX_IMAGES}, detail={IMAGE_DETAIL})"
    )
    if meta.get("image_selection"):
        print("Selected angles:")
        for line in meta["image_selection"]:
            print(f"  {line}")
    print(f"Models: repair={REPAIR_MODEL}, resale={RESALE_MODEL}")
    print(f"Download dir: {meta['download_dir']}")
    print("-" * 72)
    print(f"Repair estimate:  {ai_result.get('repair_estimate')}")
    print(f"Repair details:   {ai_result.get('repair_details')}")
    print(f"Resale estimate:  {ai_result.get('resale_estimate')}")
    print(f"Resale details:   {ai_result.get('resale_details')}")
    print(f"Reliability:      {ai_result.get('reliability_summary')}")
    known = ai_result.get("known_issues") or []
    wear = ai_result.get("wear_items") or []
    if known or wear:
        print(f"Known issues:     {len(known)}  |  Wear items: {len(wear)}")

    if structured and structured.get("regions"):
        print("-" * 72)
        print("Region flags:")
        for region, info in structured["regions"].items():
            damaged = info.get("damaged", False)
            evidence = info.get("evidence") or ""
            print(f"  {region}: damaged={damaged}  evidence={evidence or '(none)'}")

    if usages:
        print("-" * 72)
        prompt_total = completion_total = cached_total = grand_total = 0
        for stat in usages:
            print(
                f"  {stat['label']:>6}: prompt={stat['prompt']:,}, "
                f"completion={stat['completion']:,}, cached={stat['cached']:,}, "
                f"total={stat['total']:,}"
            )
            prompt_total += stat["prompt"]
            completion_total += stat["completion"]
            cached_total += stat["cached"]
            grand_total += stat["total"]
        print(
            f"  {'TOTAL':>6}: prompt={prompt_total:,}, completion={completion_total:,}, "
            f"cached={cached_total:,}, total={grand_total:,}"
        )
    print("=" * 72 + "\n")


def dry_run_lot(lot, rds_engine):
    """Run AI for one lot without writing to the database."""
    vehicle, meta_or_error = _load_vehicle_for_lot(lot, rds_engine)
    if not vehicle:
        print(meta_or_error)
        return False

    print(
        f"Dry run lot {lot}: {meta_or_error['year']} {meta_or_error['make']} "
        f"{meta_or_error['model']} ({meta_or_error['damage']})"
    )
    ai_result = analyze_vehicle(vehicle, mode="full")
    _print_dry_run_result(lot, meta_or_error, ai_result)
    return True


def process_lot(lot, rds_engine, dry_run=False, force=False):
    """Handles one vehicle lot end-to-end (read → analyze → update DB)."""
    if dry_run:
        return dry_run_lot(lot, rds_engine)

    try:
        vehicle, meta_or_error = _load_vehicle_for_lot(lot, rds_engine)
        if not vehicle:
            print(meta_or_error)
            return False

        if meta_or_error["existing_repair"] and not force:
            print(f"Skipping lot {lot} (already analyzed)")
            return True

        if force and meta_or_error["existing_repair"]:
            print(f"Re-analyzing lot {lot} (--force)")

        print(
            f"Lot {lot}: {meta_or_error['year']} {meta_or_error['make']} "
            f"{meta_or_error['model']} ({meta_or_error['damage']})"
        )

        vehicle.pop("keep_structured", None)
        ai_result = analyze_vehicle(vehicle, mode="full")
        ai_result.pop("_usage", None)

        with rds_engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE user_vehicles
                    SET repair_estimate = :repair_estimate,
                        repair_details = :repair_details,
                        repair_breakdown = :repair_breakdown,
                        resale_estimate = :resale_estimate,
                        resale_details = :resale_details,
                        reliability_summary = :reliability_summary,
                        known_issues = :known_issues,
                        wear_items = :wear_items,
                        updated_at = NOW()
                    WHERE lot_number = :lot;
                """),
                {
                    "lot": lot,
                    "repair_estimate": ai_result.get("repair_estimate"),
                    "repair_details": ai_result.get("repair_details"),
                    "repair_breakdown": ai_result.get("repair_breakdown", "[]"),
                    "resale_estimate": ai_result.get("resale_estimate"),
                    "resale_details": ai_result.get("resale_details"),
                    "reliability_summary": ai_result.get("reliability_summary"),
                    "known_issues": json.dumps(ai_result.get("known_issues") or []),
                    "wear_items": json.dumps(ai_result.get("wear_items") or []),
                },
            )

        if result.rowcount == 0:
            print(f"No rows updated for lot {lot}")
            return False

        print(f"Updated lot {lot}")
        return True

    except Exception as e:
        print(f"Error processing lot {lot}: {e}")
        return False


# --------------------------------------------------
# MAIN BATCH EXECUTION
# --------------------------------------------------

def main(user_id: int, force: bool = False):
    uploads_dir = os.path.join(os.path.dirname(BASE_DIR), "user_uploads")

    if not os.path.exists(uploads_dir):
        print("No user_uploads directory found.")
        return

    csv_files = [
        os.path.join(uploads_dir, f)
        for f in os.listdir(uploads_dir)
        if f.endswith(".csv")
    ]

    if not csv_files:
        print("No CSV files found in user_uploads.")
        return

    email_slug = None
    with rds_engine.connect() as conn:
        row = conn.execute(
            text("SELECT email FROM users WHERE id = :id"), {"id": user_id}
        ).fetchone()
        if row:
            email_slug = row[0].replace("@", "_").replace(".", "_")

    matching_csvs = (
        [f for f in csv_files if email_slug and email_slug in f]
        if email_slug
        else csv_files
    )

    if not matching_csvs:
        print(f"No CSV found matching user {user_id} ({email_slug}).")
        return

    csv_path = max(matching_csvs, key=os.path.getmtime)
    print(f"Using spreadsheet: {os.path.basename(csv_path)}")

    df = pd.read_csv(csv_path)

    preferred_cols = ["Lot/Inv #", "lot_number", "Lot # Number"]
    lot_col = next((c for c in df.columns if c.strip() in preferred_cols), None)

    if not lot_col:
        lot_col = next((c for c in df.columns if "lot" in c.lower()), None)

    lot_numbers = [extract_lot_number(x) for x in df[lot_col].dropna().astype(str).unique()]
    print(f"Found {len(lot_numbers)} lots in spreadsheet.")

    done = failed = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for lot in lot_numbers:
            print(f"Queuing lot {lot} for AI analysis...")
            futures.append(executor.submit(process_lot, lot, rds_engine, False, force))
            time.sleep(SLEEP_BETWEEN_LOTS)

        for future in as_completed(futures):
            try:
                if future.result(timeout=600):
                    done += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"Thread exception: {e}")
                failed += 1

    elapsed = time.time() - start_time
    print(f"\nSummary: {done} done | {failed} failed | Elapsed {elapsed/60:.1f} min.")
    print(f"Completed AI analysis for user {user_id}.")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("user_id", type=int, nargs="?", default=0, help="User ID (not used with --dry-run)")
    parser.add_argument("--lots", type=str, help="Comma-separated lot numbers", default=None)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run AI and log token usage without writing to the database",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run AI even if repair_estimate is already set",
    )
    args = parser.parse_args()

    USER_ID = args.user_id
    LOTS = [lot.strip() for lot in args.lots.split(",") if lot.strip()] if args.lots else []

    if args.dry_run:
        if not LOTS:
            print("--dry-run requires --lots (comma-separated lot numbers)")
            raise SystemExit(1)

        print(f"DRY RUN — no database writes")
        print(f"Download dir: {DOWNLOAD_DIR}")
        print(f"AI config: MAX_IMAGES={MAX_IMAGES}, detail={IMAGE_DETAIL}, angle_selection=on")
        env_cap = os.getenv("AI_MAX_IMAGES")
        print(f"  AI_MAX_IMAGES env: {env_cap if env_cap else 'not set (default 8)'}")
        print(f"Lots: {', '.join(LOTS)}")

        done = failed = 0
        start_time = time.time()
        for lot in LOTS:
            if dry_run_lot(lot, rds_engine):
                done += 1
            else:
                failed += 1

        elapsed = time.time() - start_time
        print(f"Dry run summary: {done} ok | {failed} failed | Elapsed {elapsed:.1f}s")
        raise SystemExit(0 if failed == 0 else 1)

    if LOTS:
        print(f"Running AI estimator for specific lots: {LOTS}")
        done = failed = 0
        start_time = time.time()

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            for lot in LOTS:
                lot = lot.strip()
                print(f"Queuing lot {lot} for AI analysis...")
                futures.append(executor.submit(process_lot, lot, rds_engine, False, args.force))
                time.sleep(SLEEP_BETWEEN_LOTS)

            for future in as_completed(futures):
                try:
                    if future.result(timeout=600):
                        done += 1
                    else:
                        failed += 1
                except Exception as e:
                    print(f"Thread exception: {e}")
                    failed += 1

        elapsed = time.time() - start_time
        print(f"\nSummary: {done} done | {failed} failed | Elapsed {elapsed/60:.1f} min.")
        print(f"Completed AI analysis for user {USER_ID} (manual lots mode).")

    else:
        print(f"No lot list provided — falling back to CSV detection for user {USER_ID}")
        main(USER_ID, args.force)