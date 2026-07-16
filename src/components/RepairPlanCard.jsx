import React, { useState } from "react";
import axios from "axios";
import {
  Wrench,
  RefreshCw,
  Package,
  Hammer,
  Building2,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from "lucide-react";
import RepairBreakdown from "./RepairBreakdown";
import {
  parseRepairPlan,
  hasRepairPlanData,
  formatRepairTimeline,
  inferDiyAndShopTasks,
  getRepairDifficultyDescription,
  difficultyStyles,
  formatPartPrice,
  buildAllInRepairBreakdown,
} from "../utils/repairPlan";
import { formatCurrency } from "../utils/formatCurrency";
import { isPrivateParty } from "../utils/vehicleSource";

function MetricCell({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

export default function RepairPlanCard({
  car,
  apiBase = "",
  readOnly = false,
  onUpdate,
  onTotalChange,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiNotesOpen, setAiNotesOpen] = useState(false);

  const plan = parseRepairPlan(car);
  const allIn = buildAllInRepairBreakdown(car);
  const hasPlan = hasRepairPlanData(car);
  const hasRepairContent = hasPlan || allIn.total > 0 || Boolean(car?.repair_details);
  const styles = difficultyStyles(plan.repair_difficulty_label);
  const { diyTasks, shopTasks } = inferDiyAndShopTasks(plan);
  const isPrivate = isPrivateParty(car);
  const aiNotes = String(car?.repair_details || "").trim();

  const refresh = async () => {
    if (readOnly || !car?.id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const res = await axios.post(`${apiBase}/api/vehicle/${car.public_id}/repair_plan`, {}, { headers });
      onUpdate?.(res.data);
    } catch (err) {
      console.error("Repair plan refresh failed:", err);
      setError(err.response?.data?.detail || "Could not refresh repair plan.");
    } finally {
      setLoading(false);
    }
  };

  const scoreDisplay =
    plan.repair_difficulty_score != null
      ? `${plan.repair_difficulty_label} · ${plan.repair_difficulty_score}/10`
      : plan.repair_difficulty_label || "Not assessed";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <Wrench size={13} />
              </span>
              Repair Plan
            </h3>
            <p className="mt-1 text-[11px] text-slate-400">
              How hard is the fix, what parts you need, and what it should cost
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {!hasRepairContent ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-600">No repair plan yet.</p>
            <p className="mt-1 text-xs text-slate-400">
              {isPrivate
                ? "Refresh after photos finish uploading."
                : "Refresh after photos finish downloading."}
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Generate Repair Plan
              </button>
            )}
          </div>
        ) : (
          <>
            {allIn.total > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  All-In Shop Estimate
                </p>
                <p className="text-3xl font-extrabold tabular-nums text-amber-900">
                  {formatCurrency(allIn.total)}
                </p>
                <p className="mt-1 text-xs text-amber-800/80">
                  Parts + labor + paint at body shop rates — used in profit &amp; max bid math.
                </p>
                {allIn.partsOnlyLow > 0 && (
                  <p className="mt-2 text-xs text-amber-800">
                    Parts-only to order:{" "}
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(allIn.partsOnlyLow)}
                      {allIn.partsOnlyHigh > allIn.partsOnlyLow
                        ? ` – ${formatCurrency(allIn.partsOnlyHigh)}`
                        : ""}
                    </span>
                  </p>
                )}
              </div>
            )}

            {hasPlan && (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${styles.badge}`}>
                    {scoreDisplay}
                  </span>
                  {plan.diy_friendly && (
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                      DIY: {plan.diy_friendly}
                    </span>
                  )}
                </div>

                {plan.repair_difficulty_label && (
                  <p className="mb-4 text-sm text-slate-600">
                    {getRepairDifficultyDescription(plan.repair_difficulty_label)}
                  </p>
                )}

                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricCell
                    label="Est. Labor"
                    value={
                      plan.estimated_labor_hours != null
                        ? `${Math.round(plan.estimated_labor_hours)} hrs`
                        : "—"
                    }
                  />
                  <MetricCell label="Downtime" value={formatRepairTimeline(plan)} />
                  <MetricCell label="Parts" value={plan.parts_availability || "—"} />
                  <MetricCell label="DIY Friendly" value={plan.diy_friendly || "—"} />
                </div>

                {plan.repair_plan_summary && (
                  <p className="mb-4 text-sm leading-relaxed text-slate-600">
                    {plan.repair_plan_summary}
                  </p>
                )}
              </>
            )}

            {(allIn.hasLineItems || car?.repair_breakdown) && (
              <div className="mb-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <ListChecks size={12} />
                  Repair Breakdown
                </h4>
                <RepairBreakdown
                  car={car}
                  apiBase={apiBase}
                  readOnly={readOnly}
                  onTotalChange={onTotalChange}
                  hideSummary
                  hideTotal
                />
              </div>
            )}

            {plan.parts_needed.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Package size={12} />
                  Parts Needed
                  <span className="font-normal normal-case text-slate-400">(parts-only)</span>
                </h4>
                <ul className="space-y-2">
                  {plan.parts_needed.slice(0, 8).map((part, i) => (
                    <li
                      key={`part-${i}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {part.name}
                          {part.category && part.category !== "General" && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                              {part.category}
                            </span>
                          )}
                        </p>
                        {part.notes && (
                          <p className="mt-0.5 text-xs text-slate-500">{part.notes}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-slate-700">
                        {formatPartPrice(part)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diyTasks.length > 0 && (
              <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  <Hammer size={12} />
                  DIY Tasks
                </h4>
                <ul className="space-y-1">
                  {diyTasks.map((task, i) => (
                    <li key={`diy-${i}`} className="text-xs text-emerald-900">
                      · {task}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(shopTasks.length > 0 || plan.shop_services_needed.length > 0) && (
              <div className="mb-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Building2 size={12} />
                  Shop Services
                </h4>
                <ul className="space-y-1.5">
                  {(shopTasks.length > 0 ? shopTasks : plan.shop_services_needed.map((s) => s.name)).map(
                    (name, i) => {
                      const svc =
                        plan.shop_services_needed.find((s) => s.name === name) || { name };
                      return (
                        <li key={`svc-${i}`} className="text-sm text-slate-700">
                          · {name}
                          {svc.notes && (
                            <span className="block text-xs text-slate-500">{svc.notes}</span>
                          )}
                        </li>
                      );
                    }
                  )}
                </ul>
              </div>
            )}

            {aiNotes && (
              <div className="border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setAiNotesOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  {aiNotesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  View AI repair notes
                </button>
                {aiNotesOpen && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{aiNotes}</p>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
