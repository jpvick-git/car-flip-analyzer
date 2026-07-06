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

try:
    from .vehicle_model import is_private_party
except ImportError:
    from vehicle_model import is_private_party

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

Vehicle tier multiplier — apply to the base pricing above, and use the matching labor rate:
- Economy (Toyota, Honda, Hyundai, Kia, Nissan, mainstream Ford/Chevy/Buick): base pricing as-is, ~$65-75/hr labor.
- Mainstream sport/turbo (Subaru WRX/STI, Mazdaspeed, Civic Si/Type R, Mustang/Camaro non-performance-trim): base x1.15-1.3, ~$70-85/hr labor.
- Entry luxury / mainstream German (BMW 3-series, Audi A4/Q5, Mercedes C-class, Volvo, Acura, Infiniti, Lexus): base x1.5-2, ~$100-140/hr labor. Prefer OEM parts pricing over aftermarket.
- Premium/complex luxury (Land Rover/Range Rover, BMW 5/7/X5+, Mercedes E/S/GLE/G-class+, Porsche, Audi Q7/Q8/A6+): base x2-3+, ~$130-180/hr labor, OEM parts only. If the damaged region plausibly houses air suspension components, aluminum body panels, or ADAS sensors/cameras (front bumper/grille, windshield, side mirrors), add an explicit line item or note flagging it — do not silently fold it into the bumper/panel cost.
- Exotic / limited-production / unfamiliar platform: do not price with confidence — add a repair_items line item noting "flag for manual/specialist review" with your best-guess cost range clearly labeled as low-confidence.

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
4. Factor repair cost and severity when a repair line-item list is provided below.
5. Be conservative — understate rather than overstate value.
6. CRITICAL: You have NOT seen any photos of this vehicle. Your only source of truth about
   damage is the "Known repair line items" list below (if present) and the title/odometer
   context. Do NOT state, imply, or invent any specific damage detail that is not literally
   present in that line-item list — this includes airbag deployment, frame damage, structural
   damage, or any specific component failure. If the line-item list does not mention airbags,
   you may not say airbags deployed. If it is empty or absent, describe the vehicle's value
   based only on title status, mileage, and general market factors — do not speculate about
   what kind of damage a branded title "typically" implies.
7. It is fine, and preferred, to say "no detailed repair breakdown was available" rather than
   filling that gap with plausible-sounding specifics.

