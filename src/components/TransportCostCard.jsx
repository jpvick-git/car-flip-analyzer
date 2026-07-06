import React, { useEffect, useState, useRef } from "react";
import { Truck, Save, AlertTriangle } from "lucide-react";
import axios from "axios";
import { formatCurrency } from "../utils/formatCurrency";
import {
  TRANSPORT_TYPES,
  TRANSPORT_TYPE_LABELS,
  estimateTransportCost,
  defaultPickupLocation,
  getTransportWarnings,
} from "../utils/transportCalculator";
import {
  defaultDeliveryLocation,
  defaultTransportType,
} from "../utils/userSettings";
import CurrencyInput from "./CurrencyInput";

export default function TransportCostCard({
  vehicle,
  flipMetrics,
  apiBase = "",
  readOnly = false,
  onSave,
  onPreviewChange,
  userSettings,
}) {
  const [form, setForm] = useState({
    transport_pickup_location: "",
    transport_delivery_location: "",
    transport_distance_miles: "",
    transport_type: "local_tow",
    transport_cost_manual_override: "",
    transport_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const skipPreviewRef = useRef(true);

  useEffect(() => {
    if (!vehicle) return;
    skipPreviewRef.current = true;
    setForm({
      transport_pickup_location: defaultPickupLocation(vehicle),
      transport_delivery_location: defaultDeliveryLocation(vehicle, userSettings),
      transport_distance_miles:
        vehicle.transport_distance_miles != null && vehicle.transport_distance_miles !== ""
          ? String(vehicle.transport_distance_miles)
          : "",
      transport_type: defaultTransportType(vehicle, userSettings),
      transport_cost_manual_override:
        vehicle.transport_cost_manual_override != null
          ? String(vehicle.transport_cost_manual_override)
          : "",
      transport_notes: vehicle.transport_notes || "",
    });
  }, [vehicle?.id, userSettings?.shop_location, userSettings?.default_transport_type]);

  const estimatedCost = estimateTransportCost({
    distanceMiles: form.transport_distance_miles,
    transportType: form.transport_type,
    manualOverride: form.transport_cost_manual_override || null,
    sourceType: vehicle?.source_type,
  });

  useEffect(() => {
    if (skipPreviewRef.current) {
      skipPreviewRef.current = false;
      return;
    }
    onPreviewChange?.(estimatedCost);
  }, [estimatedCost, onPreviewChange]);

  const profit = Number(flipMetrics?.profit) || 0;
  const bid = Number(flipMetrics?.bid) || 0;
  const transportInMetrics = Number(flipMetrics?.transportCost) || 0;
  const profitBeforeTransport = profit + transportInMetrics;

  const warnings = getTransportWarnings({
    vehicle,
    distanceMiles: form.transport_distance_miles,
    transportType: form.transport_type,
    transportCost: estimatedCost,
    expectedProfitBeforeTransport: profitBeforeTransport,
  });

  const update = (field, value) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (readOnly || !vehicle?.id) return;
    setSaving(true);
    setError(null);
    try {
      const miles = form.transport_distance_miles === ""
        ? null
        : Number(form.transport_distance_miles);
      const manualOverride = form.transport_cost_manual_override === ""
        ? null
        : Number(form.transport_cost_manual_override);

      const payload = {
        transport_pickup_location: form.transport_pickup_location.trim() || null,
        transport_delivery_location: form.transport_delivery_location.trim() || null,
        transport_distance_miles: Number.isFinite(miles) ? miles : null,
        transport_type: form.transport_type,
        transport_cost_estimate: estimatedCost,
        transport_cost_manual_override: Number.isFinite(manualOverride) ? manualOverride : null,
        transport_notes: form.transport_notes.trim() || null,
      };

      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const res = await axios.patch(
        `${apiBase}/api/vehicle/${vehicle.id}/transport`,
        payload,
        { headers }
      );
      onSave?.(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Transport save failed:", err);
      setError(err.response?.data?.detail || "Could not save transport details.");
    } finally {
      setSaving(false);
    }
  };

  const milesDisplay = form.transport_distance_miles
    ? `${Number(form.transport_distance_miles).toLocaleString()} miles`
    : "—";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
            <Truck size={13} />
          </span>
          Transportation
        </h3>
        <p className="mt-1 text-[11px] text-slate-400">
          Can you still flip this after getting it home?
        </p>
      </div>

      {/* Impact summary */}
      <div className="grid grid-cols-3 gap-px border-b border-slate-100 bg-slate-100">
        <SummaryCell label="Est. Transport" value={formatCurrency(estimatedCost)} />
        <SummaryCell
          label="Profit After Transport"
          value={formatCurrency(profit)}
          highlight={profit >= 0 ? "positive" : "negative"}
        />
        <SummaryCell label="Max Bid" value={formatCurrency(bid)} />
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pickup">
            <input
              type="text"
              disabled={readOnly}
              value={form.transport_pickup_location}
              onChange={(e) => update("transport_pickup_location", e.target.value)}
              placeholder="Auction yard or seller city"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
            />
          </Field>
          <Field label="Delivery">
            <input
              type="text"
              disabled={readOnly}
              value={form.transport_delivery_location}
              onChange={(e) => update("transport_delivery_location", e.target.value)}
              placeholder="Your shop or home"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Distance (miles)">
            <input
              type="number"
              min={0}
              disabled={readOnly}
              value={form.transport_distance_miles}
              onChange={(e) => update("transport_distance_miles", e.target.value)}
              placeholder="e.g. 23"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
            />
          </Field>
          <Field label="Method">
            <select
              disabled={readOnly}
              value={form.transport_type}
              onChange={(e) => update("transport_type", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
            >
              {TRANSPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRANSPORT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Manual cost override (optional)">
          <CurrencyInput
            readOnly={readOnly}
            value={form.transport_cost_manual_override || 0}
            onChange={(value) =>
              update(
                "transport_cost_manual_override",
                value > 0 ? String(value) : ""
              )
            }
            inputClassName="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="mt-1 text-xs text-slate-400">
            Rule estimate: {formatCurrency(estimatedCost)} for {milesDisplay} via{" "}
            {TRANSPORT_TYPE_LABELS[form.transport_type]}.
          </p>
        </Field>

        <Field label="Notes">
          <textarea
            rows={2}
            disabled={readOnly}
            value={form.transport_notes}
            onChange={(e) => update("transport_notes", e.target.value)}
            placeholder="Carrier quote, gate fees, etc."
            className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
          />
        </Field>

        {warnings.length > 0 && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              <AlertTriangle size={12} />
              Transport Impact
            </p>
            <ul className="space-y-1">
              {warnings.slice(0, 4).map((warning, i) => (
                <li key={i} className="text-xs leading-relaxed text-amber-900">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!readOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving…" : saved ? "Saved" : "Save Transport"}
          </button>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function SummaryCell({ label, value, highlight }) {
  const valueClass =
    highlight === "positive"
      ? "text-emerald-700"
      : highlight === "negative"
        ? "text-red-600"
        : "text-slate-900";

  return (
    <div className="bg-white px-4 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
