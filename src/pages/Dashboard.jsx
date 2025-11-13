import React, { useEffect, useState } from "react";
import axios from "axios";

// -----------------------------------------------
// Currency Formatter
// -----------------------------------------------
const formatMoney = (value) => {
  if (isNaN(value)) return "$0.00";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
};

// -----------------------------------------------
// Max Bid Calculation
// -----------------------------------------------
const computeMaxBid = (repair, resale, marginPercent, taxRate, titleFee) => {
  try {
    const copartFeeRate = 0.075;
    const margin = marginPercent / 100;

    const profitTarget = resale * margin;

    // Solve for bid
    const denominator = 1 + copartFeeRate + taxRate / 100;
    const numerator = resale - repair - titleFee - profitTarget;

    const bid = numerator / denominator;

    return bid > 0 && isFinite(bid) ? bid : 0;
  } catch {
    return 0;
  }
};

// -----------------------------------------------
// Profit Calculation
// -----------------------------------------------
const computeProfit = (bid, repair, resale, taxRate, titleFee) => {
  try {
    const copartFeeRate = 0.075;

    const taxAmount = bid * (taxRate / 100);
    const copartFee = bid * copartFeeRate;

    const totalCost = bid + repair + taxAmount + copartFee + titleFee;

    return resale - totalCost;
  } catch {
    return 0;
  }
};

