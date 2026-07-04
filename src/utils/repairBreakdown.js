export function parseRepairItems(car) {
  if (!car) return [];

  if (car.repair_breakdown) {
    try {
      const parsed = JSON.parse(car.repair_breakdown);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
          .filter((item) => item && String(item.description || "").trim())
          .map((item) => ({
            description: String(item.description).trim(),
            cost: Math.max(0, Number(item.cost) || 0),
          }));
      }
    } catch {
      // fall through to legacy parsing
    }
  }

  if (car.repair_details) {
    return [
      {
        description: String(car.repair_details).trim(),
        cost: Math.max(0, Number(car.repair_estimate) || 0),
      },
    ];
  }

  return [];
}

export function sumRepairItems(items) {
  return (items || []).reduce((total, item) => total + (Number(item.cost) || 0), 0);
}
