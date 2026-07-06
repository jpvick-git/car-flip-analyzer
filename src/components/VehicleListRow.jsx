import {
  Wrench,
  DollarSign,
  MapPin,
  Calendar,
  Hash,
  ArrowRight,
  MoreVertical,
  Trash2,
} from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import { formatCurrency } from "../utils/formatCurrency";
import { formatVehicleTitle } from "../utils/vehicleName";
import { calculateFlipMetrics } from "../utils/flipCalculator";
import { calculateFlipDecision, recommendationStyles } from "../utils/flipDecision";
import { getTransportCostForFlip, hasTransportConfigured } from "../utils/userSettings";
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

export default function VehicleListRow({
  car,
  isDemo,
  menuOpenId,
  setMenuOpenId,
  setCarToDelete,
  updateCarValue,
  onViewDetails,
  marginPercent = 15,
}) {
  const { settings } = useUserSettings();
  const odometer = Number(car.odometer);
  const hasOdometer = !Number.isNaN(odometer) && odometer > 0;

  const repair = Number(car.repair_estimate || car.ai_repair_estimate || 0);
  const resale = Number(car.resale_estimate || car.ai_resale_estimate || 0);
  const transportCost = getTransportCostForFlip(car, settings);
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

  return (
    <div className="group grid grid-cols-1 gap-4 border-b border-slate-100 bg-white p-4 transition last:border-b-0 hover:bg-slate-50/80 lg:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-5 lg:px-5 lg:py-4">
      {/* Image */}
      <div className="relative shrink-0">
        <img
          src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
          className="h-24 w-full rounded-lg object-cover lg:h-20 lg:w-[120px]"
          alt=""
        />
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur lg:hidden">
          {sourceLabel(car)}
        </span>
      </div>

      {/* Lot info */}
      <div className="min-w-0">
        <button
          type="button"
          onClick={onViewDetails}
          className="text-left text-base font-bold tracking-tight text-blue-700 transition hover:text-blue-800 hover:underline"
        >
          {formatVehicleTitle(car)}
        </button>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
          <Hash size={13} className="shrink-0 text-slate-400" />
          {isPrivateParty(car)
            ? (askingPrice(car) ? `Ask ${formatCurrency(askingPrice(car))}` : "Private party")
            : `Lot ${car.lot_number || "—"}`}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 lg:inline">
            {sourceLabel(car)}
          </span>
          {!isDemo && (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="Vehicle options"
                onClick={() => setMenuOpenId(menuOpenId === car.id ? null : car.id)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <MoreVertical size={15} />
              </button>
              {menuOpenId === car.id && (
                <div className="absolute left-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
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
      </div>

      {/* Vehicle info */}
      <div className="min-w-0 space-y-1 text-sm text-slate-600">
        {hasOdometer && (
          <p>
            <span className="text-xs text-slate-400">Odometer</span>
            <br />
            <span className="font-medium text-slate-800">{odometer.toLocaleString()} mi</span>
          </p>
        )}
        <p className="flex items-center gap-2">
          <MapPin size={13} className="shrink-0 text-slate-400" />
          {car.sale_name || car.location || "N/A"}
        </p>
        {formatSaleDate(car) && (
          <p className="flex items-center gap-2">
            <Calendar size={13} className="shrink-0 text-slate-400" />
            {formatSaleDate(car)}
          </p>
        )}
      </div>

      {/* Condition */}
      <div className="min-w-0 space-y-1 text-sm text-slate-600">
        {car.title_status && (
          <p className="font-medium text-slate-800">{car.title_status}</p>
        )}
        <p>{car.damage_description || "Unknown damage"}</p>
        {car.keys && <p>{car.keys}</p>}
      </div>

      {/* Flip decision + estimates */}
      <div className="min-w-0 space-y-2">
        <div>
          <div className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold ${styles.badge}`}>
            {decision.recommendation}
            <span className="opacity-80">· {decision.flipScore}</span>
          </div>
          <p className={`mt-1 text-lg font-extrabold tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
            {formatCurrency(decision.expectedProfit)}
            <span className="ml-1 text-xs font-semibold text-slate-400">profit</span>
          </p>
        <p className="text-xs text-slate-500">
          {maxOfferLabel(car)} {formatCurrency(flipMetrics.bid)} ·{" "}
          <span className={decision.riskLevel === "Low" ? "text-emerald-600" : decision.riskLevel === "Medium" ? "text-amber-600" : "text-red-600"}>
            {decision.riskLevel} risk
          </span>
          {hasTransportConfigured(car) && (
            <> · Transport {formatCurrency(transportCost)}</>
          )}
        </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-2">
            <div className="mb-0.5 flex items-center gap-1 text-amber-600">
              <Wrench size={11} />
              <span className="text-[10px] font-semibold uppercase">{costLabel(car)}</span>
            </div>
            <CurrencyInput
              readOnly={isDemo}
              value={repair}
              onChange={(value) => updateCarValue(car.id, "repair_estimate", value)}
              inputClassName={`w-full min-w-0 bg-transparent text-xs font-bold tabular-nums text-amber-700 ${isDemo ? "cursor-default" : "focus:outline-none"}`}
            />
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2">
            <div className="mb-0.5 flex items-center gap-1 text-emerald-600">
              <DollarSign size={11} />
              <span className="text-[10px] font-semibold uppercase">
                {isPrivateParty(car) ? "Exit" : "Resale"}
              </span>
            </div>
            <CurrencyInput
              readOnly={isDemo}
              value={resale}
              onChange={(value) => updateCarValue(car.id, "resale_estimate", value)}
              inputClassName={`w-full min-w-0 bg-transparent text-xs font-bold tabular-nums text-emerald-700 ${isDemo ? "cursor-default" : "focus:outline-none"}`}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex min-w-0 flex-col gap-2">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99]"
          onClick={onViewDetails}
        >
          View Decision
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
