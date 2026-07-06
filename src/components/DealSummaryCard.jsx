import { formatCurrency } from "../utils/formatCurrency";
import { recommendationStyles } from "../utils/flipDecision";
import { maxOfferLabel } from "../utils/vehicleSource";

export default function DealSummaryCard({ vehicle, decision, flipMetrics }) {
  if (!decision) return null;

  const styles = recommendationStyles(decision.recommendation);
  const bid = flipMetrics?.bid ?? 0;
  const profit = decision.expectedProfit ?? 0;
  const repair = Number(flipMetrics?.repair) || 0;
  const transport = Number(flipMetrics?.transportCost) || 0;

  const mainReason =
    decision.reasons?.[0] ||
    decision.warnings?.[0] ||
    "Review repair plan and risks before committing.";

  const expectedCase = profit;
  const bestCase = Math.round(profit + repair * 0.1);
  const worstCase = Math.round(profit - repair * 0.25 - transport * 0.5);

  const summaryParagraph = buildSummary(decision, profit, mainReason);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Deal Summary
        </h3>
        <p className="mt-1 text-[11px] text-slate-400">
          The bottom line in plain language
        </p>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${styles.badge}`}>
            {decision.recommendation}
          </span>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-slate-500">Profit </span>
              <span
                className={`font-bold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}
              >
                {formatCurrency(profit)}
              </span>
            </span>
            <span>
              <span className="text-slate-500">{maxOfferLabel(vehicle)} </span>
              <span className="font-bold tabular-nums text-slate-800">{formatCurrency(bid)}</span>
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-700">{summaryParagraph}</p>

        <p className="mt-3 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Main factor: </span>
          {mainReason}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <CaseCell label="Best case" value={formatCurrency(bestCase)} tone="positive" />
          <CaseCell label="Expected" value={formatCurrency(expectedCase)} tone="neutral" />
          <CaseCell label="Worst case" value={formatCurrency(worstCase)} tone="negative" />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Scenarios assume repair stays near estimate and transport doesn&apos;t increase.
        </p>
      </div>
    </section>
  );
}

function CaseCell({ label, value, tone }) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-600"
        : "text-slate-800";

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function buildSummary(decision, profit, mainReason) {
  const rec = decision.recommendation;
  if (decision.explanation && decision.explanation.length < 320) {
    return decision.explanation;
  }

  if (rec === "PASS") {
    return `We recommend passing. ${mainReason} Expected profit is ${
      profit >= 0 ? "too thin to justify the risk" : "negative"
    } after fees, repair, and transport.`;
  }

  if (rec === "MAYBE") {
    return `This is a MAYBE — the numbers can work, but ${mainReason.toLowerCase()} Keep your max bid disciplined and verify repair cost in person.`;
  }

  return `This looks like a BUY at your target margin. Expected profit is ${formatCurrency(
    profit
  )}, but ${mainReason.toLowerCase()}`;
}
