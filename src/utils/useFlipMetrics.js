import { useMemo, useRef } from "react";
import { calculateFlipMetrics } from "./flipCalculator";

/**
 * Max bid is recalculated when margin, resale, tax, title, or vehicle changes.
 * When only repair costs change, max bid stays fixed and profit updates.
 */
export function useFlipMetrics({
  carId,
  resale,
  repair,
  marginPercent,
  taxRate = 0,
  titleFee = 0,
}) {
  const lockedBidRef = useRef(null);
  const bidKeyRef = useRef("");

  const bidKey = `${carId}-${marginPercent}-${resale}-${taxRate}-${titleFee}`;

  return useMemo(() => {
    const inputs = {
      resale,
      repair,
      marginPercent,
      taxRate,
      titleFee,
    };

    if (bidKeyRef.current !== bidKey) {
      bidKeyRef.current = bidKey;
      lockedBidRef.current = calculateFlipMetrics(inputs).bid;
    }

    return calculateFlipMetrics({
      ...inputs,
      fixedBid: lockedBidRef.current,
    });
  }, [bidKey, repair, resale, marginPercent, taxRate, titleFee]);
}
