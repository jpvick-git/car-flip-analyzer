import React, { useState } from "react";
import axios from "axios";
import {
  Wrench,
  RefreshCw,
  Clock,
  Package,
  AlertTriangle,
  Hammer,
  Building2,
} from "lucide-react";
import {
  parseRepairPlan,
  hasRepairPlanData,
  formatRepairTimeline,
  inferDiyAndShopTasks,
  getRepairDifficultyDescription,
  difficultyStyles,
  formatPartPrice,
} from "../utils/repairPlan";
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
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const plan = parseRepairPlan(car);
  const hasData = hasRepairPlanData(car);
  const styles = difficultyStyles(plan.repair_difficulty_label);
  const { diyTasks, shopTasks } = inferDiyAndShopTasks(plan);
  const isPrivate = isPrivateParty(car);

  const refresh = async () => {
    if (readOnly || !car?.id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const res = await axios.post(`${apiBase}/api/vehicle/${car.id}/repair_plan`, {}, { headers });
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
              Can you actually fix this and flip it on time?
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
              {loading ? "Refreshing…" : "Refresh Repair Plan"}
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {!hasData ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-600">
              No repair plan yet for this vehicle.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {isPrivate
                ? "Refresh after photos finish uploading to get a recon plan."
                : "Refresh after photos finish downloading to get parts, labor, and timeline estimates."}
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${styles.badge}`}>
                {scoreDisplay}
              </span>
              {plan.diy_friendly && (
                <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
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
              <MetricCell
                label="Downtime"
                value={formatRepairTimeline(plan)}
                sub={
                  plan.estimated_repair_days_max > 21 ? "Long flip hold" : undefined
                }
              />
              <MetricCell
                label="Parts"
                value={plan.parts_availability || "—"}
              />
              <MetricCell
                label="DIY Friendly"
                value={plan.diy_friendly || "—"}
              />
            </div>

            {plan.repair_plan_summary && (
              <p className="mb-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
                {plan.repair_plan_summary}
              </p>
            )}

            {plan.parts_needed.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Package size={12} />
                  Parts Needed
                </h4>
                <ul className="space-y-2">
                  {plan.parts_needed.slice(0, 8).map((part, i) => (
                    <li
                      key={`part-${i}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{part.name}</p>
                        {part.notes && (
                          <p className="mt-0.5 text-xs text-slate-500">{part.notes}</p>
                        )}
                        {part.availability && (
                          <p className="mt-1 text-[10px] font-semibold uppercase text-slate-400">
                            Availability: {part.availability}
                          </p>
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

            {(shopTasks.length > 0 || diyTasks.length > 0) && (
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                {diyTasks.length > 0 && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
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
                {shopTasks.length > 0 && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                      <Building2 size={12} />
                      Shop Tasks
                    </h4>
                    <ul className="space-y-1">
                      {shopTasks.map((task, i) => (
                        <li key={`shop-${i}`} className="text-xs text-indigo-900">
                          · {task}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {plan.shop_services_needed.length > 0 && shopTasks.length === 0 && (
              <div className="mb-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Building2 size={12} />
                  Shop Services
                </h4>
                <ul className="space-y-1.5">
                  {plan.shop_services_needed.map((svc, i) => (
                    <li key={`svc-${i}`} className="text-sm text-slate-700">
                      · {svc.name}
                      {svc.required === false && (
                        <span className="ml-1 text-xs text-slate-400">(recommended)</span>
                      )}
                      {svc.notes && (
                        <span className="block text-xs text-slate-500">{svc.notes}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(plan.repair_plan_warnings.length > 0 || plan.hidden_damage_risks.length > 0) && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-3">
                <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  <AlertTriangle size={12} />
                  Watch Out For
                </h4>
                <ul className="space-y-1">
                  {plan.repair_plan_warnings.slice(0, 5).map((w, i) => (
                    <li key={`warn-${i}`} className="text-xs leading-relaxed text-amber-900">
                      · {w}
                    </li>
                  ))}
                  {plan.hidden_damage_risks.slice(0, 4).map((risk, i) => (
                    <li key={`risk-${i}`} className="text-xs leading-relaxed text-amber-900">
                      · Verify {typeof risk === "string" ? risk.toLowerCase() : risk} before bidding
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
