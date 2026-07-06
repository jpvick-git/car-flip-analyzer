import {
  TRANSPORT_TYPES,
  TRANSPORT_TYPE_LABELS,
  estimateTransportCost,
  getEffectiveTransportCost,
  hasTransportConfigured,
} from "./transportCalculator";

export const SETTINGS_CACHE_KEY = "user_settings";

export const DEFAULT_USER_SETTINGS = {
  default_margin_percent: 15,
  default_transport_type: "local_tow",
  shop_location: "",
};

export function normalizeUserSettings(raw) {
  if (!raw) return { ...DEFAULT_USER_SETTINGS };
  const margin = Number(raw.default_margin_percent);
  const transport = TRANSPORT_TYPES.includes(raw.default_transport_type)
    ? raw.default_transport_type
    : DEFAULT_USER_SETTINGS.default_transport_type;
  return {
    default_margin_percent:
      Number.isFinite(margin) && margin >= 0 && margin <= 90
        ? Math.round(margin)
        : DEFAULT_USER_SETTINGS.default_margin_percent,
    default_transport_type: transport,
    shop_location: String(raw.shop_location || "").trim(),
  };
}

export function getCachedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    return normalizeUserSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function setCachedSettings(settings) {
  const normalized = normalizeUserSettings(settings);
  localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearCachedSettings() {
  localStorage.removeItem(SETTINGS_CACHE_KEY);
}

export async function fetchUserSettings(apiBase) {
  const token = localStorage.getItem("token");
  if (!token) return { ...DEFAULT_USER_SETTINGS };

  const res = await fetch(`${apiBase}/api/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Failed to load settings");
  }

  const data = await res.json();
  return setCachedSettings(data);
}

export async function saveUserSettings(apiBase, settings) {
  const token = localStorage.getItem("token");
  const body = normalizeUserSettings(settings);

  const res = await fetch(`${apiBase}/api/settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to save settings");
  }

  const data = await res.json();
  return setCachedSettings(data);
}

/**
 * Transport cost for flip math — uses saved vehicle data, or estimates from
 * vehicle distance + user default transport type when not yet saved.
 */
export function getTransportCostForFlip(vehicle, settings = DEFAULT_USER_SETTINGS) {
  const saved = getEffectiveTransportCost(vehicle);
  if (saved > 0) return saved;

  const miles = Number(vehicle?.transport_distance_miles);
  if (!Number.isFinite(miles) || miles <= 0) return 0;

  const type =
    vehicle?.transport_type ||
    settings?.default_transport_type ||
    DEFAULT_USER_SETTINGS.default_transport_type;

  return estimateTransportCost({
    distanceMiles: miles,
    transportType: type,
    manualOverride: vehicle?.transport_cost_manual_override,
  });
}

export function defaultDeliveryLocation(vehicle, settings = DEFAULT_USER_SETTINGS) {
  if (vehicle?.transport_delivery_location) {
    return vehicle.transport_delivery_location;
  }
  return settings?.shop_location || "";
}

export function defaultTransportType(vehicle, settings = DEFAULT_USER_SETTINGS) {
  if (vehicle?.transport_type && TRANSPORT_TYPES.includes(vehicle.transport_type)) {
    return vehicle.transport_type;
  }
  return settings?.default_transport_type || DEFAULT_USER_SETTINGS.default_transport_type;
}

export function vehicleNeedsTransportDefaults(vehicle) {
  return !hasTransportConfigured(vehicle);
}

export { hasTransportConfigured } from "./transportCalculator";
