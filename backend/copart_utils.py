"""Resolve Copart CSV abbreviations to full make/model names using lot URLs."""
import re

US_STATES = frozenset({
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia",
    "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
    "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt",
    "va", "wa", "wv", "wi", "wy", "dc",
})

MULTI_WORD_MAKES = (
    ("mercedes", "benz"),
    ("land", "rover"),
    ("alfa", "romeo"),
    ("aston", "martin"),
    ("rolls", "royce"),
)

COPART_MAKE_CODES = {
    "MERZ": "Mercedes-Benz",
    "HYUN": "Hyundai",
    "NISS": "Nissan",
    "ACUR": "Acura",
    "CHRY": "Chrysler",
    "CHEV": "Chevrolet",
    "TOYT": "Toyota",
    "VOLK": "Volkswagen",
    "PORS": "Porsche",
    "INFI": "Infiniti",
    "CADI": "Cadillac",
    "MAZD": "Mazda",
    "SUBA": "Subaru",
    "MITS": "Mitsubishi",
    "LINC": "Lincoln",
    "BUIC": "Buick",
    "DODG": "Dodge",
    "FRD": "Ford",
    "FORD": "Ford",
    "GMC": "GMC",
    "JEEP": "Jeep",
    "RAM": "Ram",
    "BMW": "BMW",
    "AUDI": "Audi",
    "LEXU": "Lexus",
    "VOLV": "Volvo",
    "MINI": "MINI",
    "JAGU": "Jaguar",
    "GENE": "Genesis",
    "KIA": "Kia",
    "TESL": "Tesla",
}

UPPERCASE_MAKES = {"bmw", "gmc", "ram", "kia", "mini", "gmc"}

UPPERCASE_MODEL_TOKENS = {
    "4matic", "4ma", "4x4", "awd", "fwd", "rwd", "sdrive", "xdrive", "4wd", "2wd",
    "tlx", "tsx", "mdx", "rdx", "q50", "q60", "glc", "gle", "gls", "glk", "clk",
}


def _format_make_token(token: str) -> str:
    if token in UPPERCASE_MAKES:
        return token.upper()
    return token.capitalize()


def _format_make(tokens: tuple[str, ...]) -> str:
    if tokens == ("mercedes", "benz"):
        return "Mercedes-Benz"
    if tokens == ("land", "rover"):
        return "Land Rover"
    if tokens == ("alfa", "romeo"):
        return "Alfa Romeo"
    if tokens == ("aston", "martin"):
        return "Aston Martin"
    if tokens == ("rolls", "royce"):
        return "Rolls-Royce"
    if len(tokens) == 1:
        return _format_make_token(tokens[0])
    return " ".join(_format_make_token(t) for t in tokens)


def _format_model_token(token: str) -> str:
    lower = token.lower()
    if lower in UPPERCASE_MODEL_TOKENS:
        return lower.upper()
    if token.isdigit():
        return token
    if re.fullmatch(r"[a-z]\d+[a-z0-9]*", lower):
        return token.upper()
    if re.fullmatch(r"\d+[a-z]+", lower):
        return token.upper()
    if len(token) <= 2 and token.isalpha():
        return token.upper()
    return token.capitalize()


def _format_model_tokens(tokens: list[str]) -> str:
    return " ".join(_format_model_token(t) for t in tokens if t)


def _vehicle_tokens_before_location(parts_after_year: list[str]) -> list[str]:
    if not parts_after_year:
        return []
    for i in range(len(parts_after_year) - 1):
        if parts_after_year[i].lower() in US_STATES:
            return parts_after_year[:i]
    if len(parts_after_year) >= 2:
        return parts_after_year[:-2]
    return parts_after_year


def parse_make_model_from_lot_url(lot_url: str, year=None) -> tuple[str | None, str | None]:
    """Extract full make/model from a Copart lot URL slug."""
    if not lot_url:
        return None, None

    match = re.search(r"/lot/\d+/(.+?)/?$", lot_url.strip(), re.I)
    if not match:
        return None, None

    parts = match.group(1).lower().split("-")
    year_str = str(year).strip() if year is not None else None

    year_idx = None
    for i, part in enumerate(parts):
        if re.fullmatch(r"\d{4}", part):
            if year_str is None or part == year_str:
                year_idx = i
                break
            if year_idx is None:
                year_idx = i

    if year_idx is None:
        return None, None

    vehicle_parts = _vehicle_tokens_before_location(parts[year_idx + 1 :])
    if not vehicle_parts:
        return None, None

    for make_tokens in MULTI_WORD_MAKES:
        n = len(make_tokens)
        if vehicle_parts[:n] == list(make_tokens):
            return _format_make(make_tokens), _format_model_tokens(vehicle_parts[n:])

    make = _format_make((vehicle_parts[0],))
    model = _format_model_tokens(vehicle_parts[1:])
    return make, model or None


def resolve_make_model(
    lot_url: str | None,
    csv_make: str | None,
    csv_model: str | None,
    year=None,
) -> tuple[str | None, str | None]:
    """Prefer lot URL names; fall back to Copart make codes and CSV model."""
    parsed_make, parsed_model = parse_make_model_from_lot_url(lot_url or "", year)

    make = parsed_make
    if not make and csv_make:
        code = csv_make.strip().upper()
        make = COPART_MAKE_CODES.get(code, csv_make.strip())

    model = parsed_model
    if not model and csv_model:
        model = csv_model.strip()

    return make, model


def enrich_vehicle(vehicle: dict) -> dict:
    """Return vehicle dict with display-friendly make/model."""
    if not vehicle:
        return vehicle

    enriched = dict(vehicle)
    make, model = resolve_make_model(
        enriched.get("lot_url"),
        enriched.get("make"),
        enriched.get("model"),
        enriched.get("year"),
    )
    if make:
        enriched["make"] = make
    if model:
        enriched["model"] = model
    return enriched
