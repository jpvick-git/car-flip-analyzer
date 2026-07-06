import { Wrench, DollarSign, ArrowRight, MoreVertical, Trash2 } from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import { formatCurrency } from "../utils/formatCurrency";
import { formatVehicleTitle } from "../utils/vehicleName";
import { calculateFlipMetrics } from "../utils/flipCalculator";
import { calculateFlipDecision, recommendationStyles } from "../utils/flipDecision";
import { getTransportCostInfo } from "../utils/userSettings";
import {
  parseRepairPlan,
  hasRepairPlanData,
  formatRepairTimeline,
} from "../utils/repairPlan";
import { useUserSettings } from "../context/UserSettingsContext";
import {
  isPrivateParty,
  sourceLabel,
  costLabel,
  maxOfferLabel,
  askingPrice,
  formatSaleDate,
  buyerFeeRate,
} from "../utils/vehicleSource";

export default function CarCard({
  car,
  onViewDetails,
  onUpdateValues,
  marginPercent = 15,
  isDemo = false,
  menuOpenId,
  setMenuOpenId,
  setCarToDelete,
}) {
  const { settings } = useUserSettings();
  const repair = Number(car.repair_estimate || car.ai_repair_estimate || 0);
  const resale = Number(car.resale_estimate || car.ai_resale_estimate || 0);
  const transport = getTransportCostInfo(car, settings);
  const transportCost = transport.cost;
  const repairPlan = parseRepairPlan(car);
  const showRepairPlan = hasRepairPlanData(car);

  const flipMetrics = calculateFlipMetrics({
    resale,
    repair,
    marginPercent,
    taxRate: car.avg_tax_rate || 0,
    titleFee: car.title_fee || 0,
    buyerFeeRate: buyerFeeRate(car),
    transportCost,
    fixedBid: car.max_bid,
  });

  const decision = calculateFlipDecision(car, flipMetrics, { marginPercent });
  const styles = recommendationStyles(decision.recommendation);
  const profitPositive = decision.expectedProfit >= 0;
  const saleDate = formatSaleDate(car);

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {/* Image */}
      <div className="relative">
        <img
          src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
          alt={formatVehicleTitle(car)}
          className="h-52 w-full object-cover"
        />
        <span className={`absolute left-3 top-3 rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide shadow-sm ${styles.badge}`}>
          {decision.recommendation}
        </span>
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            Score {decision.flipScore}
          </span>
          {!isDemo && setMenuOpenId && setCarToDelete && (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="Vehicle options"
                onClick={() => setMenuOpenId(menuOpenId === car.id ? null : car.id)}
                className="rounded-full bg-black/70 p-1.5 text-white backdrop-blur transition hover:bg-black/85"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpenId === car.id && (
                <div className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpenId(null);
                      setCarToDelete(car);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {sourceLabel(car)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="line-clamp-2 min-h-[3.25rem] text-lg font-bold leading-snug tracking-tight text-slate-900">
          {formatVehicleTitle(car)}
        </h2>

        {/* Decision metrics — primary focus */}
        <div className={`mt-3 rounded-xl border ${styles.border} ${styles.bg} p-3`}>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Expected Profit
              </p>
              <p className={`text-2xl font-extrabold tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
                {formatCurrency(decision.expectedProfit)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">ROI</p>
              <p className={`text-lg font-bold tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
                {decision.roiPercent}%
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/50 pt-2 text-xs">
            <span className="text-slate-500">
              {maxOfferLabel(car)}{" "}
              <span className="font-bold tabular-nums text-slate-800">{formatCurrency(flipMetrics.bid)}</span>
            </span>
            <span className={`font-semibold ${decision.riskLevel === "Low" ? "text-emerald-600" : decision.riskLevel === "Medium" ? "text-amber-600" : "text-red-600"}`}>
              Risk: {decision.riskLevel}
            </span>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Transport{" "}
          {transport.hasValue ? (
            <span className="font-semibold tabular-nums text-slate-700">
              {transport.isEstimated ? "est. " : ""}
              {formatCurrency(transportCost)}
            </span>
          ) : (
            <span className="italic text-slate-400">not set</span>
          )}
        </p>

        {showRepairPlan && (
          <p className="mt-1 text-xs text-slate-500">
            Repair{" "}
            <span className="font-semibold text-slate-700">
              {repairPlan.repair_difficulty_label || "—"}
            </span>
            {repairPlan.parts_availability && (
              <>
                {" · "}
                Parts{" "}
                <span className="font-semibold text-slate-700">
                  {repairPlan.parts_availability}
                </span>
              </>
            )}
            {formatRepairTimeline(repairPlan) !== "—" && (
              <>
                {" · "}
                <span className="font-semibold text-slate-700">
                  {formatRepairTimeline(repairPlan)}
                </span>
              </>
            )}
          </p>
        )}

        {/* Secondary: repair / resale */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-2.5">
            <div className="mb-0.5 flex items-center gap-1 text-amber-600">
              <Wrench size={11} />
              <span className="text-[10px] font-semibold uppercase">{costLabel(car)}</span>
            </div>
            <CurrencyInput
              readOnly={isDemo}
              value={repair}
              onChange={(value) => onUpdateValues?.(car.id, { repair_estimate: value })}
              inputClassName={`w-full bg-transparent text-sm font-bold tabular-nums text-amber-700 ${isDemo ? "cursor-default" : "focus:outline-none"}`}
            />
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 p-2.5">
            <div className="mb-0.5 flex items-center gap-1 text-emerald-600">
              <DollarSign size={11} />
              <span className="text-[10px] font-semibold uppercase">
                {isPrivateParty(car) ? "Exit" : "Resale"}
              </span>
            </div>
            <CurrencyInput
              readOnly={isDemo}
              value={resale}
              onChange={(value) => onUpdateValues?.(car.id, { resale_estimate: value })}
              inputClassName={`w-full bg-transparent text-sm font-bold tabular-nums text-emerald-700 ${isDemo ? "cursor-default" : "focus:outline-none"}`}
            />
          </div>
        </div>

        {saleDate && (
          <p className="mt-2 text-xs text-slate-400">
            Sale: {saleDate}
            {isPrivateParty(car) && askingPrice(car) && (
              <> · Ask {formatCurrency(askingPrice(car))}</>
            )}
          </p>
        )}

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99]"
          onClick={onViewDetails}
        >
          View Decision
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
