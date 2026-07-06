import { Wrench } from "lucide-react";
import { formatCurrency } from "../utils/formatCurrency";
import { extractRepairHighlights } from "../utils/flipDecision";
import { parseRepairItems, sumRepairItems } from "../utils/repairBreakdown";
import RepairBreakdown from "./RepairBreakdown";
import { costLabel, isPrivateParty } from "../utils/vehicleSource";

function confidenceBadgeClass(level) {
  const l = String(level || "").toLowerCase();
  if (l === "high") return "bg-emerald-100 text-emerald-700";
  if (l === "medium") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export default function RepairAnalysisCard({
  car,
  apiBase = "",
  readOnly = false,
  onTotalChange,
  repairTotal,
}) {
  const { highlights, notes, confidence } = extractRepairHighlights(car);
  const items = parseRepairItems(car);
  const total = repairTotal ?? (items.length ? sumRepairItems(items) : Number(car?.repair_estimate || car?.ai_repair_estimate || 0));
  const hasData = Boolean(car?.repair_details || car?.repair_breakdown || total > 0);

  if (!hasData) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600">
            <Wrench size={13} />
          </span>
          {isPrivateParty(car) ? "Recon Analysis" : "AI Repair Analysis"}
        </h3>
        <p className="text-sm text-slate-400">No repair analysis available yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600">
          <Wrench size={13} />
        </span>
        {isPrivateParty(car) ? "Recon Analysis" : "AI Repair Analysis"}
      </h3>

      {/* Summary header */}
      <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
          Repair Summary
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-amber-600">Estimated {costLabel(car)}</p>
            <p className="text-3xl font-extrabold tabular-nums text-amber-800">
              {formatCurrency(total)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-amber-600">Confidence</p>
            <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${confidenceBadgeClass(confidence)}`}>
              {confidence}
            </span>
          </div>
        </div>
      </div>

      {/* Likely repairs */}
      {highlights.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Likely Repairs
          </p>
          <ul className="space-y-1.5">
            {highlights.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-slate-400">–</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick notes */}
      {notes.length > 0 && (
        <div className="mb-4 space-y-1">
          {notes.map((note, i) => (
            <p key={i} className="text-sm text-slate-500">{note}</p>
          ))}
        </div>
      )}

      {/* Editable line items */}
      {items.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Line Items
          </p>
          <RepairBreakdown
            car={car}
            apiBase={apiBase}
            readOnly={readOnly}
            onTotalChange={onTotalChange}
          />
        </div>
      )}

      {/* Fallback paragraph if no line items but has summary text */}
      {items.length === 0 && car?.repair_details && highlights.length === 0 && (
        <p className="text-sm leading-relaxed text-slate-600">{car.repair_details}</p>
      )}
    </section>
  );
}
