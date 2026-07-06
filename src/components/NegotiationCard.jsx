import React, { useState, useMemo } from "react";
import axios from "axios";
import { HandCoins, RefreshCw, MessageCircle, Copy, Check } from "lucide-react";
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

function buildNegotiationMessage(car, talkingPoints) {
  const offerLow = car?.suggested_offer_low;
  const offerHigh = car?.suggested_offer_high;
  const primary = talkingPoints[0];

  let opener = "Hi, I'm interested in the vehicle you have listed.";
  if (primary?.point) {
    opener = `Hi, I'm interested in your vehicle. ${primary.point}`;
  }

  const leverage = talkingPoints
    .slice(0, 2)
    .map((tp) => {
      if (tp.how_to_use) return tp.how_to_use;
      return tp.point;
    })
    .filter(Boolean);

  const leverageText = leverage.length
    ? leverage.map((l) => `• ${l}`).join("\n")
    : "";

  let offerLine = "";
  if (offerLow != null && offerHigh != null && offerLow !== offerHigh) {
    offerLine = `\n\nBased on the condition and what I'd need to put into it, I'd like to offer ${formatCurrency(offerLow)}–${formatCurrency(offerHigh)}.`;
  } else if (offerLow != null || offerHigh != null) {
    offerLine = `\n\nBased on the condition and what I'd need to put into it, I'd like to offer ${formatCurrency(offerLow ?? offerHigh)}.`;
  }

  const close = "\n\nI'm ready to move quickly with cash if we can agree on a fair number. Let me know if you'd like to discuss.";

  return `${opener}${leverageText ? `\n\n${leverageText}` : ""}${offerLine}${close}`;
}

function inferDiscountRange(car, talkingPoints) {
  if (car?.suggested_offer_low != null || car?.suggested_offer_high != null) {
    const low = car.suggested_offer_low;
    const high = car.suggested_offer_high;
    if (low != null && high != null && low !== high) {
      return `${formatCurrency(low)} – ${formatCurrency(high)}`;
    }
    return formatCurrency(low ?? high);
  }

  const withCost = talkingPoints.find((tp) =>
    normalizeText(tp.point).includes("$") || normalizeText(tp.how_to_use).includes("$")
  );
  if (withCost) {
    const text = withCost.how_to_use || withCost.point;
    const match = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?/);
    if (match) return match[0].replace(/–/g, "–");
  }

  return "Use suggested offer range";
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

export default function NegotiationCard({
  car,
  apiBase = "",
  readOnly = false,
  onUpdate,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedMessage, setGeneratedMessage] = useState(null);
  const [copied, setCopied] = useState(false);

  const talkingPoints = parseTalkingPoints(car);
  const hasData = hasNegotiationData(car);
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const sayThis = useMemo(() => {
    const primary = talkingPoints[0];
    if (!primary) return null;
    if (primary.how_to_use) return primary.how_to_use;
    if (primary.point) {
      const costMatch = primary.point.match(/\$[\d,]+/);
      if (costMatch) {
        return `"${primary.point}"`;
      }
      return `"I noticed ${primary.point.toLowerCase().replace(/\.$/, "")} — that affects what I can offer."`;
    }
    return null;
  }, [talkingPoints]);

  const suggestedDiscount = inferDiscountRange(car, talkingPoints);

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
      setGeneratedMessage(null);
    } catch (err) {
      console.error("Negotiation analysis failed:", err);
      setError("Could not generate negotiation tips. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMessage = () => {
    setGeneratedMessage(buildNegotiationMessage(car, talkingPoints));
  };

  const handleCopy = async () => {
    if (!generatedMessage) return;
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback ignored
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
          {/* Actionable summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            {sayThis && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600">
                  Say This
                </p>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-sky-900">
                  {sayThis.startsWith('"') ? sayThis : `"${sayThis}"`}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Tone
              </p>
              <p className="mt-1.5 text-sm font-semibold text-slate-800">Respectful but firm</p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
              Suggested Discount / Offer
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-800">
              {suggestedDiscount}
            </p>
            {car.offer_rationale && (
              <p className="mt-1.5 text-xs leading-relaxed text-emerald-800/80">
                {car.offer_rationale}
              </p>
            )}
          </div>

          {car.negotiation_summary && (
            <p className="text-sm leading-relaxed text-slate-600">
              {car.negotiation_summary}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGenerateMessage}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700"
            >
              <MessageCircle size={14} />
              Generate Message
            </button>
            {generatedMessage && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>

          {generatedMessage && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Ready-to-send message
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {generatedMessage}
              </p>
            </div>
          )}

          {talkingPoints.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                All Talking Points
              </h4>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {talkingPoints.map((item, index) => (
                  <li
                    key={`point-${index}`}
                    className="flex min-h-[5rem] flex-col rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{item.point}</p>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                          {categoryLabel(item.category)}
                        </span>
                        {item.strength && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${strengthClass(item.strength)}`}
                          >
                            {item.strength}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.how_to_use && (
                      <p className="mt-auto pt-2 text-xs leading-relaxed text-slate-500">
                        {item.how_to_use}
                      </p>
                    )}
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
            AI reviews the listing, photos, and condition to suggest what to say, how much to offer,
            and a ready-to-send message for the seller.
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
