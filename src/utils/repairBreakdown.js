export function parseRepairItems(car) {
  if (!car) return [];

  const raw = car.repair_breakdown;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .filter((item) => item && String(item.description || "").trim())
      .map((item) => ({
        description: String(item.description).trim(),
        cost: Math.max(0, Number(item.cost) || 0),
      }));
  }

  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
          .filter((item) => item && String(item.description || "").trim())
          .map((item) => ({
            description: String(item.description).trim(),
            cost: Math.max(0, Number(item.cost) || 0),
          }));
      }
    } catch {
      // fall through
    }
  }

  return [];
}

export function sumRepairItems(items) {
  return (items || []).reduce((total, item) => total + (Number(item.cost) || 0), 0);
}
