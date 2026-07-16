import { ArrowRight, MoreVertical, Trash2 } from "lucide-react";
import { formatVehicleTitle } from "../utils/vehicleName";
import { calculateFlipMetrics } from "../utils/flipCalculator";
import { calculateFlipDecision } from "../utils/flipDecision";
import { getTransportCostInfo } from "../utils/userSettings";
import { useUserSettings } from "../context/UserSettingsContext";
import { sourceLabel, buyerFeeRate } from "../utils/vehicleSource";
import {
  dealStatus,
  statusLabel,
  statusBadgeClasses,
  statusDotClasses,
} from "../utils/dealLifecycle";
import DealTrackerCard from "./DealTrackerCard";

/**
 * Inventory card: for vehicles already bought. The purchase decision is done,
 * so we drop the buy-decision UI and center on the deal's stage/process via the
 * embedded DealTrackerCard (advance stage, capture actuals, log the sale).
 */
export default function InventoryCard({
  car,
  apiBase = "",
  onViewDetails,
  onUpdate,
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

  const flipMetrics = calculateFlipMetrics({
    resale,
    repair,
    marginPercent,
    taxRate: car.avg_tax_rate || 0,
    titleFee: car.title_fee || 0,
    buyerFeeRate: buyerFeeRate(car),
    transportCost: transport.cost,
    fixedBid: car.max_bid,
  });
  const decision = calculateFlipDecision(car, flipMetrics, { marginPercent });
  const predictions = {
    maxBid: flipMetrics.bid,
    repair,
    resale,
    profit: decision.expectedProfit,
  };

  const status = dealStatus(car);

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70 transition duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-300/50">
      {/* Image */}
      <div className="relative">
        <img
          src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
          alt={formatVehicleTitle(car)}
          className="h-52 w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-navy/25 via-transparent to-transparent" />

        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {!isDemo && setMenuOpenId && setCarToDelete && (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="Vehicle options"
                onClick={() => setMenuOpenId(menuOpenId === car.id ? null : car.id)}
                className="rounded-full bg-brand-navy/75 p-1.5 text-white backdrop-blur transition hover:bg-brand-navy/90"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpenId === car.id && (
                <div className="absolute right-0 top-full z-10 mt-1.5 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/80">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpenId(null);
                      setCarToDelete(car);
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <span className="absolute bottom-3 left-3 max-w-[60%] truncate rounded-full bg-brand-navy/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {sourceLabel(car)}
        </span>
        <span
          className={`absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${statusBadgeClasses(status)}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusDotClasses(status)}`} />
          {statusLabel(status)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h2 className="line-clamp-2 min-h-[3.25rem] text-lg font-bold leading-snug tracking-tight text-brand-navy">
          {formatVehicleTitle(car)}
        </h2>

        {/* Stage tracker — the primary focus for owned inventory */}
        <div className="mt-3">
          <DealTrackerCard
            embedded
            car={car}
            apiBase={apiBase}
            predictions={predictions}
            readOnly={isDemo}
            onUpdate={onUpdate}
          />
        </div>

        <div className="mt-auto pt-4">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99]"
            onClick={onViewDetails}
          >
            View details
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