Return JSON with this exact structure:
{
  "resale_estimate": 0,
  "resale_details": "2-4 sentence wholesale value rationale, citing only line items actually provided"
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

PRIVATE_RECON_SYSTEM_PROMPT = (
    "You are an experienced used-car flipper and independent mechanic evaluating a private-party "
    "purchase. You inspect listing photos and estimate realistic reconditioning costs — NOT collision "
    "body repair unless visible accident damage is present. You flag seller red flags and note when "
    "photos do not match the listing description."
)

PRIVATE_RECON_RULES = """
Rules:
1. This is a private-party flip — estimate RECONDITIONING (detail, tires, brakes, fluids, bulbs,
   minor cosmetic touch-ups, deferred maintenance the listing mentions or photos suggest).
2. Do NOT invent collision damage. If photos show a clean car, recon should be light (detail, inspection,
   maybe tires/brakes based on mileage) — not thousands in body work.
3. Compare photos to the seller's listing description. Flag mismatches (e.g. ad says runs great but
   check-engine light visible, ad says clean but visible rust/dents not mentioned).
4. Parse the listing text for red flags: runs but, needs work, mechanic special, salvage/rebuilt
   title mentions, vague mileage, lost title, lien language, as-is, incomplete registration, etc.
5. Each recon_items cost is ALL-IN at a competent independent shop (not dealer, not DIY).
6. If listing mentions a specific issue (needs brakes, AC doesn't blow cold), include a line item for it.
7. Be conservative on recon — slightly HIGH rather than low when issues are visible or stated.

Return JSON with this exact structure:
{
  "photo_match_notes": "1-2 sentences: do photos match the listing?",
  "red_flags": ["short red flag strings from listing or photos"],
  "recon_items": [
    {"description": "Full detail + engine bay clean", "cost": 200}
  ],
  "recon_estimate": 200,
  "recon_details": "2-4 sentence summary of recon needed and photo/listing observations"
}

Rules for recon_items:
8. recon_estimate MUST equal the sum of all recon_items costs.
9. If the car appears retail-ready with no stated issues, recon_items can be minimal (detail + inspection).
"""

PRIVATE_RESALE_SYSTEM_PROMPT = (
    "You are an experienced used-car flipper estimating realistic RETAIL resale value after "
    "reconditioning — what this vehicle could sell for on Facebook Marketplace, Craigslist, or "
    "a dealer lot as a clean retail listing. Not wholesale, not auction, not trade-in."
)

PRIVATE_RESALE_RULES = """
Rules:
1. Use realistic private-party RETAIL asking prices for a well-presented example of this year/make/model/trim
   at this mileage in the current US market — not KBB "fair purchase price" and not auction wholesale.
2. Factor in title status: clean title = full retail; rebuilt/salvage = significant discount (20-40%+).
3. Factor recon costs when a recon line-item list is provided — buyer's exit is AFTER recon is done.
4. Be conservative — understate rather than overstate value.
5. You have NOT seen photos. Your only condition info is recon line items and listing context below.
6. Do NOT invent specific mechanical failures not mentioned in the recon list or listing.

Return JSON with this exact structure:
{
  "resale_estimate": 0,
  "resale_details": "2-4 sentence retail exit rationale"
}
"""

NEGOTIATION_SYSTEM_PROMPT = (
    "You are an experienced used-car buyer and flipper coaching someone to negotiate a lower "
    "private-party purchase price. You inspect listing photos and text to find factual leverage — "
    "visible condition issues, listing omissions or exaggerations, recon costs, market comps, and "
    "title/mileage concerns. You give practical talking points the buyer can use respectfully with "
    "the seller. You never suggest lying, insulting the seller, or fabricating problems."
)

NEGOTIATION_RULES = """
Rules:
1. Base every talking point on evidence from the listing text, photos, or provided recon/resale estimates.
2. Compare photos to the seller's description — mismatches are strong negotiation leverage.
3. Reference visible wear, deferred maintenance, recon line items, or red flags when present.
4. Use asking price vs. realistic retail exit (if provided) to frame how much room exists to negotiate.
5. Include questions the buyer should ask the seller before making an offer (service records, accidents, why selling).
6. Suggest a realistic offer range ONLY when you have enough context (asking price + condition/market signals).
   If asking price is unknown, omit dollar amounts from the offer range and explain what data is missing.
7. Be respectful — frame points as "I noticed..." or "help me understand..." not attacks on the seller.
8. Prioritize the strongest 5-8 points; quality over quantity.
9. Do NOT invent damage or mechanical problems not visible in photos or stated in the listing.
10. Categories for talking_points: "condition", "listing", "market", "maintenance", "title", "timing", "strategy".
11. Strength for each point: "strong" (clear photo/listing evidence), "moderate" (reasonable inference),
    "weak" (soft market leverage — use sparingly).

Return JSON with this exact structure:
{
  "negotiation_summary": "2-3 sentences on overall negotiation position and tone to take",
  "suggested_offer_low": 0,
  "suggested_offer_high": 0,
  "offer_rationale": "1-2 sentences explaining the suggested range, or why a range cannot be set",
  "talking_points": [
    {
      "point": "The listing says 'no issues' but Photo 3 shows curb rash on both front wheels",
      "category": "condition",
      "strength": "strong",
      "how_to_use": "Mention you budget for wheels/tires and ask if they'd adjust price for recon"
    }
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


# Copart's gallery order is NOT consistent across lots (confirmed by comparing real lots —
# position 1 is sometimes a front shot, sometimes a 3/4 side shot; interior/engine/VIN photos
# land at different indices per lot). A fixed index->angle map silently mislabels photos and
# was the root cause of a prior under-estimate (damage photos got excluded from the model's
# priority selection because they were mis-bucketed as "interior"/"dashboard").
#
# Fix: only trust angle labels we can detect from the FILENAME itself (works for manual
# uploads named front/rear/left/right/etc.). For generic Copart filenames with no keyword
# (e.g. "54558326_Image_5.jpg"), do NOT guess an angle — bucket by index only, and when a
# subset must be chosen, spread the selection evenly across the full index range so both
# early and late photos in the gallery get a chance (Copart's damage/3-4 detail shots can
# land anywhere in the sequence, not just at the end).

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
    """Return (angle_bucket, sort_index) for an image filename.

    Angle is only ever set from a filename keyword match. Generic Copart-style
    filenames with no keyword ("Image_5.jpg") return "unlabeled" rather than a
    guessed angle — a fixed position->angle mapping does not hold across lots.
    """
    angle = _detect_angle_from_filename(filename)
    index = _parse_image_index(filename)

    if angle:
        return angle, index if index is not None else 9999
    return "unlabeled", index if index is not None else 9999


def _evenly_spread(items: list[tuple[int, str, str]], count: int) -> list[tuple[int, str, str]]:
    """Pick `count` items spread evenly across the list rather than just the first N —
    so a subset selection doesn't systematically favor early or late gallery positions."""
    if count <= 0 or not items:
        return []
    if len(items) <= count:
        return items
    step = len(items) / count
    picked, seen_idx = [], set()
    for i in range(count):
        idx = int(i * step)
        while idx in seen_idx and idx < len(items) - 1:
            idx += 1
        seen_idx.add(idx)
        picked.append(items[idx])
    return picked


def select_images_by_angle(lot_dir: str, max_images: int | None = None) -> tuple[list[dict], dict]:
    """
    Pick inspection photos: filename-keyword matches (front/rear/left/etc.) get priority
    slots since those labels are reliable; everything else ("unlabeled" — the common case
    for raw Copart filenames) is spread evenly across the gallery rather than guessed at
    or truncated from one end, since damage/detail shots can land anywhere in the sequence.
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
    buckets["unlabeled"] = []

    for filename in files:
        angle, sort_index = _classify_image(filename)
        target = angle if angle in buckets else "unlabeled"
        buckets[target].append((sort_index, filename, os.path.join(lot_dir, filename)))

    selected: list[dict] = []
    selected_debug: list[str] = []
    used_paths: set[str] = set()

    # Keyword-matched angles first — one photo per recognized angle, since these labels
    # are trustworthy and we want guaranteed coverage of each side of the vehicle.
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

    # Remaining slots: spread evenly across whatever's left (unlabeled + any extra
    # keyword-matched photos beyond one-per-angle), sorted by original gallery index.
    remaining_slots = limit - len(selected)
    if remaining_slots > 0:
        leftover = sorted(
            [
                (sort_index, filename, path)
                for angle in ANGLE_PRIORITY + ["unlabeled"]
                for sort_index, filename, path in buckets.get(angle, [])
                if path not in used_paths
            ],
            key=lambda item: item[0],
        )
        for sort_index, filename, path in _evenly_spread(leftover, remaining_slots):
            if path in used_paths:
                continue
            angle, _ = _classify_image(filename)
            label = angle if angle != "unlabeled" else f"photo_{sort_index}"
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


def _private_vehicle_context(vehicle) -> str:
    year = vehicle.get("year") or "Unknown"
    make = vehicle.get("make") or "Unknown"
    model = vehicle.get("model") or "Unknown"
    odometer_display = vehicle.get("odometer", "Unknown")
    title_code = _normalize_title_code(vehicle.get("title_code", "Unknown"))
    asking = vehicle.get("asking_price") or vehicle.get("est_retail_value") or "Unknown"
    listing = (
        vehicle.get("listing_description")
        or vehicle.get("description")
        or vehicle.get("damage_description")
        or "No listing text provided"
    )

    return (
        "Private-party listing context:\n"
        f"- Year: {year}\n"
        f"- Make: {make}\n"
        f"- Model: {model}\n"
        f"- Seller asking price: {asking}\n"
        f"- Odometer: {odometer_display}\n"
        f"- Title type: {title_code}\n"
        f"- Seller description / listing text:\n{listing}"
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


def _attach_images(messages, image_entries, lot_number: str, max_images: int | None = None) -> None:
    limit = max_images if max_images is not None else MAX_IMAGES
    valid_entries = [
        entry for entry in image_entries[:limit]
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
        # Pass the STRUCTURED line items, not the free-text summary — the resale model
        # (text-only, no photo access) must not be able to elaborate beyond what the
        # vision model actually itemized. Free-text summaries invite it to "fill in"
        # plausible-sounding specifics (e.g. inventing airbag deployment) that were
        # never actually costed or seen.
        breakdown_raw = repair_result.get("repair_breakdown")
        items = []
        if breakdown_raw:
            try:
                items = json.loads(breakdown_raw) if isinstance(breakdown_raw, str) else breakdown_raw
            except (json.JSONDecodeError, TypeError):
                items = []
        if estimate is not None or items:
            if items:
                item_lines = "\n".join(
                    f"  - {item.get('description', 'Unknown item')}: ${item.get('cost', 0)}"
                    for item in items
                )
            else:
                item_lines = "  (no itemized breakdown available)"
            repair_summary = (
                "\nKnown repair line items (this is the ONLY damage information you have — "
                "do not add to it):\n"
                f"- Repair estimate total: {estimate if estimate is not None else 'Unknown'}\n"
                f"{item_lines}"
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


def _finalize_private_recon_fields(parsed: dict) -> dict:
    items = []
    for item in parsed.get("recon_items") or []:
        if not isinstance(item, dict):
            continue
        description = str(item.get("description") or "").strip()
        if not description:
            continue
        try:
            cost = int(float(item.get("cost") or 0))
        except (TypeError, ValueError):
            cost = 0
        items.append({"description": description, "cost": max(cost, 0)})

    total = sum(item["cost"] for item in items)
    if not total:
        try:
            total = int(float(parsed.get("recon_estimate") or 0))
        except (TypeError, ValueError):
            total = 0

    details = (parsed.get("recon_details") or "").strip()
    photo_notes = (parsed.get("photo_match_notes") or "").strip()
    if photo_notes and photo_notes not in details:
        details = f"{photo_notes} {details}".strip()

    red_flags = [
        str(flag).strip()
        for flag in (parsed.get("red_flags") or [])
        if str(flag).strip()
    ]

    return {
        "repair_estimate": total,
        "repair_details": details or "No recon details available.",
        "repair_breakdown": json.dumps(items),
        "red_flags": red_flags,
    }


def analyze_private_recon(vehicle: dict) -> dict:
    """Vision-based reconditioning estimate for private-party listings."""
    lot_number = vehicle.get("lot_number", "unknown")
    image_entries = vehicle.get("image_entries") or []
    if not image_entries and vehicle.get("images"):
        image_entries = [
            {"path": p, "label": "unknown", "filename": os.path.basename(p)}
            for p in vehicle["images"]
        ]

    manifest = _photo_manifest(image_entries)
    user_prompt = f"{PRIVATE_RECON_RULES.strip()}\n\n{_private_vehicle_context(vehicle)}"
    if manifest:
        user_prompt += f"\n\n{manifest}"

    messages = [
        {"role": "system", "content": PRIVATE_RECON_SYSTEM_PROMPT},
        {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
    ]
    _attach_images(messages, image_entries, lot_number)

    if len(messages[1]["content"]) == 1:
        return {
            **_empty_repair_result("No usable photos attached for recon analysis."),
            "red_flags": [],
        }

    response = client.chat.completions.create(
        model=REPAIR_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    usage = _log_token_usage("private_recon", response)

    raw = response.choices[0].message.content.strip()
    parsed = _parse_json_response(
        raw,
        lot_number,
        {"recon_estimate": None, "recon_details": raw[:800], "red_flags": []},
    )
    recon_fields = _finalize_private_recon_fields(parsed)
    return {
        **recon_fields,
        "_usage": [usage],
    }


def analyze_private_resale(vehicle: dict, recon_result: dict | None = None) -> dict:
    """Text-only retail resale estimate for private-party flips."""
    lot_number = vehicle.get("lot_number", "unknown")
    odometer_display = vehicle.get("odometer", "Unknown")
    title_code = _normalize_title_code(vehicle.get("title_code", "Unknown"))

    recon_summary = ""
    if recon_result:
        estimate = recon_result.get("repair_estimate")
        breakdown_raw = recon_result.get("repair_breakdown")
        items = []
        if breakdown_raw:
            try:
                items = json.loads(breakdown_raw) if isinstance(breakdown_raw, str) else breakdown_raw
            except (json.JSONDecodeError, TypeError):
                items = []
        if estimate is not None or items:
            if items:
                item_lines = "\n".join(
                    f"  - {item.get('description', 'Unknown item')}: ${item.get('cost', 0)}"
                    for item in items
                )
            else:
                item_lines = "  (no itemized recon breakdown available)"
            recon_summary = (
                "\nKnown recon line items (this is the ONLY condition work you have — do not add to it):\n"
                f"- Recon estimate total: {estimate if estimate is not None else 'Unknown'}\n"
                f"{item_lines}"
            )

    user_prompt = (
        f"{PRIVATE_RESALE_RULES.strip()}\n\n"
        f"{_private_vehicle_context(vehicle)}\n"
        f"{recon_summary}\n\n"
        f"Odometer for resale math: {odometer_display} miles.\n"
        f"Title type for resale math: {title_code}."
    )

    response = client.chat.completions.create(
        model=RESALE_MODEL,
        messages=[
            {"role": "system", "content": PRIVATE_RESALE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    usage = _log_token_usage("private_resale", response)

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


def analyze_vehicle_negotiation(vehicle: dict) -> dict:
    """Vision + text negotiation coaching for private-party purchases."""
    lot_number = vehicle.get("lot_number", "unknown")
    image_entries = vehicle.get("image_entries") or []
    if not image_entries and vehicle.get("images"):
        image_entries = [
            {"path": p, "label": "unknown", "filename": os.path.basename(p)}
            for p in vehicle["images"]
        ]

    context_parts = [_private_vehicle_context(vehicle)]

    asking = vehicle.get("asking_price") or vehicle.get("est_retail_value")
    if asking:
        context_parts.append(f"Seller asking price: ${asking}")

    recon_estimate = vehicle.get("repair_estimate")
    resale_estimate = vehicle.get("resale_estimate")
    if recon_estimate is not None:
        context_parts.append(f"Estimated recon to retail-ready: ${recon_estimate}")
    if resale_estimate is not None:
        context_parts.append(f"Estimated retail exit value after recon: ${resale_estimate}")

    breakdown_raw = vehicle.get("repair_breakdown")
    if breakdown_raw:
        try:
            items = json.loads(breakdown_raw) if isinstance(breakdown_raw, str) else breakdown_raw
        except (json.JSONDecodeError, TypeError):
            items = []
        if items:
            item_lines = "\n".join(
                f"  - {item.get('description', 'Unknown')}: ${item.get('cost', 0)}"
                for item in items
            )
            context_parts.append(f"Recon line items:\n{item_lines}")

    red_flags = vehicle.get("red_flags") or []
    if red_flags:
        if isinstance(red_flags, str):
            try:
                red_flags = json.loads(red_flags)
            except (json.JSONDecodeError, TypeError):
                red_flags = [red_flags]
        flag_lines = "\n".join(f"  - {flag}" for flag in red_flags if str(flag).strip())
        if flag_lines:
            context_parts.append(f"Prior red flags from analysis:\n{flag_lines}")

    manifest = _photo_manifest(image_entries)
    user_prompt = f"{NEGOTIATION_RULES.strip()}\n\n" + "\n\n".join(context_parts)
    if manifest:
        user_prompt += f"\n\n{manifest}"

    messages = [
        {"role": "system", "content": NEGOTIATION_SYSTEM_PROMPT},
        {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
    ]

    has_images = bool(image_entries)
    if has_images:
        _attach_images(messages, image_entries, lot_number)

    model = REPAIR_MODEL if has_images else RESALE_MODEL
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    usage = _log_token_usage("negotiation", response)

    raw = response.choices[0].message.content.strip()
    fallback = {
        "negotiation_summary": "Unable to generate negotiation guidance.",
        "suggested_offer_low": None,
        "suggested_offer_high": None,
        "offer_rationale": "",
        "talking_points": [],
    }
    parsed = _parse_json_response(raw, lot_number, fallback)

    talking_points = []
    for item in parsed.get("talking_points") or []:
        if not isinstance(item, dict):
            continue
        point = str(item.get("point") or "").strip()
        if not point:
            continue
        talking_points.append({
            "point": point,
            "category": str(item.get("category") or "strategy").strip().lower(),
            "strength": str(item.get("strength") or "moderate").strip().lower(),
            "how_to_use": str(item.get("how_to_use") or "").strip(),
        })

    def _parse_offer(val):
        if val is None:
            return None
        try:
            return int(float(str(val).replace(",", "").replace("$", "")))
        except (TypeError, ValueError):
            return None

    return {
        "negotiation_summary": parsed.get("negotiation_summary") or fallback["negotiation_summary"],
        "suggested_offer_low": _parse_offer(parsed.get("suggested_offer_low")),
        "suggested_offer_high": _parse_offer(parsed.get("suggested_offer_high")),
        "offer_rationale": parsed.get("offer_rationale") or "",
        "negotiation_talking_points": talking_points,
        "_usage": [usage],
    }


def validate_private_deal(vehicle: dict, result: dict) -> dict:
    """Sanity checks for private-party flip analysis."""
    reasons = list(result.get("red_flags") or [])

    asking = vehicle.get("asking_price")
    if asking is None:
        try:
            asking = int(float(str(vehicle.get("est_retail_value") or "0").replace(",", "").replace("$", "")))
        except (TypeError, ValueError):
            asking = None

    recon_estimate = int(result.get("repair_estimate") or 0)
    resale_estimate = result.get("resale_estimate")

    if asking and resale_estimate and asking >= resale_estimate * 0.9:
        reasons.append(
            f"Asking price (${asking}) is very close to or above estimated retail exit (${resale_estimate}) — "
            "little or no margin before recon and fees."
        )

    if recon_estimate and resale_estimate and recon_estimate >= resale_estimate * 0.4:
        reasons.append(
            f"Recon estimate (${recon_estimate}) is high relative to retail exit (${resale_estimate})."
        )

    title = (vehicle.get("title_code") or "").lower()
    if any(term in title for term in ("salvage", "rebuilt", "junk", "flood")):
        reasons.append(f"Branded title ({vehicle.get('title_code')}) — verify title status before purchase.")

    return {
        "needs_manual_review": bool(reasons),
        "review_reasons": reasons,
    }


def validate_repair_estimate(vehicle: dict, result: dict) -> dict:
    """
    Rule-based sanity checks — catches the two failure modes seen in practice:
    (1) auction damage note mentions a region with no matching repair line item,
    (2) resale narrative describes damage severity the repair line items don't support.
    This never changes any dollar figure — it only flags for manual review.
    """
    reasons = []

    damage_note = (vehicle.get("damage_description") or "").lower()
    breakdown_raw = result.get("repair_breakdown")
    items = []
    if breakdown_raw:
        try:
            items = json.loads(breakdown_raw) if isinstance(breakdown_raw, str) else breakdown_raw
        except (json.JSONDecodeError, TypeError):
            items = []
    item_text = " ".join(item.get("description", "") for item in items).lower()
    repair_estimate = result.get("repair_estimate") or 0
    resale_estimate = result.get("resale_estimate") or 0

    # 1. Damage-note region vs. line items
    region_keywords = {
        "front": ["front"],
        "rear": ["rear", "back"],
        "side": ["side", "left", "right", "driver", "passenger"],
        "roof": ["roof", "top", "rollover"],
        "all over": ["all over", "burn", "fire", "flood"],
    }
    for region, keywords in region_keywords.items():
        if any(kw in damage_note for kw in keywords):
            if not any(kw in item_text for kw in keywords) and items:
                reasons.append(
                    f"Auction damage note mentions '{region}' but no repair line item references it."
                )

    # 2. Airbag/SRS mentioned in damage note or resale text, but no corresponding line item
    resale_text = (result.get("resale_details") or "").lower()
    airbag_terms = ["airbag", "air bag", "srs"]
    if any(term in damage_note or term in resale_text for term in airbag_terms):
        if not any(term in item_text for term in airbag_terms):
            reasons.append(
                "Airbag/SRS mentioned in damage note or resale narrative but not priced as a repair line item."
            )

    # 3. Resale narrative claiming severity/specifics not present in repair line items
    severity_terms = ["deployed airbag", "structural damage", "frame damage", "totaled", "severe damage"]
    for term in severity_terms:
        if term in resale_text and term.split()[0] not in item_text:
            reasons.append(f"Resale narrative states '{term}' — not reflected in repair line items.")

    # 4. Floor check — real accident repairs rarely land under $1,500 all-in
    if items and 0 < repair_estimate < 1500:
        reasons.append(f"Repair estimate (${repair_estimate}) is unusually low for a listed accident lot.")

    # 5. Ceiling check — repair approaching/exceeding resale value is a walk-away zone
    if resale_estimate and repair_estimate >= resale_estimate * 0.6:
        reasons.append(
            f"Repair estimate (${repair_estimate}) is >=60% of resale estimate (${resale_estimate}) — "
            "marginal or negative-margin territory."
        )

    return {
        "needs_manual_review": bool(reasons),
        "review_reasons": reasons,
    }


def analyze_salvage_flip(vehicle, mode: str = "full") -> dict:
    """
    Salvage/auction flip analysis — collision repair + wholesale resale.
    """
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

    if mode == "full":
        result.update(validate_repair_estimate(vehicle, result))

    if usages:
        result["_usage"] = usages

    if not vehicle.get("keep_structured"):
        result.pop("_repair_structured", None)

    return result


def analyze_private_flip(vehicle, mode: str = "full") -> dict:
    """
    Private-party flip analysis — recon + retail resale + listing red flags.
    """
    result = {}
    usages = []

    image_paths = [p for p in (vehicle.get("images") or []) if p and os.path.isfile(p)]
    has_images = bool(image_paths)

    if mode in ("full", "repair"):
        if has_images:
            recon_result = analyze_private_recon(vehicle)
            usages.extend(recon_result.pop("_usage", []))
            result.update(recon_result)
        else:
            result.update(_empty_repair_result("No photos provided for recon analysis."))
            result["red_flags"] = []

    if mode in ("full", "resale"):
        recon_context = None
        if mode == "full" and has_images:
            recon_context = result
        elif vehicle.get("repair_context"):
            recon_context = vehicle["repair_context"]
        resale_result = analyze_private_resale(vehicle, recon_context)
        usages.extend(resale_result.pop("_usage", []))
        result.update(resale_result)

    if mode in ("full", "known_issues"):
        known_issues_result = analyze_vehicle_known_issues(vehicle)
        usages.extend(known_issues_result.pop("_usage", []))
        result.update(known_issues_result)

    if mode == "full":
        validation = validate_private_deal(vehicle, result)
        result["needs_manual_review"] = validation["needs_manual_review"]
        result["review_reasons"] = validation["review_reasons"]

    if usages:
        result["_usage"] = usages

    return result


def analyze_vehicle(vehicle, mode: str = "full") -> dict:
    """
    Analyze a vehicle with AI. Routes by source_type.

    mode:
      - "full": repair/recon (if photos) + resale + known_issues
      - "repair": vision repair/recon only
      - "resale": text resale only
      - "known_issues": text platform-reliability lookup only
      - "negotiation": private-party price negotiation coaching only
    """
    mode = vehicle.get("mode", mode)
    if mode == "negotiation":
        if not is_private_party(vehicle):
            return {
                "negotiation_summary": "Negotiation coaching is only available for private-party listings.",
                "suggested_offer_low": None,
                "suggested_offer_high": None,
                "offer_rationale": "",
                "negotiation_talking_points": [],
            }
        return analyze_vehicle_negotiation(vehicle)
    if is_private_party(vehicle):
        return analyze_private_flip(vehicle, mode)
    return analyze_salvage_flip(vehicle, mode)


# --------------------------------------------------
# LOT PROCESSING FUNCTION
# --------------------------------------------------

def _load_vehicle_for_lot(lot, rds_engine):
    """Load vehicle metadata and local image paths for a lot."""
    lot = str(lot).strip()
    with rds_engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT year, make, model, damage_description, odometer, title_code, repair_estimate,
                       source_type, asking_price, listing_description, est_retail_value
                FROM user_vehicles
                WHERE lot_number = :lot
                LIMIT 1
            """),
            {"lot": lot},
        ).fetchone()

    if not row:
        return None, f"No user_vehicles record found for lot {lot}"

    (
        year, make, model, damage, odometer, title_code, existing_repair,
        source_type, asking_price, listing_description, est_retail_value,
    ) = row

    lot_dir = os.path.join(DOWNLOAD_DIR, lot)
    if not os.path.isdir(lot_dir):
        return None, f"No download folder for lot {lot}: {lot_dir}"

    image_entries, image_selection = select_images_by_angle(lot_dir, MAX_IMAGES)
    if not image_entries:
        return None, f"No images found for lot {lot} in {lot_dir}"

    vehicle = {
        "lot_number": lot,
        "source_type": source_type or "salvage_auction",
        "year": year,
        "make": make,
        "model": model,
        "damage_description": damage,
        "listing_description": listing_description,
        "asking_price": asking_price,
        "est_retail_value": est_retail_value,
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

    if ai_result.get("needs_manual_review"):
        print("-" * 72)
        print("⚠ NEEDS MANUAL REVIEW:")
        for reason in ai_result.get("review_reasons", []):
            print(f"  - {reason}")

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
                        red_flags = :red_flags,
                        needs_manual_review = :needs_manual_review,
                        review_reasons = :review_reasons,
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
                    "red_flags": json.dumps(ai_result.get("red_flags") or []),
                    "needs_manual_review": ai_result.get("needs_manual_review", False),
                    "review_reasons": json.dumps(ai_result.get("review_reasons") or []),
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