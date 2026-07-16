import { parseRedFlags, isPrivateParty, askingPrice, isSalvageAuction } from "./vehicleSource";
import { getEffectiveTransportCost, getTransportWarnings } from "./transportCalculator";
import { parseKnownIssues, parseWearItems } from "./knownIssues";
import { parseRepairItems } from "./repairBreakdown";
import {
  parseRepairPlan,
  evaluateRepairPlanImpact,
  hasRepairPlanData,
  formatRepairTimeline,
} from "./repairPlan";

export const RECOMMENDATION = {
  BUY: "BUY",
  MAYBE: "MAYBE",
  PASS: "PASS",
};

// ── Style helpers ──────────────────────────────────────────────

export function recommendationStyles(recommendation) {
  switch (recommendation) {
    case RECOMMENDATION.BUY:
      return {
        badge: "bg-emerald-600 text-white",
        border: "border-emerald-200",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        ring: "ring-emerald-500/20",
      };
    case RECOMMENDATION.MAYBE:
      return {
        badge: "bg-amber-500 text-white",
        border: "border-amber-200",
        bg: "bg-amber-50",
        text: "text-amber-700",
        ring: "ring-amber-500/20",
      };
    default:
      return {
        badge: "bg-red-600 text-white",
        border: "border-red-200",
        bg: "bg-red-50",
        text: "text-red-700",
        ring: "ring-red-500/20",
      };
  }
}

// ── Inference helpers ──────────────────────────────────────────

const SEVERE_TITLE_KEYWORDS = [
  "rebuilt",
  "junk",
  "parts only",
  "certificate of destruction",
  "non-repairable",
  "flood",
  "fire",
];

// Salvage-branded title is normal at auction — not treated as severe there.

const SEVERE_DAMAGE_KEYWORDS = [
  "structural",
  "frame",
  "airbag",
  "deployed",
  "rollover",
  "burn",
  "flood",
  "total loss",
];

const MODERATE_DAMAGE_KEYWORDS = [
  "front end",
  "rear end",
  "side",
  "collision",
  "hail",
];

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function getRepairAmount(vehicle) {
  const items = parseRepairItems(vehicle);
  if (items.length) {
    return items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  }
  return Math.max(0, Number(vehicle?.repair_estimate || vehicle?.ai_repair_estimate || 0));
}

function getResaleAmount(vehicle) {
  return Math.max(0, Number(vehicle?.resale_estimate || vehicle?.ai_resale_estimate || 0));
}

function countSevereRedFlags(vehicle) {
  const flags = parseRedFlags(vehicle);
  return flags.filter((flag) => {
    const text = normalizeText(
      typeof flag === "string" ? flag : flag?.flag || flag?.message || flag?.description || ""
    );
    const severity = normalizeText(typeof flag === "object" ? flag?.severity : "");
    return (
      severity === "high" ||
      severity === "critical" ||
      severity === "severe" ||
      SEVERE_DAMAGE_KEYWORDS.some((kw) => text.includes(kw))
    );
  }).length;
}

