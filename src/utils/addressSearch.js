const PHOTON_API = "https://photon.komoot.io/api/";
const US_BBOX = "-125.0,24.0,-66.0,49.0";
const MIN_QUERY_LENGTH = 3;

const US_STATE_ABBR = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function abbreviateState(state) {
  if (!state) return "";
  const trimmed = String(state).trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return US_STATE_ABBR[trimmed.toLowerCase()] || trimmed;
}

export function formatAddressSuggestion(properties = {}) {
  const streetLine = [properties.housenumber, properties.street]
    .filter(Boolean)
    .join(" ")
    .trim();

  const city = properties.city || properties.name || properties.county || "";
  const state = abbreviateState(properties.state);
  const locality = [city, state].filter(Boolean).join(", ");

  if (streetLine && locality) {
    return `${streetLine}, ${locality}`;
  }
  if (locality) return locality;
  return properties.name || properties.street || "";
}

export function formatAddressSecondary(properties = {}) {
  const parts = [];
  if (properties.postcode) parts.push(properties.postcode);
  if (properties.country && properties.countrycode !== "US") {
    parts.push(properties.country);
  }
  return parts.join(" · ");
}

export async function searchAddresses(query, { limit = 6 } = {}) {
  const q = String(query || "").trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const params = new URLSearchParams({
    q,
    limit: String(limit),
    lang: "en",
    bbox: US_BBOX,
  });

  const res = await fetch(`${PHOTON_API}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error("Address lookup failed");
  }

  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  const seen = new Set();
  const results = [];

  for (const feature of features) {
    const props = feature.properties || {};
    if (props.countrycode && props.countrycode !== "US") continue;

    const label = formatAddressSuggestion(props);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());

    const [lon, lat] = feature.geometry?.coordinates || [];
    results.push({
      id: `${label}-${lat}-${lon}`,
      label,
      secondary: formatAddressSecondary(props),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      properties: props,
    });
  }

  return results;
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/** Approximate driving distance from straight-line miles (typical US haul). */
export function roadMilesFromCoords(lat1, lon1, lat2, lon2) {
  const straight = haversineMiles(lat1, lon1, lat2, lon2);
  return Math.max(1, Math.round(straight * 1.2));
}

/** Turn Copart yard strings like "MA - FREETOWN" into "Freetown, MA". */
export function normalizeLocationQuery(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";

  const copartMatch = trimmed.match(/^([A-Z]{2})\s*[-–—]\s*(.+)$/i);
  if (copartMatch) {
    const state = copartMatch[1].toUpperCase();
    const city = copartMatch[2]
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `${city}, ${state}`;
  }

  return trimmed;
}

/** Best-effort geocode for a city, yard, or address string. */
export async function geocodeAddress(query) {
  const normalized = normalizeLocationQuery(query);
  if (normalized.length < MIN_QUERY_LENGTH) return null;

  const results = await searchAddresses(normalized, { limit: 1 });
  return results[0] || null;
}

export { MIN_QUERY_LENGTH };
