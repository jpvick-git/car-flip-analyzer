import React, { useState } from "react";
import axios from "axios";
import { AlertTriangle, RefreshCw, Wrench } from "lucide-react";
import {
  hasKnownIssuesData,
  parseKnownIssues,
  parseWearItems,
} from "../utils/knownIssues";

function confidenceClass(confidence) {
  const level = String(confidence || "").toLowerCase();
  if (level === "high") return "bg-emerald-100 text-emerald-700";
  if (level === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function IssueList({ title, items, labelKey }) {
  if (!items.length) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h4>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item, index) => {
          const label = item[labelKey] || item.issue || item.item || "Unknown";
          return (
            <li
              key={`${labelKey}-${index}`}
              className="flex min-h-[5.5rem] flex-col rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{label}</p>
                {item.confidence ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confidenceClass(item.confidence)}`}
                  >
                    {item.confidence}
                  </span>
                ) : (
                  <span className="invisible shrink-0 rounded-full px-2 py-0.5 text-[10px]">—</span>
                )}
              </div>
              <dl className="mt-auto grid gap-1 pt-2 text-xs text-slate-500 sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium text-slate-600">Typical mileage: </dt>
                  <dd className="inline">{item.typical_mileage || "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-slate-600">Est. cost: </dt>
                  <dd className="inline">{item.cost_range || "—"}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function KnownIssuesCard({
  car,
  apiBase = "",
  readOnly = false,
  onUpdate,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const knownIssues = parseKnownIssues(car);
  const wearItems = parseWearItems(car);
  const hasData = hasKnownIssuesData(car);
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const refresh = async () => {
    if (readOnly || !car?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(
        `${apiBase}/api/vehicle/${car.id}/known_issues`,
        {},
        { headers }
      );
      onUpdate?.(res.data);
    } catch (err) {
      console.error("Known issues lookup failed:", err);
      setError("Could not load platform issues. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-600">
              <AlertTriangle size={13} />
            </span>
            Ownership Risks
          </h3>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
            What Could Cost You Later
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {hasData ? "Refresh" : "Check issues"}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 shrink-0 text-sm text-red-600">{error}</p>
      )}

      <div className="flex-1">
      {loading && !hasData ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw size={14} className="animate-spin" />
          Looking up known issues for this platform…
        </div>
      ) : hasData ? (
        <div className="space-y-5">
          {car.reliability_summary && (
            <p className="text-sm leading-relaxed text-slate-600">
              {car.reliability_summary}
            </p>
          )}
          <IssueList title="Common Problems" items={knownIssues} labelKey="issue" />
          <IssueList title="Wear & Maintenance" items={wearItems} labelKey="item" />
          {!knownIssues.length && !wearItems.length && car.reliability_summary && (
            <p className="text-sm text-slate-500">
              No specific platform issues flagged for this year/make/model.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
            <Wrench size={14} className="mt-0.5 shrink-0 text-slate-400" />
            Long-term ownership costs and typical wear items for this year, make, and model
            — separate from accident damage. Budget these beyond the visible repair estimate.
          </p>
          {!readOnly && (
            <p className="text-xs text-slate-400">
              Click &ldquo;Check issues&rdquo; to run a quick text lookup.
            </p>
          )}
        </div>
      )}
      </div>

      <p className="mt-4 shrink-0 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
        Based on model training data, not live NHTSA/TSB lookup. Treat low-confidence items as
        leads for your own research, not facts about this specific vehicle.
      </p>
    </section>
  );
}
