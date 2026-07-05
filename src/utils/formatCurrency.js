export function formatCurrency(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  return `$${amount.toLocaleString("en-US")}`;
}

export function parseCurrencyInput(value) {
  if (value == null || value === "") return 0;
  const cleaned = String(value).replace(/[^\d]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
