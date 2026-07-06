import { isPrivateParty, isSalvageAuction } from "./vehicleSource";

export const TRANSPORT_TYPES = [
  "local_tow",
  "self_pickup",
  "open_carrier",
  "enclosed_carrier",
  "drive_home",
];

export const TRANSPORT_TYPE_LABELS = {
  local_tow: "Local Tow",
  self_pickup: "Self Pickup / Trailer",
  open_carrier: "Open Carrier",
  enclosed_carrier: "Enclosed Carrier",
  drive_home: "Drive Home",
};

export const TRANSPORT_RATES = {
  local_tow: { baseFee: 75, ratePerMile: 3.5 },
  self_pickup: { baseFee: 0, ratePerMile: 0.75 },
  open_carrier: { baseFee: 150, ratePerMile: 1.25 },
  enclosed_carrier: { baseFee: 300, ratePerMile: 2.0 },
  drive_home: { baseFee: 0, ratePerMile: 0.2 },
};

function parseMiles(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseCost(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function estimateTransportCost({
  distanceMiles,
  transportType = "local_tow",
  isRunning = true,
  sourceType,
  manualOverride,
}) {
  const override = parseCost(manualOverride);
  if (override != null) return override;

  const miles = parseMiles(distanceMiles);
  if (miles == null || miles <= 0) return 0;

  const type = TRANSPORT_TYPES.includes(transportType) ? transportType : "local_tow";
  const rates = TRANSPORT_RATES[type];
  const cost = Math.round(rates.baseFee + miles * rates.ratePerMile);
  return Math.max(0, cost);
}

export function getEffectiveTransportCost(vehicle) {
  if (!vehicle) return 0;
  const override = parseCost(vehicle.transport_cost_manual_override);
  if (override != null) return override;

  const estimate = parseCost(vehicle.transport_cost_estimate);
  if (estimate != null) return estimate;

  return 0;
}

export function hasTransportConfigured(vehicle) {
  if (!vehicle) return false;
  const miles = parseMiles(vehicle.transport_distance_miles);
  if (miles != null && miles > 0) return true;
  return getEffectiveTransportCost(vehicle) > 0;
}

export function defaultPickupLocation(vehicle) {
  return (
    vehicle?.transport_pickup_location ||
    vehicle?.sale_name ||
    vehicle?.location ||
    ""
  );
}

export function getTransportWarnings({
  vehicle,
  distanceMiles,
  transportType,
  transportCost,
  expectedProfitBeforeTransport,
}) {
  const warnings = [];
  const miles = parseMiles(distanceMiles) ?? 0;
  const type = transportType || "local_tow";
  const cost = Math.max(0, Number(transportCost) || 0);
  const profitBefore = Number(expectedProfitBeforeTransport) || 0;

  if (type === "drive_home") {
    if (isSalvageAuction(vehicle)) {
      warnings.push("Salvage auction vehicles should not be assumed driveable.");
    }
    warnings.push("Vehicle may not be safe or legal to drive home.");
  }

  if (miles >= 500) {
    warnings.push("Long-distance transport may reduce profit significantly.");
  }

  if (cost > 0 && profitBefore > 0 && cost / profitBefore >= 0.25) {
    warnings.push("Transport cost is high compared to expected profit.");
  }

  if (cost > 0 && profitBefore > 0) {
    warnings.push(`Transport reduces expected profit by $${cost.toLocaleString()}.`);
  }

  if (cost > 0 && profitBefore - cost < 0) {
    warnings.push("Transport may kill this deal.");
  } else if (cost > 0 && profitBefore - cost >= 0 && profitBefore > 0) {
    warnings.push("This still looks profitable after transport.");
  }

  const keys = vehicle?.keys;
  const damage = String(vehicle?.damage_description || "").toLowerCase();
  const nonRunner =
    damage.includes("non-runner") ||
    damage.includes("does not run") ||
    damage.includes("engine damage") ||
    String(keys || "").toLowerCase().includes("no key");

  if (type === "drive_home" && (nonRunner || !vehicle?.runs)) {
    warnings.push("This vehicle may not be safe or legal to drive home.");
  }

  if (isPrivateParty(vehicle) && type === "drive_home" && miles > 100) {
    warnings.push("Long-distance pickup increases the risk of this flip.");
  }

  return [...new Set(warnings)];
}
