import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { collectDealRisks, groupDealRisks } from "../utils/dealRisks";
import { parseRedFlags } from "../utils/vehicleSource";

const PRIORITY_LIMIT = 6;

export default function DealRisksCard({ vehicle, decision, flipMetrics, transportCost }) {
  const [expanded, setExpanded] = useState(false);

  const allRisks = collectDealRisks(vehicle, { decision, flipMetrics, transportCost });
  const redFlags = parseRedFlags(vehicle);
  const hasRisks = allRisks.length > 0;

  if (!hasRisks && redFlags.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No major red flags detected from the listing.
      </p>
    );
  }

  const visibleRisks = expanded ? allRisks : allRisks.slice(0, PRIORITY_LIMIT);
  const grouped = groupDealRisks(visibleRisks);
  const hiddenCount = Math.max(0, allRisks.length - PRIORITY_LIMIT);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            <AlertTriangle size={13} />
          </span>
          Deal Risks
        </h3>
        <p className="mt-1 text-[11px] text-slate-400">
          Top things that could kill this flip
        </p>
      </div>

      <div className="space-y-4 p-5">
        {Object.entries(grouped).map(([category, items]) => {
          if (!items.length) return null;
          return (
            <div key={category}>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {category}
              </h4>
              <ul className="space-y-1.5">
                {items.map((risk, i) => (
                  <li
                    key={`${category}-${i}`}
                    className="flex gap-2 text-sm leading-relaxed text-slate-700"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {risk.message}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-green hover:text-brand-green-dark"
          >
            {expanded ? (
              <>
                <ChevronUp size={16} /> Show fewer warnings
              </>
            ) : (
              <>
                <ChevronDown size={16} /> View all warnings ({allRisks.length})
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
