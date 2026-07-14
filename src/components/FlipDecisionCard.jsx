import { CheckCircle2, AlertCircle, XCircle, TrendingUp } from "lucide-react";
import { formatCurrency } from "../utils/formatCurrency";
import {
  recommendationStyles,
  RECOMMENDATION,
} from "../utils/flipDecision";
import { maxOfferLabel } from "../utils/vehicleSource";

function RecommendationIcon({ recommendation }) {
  const size = 22;
  if (recommendation === RECOMMENDATION.BUY) return <CheckCircle2 size={size} />;
  if (recommendation === RECOMMENDATION.MAYBE) return <AlertCircle size={size} />;
  return <XCircle size={size} />;
}

function riskClass(level) {
  const l = String(level || "").toLowerCase();
  if (l === "low") return "text-emerald-600";
  if (l === "medium") return "text-amber-600";
  return "text-red-600";
}

function confidenceClass(level) {
  const l = String(level || "").toLowerCase();
  if (l === "high") return "text-emerald-600";
  if (l === "medium") return "text-amber-600";
  return "text-slate-500";
}

export default function FlipDecisionCard({
  vehicle,
  flipMetrics,
  decision,
  compact = false,
  hideNarrative = false,
}) {
  if (!decision) return null;

  const styles = recommendationStyles(decision.recommendation);
  const bid = flipMetrics?.bid ?? 0;
  const profitPositive = decision.expectedProfit >= 0;

  if (compact) {
    return (
      <div className={`rounded-xl border ${styles.border} ${styles.bg} p-3`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide ${styles.badge}`}>
            <RecommendationIcon recommendation={decision.recommendation} />
            {decision.recommendation}
          </span>
          <span className="text-xs font-semibold text-slate-500">
            Score <span className="tabular-nums text-slate-800">{decision.flipScore}</span>
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-slate-500">Profit</p>
            <p className={`font-bold tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
              {formatCurrency(decision.expectedProfit)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Risk</p>
            <p className={`font-semibold ${riskClass(decision.riskLevel)}`}>{decision.riskLevel}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-2xl border ${styles.border} bg-white shadow-lg ${styles.ring} ring-1`}>
      {/* Recommendation header */}
      <div className={`px-6 py-5 ${styles.bg}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Flip Decision
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-2xl font-extrabold tracking-tight ${styles.badge}`}>
                <RecommendationIcon recommendation={decision.recommendation} />
                {decision.recommendation}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Flip Score</p>
            <p className="text-3xl font-extrabold tabular-nums text-slate-900">{decision.flipScore}</p>
            <p className="text-xs text-slate-400">/ 100</p>
          </div>
        </div>

        {/* Profit — focal metric */}
        <div className="mt-5 rounded-xl border border-white/60 bg-white/80 px-4 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <TrendingUp size={13} />
                Expected Profit
              </p>
              <p className={`mt-1 text-4xl font-extrabold tabular-nums tracking-tight ${profitPositive ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(decision.expectedProfit)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expected ROI</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${profitPositive ? "text-emerald-600" : "text-red-600"}`}>
                {decision.roiPercent}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-px bg-brand-bg sm:grid-cols-4">
        <MetricCell label="Confidence" value={decision.confidenceLabel} valueClass={confidenceClass(decision.confidenceLabel)} />
        <MetricCell label={maxOfferLabel(vehicle)} value={formatCurrency(bid)} />
        <MetricCell label="Risk Level" value={decision.riskLevel} valueClass={riskClass(decision.riskLevel)} />
        <MetricCell label="Walk Away" value={formatCurrency(decision.walkAwayPrice)} />
      </div>

      {/* Explanation, reasons & warnings — shown in Deal Summary / Deal Risks when hideNarrative */}
      {!hideNarrative && decision.explanation && (
        <div className="border-t border-slate-100 px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Why we recommend it
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{decision.explanation}</p>
        </div>
      )}

      {/* Reasons & warnings */}
      {!hideNarrative && (decision.reasons?.length > 0 || decision.warnings?.length > 0) && (
        <div className="grid gap-4 border-t border-slate-100 px-6 py-4 sm:grid-cols-2">
          {decision.reasons?.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                Why this is a good flip
              </p>
              <ul className="space-y-1.5">
                {decision.reasons.map((reason, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {decision.warnings?.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
                What to watch out for
              </p>
              <ul className="space-y-1.5">
                {decision.warnings.map((warning, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value, valueClass = "text-slate-800" }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