function capitalizeLevel(level) {
  const s = String(level || "medium").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hasEstimates(vehicle) {
  const hasResale = Boolean(
    vehicle?.resale_details ||
    vehicle?.resale_estimate ||
    vehicle?.ai_resale_estimate
  );
  const hasRepair = Boolean(
    vehicle?.repair_details ||
    vehicle?.repair_breakdown ||
    vehicle?.repair_estimate ||
    vehicle?.ai_repair_estimate
  );
  return { hasResale, hasRepair };
}

function hasSevereTitleRisk(vehicle) {
  const title = normalizeText(
    [vehicle?.title_code, vehicle?.title_status].filter(Boolean).join(" ")
  );
  if (!title) return false;

  if (SEVERE_TITLE_KEYWORDS.some((kw) => title.includes(kw))) return true;

  // Branded salvage title is a red flag for private-party buys, not Copart baseline.
  if (isPrivateParty(vehicle) && title.includes("salvage")) return true;

  return false;
}

function hasBadTitle(vehicle) {
  return hasSevereTitleRisk(vehicle);
}

function damageSeverityScore(vehicle) {
  const damage = normalizeText(vehicle?.damage_description);
  if (!damage) return 0;
  if (SEVERE_DAMAGE_KEYWORDS.some((kw) => damage.includes(kw))) return -25;
  if (MODERATE_DAMAGE_KEYWORDS.some((kw) => damage.includes(kw))) return -10;
  if (damage.includes("minor") || damage.includes("scratch") || damage.includes("dent")) return 5;
  return 0;
}

function mileagePenalty(vehicle) {
  const miles = Number(vehicle?.odometer);
  if (!Number.isFinite(miles) || miles <= 0) return -3;
  if (miles > 180000) return -15;
  if (miles > 120000) return -10;
  if (miles > 80000) return -5;
  return 0;
}

function agePenalty(vehicle) {
  const year = Number(vehicle?.year);
  if (!Number.isFinite(year) || year <= 0) return -3;
  const age = new Date().getFullYear() - year;
  if (age > 15) return -10;
  if (age > 10) return -5;
  return 0;
}

export function inferRepairConfidence(vehicle) {
  const repair = getRepairAmount(vehicle);
  const resale = getResaleAmount(vehicle);
  const repairRatio = resale > 0 ? repair / resale : 1;
  const redFlags = parseRedFlags(vehicle);
  const severeFlags = countSevereRedFlags(vehicle);
  const damage = normalizeText(vehicle?.damage_description);
  const hasStructural = SEVERE_DAMAGE_KEYWORDS.some((kw) => damage.includes(kw));
  const { hasResale, hasRepair } = hasEstimates(vehicle);
  const manualReview = Boolean(vehicle?.needs_manual_review);

  if (!hasResale || !hasRepair) return "Low";

  if (
    severeFlags > 0 ||
    hasStructural ||
    hasSevereTitleRisk(vehicle) ||
    repairRatio > 0.5
  ) {
    return "Low";
  }

  if (
    repairRatio <= 0.15 &&
    redFlags.length === 0 &&
    !manualReview &&
    !hasStructural
  ) {
    return "High";
  }

  if (
    repairRatio > 0.35 ||
    redFlags.length > 1 ||
    repair > 12000
  ) {
    return "Low";
  }

  if (
    repairRatio > 0.25 ||
    redFlags.length > 0 ||
    repair > 8000 ||
    manualReview
  ) {
    return "Medium";
  }

  return "Medium";
}

function inferEstimateConfidence(vehicle) {
  if (vehicle?.confidence) return capitalizeLevel(vehicle.confidence);
  if (vehicle?.flip_confidence) return capitalizeLevel(vehicle.flip_confidence);

  const { hasResale, hasRepair } = hasEstimates(vehicle);
  if (!hasResale || !hasRepair) return "Low";

  const repairConf = inferRepairConfidence(vehicle);

  if (repairConf === "High") return "High";
  if (repairConf === "Low") return "Low";
  return "Medium";
}

function computeWalkAwayPrice(maxBid, vehicle) {
  const bid = Math.max(0, Number(maxBid) || 0);
  if (bid <= 0) return 0;

  const asking = askingPrice(vehicle);
  if (isPrivateParty(vehicle) && asking != null) {
    return Math.min(asking, Math.round(bid * 1.03 + 250));
  }

  return Math.round(bid * 1.035 + 100);
}

function computeFlipScore(vehicle, flipMetrics, context) {
  const {
    profit,
    bid,
    resale,
    repair,
    roiPercent,
    redFlagCount,
    severeRedFlagCount,
    repairRatio,
    knownIssueCount,
    confidenceLabel,
    transportCost = 0,
  } = context;

  let score = 50;

  // Profit contribution (up to +25)
  if (profit > 3000) score += 25;
  else if (profit > 1500) score += 18;
  else if (profit > 750) score += 12;
  else if (profit > 250) score += 6;
  else if (profit > 0) score += 2;
  else if (profit < 0) score -= 20;

  // ROI contribution (up to +15)
  if (roiPercent >= 25) score += 15;
  else if (roiPercent >= 18) score += 12;
  else if (roiPercent >= 12) score += 8;
  else if (roiPercent >= 8) score += 4;
  else if (roiPercent < 5) score -= 8;

  // Repair vs resale (up to ±15)
  if (repairRatio <= 0.12) score += 12;
  else if (repairRatio <= 0.2) score += 6;
  else if (repairRatio > 0.5) score -= 20;
  else if (repairRatio > 0.35) score -= 12;
  else if (repairRatio > 0.25) score -= 6;

  // Red flags
  score -= Math.min(25, redFlagCount * 5 + severeRedFlagCount * 8);

  // Title & damage
  if (hasBadTitle(vehicle)) score -= 18;
  score += damageSeverityScore(vehicle);

  // Age & mileage
  score += agePenalty(vehicle);
  score += mileagePenalty(vehicle);

  // Known issues
  score -= Math.min(12, knownIssueCount * 3);

  // Source type
  if (isPrivateParty(vehicle)) score += 3;
  else if (bid < 500 && resale > 0) score -= 10;

  // Confidence
  if (confidenceLabel === "High") score += 8;
  else if (confidenceLabel === "Low") score -= 10;

  if (vehicle?.needs_manual_review) score -= 12;

  if (hasRepairPlanData(vehicle)) {
    const planImpact = evaluateRepairPlanImpact(parseRepairPlan(vehicle), context);
    score += planImpact.scoreAdjustment || 0;
  }

  if (transportCost > 0 && profit + transportCost > 0) {
    const transportShare = transportCost / (profit + transportCost);
    if (transportShare > 0.35) score -= 15;
    else if (transportShare > 0.25) score -= 8;
  }

  // Backend override
  if (vehicle?.flip_score != null) {
    const backendScore = Number(vehicle.flip_score);
    if (Number.isFinite(backendScore)) return Math.max(0, Math.min(100, Math.round(backendScore)));
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function deriveRiskLevel(flipScore, severeRedFlagCount, repairRatio, profit) {
  if (severeRedFlagCount > 0 || profit < 0 || repairRatio > 0.5) return "High";
  if (flipScore >= 75 && severeRedFlagCount === 0 && repairRatio <= 0.2) return "Low";
  if (flipScore >= 55) return "Medium";
  return "High";
}

function buildReasons(vehicle, context) {
  const reasons = [];
  const { profit, roiPercent, repairRatio, resale, repair } = context;

  if (profit > 0) {
    reasons.push(`Expected profit of $${profit.toLocaleString()} with ${roiPercent}% ROI.`);
  }

  if (repairRatio <= 0.2 && resale > 0) {
    reasons.push("Repair cost is low relative to resale value.");
  }

  const title = [vehicle?.title_code, vehicle?.title_status].filter(Boolean).join(" ");
  if (title && !hasBadTitle(vehicle)) {
    reasons.push(`${title} title supports a clean retail exit.`);
  }

  const damage = normalizeText(vehicle?.damage_description);
  if (damage.includes("minor") || damage.includes("scratch") || damage.includes("dent")) {
    reasons.push("Damage appears mostly cosmetic.");
  }

  if (isPrivateParty(vehicle)) {
    reasons.push("Private-party acquisition avoids auction buyer fees.");
  }

  if (inferRepairConfidence(vehicle) === "High") {
    reasons.push("AI has high confidence in the repair estimate.");
  }

  if (hasRepairPlanData(vehicle)) {
    const plan = parseRepairPlan(vehicle);
    if (plan.repair_difficulty_label === "Easy") {
      reasons.push("Repair plan looks like a mostly bolt-on flip.");
    } else if (plan.parts_availability === "Good") {
      reasons.push("Parts should be easy to source.");
    }
    const timeline = formatRepairTimeline(plan);
    if (timeline !== "—" && (plan.estimated_repair_days_max ?? 99) <= 14) {
      reasons.push(`Short repair timeline (${timeline}).`);
    }
  }

  if (reasons.length === 0 && profit > 0) {
    reasons.push("Numbers support a positive flip at your target margin.");
  }

  return reasons.slice(0, 4);
}

function buildWarnings(vehicle, context) {
  const warnings = [];
  const { repairRatio, severeRedFlagCount, redFlagCount, knownIssueCount, transportCost, profit } = context;

  parseRedFlags(vehicle).forEach((flag) => {
    const text = typeof flag === "string" ? flag : flag?.flag || flag?.message || flag?.description;
    if (text) warnings.push(text);
  });

  if (hasBadTitle(vehicle)) {
    warnings.push("Title status may limit resale or financing options.");
  }

  if (repairRatio > 0.35) {
    warnings.push("Repair costs eat a large share of resale value.");
  }

  if (severeRedFlagCount > 0 && warnings.length < 6) {
    warnings.push("Severe condition or structural concerns detected.");
  }

  const issues = parseKnownIssues(vehicle);
  if (knownIssueCount > 0 && warnings.length < 6) {
    const top = issues[0]?.issue || issues[0]?.item;
    if (top) warnings.push(`Platform risk: ${top}.`);
  }

  if (vehicle?.needs_manual_review) {
    warnings.push("AI flagged this vehicle for manual review.");
  }

  const miles = Number(vehicle?.odometer);
  if (Number.isFinite(miles) && miles > 120000 && warnings.length < 6) {
    warnings.push("Higher mileage increases repair and exit risk.");
  }

  if (profit > 0 && profit < 500 && warnings.length < 6) {
    warnings.push("Profit margin is thin — small overruns erase the deal.");
  }

  if (redFlagCount === 0 && warnings.length === 0 && repairRatio > 0.25) {
    warnings.push("Moderate repair exposure — verify estimates in person.");
  }

  const profitBeforeTransport = profit + (transportCost || 0);
  const transportWarnings = getTransportWarnings({
    vehicle,
    distanceMiles: vehicle?.transport_distance_miles,
    transportType: vehicle?.transport_type,
    transportCost,
    expectedProfitBeforeTransport: profitBeforeTransport,
  });
  transportWarnings.forEach((w) => {
    if (warnings.length < 6) warnings.push(w);
  });

  if (hasRepairPlanData(vehicle)) {
    const plan = parseRepairPlan(vehicle);
    const planImpact = evaluateRepairPlanImpact(plan, context);
    planImpact.warnings.forEach((w) => {
      if (warnings.length < 6) warnings.push(w);
    });
  }

  return [...new Set(warnings)].slice(0, 6);
}

function applyRepairPlanToRecommendation(recommendation, vehicle, context) {
  if (!hasRepairPlanData(vehicle)) return recommendation;

  const planImpact = evaluateRepairPlanImpact(parseRepairPlan(vehicle), context);

  if (recommendation === RECOMMENDATION.BUY && planImpact.downgradeBuyToMaybe) {
    return RECOMMENDATION.MAYBE;
  }
  if (
    (recommendation === RECOMMENDATION.MAYBE || recommendation === RECOMMENDATION.BUY) &&
    planImpact.downgradeMaybeToPass
  ) {
    return RECOMMENDATION.PASS;
  }
  return recommendation;
}

function applyRepairPlanToConfidence(confidenceLabel, vehicle) {
  if (!hasRepairPlanData(vehicle)) return confidenceLabel;

  const planImpact = evaluateRepairPlanImpact(parseRepairPlan(vehicle));

  if (planImpact.confidencePenalty && confidenceLabel === "High") {
    return "Medium";
  }
  if (planImpact.confidenceBoost && confidenceLabel === "Medium") {
    return "High";
  }
  if (planImpact.confidencePenalty && confidenceLabel === "Medium") {
    return "Low";
  }
  return confidenceLabel;
}

function deriveRecommendation(flipScore, context, vehicle, marginPercent) {
  if (vehicle?.flip_recommendation) {
    const rec = String(vehicle.flip_recommendation).toUpperCase();
    if (Object.values(RECOMMENDATION).includes(rec)) return rec;
  }

  const {
    profit,
    roiPercent,
    severeRedFlagCount,
    repairRatio,
    confidenceLabel,
    bid,
    resale,
    transportCost,
  } = context;

  const profitBeforeTransport = profit + (transportCost || 0);
  const transportHeavy =
    transportCost > 0 &&
    profitBeforeTransport > 0 &&
    transportCost / profitBeforeTransport > 0.25;

  if (
    profit < 0 ||
    severeRedFlagCount > 0 ||
    repairRatio > 0.55 ||
    (resale > 0 && repairRatio > 0.45 && profit < 750) ||
    (bid < 300 && !isPrivateParty(vehicle) && resale > 3000)
  ) {
    return RECOMMENDATION.PASS;
  }

  let recommendation = RECOMMENDATION.MAYBE;

  if (
    flipScore >= 72 &&
    profit > 0 &&
    roiPercent >= marginPercent - 2 &&
    confidenceLabel !== "Low" &&
    severeRedFlagCount === 0 &&
    repairRatio <= 0.35
  ) {
    recommendation = RECOMMENDATION.BUY;
  }

  if (flipScore < 45 || profit < 0) {
    return RECOMMENDATION.PASS;
  }

  if (recommendation === RECOMMENDATION.BUY && transportHeavy) {
    return RECOMMENDATION.MAYBE;
  }

  return applyRepairPlanToRecommendation(recommendation, vehicle, context);
}

// ── Main exports ───────────────────────────────────────────────

export function calculateFlipDecision(vehicle, flipMetrics, options = {}) {
  if (!vehicle || !flipMetrics) {
    return {
      recommendation: RECOMMENDATION.MAYBE,
      flipScore: 50,
      confidenceLabel: "Low",
      riskLevel: "Medium",
      expectedProfit: 0,
      roiPercent: 0,
      walkAwayPrice: 0,
      reasons: [],
      warnings: ["Insufficient data to evaluate this vehicle."],
      explanation: "Not enough data to generate a recommendation.",
    };
  }

  const marginPercent = Number(options.marginPercent ?? 15);
  const transportCost = Math.round(
    Number(flipMetrics.transportCost) || getEffectiveTransportCost(vehicle)
  );
  const profit = Math.round(Number(flipMetrics.profit) || 0);
  const bid = Math.round(Number(flipMetrics.bid) || 0);
  const resale = Math.round(Number(flipMetrics.resale) || getResaleAmount(vehicle));
  const repair = Math.round(Number(flipMetrics.repair) || getRepairAmount(vehicle));
  const roiPercent = resale > 0
    ? Number(((profit / resale) * 100).toFixed(1))
    : Number(flipMetrics.marginActual || 0);

  const redFlags = parseRedFlags(vehicle);
  const severeRedFlagCount = countSevereRedFlags(vehicle);
  const repairRatio = resale > 0 ? repair / resale : 1;
  const knownIssueCount = parseKnownIssues(vehicle).length + parseWearItems(vehicle).length;
  let confidenceLabel = inferEstimateConfidence(vehicle);

  if (
    vehicle?.transport_type === "drive_home" &&
    isSalvageAuction(vehicle) &&
    confidenceLabel === "High"
  ) {
    confidenceLabel = "Medium";
  }

  confidenceLabel = applyRepairPlanToConfidence(confidenceLabel, vehicle);

  const context = {
    profit,
    bid,
    resale,
    repair,
    roiPercent,
    redFlagCount: redFlags.length,
    severeRedFlagCount,
    repairRatio,
    knownIssueCount,
    confidenceLabel,
    transportCost,
  };

  const flipScore = computeFlipScore(vehicle, flipMetrics, context);
  let riskLevel = vehicle?.risk_level || deriveRiskLevel(flipScore, severeRedFlagCount, repairRatio, profit);

  if (hasRepairPlanData(vehicle)) {
    const planScore = parseRepairPlan(vehicle).repair_difficulty_score ?? 0;
    if (planScore >= 8 && riskLevel === "Low") riskLevel = "Medium";
    else if (planScore >= 9 && riskLevel !== "High") riskLevel = "High";
  }

  const recommendation = deriveRecommendation(flipScore, context, vehicle, marginPercent);
  const reasons = vehicle?.buy_reasons?.length ? vehicle.buy_reasons : buildReasons(vehicle, context);
  const warnings = vehicle?.watch_out_for?.length ? vehicle.watch_out_for : buildWarnings(vehicle, context);
  const walkAwayPrice = computeWalkAwayPrice(bid, vehicle);

  const decision = {
    recommendation,
    flipScore,
    confidenceLabel,
    riskLevel,
    expectedProfit: profit,
    roiPercent,
    walkAwayPrice,
    reasons,
    warnings,
    explanation: buildRecommendationExplanation(vehicle, flipMetrics, {
      recommendation,
      flipScore,
      confidenceLabel,
      riskLevel,
      expectedProfit: profit,
      roiPercent,
      walkAwayPrice,
      reasons,
      warnings,
    }),
  };

  return decision;
}

export function buildRecommendationExplanation(vehicle, flipMetrics, decision) {
  if (vehicle?.recommendation_summary) return vehicle.recommendation_summary;

  const rec = decision?.recommendation || RECOMMENDATION.MAYBE;
  const profit = decision?.expectedProfit ?? flipMetrics?.profit ?? 0;
  const repair = getRepairAmount(vehicle);
  const resale = getResaleAmount(vehicle);
  const repairRatio = resale > 0 ? repair / resale : 0;
  const damage = vehicle?.damage_description || "the reported damage";
  const title = vehicle?.title_code || vehicle?.title_status || "the title status";
  const issues = parseKnownIssues(vehicle);
  const topIssue = issues[0]?.issue;

  if (rec === RECOMMENDATION.PASS) {
    const primary = decision?.warnings?.[0] || "the risk outweighs the upside";
    return `We recommend passing on this one. ${primary}. Expected profit is ${profit >= 0 ? "thin" : "negative"} after fees, repair, and taxes.`;
  }

  if (rec === RECOMMENDATION.MAYBE) {
    return `This could work, but proceed carefully. ${damage} and ${title} create uncertainty. Profit looks ${profit > 0 ? `positive at $${profit.toLocaleString()}` : "tight"}, but ${decision?.warnings?.[0] || "verify repair costs and title before committing"}.`;
  }

  const spread =
    repairRatio <= 0.2
      ? "a strong resale spread with relatively low repair cost"
      : "a workable spread if repair stays on budget";

  let text = `This vehicle appears to offer ${spread}. Estimated repair is $${repair.toLocaleString()} against a $${resale.toLocaleString()} exit, supporting roughly $${profit.toLocaleString()} profit at your target margin.`;

  if (topIssue) {
    text += ` The main long-term risk is ${topIssue.toLowerCase()} — budget for it beyond the visible damage.`;
  } else if (decision?.warnings?.length) {
    text += ` Watch for: ${decision.warnings[0].toLowerCase()}.`;
  } else {
    text += " Condition and title look manageable for a flip at the suggested bid.";
  }

  return text;
}

export function extractRepairHighlights(vehicle) {
  const items = parseRepairItems(vehicle);
  const highlights = items
    .filter((item) => item.description)
    .slice(0, 6)
    .map((item) => item.description);

  const summary = String(vehicle?.repair_details || "").trim();
  const notes = [];

  const damage = normalizeText(vehicle?.damage_description);
  if (!damage.includes("structural") && !damage.includes("frame")) {
    notes.push("No major visible structural damage detected.");
  }
  if (!damage.includes("airbag")) {
    notes.push("No airbags deployed noted.");
  }

  if (!highlights.length && summary) {
    const sentences = summary.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    highlights.push(...sentences.slice(0, 4));
  }

  return { highlights, notes, confidence: inferRepairConfidence(vehicle) };
}
