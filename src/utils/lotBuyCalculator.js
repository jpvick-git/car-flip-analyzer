// Lot buy / appraisal math. Pure functions, no side effects.

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Holding cost across a turn window.
 */
export function holdingCost(floorPlanPerDay, turnDays) {
  return Math.max(0, num(floorPlanPerDay)) * Math.max(0, num(turnDays));
}

/**
 * Total cost stack to get a unit retail-ready and carried through its turn window,
 * NOT including the purchase price itself.
 */
export function costStack({
  recon,
  auctionFee,
  transport,
  dealShield,
  floorPlanPerDay,
  turnDays,
}) {
  const holding = holdingCost(floorPlanPerDay, turnDays);
  const recurring = num(recon) + num(auctionFee) + num(transport) + num(dealShield);
  return {
    recon: num(recon),
    auctionFee: num(auctionFee),
    transport: num(transport),
    dealShield: num(dealShield),
    holding,
    total: recurring + holding,
  };
}

/**
 * Max buy = retail - target front gross - full cost stack.
 * Returns the ceiling price you can pay and still hit your gross target.
 */
export function calculateMaxBuy({
  retail,
  targetFrontGross,
  recon,
  auctionFee,
  transport,
  dealShield,
  floorPlanPerDay,
  turnDays,
}) {
  const stack = costStack({
    recon,
    auctionFee,
    transport,
    dealShield,
    floorPlanPerDay,
    turnDays,
  });
  const rawMaxBuy = num(retail) - num(targetFrontGross) - stack.total;
  const maxBuy = Math.max(0, Math.round(rawMaxBuy));
  return {
    maxBuy,
    rawMaxBuy: Math.round(rawMaxBuy),
    belowFloor: rawMaxBuy <= 0,
    costStack: stack,
    targetFrontGross: num(targetFrontGross),
    retail: num(retail),
  };
}

/**
 * Projected front gross if you buy at a given price. Uses actual days on lot when
 * provided, otherwise the target turn window.
 */
export function grossAtPrice({
  retail,
  buyPrice,
  recon,
  auctionFee,
  transport,
  dealShield,
  floorPlanPerDay,
  turnDays,
  daysOnLot,
}) {
  const effectiveDays = daysOnLot != null ? daysOnLot : turnDays;
  const stack = costStack({
    recon,
    auctionFee,
    transport,
    dealShield,
    floorPlanPerDay,
    turnDays: effectiveDays,
  });
  const gross = num(retail) - num(buyPrice) - stack.total;
  return {
    gross: Math.round(gross),
    costStack: stack,
    marginPct: num(retail) > 0 ? (gross / num(retail)) * 100 : 0,
  };
}
