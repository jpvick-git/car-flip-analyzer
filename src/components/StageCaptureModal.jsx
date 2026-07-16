import React, { useState } from "react";
import { X } from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import { formatCurrency } from "../utils/formatCurrency";

/**
 * Lightweight, single-purpose prompt shown at a deal-stage transition to
 * capture the number that just became known (purchase price, recon, list
 * price). Every field is prefilled with the app's estimate so it's a quick
 * confirm. Saving commits the status change + the value atomically; skipping
 * advances the stage without a value (it can be filled later in Log Outcome).
 */
export default function StageCaptureModal({ title, subtitle, fields, onSave, onSkip, onClose }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, initial(f)]))
  );
  const [saving, setSaving] = useState(false);

  const setValue = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));

  const handle = async (fn, payload) => {
    setSaving(true);
    try {
      await fn(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <button
          onClick={() => onClose?.()}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={20} />
        </button>

        <h2 className="pr-8 text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}

        <div className="mt-5 space-y-3">
          {fields.map((f) => {
            const showPredicted = f.predicted != null && Number(f.predicted) > 0;
            return (
              <div key={f.key}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">{f.label}</label>
                  {showPredicted && (
                    <button
                      type="button"
                      onClick={() => setValue(f.key, Number(f.predicted))}
                      className="text-xs font-medium text-blue-600 transition hover:text-blue-700"
                      title="Use the app's estimate"
                    >
                      {f.predictedLabel || "Estimate"}: {formatCurrency(f.predicted)}
                    </button>
                  )}
                </div>
                <CurrencyInput
                  value={values[f.key]}
                  onChange={(v) => setValue(f.key, v)}
                  inputClassName="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tabular-nums text-slate-800 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => handle(onSkip)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-700 disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handle(onSave, toInts(values))}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function initial(field) {
  if (field.initial != null && field.initial !== "") return Number(field.initial) || 0;
  return Math.round(Number(field.predicted) || 0);
}

function toInts(values) {
  const out = {};
  for (const [key, val] of Object.entries(values)) {
    out[key] = Math.max(0, Math.round(Number(val) || 0));
  }
  return out;
}
