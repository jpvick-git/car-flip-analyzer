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

export function parseKnownIssues(car) {
  return parseJsonArray(car?.known_issues).filter(
    (item) => item && String(item.issue || item.item || "").trim()
  );
}

export function parseWearItems(car) {
  return parseJsonArray(car?.wear_items).filter(
    (item) => item && String(item.item || item.issue || "").trim()
  );
}

export function hasKnownIssuesData(car) {
  if (!car) return false;
  if (car.reliability_summary) return true;
  return parseKnownIssues(car).length > 0 || parseWearItems(car).length > 0;
}
