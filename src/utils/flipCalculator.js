export function calculateFlipMetrics({
  resale,
  repair,
  marginPercent,
  taxRate = 0,
  titleFee = 0,
  buyerFeeRate = 0.075,
}) {
  const resaleNum = Math.max(0, Number(resale) || 0);
  const repairNum = Math.max(0, Number(repair) || 0);
  const margin = Number(marginPercent) / 100;
  const tax = Number(taxRate) || 0;
  const title = Math.max(0, Number(titleFee) || 0);
  const feeMultiplier = 1 + buyerFeeRate + tax / 100;

  const targetProfit = Math.round(resaleNum * margin);
  const targetTotalCost = resaleNum - targetProfit;
  const bidBudget = targetTotalCost - title - repairNum;

  let bid = 0;
  if (bidBudget > 0) {
    const estimate = Math.round(bidBudget / feeMultiplier);
    let bestBid = estimate;
    let bestScore = Infinity;

    for (let candidate = Math.max(0, estimate - 3); candidate <= estimate + 3; candidate++) {
      const buyerFee = Math.round(candidate * buyerFeeRate);
      const taxAmt = Math.round(candidate * (tax / 100));
      const totalCost = candidate + buyerFee + taxAmt + title + repairNum;
      const profit = resaleNum - totalCost;
      const score =
        Math.abs(totalCost - targetTotalCost) * 10 + Math.abs(profit - targetProfit);

      if (score < bestScore) {
        bestScore = score;
        bestBid = candidate;
      }
    }

    bid = bestBid;
  }

  const buyerFee = Math.round(bid * buyerFeeRate);
  const taxAmt = Math.round(bid * (tax / 100));
  const totalCost = bid + buyerFee + taxAmt + title + repairNum;
  const profit = resaleNum - totalCost;
  const marginActual = resaleNum > 0 ? Number(((profit / resaleNum) * 100).toFixed(1)) : 0;

  return {
    bid,
    buyerFee,
    taxAmt,
    titleFee: title,
    repair: repairNum,
    totalCost,
    profit,
    resale: resaleNum,
    taxRate: tax,
    targetProfit,
    marginActual,
  };
}
