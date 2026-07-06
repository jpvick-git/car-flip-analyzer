import React, { useState } from "react";
import axios from "axios";
import { HandCoins, RefreshCw, MessageCircle } from "lucide-react";
import { formatCurrency } from "../utils/formatCurrency";
import { hasNegotiationData, parseTalkingPoints } from "../utils/negotiation";

function strengthClass(strength) {
  const level = String(strength || "").toLowerCase();
  if (level === "strong") return "bg-emerald-100 text-emerald-700";
  if (level === "moderate") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function categoryLabel(category) {
  const labels = {
    condition: "Condition",
    listing: "Listing",
    market: "Market",
    maintenance: "Maintenance",
    title: "Title",
    timing: "Timing",
    strategy: "Strategy",
  };
  return labels[String(category || "").toLowerCase()] || "Strategy";
}

export default function NegotiationCard({
  car,
  apiBase = "",
  readOnly = false,
  onUpdate,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const talkingPoints = parseTalkingPoints(car);
  const hasData = hasNegotiationData(car);
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const offerLow = car?.suggested_offer_low;
  const offerHigh = car?.suggested_offer_high;
  const hasOfferRange = offerLow != null || offerHigh != null;

  const refresh = async () => {
    if (readOnly || !car?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(
        `${apiBase}/api/vehicle/${car.id}/negotiation`,
        {},
        { headers }
      );
      onUpdate?.(res.data);
    } catch (err) {
      console.error("Negotiation analysis failed:", err);
      setError("Could not generate negotiation tips. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-sky-600">
            <HandCoins size={13} />
          </span>
          Negotiation Coach
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {hasData ? "Refresh" : "Get tips"}
          </button>
        )}
      </div>

      {error && <p className="mb-3 shrink-0 text-sm text-red-600">{error}</p>}

      <div className="flex-1">
      {loading && !hasData ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw size={14} className="animate-spin" />
          Analyzing listing and photos for negotiation leverage…
        </div>
      ) : hasData ? (
        <div className="space-y-5">
          {car.negotiation_summary && (
            <p className="text-sm leading-relaxed text-slate-600">
              {car.negotiation_summary}
            </p>
          )}

          {hasOfferRange && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600">
                Suggested Offer Range
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-sky-900">
                {offerLow != null && offerHigh != null && offerLow !== offerHigh
                  ? `${formatCurrency(offerLow)} – ${formatCurrency(offerHigh)}`
                  : formatCurrency(offerLow ?? offerHigh)}
              </p>
              {car.offer_rationale && (
                <p className="mt-1.5 text-xs leading-relaxed text-sky-800/80">
                  {car.offer_rationale}
                </p>
              )}
            </div>
          )}

          {talkingPoints.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Key Talking Points
              </h4>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {talkingPoints.map((item, index) => (
                  <li
                    key={`point-${index}`}
                    className="flex min-h-[7.5rem] flex-col rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{item.point}</p>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                          {categoryLabel(item.category)}
                        </span>
                        {item.strength ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${strengthClass(item.strength)}`}
                          >
                            {item.strength}
                          </span>
                        ) : (
                          <span className="invisible rounded-full px-2 py-0.5 text-[10px]">—</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto min-h-[2.5rem] pt-2">
                      {item.how_to_use && (
                        <p className="flex gap-1.5 text-xs leading-relaxed text-slate-500">
                          <MessageCircle size={12} className="mt-0.5 shrink-0 text-slate-400" />
                          {item.how_to_use}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
            <HandCoins size={14} className="mt-0.5 shrink-0 text-slate-400" />
            AI reviews the listing, photos, and condition to suggest respectful talking points
            and a realistic offer range when negotiating with the seller.
          </p>
          {!readOnly && (
            <p className="text-xs text-slate-400">
              Click &ldquo;Get tips&rdquo; to generate negotiation guidance.
            </p>
          )}
        </div>
      )}
      </div>

      <p className="mt-4 shrink-0 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
        Suggestions are based on listing evidence and estimates — use your own judgment and
        verify facts with the seller before making an offer.
      </p>
    </section>
  );
}
