import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calculator, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";
import { useUserSettings } from "../context/UserSettingsContext";
import { isDealer } from "../utils/businessMode";
import { calculateMaxBuy, grossAtPrice } from "../utils/lotBuyCalculator";

function currency(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString()}`;
}

function NumberField({ label, value, onChange, prefix = "$", suffix }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl border border-slate-300 py-2.5 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            prefix ? "pl-7" : "pl-3"
          } ${suffix ? "pr-12" : "pr-3"}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Appraise() {
  const navigate = useNavigate();
  const { settings, loading } = useUserSettings();
  const dealer = isDealer(settings);

  const [retail, setRetail] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (loading) return;
    setProfile({
      targetFrontGross: settings.target_front_gross,
      recon: settings.default_recon,
      auctionFee: settings.auction_fee_default,
      transport: settings.transport_cost_default,
      dealShield: settings.deal_shield_fee,
      floorPlanPerDay: settings.floor_plan_cost_per_day,
      turnDays: settings.target_turn_days,
    });
  }, [loading, settings]);

  const setP = (key, val) => setProfile((prev) => ({ ...prev, [key]: val }));

  const resetProfile = () => {
    setProfile({
      targetFrontGross: settings.target_front_gross,
      recon: settings.default_recon,
      auctionFee: settings.auction_fee_default,
      transport: settings.transport_cost_default,
      dealShield: settings.deal_shield_fee,
      floorPlanPerDay: settings.floor_plan_cost_per_day,
      turnDays: settings.target_turn_days,
    });
  };

  const result = useMemo(() => {
    if (!profile) return null;
    return calculateMaxBuy({ retail, ...profile });
  }, [retail, profile]);

  const grossPreview = useMemo(() => {
    if (!profile || !buyPrice) return null;
    return grossAtPrice({ retail, buyPrice, ...profile });
  }, [retail, buyPrice, profile]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!dealer) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Calculator size={32} className="mx-auto text-slate-400" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">Buy Calculator</h1>
          <p className="mt-2 text-sm text-slate-500">
            The lot buy calculator is part of dealer mode. Switch your business type to
            "Used Car Lot" in preferences to unlock it.
          </p>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open Preferences
          </button>
        </div>
      </main>
    );
  }

  const belowFloor = result?.belowFloor;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to inventory
        </button>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <Calculator size={24} className="text-slate-500" />
          Buy Calculator
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the retail you can realistically hit. We back out your cost stack to show the
          most you can pay and still make your gross.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Inputs */}
        <div className="space-y-5 lg:col-span-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">This Unit</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField label="Target retail" value={retail} onChange={setRetail} />
              <NumberField
                label="Recon (this unit)"
                value={profile.recon}
                onChange={(v) => setP("recon", v)}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Cost Stack</h2>
              <button
                type="button"
                onClick={resetProfile}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <RotateCcw size={12} />
                Reset to defaults
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField
                label="Target front gross"
                value={profile.targetFrontGross}
                onChange={(v) => setP("targetFrontGross", v)}
              />
              <NumberField
                label="Auction fees"
                value={profile.auctionFee}
                onChange={(v) => setP("auctionFee", v)}
              />
              <NumberField
                label="Transport"
                value={profile.transport}
                onChange={(v) => setP("transport", v)}
              />
              <NumberField
                label="DealShield / protection"
                value={profile.dealShield}
                onChange={(v) => setP("dealShield", v)}
              />
              <NumberField
                label="Floor plan / day"
                value={profile.floorPlanPerDay}
                onChange={(v) => setP("floorPlanPerDay", v)}
              />
              <NumberField
                label="Turn window"
                value={profile.turnDays}
                onChange={(v) => setP("turnDays", v)}
                prefix={null}
                suffix="days"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Check a price <span className="font-normal text-slate-400">(optional)</span>
            </h2>
            <NumberField
              label="If you buy at…"
              value={buyPrice}
              onChange={setBuyPrice}
            />
            {grossPreview && (
              <div
                className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
                  grossPreview.gross >= 0
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-red-700"
                }`}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  {grossPreview.gross >= 0 ? (
                    <TrendingUp size={15} />
                  ) : (
                    <TrendingDown size={15} />
                  )}
                  Projected front gross
                </span>
                <span className="text-base font-bold tabular-nums">
                  {currency(grossPreview.gross)}
                </span>
              </div>
            )}
          </section>
        </div>

        {/* Result */}
        <div className="lg:col-span-2">
          <div className="sticky top-20 space-y-4">
            <div
              className={`rounded-2xl border p-6 text-center shadow-sm ${
                belowFloor
                  ? "border-red-200 bg-red-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Max buy
              </p>
              <p
                className={`mt-1 text-4xl font-extrabold tabular-nums ${
                  belowFloor ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {result ? currency(result.maxBuy) : "$0"}
              </p>
              {belowFloor ? (
                <p className="mt-2 text-xs font-medium text-red-600">
                  Costs exceed retail at your target gross — pass or find cheaper.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Pay this or less to make {currency(profile.targetFrontGross)} front gross.
                </p>
              )}
            </div>

            {result && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  How we got there
                </h3>
                <dl className="space-y-2 text-sm">
                  <Row label="Target retail" value={currency(result.retail)} />
                  <Row
                    label="− Target front gross"
                    value={currency(result.targetFrontGross)}
                  />
                  <Row label="− Recon" value={currency(result.costStack.recon)} />
                  <Row label="− Auction fees" value={currency(result.costStack.auctionFee)} />
                  <Row label="− Transport" value={currency(result.costStack.transport)} />
                  <Row
                    label="− DealShield"
                    value={currency(result.costStack.dealShield)}
                  />
                  <Row
                    label={`− Holding (${profile.turnDays}d)`}
                    value={currency(result.costStack.holding)}
                  />
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900">
                    <dt>Max buy</dt>
                    <dd className="tabular-nums">{currency(result.maxBuy)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
