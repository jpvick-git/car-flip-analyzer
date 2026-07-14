import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import CurrencyInput from "./CurrencyInput";
import { formatCurrency } from "../utils/formatCurrency";
import { parseRepairItems, sumRepairItems } from "../utils/repairBreakdown";

export default function RepairBreakdown({
  car,
  apiBase = "",
  readOnly = false,
  onTotalChange,
  className = "",
  hideSummary = false,
  hideTotal = false,
}) {
  const [items, setItems] = useState(() => parseRepairItems(car));
  const saveTimer = useRef(null);
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  useEffect(() => {
    const parsed = parseRepairItems(car);
    setItems(parsed);
    onTotalChange?.(sumRepairItems(parsed));
  }, [car?.id, car?.repair_breakdown, car?.repair_details, onTotalChange]);

  const persist = (nextItems) => {
    if (readOnly || !car?.id) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await axios.patch(
          `${apiBase}/api/vehicle/${car.id}/repair`,
          { repair_items: nextItems },
          { headers }
        );
      } catch (err) {
        console.error("Failed to save repair breakdown:", err);
      }
    }, 500);
  };

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              [field]: field === "cost" ? Math.max(0, Number(value) || 0) : value,
            }
          : item
      );
      onTotalChange?.(sumRepairItems(next));
      persist(next);
      return next;
    });
  };

  const summary = String(car.repair_details || "").trim();
  const hasSummary = summary.length > 0;
  const hasItems = items.length > 0;

  if (!hasSummary && !hasItems) {
    return (
      <p className={`text-sm leading-relaxed text-slate-600 ${className}`}>
        No repair items identified.
      </p>
    );
  }

  const itemList = hasItems ? (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${car?.id || "car"}-repair-${index}`}
          className="flex items-start gap-2 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 sm:gap-3"
        >
          <span className="mt-2 shrink-0 text-slate-400">•</span>
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
          <CurrencyInput
            readOnly={readOnly}
            value={item.cost}
            onChange={(value) => updateItem(index, "cost", value)}
            inputClassName="w-24 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm font-semibold tabular-nums text-slate-800 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20 disabled:bg-slate-50 sm:w-28"
          />
        </li>
      ))}
      {!hideTotal && (
        <li className="flex items-center justify-between pt-1 text-sm font-semibold text-slate-700">
          <span>Total repair</span>
          <span className="tabular-nums">{formatCurrency(sumRepairItems(items))}</span>
        </li>
      )}
    </ul>
  ) : null;

  return (
    <div className={`space-y-4 ${className}`}>
      {hasSummary && !hideSummary && (
        <p className="text-sm leading-relaxed text-slate-600">{summary}</p>
      )}
      {hasSummary && !hideSummary && hasItems && <div className="border-t border-slate-100" />}
      {itemList}
    </div>
  );
}
