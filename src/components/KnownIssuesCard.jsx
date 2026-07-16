import React, { useState } from "react";
import axios from "axios";
import { AlertTriangle, RefreshCw, Wrench, ChevronDown, ChevronUp } from "lucide-react";
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

function topIssues(knownIssues, wearItems, limit = 5) {
  const combined = [
    ...knownIssues.map((i) => ({ ...i, kind: "issue" })),
    ...wearItems.map((i) => ({ ...i, kind: "wear" })),
  ];
  return combined.slice(0, limit);
}

function IssueRow({ item }) {
  const label = item.issue || item.item || "Unknown";
  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {item.confidence && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confidenceClass(item.confidence)}`}
          >
            {item.confidence}
          </span>
        )}
      </div>
      {item.cost_range && (
        <p className="mt-1 text-xs text-slate-500">Est. cost: {item.cost_range}</p>
      )}
    </li>
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
  const [expanded, setExpanded] = useState(false);

  const knownIssues = parseKnownIssues(car);
  const wearItems = parseWearItems(car);
  const hasData = hasKnownIssuesData(car);
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const preview = topIssues(knownIssues, wearItems, 4);
  const totalCount = knownIssues.length + wearItems.length;

  const refresh = async () => {
    if (readOnly || !car?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(
        `${apiBase}/api/vehicle/${car.public_id}/known_issues`,
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-600">
              <AlertTriangle size={13} />
            </span>
            Ownership Risks
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">What could cost you later on this platform</p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {hasData ? "Refresh" : "Check"}
          </button>
        )}
      </div>

      <div className="p-5">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {loading && !hasData ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw size={14} className="animate-spin" />
            Looking up platform issues…
          </div>
        ) : hasData ? (
          <>
            {car.reliability_summary && !expanded && (
              <p className="mb-3 line-clamp-2 text-sm text-slate-600">{car.reliability_summary}</p>
            )}

            {!expanded && preview.length > 0 && (
              <ul className="space-y-2">
                {preview.map((item, i) => (
                  <IssueRow key={`preview-${i}`} item={item} />
                ))}
              </ul>
            )}

            {expanded && (
              <div className="space-y-4">
                {car.reliability_summary && (
                  <p className="text-sm leading-relaxed text-slate-600">{car.reliability_summary}</p>
                )}
                {knownIssues.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Common Problems
                    </h4>
                    <ul className="space-y-2">
                      {knownIssues.map((item, i) => (
                        <IssueRow key={`ki-${i}`} item={item} />
                      ))}
                    </ul>
                  </div>
                )}
                {wearItems.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Wear & Maintenance
                    </h4>
                    <ul className="space-y-2">
                      {wearItems.map((item, i) => (
                        <IssueRow key={`wear-${i}`} item={item} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {totalCount > preview.length && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {expanded ? (
                  <>
                    <ChevronUp size={16} /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} /> View all ownership risks ({totalCount})
                  </>
                )}
              </button>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <Wrench size={14} className="mt-0.5 shrink-0 text-slate-400" />
              Long-term platform risks — separate from accident damage. Budget beyond visible repair.
            </p>
            {!readOnly && (
              <p className="text-xs text-slate-400">Click Check to run a quick lookup.</p>
            )}
          </div>
        )}

        <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
          Model-based research — verify before bidding.
        </p>
      </div>
    </section>
  );
}
