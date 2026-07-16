import React, { useState } from "react";
import axios from "axios";
import { X, TrendingUp, TrendingDown, Trophy, Sparkles } from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import { formatCurrency } from "../utils/formatCurrency";
import { isPrivateParty, maxOfferLabel } from "../utils/vehicleSource";
import {
  computeRealizedProfit,
  computeAccuracy,
  formatSignedCurrency,
} from "../utils/dealLifecycle";

/**
 * One-tap-friendly outcome logger. Every actual field is prefilled with the
 * app's prediction so logging a real outcome is a quick confirm, not a chore.
 * On saving a sale it shows a "predicted vs actual" result — the payoff hook.
 */
export default function OutcomeLogModal({ car, apiBase = "", predictions = {}, onClose, onSaved }) {
  const isPrivate = isPrivateParty(car);
  const purchaseLabel = isPrivate ? "Actual Purchase Price" : "Winning Bid";

  const [purchase, setPurchase] = useState(
    numOr(car?.actual_purchase_price, predictions.maxBid)
  );
  const [repair, setRepair] = useState(
    numOr(car?.actual_repair_cost, predictions.repair)
  );
  const [sale, setSale] = useState(
    numOr(car?.actual_sale_price, predictions.resale)
  );
  const [transport, setTransport] = useState(
    numOr(car?.actual_transport_cost, 0)
  );
  const [notes, setNotes] = useState(car?.outcome_notes || "");
  const [saleTouched, setSaleTouched] = useState(car?.actual_sale_price != null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const preview = computeRealizedProfit({
    ...car,
    actual_purchase_price: purchase,
    actual_repair_cost: repair,
    actual_sale_price: saleTouched ? sale : null,
    actual_transport_cost: transport,
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        actual_purchase_price: toInt(purchase),
        actual_repair_cost: toInt(repair),
        actual_transport_cost: toInt(transport),
        outcome_notes: notes || null,
      };
      if (saleTouched) payload.actual_sale_price = toInt(sale);

      const res = await axios.patch(
        `${apiBase}/api/vehicle/${car.id}/outcome`,
        payload,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );

      const updated = res.data;
      onSaved?.(updated);

      // Show the payoff card when a sale was logged
      if (saleTouched) {
        setResult({
          realized: updated?.realized_profit ?? computeRealizedProfit(updated),
          accuracy: computeAccuracy(updated),
        });
      } else {
        onClose?.();
      }
    } catch (err) {
      console.error("Outcome save failed:", err);
      setError(err.response?.data?.detail || "Failed to save outcome.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <button
          onClick={() => onClose?.()}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={20} />
        </button>

        {result ? (
          <ResultView result={result} onClose={onClose} isPrivate={isPrivate} />
        ) : (
          <>
            <h2 className="pr-8 text-xl font-bold tracking-tight text-slate-900">
              Log deal outcome
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Confirm the real numbers. We prefilled them with the app's estimates.
            </p>

            <div className="mt-5 space-y-3">
              <OutcomeField
                label={purchaseLabel}
                predicted={predictions.maxBid}
                predictedLabel={maxOfferLabel(car)}
                value={purchase}
                onChange={setPurchase}
              />
              <OutcomeField
                label="Actual Repair Cost"
                predicted={predictions.repair}
                predictedLabel="Est. repair"
                value={repair}
                onChange={setRepair}
              />
              <OutcomeField
                label="Transport Cost"
                value={transport}
                onChange={setTransport}
              />
              <OutcomeField
                label={isPrivate ? "Actual Sale Price" : "Actual Sale Price"}
                predicted={predictions.resale}
                predictedLabel="Est. resale"
                value={sale}
                onChange={(v) => {
                  setSale(v);
                  setSaleTouched(true);
                }}
                highlight
                hint={!saleTouched ? "Set this to close out and score the deal" : null}
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything you learned on this flip…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            {preview != null && (
              <div
                className={`mt-4 flex items-center justify-between rounded-xl border px-4 py-3 ${
                  preview >= 0
                    ? "border-emerald-100 bg-emerald-50"
                    : "border-red-100 bg-red-50"
                }`}
              >
                <span
                  className={`flex items-center gap-1.5 text-sm font-semibold ${
                    preview >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {preview >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {saleTouched ? "Realized Profit" : "Profit so far"}
                </span>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    preview >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {formatSignedCurrency(preview)}
                </span>
              </div>
            )}

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => onClose?.()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save outcome"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OutcomeField({ label, predicted, predictedLabel, value, onChange, highlight, hint }) {
  const showPredicted = predicted != null && Number(predicted) > 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {showPredicted && (
          <button
            type="button"
            onClick={() => onChange(Number(predicted))}
            className="text-xs font-medium text-blue-600 transition hover:text-blue-700"
            title="Use the app's estimate"
          >
            {predictedLabel || "Predicted"}: {formatCurrency(predicted)}
          </button>
        )}
      </div>
      <CurrencyInput
        value={value}
        onChange={onChange}
        inputClassName={`w-full rounded-lg border px-3 py-2 text-sm font-semibold tabular-nums text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
          highlight ? "border-emerald-300 bg-emerald-50/40" : "border-slate-300"
        }`}
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function ResultView({ result, onClose, isPrivate }) {
  const { realized, accuracy } = result;
  const positive = (realized ?? 0) >= 0;
  const beat = accuracy?.betterThanApp;

  return (
    <div className="pt-2 text-center">
      <div
        className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${
          positive ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
        }`}
      >
        {positive ? <Trophy size={26} /> : <TrendingDown size={26} />}
      </div>

      <h2 className="text-xl font-bold tracking-tight text-slate-900">
        {positive ? "Deal closed" : "Deal logged"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {positive
          ? "Nice flip — it's on your scoreboard."
          : "Logged. Every outcome sharpens your next bid."}
      </p>

      <div
        className={`mt-4 rounded-xl border px-4 py-4 ${
          positive ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Realized Profit
        </p>
        <p
          className={`text-3xl font-extrabold tabular-nums ${
            positive ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {formatSignedCurrency(realized)}
        </p>
      </div>

      {accuracy && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Sparkles size={13} className="text-blue-500" /> You vs the app
          </p>
          <p className="text-sm text-slate-700">
            Predicted{" "}
            <span className="font-semibold tabular-nums">
              {formatSignedCurrency(accuracy.predicted)}
            </span>{" "}
            → actual{" "}
            <span className="font-semibold tabular-nums">
              {formatSignedCurrency(accuracy.realized)}
            </span>
          </p>
          <p
            className={`mt-1 text-sm font-semibold ${
              beat ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {beat
              ? `You beat the estimate by ${formatSignedCurrency(Math.abs(accuracy.delta))}.`
              : `Came in ${formatSignedCurrency(-Math.abs(accuracy.delta))} under the estimate.`}
          </p>
        </div>
      )}

      <button
        onClick={() => onClose?.()}
        className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Done
      </button>
    </div>
  );
}

function numOr(actual, fallback) {
  if (actual != null && actual !== "") return Number(actual) || 0;
  return Math.round(Number(fallback) || 0);
}

function toInt(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}
