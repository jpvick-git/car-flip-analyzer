import {
  TRANSPORT_TYPES,
  TRANSPORT_TYPE_LABELS,
  estimateTransportCost,
  getEffectiveTransportCost,
  hasTransportConfigured,
} from "./transportCalculator";
import { getCachedTransportEstimate, isTransportSavedOnVehicle } from "./transportEstimate";

export const SETTINGS_CACHE_KEY = "user_settings";

export const BUSINESS_TYPES = ["flipper", "dealer"];

// Lot cost-profile defaults (dealer mode) — mirror LOT_PROFILE_DEFAULTS in backend.
export const LOT_PROFILE_DEFAULTS = {
  target_front_gross: 2500,
  auction_fee_default: 550,
  transport_cost_default: 700,
  deal_shield_fee: 365,
  default_recon: 1200,
  floor_plan_cost_per_day: 12,
  target_turn_days: 60,
  max_turn_days: 90,
};

export const DEFAULT_USER_SETTINGS = {
  default_margin_percent: 15,
  default_transport_type: "local_tow",
  shop_location: "",
  business_type: "flipper",
  role: "user",
  ...LOT_PROFILE_DEFAULTS,
};

export function isDealer(settings) {
  return (settings?.business_type || "flipper") === "dealer";
}

export function isSuperAdmin(settings) {
  return (settings?.role || "user") === "super_admin";
}

function normalizeInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

export function normalizeUserSettings(raw) {
  if (!raw) return { ...DEFAULT_USER_SETTINGS };
  const margin = Number(raw.default_margin_percent);
  const transport = TRANSPORT_TYPES.includes(raw.default_transport_type)
    ? raw.default_transport_type
    : DEFAULT_USER_SETTINGS.default_transport_type;
  const business = BUSINESS_TYPES.includes(raw.business_type)
    ? raw.business_type
    : DEFAULT_USER_SETTINGS.business_type;

  const normalized = {
    default_margin_percent:
      Number.isFinite(margin) && margin >= 0 && margin <= 90
        ? Math.round(margin)
        : DEFAULT_USER_SETTINGS.default_margin_percent,
    default_transport_type: transport,
    shop_location: String(raw.shop_location || "").trim(),
    business_type: business,
    role: raw.role === "super_admin" ? "super_admin" : "user",
  };
  for (const [key, fallback] of Object.entries(LOT_PROFILE_DEFAULTS)) {
    normalized[key] = normalizeInt(raw[key], fallback);
  }
  return normalized;
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
  if (Number.isFinite(miles) && miles > 0) {
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

  const cached = getCachedTransportEstimate(vehicle, settings);
  return cached != null ? cached : 0;
}

export function getTransportCostInfo(vehicle, settings = DEFAULT_USER_SETTINGS) {
  const cost = getTransportCostForFlip(vehicle, settings);
  const saved = isTransportSavedOnVehicle(vehicle);
  return {
    cost,
    isEstimated: cost > 0 && !saved,
    hasValue: cost > 0,
  };
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
