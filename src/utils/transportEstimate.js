import { geocodeAddress, normalizeLocationQuery, roadMilesFromCoords } from "./addressSearch";
import {
  TRANSPORT_TYPES,
  defaultPickupLocation,
  estimateTransportCost,
  getEffectiveTransportCost,
} from "./transportCalculator";

const geocodeCache = new Map();
const estimateCache = new Map();

function defaultDeliveryLocation(vehicle, settings) {
  if (vehicle?.transport_delivery_location) {
    return vehicle.transport_delivery_location;
  }
  return settings?.shop_location || "";
}

function defaultTransportType(vehicle, settings) {
  if (vehicle?.transport_type && TRANSPORT_TYPES.includes(vehicle.transport_type)) {
    return vehicle.transport_type;
  }
  return settings?.default_transport_type || "local_tow";
}

async function geocodeCached(query) {
  const key = normalizeLocationQuery(query).toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const result = await geocodeAddress(query);
  geocodeCache.set(key, result);
  return result;
}

function estimateCacheKey(vehicle, settings) {
  const pickup = defaultPickupLocation(vehicle)?.trim();
  const delivery = defaultDeliveryLocation(vehicle, settings)?.trim();
  if (!pickup || pickup.length < 3 || !delivery || delivery.length < 3) return null;

  const type = defaultTransportType(vehicle, settings);
  return `${normalizeLocationQuery(pickup).toLowerCase()}|${normalizeLocationQuery(delivery).toLowerCase()}|${type}`;
}

export function getCachedTransportEstimate(vehicle, settings) {
  const key = estimateCacheKey(vehicle, settings);
  if (!key) return null;
  const cost = estimateCache.get(key);
  return Number.isFinite(cost) ? cost : null;
}

export function clearTransportEstimateCache() {
  estimateCache.clear();
}

export function isTransportSavedOnVehicle(vehicle) {
  if (!vehicle) return false;
  if (getEffectiveTransportCost(vehicle) > 0) return true;
  const miles = Number(vehicle.transport_distance_miles);
  return Number.isFinite(miles) && miles > 0;
}

export async function prefetchTransportEstimates(vehicles, settings) {
  const delivery = settings?.shop_location?.trim();
  if (!delivery || !Array.isArray(vehicles) || vehicles.length === 0) return;

  await Promise.all(
    vehicles.map(async (vehicle) => {
      if (isTransportSavedOnVehicle(vehicle)) return;

      const key = estimateCacheKey(vehicle, settings);
      if (!key || estimateCache.has(key)) return;

      const pickup = defaultPickupLocation(vehicle)?.trim();
      const [pickupResult, deliveryResult] = await Promise.all([
        geocodeCached(pickup),
        geocodeCached(delivery),
      ]);

      if (pickupResult?.lat == null || deliveryResult?.lat == null) return;

      const miles = roadMilesFromCoords(
        pickupResult.lat,
        pickupResult.lon,
        deliveryResult.lat,
        deliveryResult.lon
      );
      const cost = estimateTransportCost({
        distanceMiles: miles,
        transportType: defaultTransportType(vehicle, settings),
      });

      estimateCache.set(key, cost);
    })
  );
}
