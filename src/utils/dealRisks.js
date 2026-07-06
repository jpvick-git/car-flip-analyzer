import { parseRedFlags, isPrivateParty, isSalvageAuction } from "./vehicleSource";
import { parseRepairPlan, getRepairPlanWarnings } from "./repairPlan";
import { getTransportWarnings } from "./transportCalculator";
import { parseKnownIssues } from "./knownIssues";

const CATEGORY_ORDER = [
  "Repair Risk",
  "Transport Risk",
  "Title / Auction Risk",
  "Ownership Risk",
  "Market Risk",
];

function normalizeKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function categorizeWarning(text) {
  const t = normalizeKey(text);
  if (/transport|haul|carrier|mile|pickup|delivery|drive home/.test(t)) {
    return "Transport Risk";
  }
  if (/title|salvage|rebuilt|flood|auction|copart|lien|registration/.test(t)) {
    return "Title / Auction Risk";
  }
  if (/platform|ownership|mileage|wear|known issue|long-term|reliability/.test(t)) {
    return "Ownership Risk";
  }
  if (/profit|margin|roi|thin|resale|market|bid/.test(t)) {
    return "Market Risk";
  }
  return "Repair Risk";
}

function addRisk(risks, seen, category, message, priority = 2) {
  const key = normalizeKey(message);
  if (!key || seen.has(key)) return;
  seen.add(key);
  risks.push({
    category: CATEGORY_ORDER.includes(category) ? category : categorizeWarning(message),
    message: String(message).trim(),
    priority,
  });
}

export function collectDealRisks(vehicle, context = {}) {
  const { decision, flipMetrics, transportCost } = context;
  const risks = [];
  const seen = new Set();

  const plan = parseRepairPlan(vehicle);

  getRepairPlanWarnings(vehicle, plan).forEach((w) => {
    addRisk(risks, seen, "Repair Risk", w, 1);
  });

  (plan.hidden_damage_risks || []).forEach((risk) => {
    const msg =
      typeof risk === "string"
        ? `Verify ${risk.toLowerCase()} before bidding`
        : String(risk);
    addRisk(risks, seen, "Repair Risk", msg, 1);
  });

  parseRedFlags(vehicle).forEach((flag) => {
    const text = typeof flag === "string" ? flag : flag?.flag || flag?.message || "";
    if (text) addRisk(risks, seen, "Title / Auction Risk", text, 1);
  });

  (decision?.warnings || []).forEach((w) => {
    addRisk(risks, seen, categorizeWarning(w), w, 2);
  });

  if (vehicle?.needs_manual_review) {
    addRisk(risks, seen, "Repair Risk", "AI flagged this vehicle for manual review.", 1);
  }

  const profit = Number(flipMetrics?.profit ?? decision?.expectedProfit) || 0;
  const profitBeforeTransport = profit + (Number(transportCost) || 0);
  getTransportWarnings({
    vehicle,
    distanceMiles: vehicle?.transport_distance_miles,
    transportType: vehicle?.transport_type,
    transportCost: Number(transportCost) || 0,
    expectedProfitBeforeTransport: profitBeforeTransport,
  }).forEach((w) => {
    addRisk(risks, seen, "Transport Risk", w, 1);
  });

  if (isSalvageAuction(vehicle) && !isPrivateParty(vehicle)) {
    const title = [vehicle?.title_code, vehicle?.title_status].filter(Boolean).join(" ");
    if (title) {
      addRisk(
        risks,
        seen,
        "Title / Auction Risk",
        `Salvage auction title: ${title} — verify retail exit impact.`,
        3
      );
    }
  }

  parseKnownIssues(vehicle)
    .slice(0, 3)
    .forEach((issue) => {
      const label = issue?.issue || issue?.item;
      if (label) {
        addRisk(
          risks,
          seen,
          "Ownership Risk",
          `Platform risk: ${label}${issue.cost_range ? ` (${issue.cost_range})` : ""}`,
          3
        );
      }
    });

  if (profit > 0 && profit < 750) {
    addRisk(risks, seen, "Market Risk", "Profit margin is thin — small overruns erase the deal.", 2);
  }

  risks.sort((a, b) => a.priority - b.priority || a.category.localeCompare(b.category));
  return risks;
}

export function groupDealRisks(risks) {
  const grouped = {};
  for (const cat of CATEGORY_ORDER) {
    grouped[cat] = [];
  }
  for (const risk of risks) {
    const cat = CATEGORY_ORDER.includes(risk.category) ? risk.category : "Repair Risk";
    grouped[cat].push(risk);
  }
  return grouped;
}
