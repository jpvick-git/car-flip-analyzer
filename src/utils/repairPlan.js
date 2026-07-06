import { parseRepairItems, sumRepairItems } from "./repairBreakdown";

function parseJsonArray(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const EMPTY_REPAIR_PLAN = {
  repair_difficulty_score: null,
  repair_difficulty_label: null,
  parts_availability: null,
  estimated_labor_hours: null,
  estimated_repair_days_min: null,
  estimated_repair_days_max: null,
  diy_friendly: null,
  parts_needed: [],
  shop_services_needed: [],
  repair_plan_summary: "",
  repair_plan_warnings: [],
  hidden_damage_risks: [],
};

const SEVERE_HIDDEN_RISK_KEYWORDS = [
  "frame",
  "airbag",
  "suspension",
  "hybrid battery",
  "adas",
  "flood",
  "electrical",
  "drivetrain",
  "structural",
  "unibody",
  "subframe",
];

const SEVERE_SHOP_SERVICE_KEYWORDS = [
  "frame measurement",
  "frame straighten",
  "airbag",
  "adas calibration",
  "structural repair",
  "structural",
  "unibody",
];

const DIY_CATEGORIES = new Set(["body", "lighting", "interior", "trim", "cosmetic", "general"]);

const SHOP_TASK_KEYWORDS =
  /paint|blend|refinish|align|calibrat|frame|measure|diagnostic|dent repair|body shop|gap check|hinge|structural|airbag|adas/i;

export function getRepairDifficultyLabel(score) {
  const n = safeNumber(score);
  if (n == null) return "Unknown";
  if (n <= 3) return "Easy";
  if (n <= 6) return "Medium";
  if (n <= 8) return "Hard";
  return "Expert";
}

export function getRepairDifficultyDescription(label) {
  switch (label) {
    case "Easy":
      return "Mostly bolt-on parts. Good DIY candidate.";
    case "Medium":
      return "Some DIY work possible, but paint, alignment, or diagnostics may be needed.";
    case "Hard":
      return "Likely requires body shop, advanced tools, or structural inspection.";
    case "Expert":
      return "High-risk repair involving frame, airbags, ADAS, drivetrain, or major structural work.";
    default:
      return "Repair difficulty not yet assessed.";
  }
}

export function parseRepairPlan(vehicle) {
  if (!vehicle) return { ...EMPTY_REPAIR_PLAN };

  const score = safeNumber(vehicle.repair_difficulty_score);
  const label =
    vehicle.repair_difficulty_label?.trim() ||
    (score != null ? getRepairDifficultyLabel(score) : null);

  return {
    repair_difficulty_score: score,
    repair_difficulty_label: label,
    parts_availability: vehicle.parts_availability?.trim() || null,
    estimated_labor_hours: safeNumber(vehicle.estimated_labor_hours),
    estimated_repair_days_min: safeNumber(vehicle.estimated_repair_days_min),
    estimated_repair_days_max: safeNumber(vehicle.estimated_repair_days_max),
    diy_friendly: vehicle.diy_friendly?.trim() || null,
    parts_needed: parseJsonArray(vehicle.parts_needed),
    shop_services_needed: parseJsonArray(vehicle.shop_services_needed),
    repair_plan_summary: String(vehicle.repair_plan_summary || "").trim(),
    repair_plan_warnings: parseJsonArray(vehicle.repair_plan_warnings),
    hidden_damage_risks: parseJsonArray(vehicle.hidden_damage_risks),
  };
}

export function hasRepairPlanData(vehicle) {
  const plan = parseRepairPlan(vehicle);
  const hasScore = plan.repair_difficulty_score != null && plan.repair_difficulty_score > 0;
  const hasLabor = plan.estimated_labor_hours != null && plan.estimated_labor_hours > 0;
  return (
    hasScore ||
    hasLabor ||
    plan.parts_needed.length > 0 ||
    plan.shop_services_needed.length > 0 ||
    plan.repair_plan_summary.length > 0 ||
    plan.repair_plan_warnings.length > 0 ||
    plan.hidden_damage_risks.length > 0
  );
}

export function buildAllInRepairBreakdown(vehicle) {
  const lineItems = parseRepairItems(vehicle);
  const fromLines = sumRepairItems(lineItems);
  const total = fromLines > 0 ? fromLines : Math.max(0, Number(vehicle?.repair_estimate) || 0);

  const partsLow = (parseRepairPlan(vehicle).parts_needed || []).reduce(
    (sum, p) => sum + (Number(p.estimated_price_low) || 0),
    0
  );
  const partsHigh = (parseRepairPlan(vehicle).parts_needed || []).reduce(
    (sum, p) => sum + (Number(p.estimated_price_high) || 0),
    0
  );

  return {
    lineItems,
    total,
    partsOnlyLow: partsLow,
    partsOnlyHigh: partsHigh,
    hasLineItems: lineItems.length > 0,
  };
}

export function formatRepairTimeline(plan) {
  const min = plan?.estimated_repair_days_min;
  const max = plan?.estimated_repair_days_max;
  if (min != null && max != null) {
    if (min === max) return `${min} day${min === 1 ? "" : "s"}`;
    if (max <= 14) {
      const minWeeks = Math.max(1, Math.round(min / 7));
      const maxWeeks = Math.max(minWeeks, Math.round(max / 7));
      if (minWeeks === maxWeeks) return `${minWeeks} week${minWeeks === 1 ? "" : "s"}`;
      return `${minWeeks}-${maxWeeks} weeks`;
    }
    return `${Math.round(min)}-${Math.round(max)} days`;
  }
  if (max != null) return `Up to ${Math.round(max)} days`;
  if (min != null) return `${Math.round(min)}+ days`;
  return "—";
}

export function summarizeRepairPlan(repairPlan) {
  if (!repairPlan) return "";
  if (repairPlan.repair_plan_summary) return repairPlan.repair_plan_summary;

  const parts = [];
  if (repairPlan.repair_difficulty_label) {
    parts.push(`${repairPlan.repair_difficulty_label} repair`);
  }
  if (repairPlan.parts_availability) {
    parts.push(`${repairPlan.parts_availability.toLowerCase()} parts availability`);
  }
  const timeline = formatRepairTimeline(repairPlan);
  if (timeline !== "—") parts.push(`${timeline} turnaround`);
  return parts.join(" · ") || "Repair plan not yet generated.";
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function normalizeName(value) {
  return normalizeText(value).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function namesOverlap(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function isShopOnlyTask(name) {
  return SHOP_TASK_KEYWORDS.test(String(name || ""));
}

function listContainsKeyword(items, keywords) {
  const texts = items.map((item) => {
    if (typeof item === "string") return normalizeText(item);
    return normalizeText(item?.name || item?.issue || item?.description || "");
  });
  return keywords.some((kw) => texts.some((t) => t.includes(kw)));
}

export function inferDiyAndShopTasks(repairPlan) {
  const diyTasks = [];
  const shopTasks = [];
  const partNames = (repairPlan?.parts_needed || []).map((p) => p.name).filter(Boolean);

  (repairPlan?.parts_needed || []).forEach((part) => {
    const category = normalizeText(part?.category);
    const name = part?.name || "";
    if (!name || category === "paint") return;
    if (DIY_CATEGORIES.has(category) || category.includes("body") || category.includes("light") || category.includes("trim")) {
      diyTasks.push(`Install ${name}`);
    }
  });

  (repairPlan?.shop_services_needed || []).forEach((svc) => {
    const name = typeof svc === "string" ? svc : svc?.name;
    if (!name) return;
    const duplicatesPart = partNames.some((partName) => namesOverlap(partName, name));
    if (duplicatesPart && !isShopOnlyTask(name)) return;
    shopTasks.push(name);
  });

  if (repairPlan?.repair_difficulty_score >= 7 && shopTasks.length === 0) {
    shopTasks.push("Professional body shop work likely required");
  }

  return {
    diyTasks: [...new Set(diyTasks)].slice(0, 6),
    shopTasks: [...new Set(shopTasks)].slice(0, 6),
  };
}

export function getRepairPlanWarnings(vehicle, repairPlan) {
  const plan = repairPlan || parseRepairPlan(vehicle);
  const warnings = [...(plan.repair_plan_warnings || [])];

  const score = plan.repair_difficulty_score;
  if (score >= 7) {
    warnings.push("Repair difficulty is high for the expected profit.");
  }
  if (normalizeText(plan.parts_availability) === "poor") {
    warnings.push("Parts availability may slow down the flip.");
  }
  if (plan.estimated_repair_days_max > 21) {
    warnings.push("This could tie up your cash for 3+ weeks.");
  }
  if (listContainsKeyword(plan.hidden_damage_risks, ["frame", "structural", "radiator support"])) {
    warnings.push("Hidden structural damage could change the repair cost.");
  }
  if (
    listContainsKeyword(plan.hidden_damage_risks, ["adas"]) ||
    listContainsKeyword(plan.shop_services_needed, ["adas"])
  ) {
    warnings.push("ADAS calibration may add cost after repair.");
  }
  if (score >= 7 || listContainsKeyword(plan.shop_services_needed, ["paint", "body"])) {
    warnings.push("This looks more like a body-shop repair than a DIY flip.");
  }

  return [...new Set(warnings.map((w) => String(w).trim()).filter(Boolean))];
}

export function evaluateRepairPlanImpact(repairPlan, context = {}) {
  const plan = repairPlan || EMPTY_REPAIR_PLAN;
  const profit = Number(context.profit) || 0;
  const score = plan.repair_difficulty_score ?? 0;
  const partsAvail = normalizeText(plan.parts_availability);
  const daysMax = plan.estimated_repair_days_max ?? 0;

  const severeHidden = listContainsKeyword(plan.hidden_damage_risks, SEVERE_HIDDEN_RISK_KEYWORDS);
  const severeShop = listContainsKeyword(plan.shop_services_needed, SEVERE_SHOP_SERVICE_KEYWORDS);

  const downgradeBuyToMaybe =
    score >= 7 || partsAvail === "poor" || daysMax > 21 || severeHidden || severeShop;

  const thinProfit = profit > 0 && profit < 1500;
  const downgradeMaybeToPass =
    score >= 9 ||
    (thinProfit && score >= 7) ||
    (partsAvail === "poor" && profit < 2500) ||
    (severeHidden && score >= 7) ||
    (daysMax > 28 && profit < 2000);

  const confidenceBoost =
    score <= 6 && score > 0 && (partsAvail === "good" || partsAvail === "high") && !severeHidden && daysMax <= 14;

  const confidencePenalty = score >= 7 || partsAvail === "poor" || severeHidden || daysMax > 21;

  let scoreAdjustment = 0;
  if (score >= 9) scoreAdjustment -= 20;
  else if (score >= 7) scoreAdjustment -= 12;
  else if (score <= 3 && score > 0) scoreAdjustment += 8;
  else if (score <= 6 && score > 0) scoreAdjustment += 4;

  if (partsAvail === "poor") scoreAdjustment -= 8;
  if (partsAvail === "good" || partsAvail === "high") scoreAdjustment += 4;
  if (daysMax > 21) scoreAdjustment -= 6;
  if (severeHidden) scoreAdjustment -= 10;

  const warnings = getRepairPlanWarnings(null, plan);

  return {
    downgradeBuyToMaybe,
    downgradeMaybeToPass,
    confidenceBoost,
    confidencePenalty,
    scoreAdjustment,
    warnings,
    hasPlan: hasRepairPlanData({ ...plan, repair_difficulty_score: plan.repair_difficulty_score }),
  };
}

export function difficultyStyles(label) {
  switch (label) {
    case "Easy":
      return { badge: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" };
    case "Medium":
      return { badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500" };
    case "Hard":
      return { badge: "bg-orange-100 text-orange-800", bar: "bg-orange-500" };
    case "Expert":
      return { badge: "bg-red-100 text-red-800", bar: "bg-red-500" };
    default:
      return { badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400" };
  }
}

export function formatPartPrice(part) {
  const low = Number(part?.estimated_price_low) || 0;
  const high = Number(part?.estimated_price_high) || 0;
  if (low > 0 && high > 0 && low !== high) {
    return `$${low.toLocaleString()} - $${high.toLocaleString()}`;
  }
  if (high > 0) return `$${high.toLocaleString()}`;
  if (low > 0) return `$${low.toLocaleString()}`;
  return "Estimate TBD";
}
