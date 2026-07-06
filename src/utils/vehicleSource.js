export const SOURCE_SALVAGE_AUCTION = "salvage_auction";
export const SOURCE_PRIVATE_PARTY = "private_party";

export function isPrivateParty(car) {
  if (!car) return false;
  if (car.source_type === SOURCE_PRIVATE_PARTY) return true;
  if (car.source_type === SOURCE_SALVAGE_AUCTION) return false;
  return String(car.lot_number || "").startsWith("MANUAL-");
}

export function isSalvageAuction(car) {
  return !isPrivateParty(car);
}

export function buyerFeeRate(car) {
  return isPrivateParty(car) ? 0 : 0.075;
}

export function sourceLabel(car) {
  return isPrivateParty(car) ? "Private Party" : "Auction";
}

export function costLabel(car) {
  return isPrivateParty(car) ? "Recon" : "Repair";
}

export function maxOfferLabel(car) {
  return isPrivateParty(car) ? "Max Offer" : "Max Bid";
}

export function parseRedFlags(car) {
  if (!car?.red_flags) return [];
  if (Array.isArray(car.red_flags)) return car.red_flags;
  try {
    const parsed = JSON.parse(car.red_flags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function askingPrice(car) {
  const raw = car?.asking_price ?? car?.est_retail_value;
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
