import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Save, MapPin, Percent, Truck, Store, User, Wallet } from "lucide-react";
import { useUserSettings } from "../context/UserSettingsContext";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { LOT_PROFILE_DEFAULTS } from "../utils/userSettings";
import {
  TRANSPORT_TYPES,
  TRANSPORT_TYPE_LABELS,
} from "../utils/transportCalculator";

const LOT_PROFILE_FIELDS = [
  ["target_front_gross", "Target front gross", "$", "Profit you aim to make per unit before backend."],
  ["default_recon", "Default recon", "$", "Fallback recon cost when no photo estimate exists."],
  ["auction_fee_default", "Auction fees", "$", "Typical buyer/auction fees per unit."],
  ["transport_cost_default", "Transport", "$", "Typical transport cost per unit."],
  ["deal_shield_fee", "DealShield / buy protection", "$", "Flat purchase-protection fee, if used."],
  ["floor_plan_cost_per_day", "Floor plan cost / day", "$", "Daily holding cost while a unit sits."],
  ["target_turn_days", "Target turn (days)", "d", "Healthy days-on-lot before it ages."],
  ["max_turn_days", "Act-by turn (days)", "d", "Age at which you cut price or wholesale."],
];

export default function SettingsPage({ isDemo = false }) {
  const navigate = useNavigate();
  const { settings, loading, updateSettings } = useUserSettings();

  const [form, setForm] = useState({
    default_margin_percent: 15,
    default_transport_type: "local_tow",
    shop_location: "",
    business_type: "flipper",
    ...LOT_PROFILE_DEFAULTS,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      default_margin_percent: settings.default_margin_percent,
      default_transport_type: settings.default_transport_type,
      shop_location: settings.shop_location,
      business_type: settings.business_type || "flipper",
      ...Object.fromEntries(
        Object.keys(LOT_PROFILE_DEFAULTS).map((k) => [
          k,
          settings[k] ?? LOT_PROFILE_DEFAULTS[k],
        ])
      ),
    }));
  }, [settings]);

  const isDealer = form.business_type === "dealer";
  const marginFill = (form.default_margin_percent / 40) * 100;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (isDemo) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        default_margin_percent: Number(form.default_margin_percent),
        default_transport_type: form.default_transport_type,
        shop_location: form.shop_location.trim(),
        business_type: form.business_type,
      };
      for (const key of Object.keys(LOT_PROFILE_DEFAULTS)) {
        payload[key] = Math.max(0, Math.round(Number(form[key]) || 0));
      }
      await updateSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to inventory
        </button>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <Settings size={24} className="text-slate-500" />
          Flip Preferences
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Defaults used for max bid, profit, and transport estimates across your pipeline.
        </p>
      </div>

      {isDemo && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Demo mode — settings are read-only.
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {/* Business type */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Business Type</h2>
              <p className="text-xs text-slate-500">
                Dealer mode switches to retail/recon language and unlocks the lot buy calculator.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["flipper", "Flipper", User],
              ["dealer", "Used Car Lot", Store],
            ].map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                disabled={isDemo}
                onClick={() => setField("business_type", value)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                  form.business_type === value
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </section>

        {isDealer && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <Wallet size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Lot Cost Profile</h2>
                <p className="text-xs text-slate-500">
                  Your typical cost stack — used to compute max buy and true gross per unit.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LOT_PROFILE_FIELDS.map(([key, label, unit, hint]) => (
                <div key={key}>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
                  <div className="relative">
                    {unit === "$" && (
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                        $
                      </span>
                    )}
                    <input
                      type="number"
                      min={0}
                      disabled={isDemo}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      className={`w-full rounded-xl border border-slate-300 py-2.5 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 ${
                        unit === "$" ? "pl-7 pr-3" : "px-3"
                      }`}
                    />
                    {unit === "d" && (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        days
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{hint}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Default margin */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Percent size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Default Margin</h2>
              <p className="text-xs text-slate-500">
                Target profit as a percent of resale — used on dashboard and new vehicle views.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Desired margin</span>
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-sm font-bold text-blue-600">
                {form.default_margin_percent}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              disabled={isDemo}
              value={form.default_margin_percent}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  default_margin_percent: Number(e.target.value),
                }))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-full accent-blue-600 disabled:opacity-50"
              style={{
                background: `linear-gradient(to right, #2563eb 0%, #2563eb ${marginFill}%, #e2e8f0 ${marginFill}%, #e2e8f0 100%)`,
              }}
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>0%</span>
              <span>40%</span>
            </div>
          </div>
        </section>

        {/* Shop location */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <MapPin size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Shop / Home Location</h2>
              <p className="text-xs text-slate-500">
                Default delivery point when estimating transport for new vehicles.
              </p>
            </div>
          </div>
          <AddressAutocomplete
            disabled={isDemo}
            value={form.shop_location}
            onChange={(val) =>
              setForm((prev) => ({ ...prev, shop_location: val }))
            }
            placeholder="e.g. Alabaster, AL"
          />
        </section>

        {/* Default transport */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <Truck size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Default Transport Method</h2>
              <p className="text-xs text-slate-500">
                Used to estimate haul cost when a vehicle has miles but no saved transport quote.
              </p>
            </div>
          </div>
          <select
            disabled={isDemo}
            value={form.default_transport_type}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                default_transport_type: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
          >
            {TRANSPORT_TYPES.map((type) => (
              <option key={type} value={type}>
                {TRANSPORT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!isDemo && (
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving…" : saved ? "Saved" : "Save Preferences"}
          </button>
        )}
      </form>
    </main>
  );
}
