import { isDealer } from "./userSettings";

export { isDealer };

/**
 * Vocabulary that shifts between flipper and dealer (lot) framing.
 * Pass the user settings object; falls back to flipper terms.
 */
export function modeLabels(settings) {
  const dealer = isDealer(settings);
  return {
    dealer,
    maxOffer: dealer ? "Max Buy" : "Max Bid",
    resale: dealer ? "Retail" : "Resale",
    repair: dealer ? "Recon" : "Repair",
    unit: dealer ? "unit" : "vehicle",
    units: dealer ? "units" : "vehicles",
    profit: dealer ? "Front Gross" : "Profit",
    inventoryTitle: dealer ? "Inventory" : "Vehicle Inventory",
  };
}