// -----------------------------------------------
// DASHBOARD COMPONENT
// -----------------------------------------------
const Dashboard = () => {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState(null);

  // Stores all edits synced between card & modal
  const [editedValues, setEditedValues] = useState({});

  // ---------------------------------------------
  // Fetch Vehicles
  // ---------------------------------------------
  useEffect(() => {
    const fetchCars = async () => {
      try {
        const response = await axios.get(
          `${
            process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com"
          }/get_vehicles`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        const data = response.data?.vehicles || [];

        // Initialize edited values for each vehicle
        const initial = {};
        data.forEach((car) => {
          const repair = Number(car.repair_estimate || 0);
          const resale = Number(car.resale_estimate || 0);
          const taxRate = Number(car.avg_tax_rate || 0);
          const titleFee = Number(car.title_fee || 0);
          const margin = 15; // default

          const maxBid = computeMaxBid(repair, resale, margin, taxRate, titleFee);
          const profit = computeProfit(maxBid, repair, resale, taxRate, titleFee);

          initial[car.id] = {
            repair,
            resale,
            margin,
            maxBid,
            profit,
          };
        });

        setEditedValues(initial);
        setCars(data);
      } catch (err) {
        console.error("Failed to fetch vehicles:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

  // ---------------------------------------------
  // Update Vehicle Local Values (Card & Modal)
  // ---------------------------------------------
  const updateVehicle = (id, field, value, vehicle) => {
    setEditedValues((prev) => {
      const updated = { ...prev };
      const current = { ...updated[id] };

      current[field] = Number(value) || 0;

      // Recalculate maxBid + profit when key fields change
      const maxBid = computeMaxBid(
        current.repair,
        current.resale,
        current.margin,
        vehicle.avg_tax_rate,
        vehicle.title_fee
      );

      const profit = computeProfit(
        maxBid,
        current.repair,
        current.resale,
        vehicle.avg_tax_rate,
        vehicle.title_fee
      );

      current.maxBid = maxBid;
      current.profit = profit;

      updated[id] = current;
      return updated;
    });
  };

  // ---------------------------------------------
  // Render
  // ---------------------------------------------
  if (loading) return <p className="text-center text-gray-700">Loading...</p>;

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cars.map((car) => {
        const ev = editedValues[car.id];
        if (!ev) return null;

        return (
          <div
            key={car.id}
            className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
          >
            {/* Image */}
            <div className="relative">
              <img
                src={car.image_url}
                alt={`${car.make} ${car.model}`}
                className="w-full h-56 object-cover"
              />

              <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                {car.damage_description || "Unknown Damage"}
              </div>
            </div>

            {/* Info Section */}
            <div className="p-4 space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {car.year} {car.make} {car.model}
              </h2>

              <p className="text-sm text-gray-500">Lot #: {car.lot_number}</p>

              {/* Location */}
              <p className="text-sm text-gray-500">
                Location: {car.location || car.sale_name || "N/A"}
              </p>

              {/* Sale Date */}
              <p className="text-sm text-gray-500">
                Sale Date:{" "}
                {car.sale_date
                  ? new Date(car.sale_date).toLocaleDateString()
                  : "N/A"}
              </p>

              {/* Editable Repair & Resale */}
              <div className="flex justify-between text-gray-700 pt-2 border-t border-gray-100">
                <div>
                  Repair: $
                  <input
                    type="number"
                    value={ev.repair}
                    onChange={(e) =>
                      updateVehicle(car.id, "repair", e.target.value, car)
                    }
                    className="w-20 ml-1 border rounded px-1"
                  />
                </div>

                <div>
                  Resale: $
                  <input
                    type="number"
                    value={ev.resale}
                    onChange={(e) =>
                      updateVehicle(car.id, "resale", e.target.value, car)
                    }
                    className="w-20 ml-1 border rounded px-1"
                  />
                </div>
              </div>

              {/* Max Bid + Profit (Two Columns) */}
              <div className="flex justify-between text-gray-800 font-medium pt-2">
                <div>Max Bid: {formatMoney(ev.maxBid)}</div>
                <div>Profit: {formatMoney(ev.profit)}</div>
              </div>

              {/* View Details Button */}
              <div className="flex justify-start items-center pt-3">
                <button
                  onClick={() => setSelectedCar(car)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 transition"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* ---------------- MODAL ---------------- */}
      {selectedCar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setSelectedCar(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
            >
              ✕
            </button>

            <h2 className="text-xl font-semibold mb-2 text-gray-800">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>

            <p className="text-sm text-gray-500">
              Location: {selectedCar.location || selectedCar.sale_name}
            </p>

            <p className="text-sm text-gray-500 mb-3">
              Sale Date:{" "}
              {selectedCar.sale_date
                ? new Date(selectedCar.sale_date).toLocaleString()
                : "N/A"}
            </p>

            {/* MODAL EDITABLES */}
            {editedValues[selectedCar.id] && (
              <>
                <div className="flex justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">
                    Repair: $
                  </label>
                  <input
                    type="number"
                    value={editedValues[selectedCar.id].repair}
                    onChange={(e) =>
                      updateVehicle(
                        selectedCar.id,
                        "repair",
                        e.target.value,
                        selectedCar
                      )
                    }
                    className="w-24 border rounded px-1"
                  />
                </div>

                <div className="flex justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">
                    Resale: $
                  </label>
                  <input
                    type="number"
                    value={editedValues[selectedCar.id].resale}
                    onChange={(e) =>
                      updateVehicle(
                        selectedCar.id,
                        "resale",
                        e.target.value,
                        selectedCar
                      )
                    }
                    className="w-24 border rounded px-1"
                  />
                </div>

                <div className="flex justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">
                    Margin (%):
                  </label>
                  <input
                    type="number"
                    value={editedValues[selectedCar.id].margin}
                    onChange={(e) =>
                      updateVehicle(
                        selectedCar.id,
                        "margin",
                        e.target.value,
                        selectedCar
                      )
                    }
                    className="w-20 border rounded px-1"
                  />
                </div>

                {/* COST BREAKDOWN */}
                <div className="bg-gray-50 p-4 rounded-lg mt-4 space-y-1 text-gray-700 text-sm">
                  <p>
                    Max Bid:{" "}
                    <span className="font-semibold">
                      {formatMoney(editedValues[selectedCar.id].maxBid)}
                    </span>
                  </p>

                  <p>
                    Potential Profit:{" "}
                    <span className="font-semibold">
                      {formatMoney(editedValues[selectedCar.id].profit)}
                    </span>
                  </p>

                  <p>Tax Rate: {selectedCar.avg_tax_rate}%</p>
                  <p>Title Fee: {formatMoney(selectedCar.title_fee)}</p>
                  <p>Copart Fee Rate: 7.5%</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
