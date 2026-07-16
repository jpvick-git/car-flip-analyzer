import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  Target,
  Clock,
  TrendingUp,
  Sparkles,
  Wallet,
  Percent,
  ArrowRight,
  ArrowLeft,
  BarChart3,
} from "lucide-react";
import { formatCurrency } from "../utils/formatCurrency";
import { formatSignedCurrency } from "../utils/dealLifecycle";
import { formatVehicleTitle } from "../utils/vehicleName";

const API = process.env.REACT_APP_API_BASE_URL ?? "";

export default function Portfolio() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/api/portfolio/summary`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setSummary(res.data);
      } catch (err) {
        console.error(err);
        setError("Failed to load your portfolio.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center bg-brand-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading portfolio…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-2 bg-brand-bg px-6 text-center">
        <p className="text-lg font-semibold text-brand-navy">Something went wrong</p>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  const profit = summary.realized_profit_total || 0;
  const soldCount = summary.sold_count || 0;
  const hasData = soldCount > 0 || (summary.active_count || 0) > 0;
  const dealer = summary.business_type === "dealer";
  const unitWord = dealer ? "unit" : "flip";

  return (
    <main className="relative min-h-screen bg-brand-bg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-white via-brand-bg/80 to-transparent" />

      <div className="relative w-full px-3 py-5 sm:px-4 sm:py-6 lg:px-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700"
        >
          <ArrowLeft size={16} className="transition group-hover:-translate-x-0.5" />
          Back to Dashboard
        </button>

        <div className="mb-6">
          <p className="text-sm font-medium text-blue-600">
            {dealer ? "Your lot" : "Your flip business"}
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
            Portfolio
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">
            {soldCount > 0
              ? `${soldCount} ${unitWord}${soldCount === 1 ? "" : "s"} sold · ${summary.active_count || 0} on lot`
              : "Track your real outcomes to build your scoreboard."}
          </p>
        </div>

        {!hasData ? (
          <EmptyState onBrowse={() => navigate("/")} />
        ) : (
          <>
            {/* Profit + Accuracy side by side */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* PROFIT */}
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                  <Wallet size={16} className="text-emerald-600" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Money made
                  </h2>
                </div>
                <div className="p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Realized profit
                  </p>
                  <p
                    className={`text-4xl font-extrabold tabular-nums ${
                      profit >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {formatSignedCurrency(profit)}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Stat
                      icon={Percent}
                      label="Avg ROI"
                      value={summary.avg_roi != null ? `${summary.avg_roi}%` : "—"}
                    />
                    <Stat
                      icon={Target}
                      label="Win rate"
                      value={summary.win_rate != null ? `${summary.win_rate}%` : "—"}
                    />
                    <Stat
                      icon={Wallet}
                      label="Total invested"
                      value={formatCurrency(summary.total_invested || 0)}
                    />
                    <Stat
                      icon={Clock}
                      label="Avg days to sell"
                      value={summary.avg_days_to_sell != null ? `${summary.avg_days_to_sell}d` : "—"}
                    />
                  </div>
                </div>
              </section>

              {/* ACCURACY — you vs the AI */}
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                  <Sparkles size={16} className="text-blue-600" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    You vs the app
                  </h2>
                </div>
                <div className="p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Avg profit prediction error
                  </p>
                  <p className="text-4xl font-extrabold tabular-nums text-slate-900">
                    {summary.avg_profit_error != null
                      ? `±${formatCurrency(summary.avg_profit_error)}`
                      : "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    How close the app's predicted profit lands to your real result.
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Stat
                      icon={Target}
                      label="BUY hit rate"
                      value={summary.buy_hit_rate != null ? `${summary.buy_hit_rate}%` : "—"}
                    />
                    <Stat
                      icon={TrendingUp}
                      label="BUY-called flips"
                      value={String(summary.buy_called || 0)}
                    />
                  </div>

                  {summary.avg_profit_error == null && (
                    <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                      Log a few sold deals to unlock your accuracy score.
                    </p>
                  )}
                </div>
              </section>
            </div>

            {/* Dealer/lot performance */}
            {dealer && (
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Gross split */}
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                    <Wallet size={16} className="text-emerald-600" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Gross split
                    </h2>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-3">
                      <Stat
                        icon={TrendingUp}
                        label="Front gross"
                        value={formatSignedCurrency(summary.front_gross_total || 0)}
                      />
                      <Stat
                        icon={Sparkles}
                        label="Back gross"
                        value={formatSignedCurrency(summary.back_gross_total || 0)}
                      />
                      <Stat
                        icon={TrendingUp}
                        label="Avg front / unit"
                        value={
                          summary.avg_front_gross != null
                            ? formatSignedCurrency(summary.avg_front_gross)
                            : "—"
                        }
                      />
                      <Stat
                        icon={Target}
                        label="Avg recon miss"
                        value={
                          summary.avg_recon_variance != null
                            ? formatSignedCurrency(summary.avg_recon_variance)
                            : "—"
                        }
                      />
                    </div>
                  </div>
                </section>

                {/* Aging tracker */}
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                    <Clock size={16} className="text-amber-600" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Aging on lot
                    </h2>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3">
                      <AgeBucket
                        label={`Fresh (<${summary.target_turn_days}d)`}
                        count={summary.aging_buckets?.fresh || 0}
                        tone="emerald"
                      />
                      <AgeBucket
                        label={`Aging (${summary.target_turn_days}-${summary.max_turn_days}d)`}
                        count={summary.aging_buckets?.aging || 0}
                        tone="amber"
                      />
                      <AgeBucket
                        label={`Stale (>${summary.max_turn_days}d)`}
                        count={summary.aging_buckets?.stale || 0}
                        tone="red"
                      />
                    </div>
                    {summary.units_over_max_turn > 0 ? (
                      <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
                        {summary.units_over_max_turn} unit
                        {summary.units_over_max_turn === 1 ? "" : "s"} past your{" "}
                        {summary.max_turn_days}-day act-by window — time to move them.
                      </p>
                    ) : (
                      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                        Nothing stale — your lot is turning within target.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* Recent sold — predicted vs actual */}
            <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                <BarChart3 size={16} className="text-slate-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Recent flips
                </h2>
              </div>

              {summary.recent_sold?.length ? (
                <div className="divide-y divide-slate-100">
                  {summary.recent_sold.map((deal) => (
                    <SoldRow key={deal.id} deal={deal} onOpen={() => navigate(`/vehicle/${deal.public_id}`)} />
                  ))}
                </div>
              ) : (
                <p className="px-5 py-6 text-sm text-slate-500">
                  No closed flips yet. Mark a deal as sold and log the sale price to see it here.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-slate-400">
        <Icon size={13} />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums text-slate-800">{value}</p>
    </div>
  );
}

function AgeBucket({ label, count, tone }) {
  const tones = {
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-700",
    red: "border-red-100 bg-red-50/70 text-red-700",
  };
  return (
    <div className={`rounded-2xl border p-3 text-center ${tones[tone] || tones.emerald}`}>
      <p className="text-2xl font-extrabold tabular-nums">{count}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide leading-tight">
        {label}
      </p>
    </div>
  );
}

function SoldRow({ deal, onOpen }) {
  const realized = deal.realized_profit ?? 0;
  const positive = realized >= 0;
  const predicted = deal.predicted_profit;
  const delta = predicted != null ? realized - predicted : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-slate-50"
    >
      <img
        src={deal.image_url || "https://placehold.co/80x60?text=No+Image"}
        alt=""
        className="h-12 w-16 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-navy">
          {formatVehicleTitle(deal)}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          Bought {formatCurrency(deal.actual_purchase_price)} · Repair{" "}
          {formatCurrency(deal.actual_repair_cost)} · Sold{" "}
          {formatCurrency(deal.actual_sale_price)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-base font-bold tabular-nums ${
            positive ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {formatSignedCurrency(realized)}
        </p>
        {delta != null && (
          <p
            className={`text-[11px] font-medium ${
              delta >= 0 ? "text-emerald-500" : "text-amber-600"
            }`}
          >
            {delta >= 0 ? "beat est. " : "under est. "}
            {formatSignedCurrency(Math.abs(delta))}
          </p>
        )}
      </div>
    </button>
  );
}

function EmptyState({ onBrowse }) {
  return (
    <div className="flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-xl shadow-slate-200/70">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-bg text-slate-400">
        <Trophy size={26} />
      </div>
      <p className="text-xl font-bold tracking-tight text-brand-navy">No flips tracked yet</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        Mark a vehicle as bought, then log the sale price when it sells. Your profit and
        accuracy scoreboard builds itself from there.
      </p>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
      >
        Go to inventory
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
