function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseTalkingPoints(car) {
  return parseJsonArray(car?.negotiation_talking_points).filter(
    (item) => item && String(item.point || "").trim()
  );
}

export function hasNegotiationData(car) {
  if (!car) return false;
  if (car.negotiation_summary) return true;
  if (car.suggested_offer_low != null || car.suggested_offer_high != null) return true;
  return parseTalkingPoints(car).length > 0;
}
