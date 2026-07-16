import { buyerFeeRate } from "./vehicleSource";

// Deal lifecycle statuses — mirror backend DEAL_STATUSES in user_vehicles.py
export const DEAL_STATUS = {
  ANALYZING: "analyzing",
  WATCHING: "watching",
  BOUGHT: "bought",
  IN_REPAIR: "in_repair",
  LISTED: "listed",
  SOLD: "sold",
  PASSED: "passed",
};

// Ordered progression through an active deal
export const DEAL_STATUS_FLOW = [
  DEAL_STATUS.WATCHING,
  DEAL_STATUS.BOUGHT,
  DEAL_STATUS.IN_REPAIR,
  DEAL_STATUS.LISTED,
  DEAL_STATUS.SOLD,
];

export const ACQUIRED_STATUSES = new Set([
  DEAL_STATUS.BOUGHT,
  DEAL_STATUS.IN_REPAIR,
  DEAL_STATUS.LISTED,
  DEAL_STATUS.SOLD,
]);

export const ACTIVE_STATUSES = new Set([
  DEAL_STATUS.WATCHING,
  DEAL_STATUS.BOUGHT,
  DEAL_STATUS.IN_REPAIR,
  DEAL_STATUS.LISTED,
]);

const STATUS_META = {
  [DEAL_STATUS.ANALYZING]: {
    label: "Analyzing",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  [DEAL_STATUS.WATCHING]: {
    label: "Watching",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  [DEAL_STATUS.BOUGHT]: {
    label: "Bought",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  [DEAL_STATUS.IN_REPAIR]: {
    label: "In Repair",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  [DEAL_STATUS.LISTED]: {
    label: "Listed",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
  },
  [DEAL_STATUS.SOLD]: {
    label: "Sold",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  [DEAL_STATUS.PASSED]: {
    label: "Passed",
    badge: "bg-red-50 text-red-600 border-red-200",
    dot: "bg-red-500",
  },
};

export function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();
  return STATUS_META[s] ? s : DEAL_STATUS.ANALYZING;
}

export function dealStatus(car) {
  return normalizeStatus(car?.deal_status);
}

export function statusLabel(status) {
  return STATUS_META[normalizeStatus(status)].label;
}

export function statusBadgeClasses(status) {
  return STATUS_META[normalizeStatus(status)].badge;
}

export function statusDotClasses(status) {
  return STATUS_META[normalizeStatus(status)].dot;
}

export function isAcquired(car) {
  return ACQUIRED_STATUSES.has(dealStatus(car));
}

export function isActiveDeal(car) {
  return ACTIVE_STATUSES.has(dealStatus(car));
}

export function isSold(car) {
  return dealStatus(car) === DEAL_STATUS.SOLD;
}

/** The next logical status in the progression, or null if none. */
export function nextStatus(status) {
  const idx = DEAL_STATUS_FLOW.indexOf(normalizeStatus(status));
  if (idx === -1 || idx >= DEAL_STATUS_FLOW.length - 1) return null;
  return DEAL_STATUS_FLOW[idx + 1];
}

/**
 * Realized profit for a sold deal from actual numbers.
 * Mirrors _realized_profit() in backend/user_vehicles.py.
 * Returns null when purchase or sale price is missing.
 */
export function computeRealizedProfit(car) {
  const sale = toNumOrNull(car?.actual_sale_price);
  const purchase = toNumOrNull(car?.actual_purchase_price);
  if (sale == null || purchase == null) return null;
  const repair = Number(car?.actual_repair_cost) || 0;
  const transport = Number(car?.actual_transport_cost) || 0;
  const backend = Number(car?.backend_gross) || 0;
  const auctionFee = Number(car?.buy_auction_fee) || 0;
  const dealShield = Number(car?.buy_deal_shield) || 0;
  const buyerFee = Math.round(purchase * buyerFeeRate(car));
  return (
    sale +
    backend -
    purchase -
    repair -
    transport -
    auctionFee -
    dealShield -
    buyerFee
  );
}

/** Realized profit excluding backend gross (vehicle front-end only). */
export function computeFrontGross(car) {
  const realized = computeRealizedProfit(car);
  if (realized == null) return null;
  return realized - (Number(car?.backend_gross) || 0);
}

/** Total cash invested in a sold/acquired deal (purchase + recon + transport + fees). */
export function computeInvested(car) {
  const purchase = Number(car?.actual_purchase_price) || 0;
  const repair = Number(car?.actual_repair_cost) || 0;
  const transport = Number(car?.actual_transport_cost) || 0;
  const auctionFee = Number(car?.buy_auction_fee) || 0;
  const dealShield = Number(car?.buy_deal_shield) || 0;
  return purchase + repair + transport + auctionFee + dealShield;
}

/**
 * Accuracy of the app's predicted profit vs realized outcome.
 * Returns { delta, betterThanApp } or null when not comparable.
 * delta > 0 means the real deal beat the app's prediction.
 */
export function computeAccuracy(car) {
  const realized = computeRealizedProfit(car);
  const predicted = toNumOrNull(car?.predicted_profit);
  if (realized == null || predicted == null) return null;
  const delta = realized - predicted;
  return { predicted, realized, delta, betterThanApp: delta >= 0 };
}

export function daysToSell(car) {
  const start = car?.purchased_at ? new Date(car.purchased_at) : null;
  const end = car?.sold_at ? new Date(car.sold_at) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

/**
 * Days since a deal was marked bought but not yet sold — used for the
 * "did this sell yet?" nudge. Returns null for non-acquired or sold deals.
 */
export function daysSincePurchaseUnsold(car) {
  if (isSold(car) || !isAcquired(car)) return null;
  if (!car?.purchased_at) return null;
  const start = new Date(car.purchased_at);
  if (Number.isNaN(start.getTime())) return null;
  return Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/** Signed currency formatter (formatCurrency clamps negatives to $0). */
export function formatSignedCurrency(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

function toNumOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
