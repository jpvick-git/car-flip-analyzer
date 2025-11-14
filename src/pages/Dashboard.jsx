import React, { useEffect, useState } from "react";
import axios from "axios";
import { Wrench, DollarSign } from "lucide-react";

const Dashboard = () => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [tempMargin, setTempMargin] = useState(15); // Default margin used ONLY inside modal
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ----------------------------------------------------------
  // CENTRAL CALCULATION FUNCTION (REAL-WORLD MATH)
  // ----------------------------------------------------------
  const calculateCarWithMargin = (car, marginInput) => {
    const resale = Number(car.resale_estimate || 0);
    const repair = Number(car.repair_estimate || 0);
    const taxRate = Number(car.avg_tax_rate || 0);
    const titleFee = Number(car.title_fee || 0);

    const margin = Number(marginInput) / 100;

    // Algebraic bid formula
    const divisor = 1 + 0.075 + taxRate / 100;
    let bid = (resale * (1 - margin) - titleFee - repair) / divisor;

    if (isNaN(bid) || bid < 0) bid = 0;
    bid = Math.round(bid);

    // Breakdown
    const buyerFee = bid * 0.075;
    const taxAmt = bid * (taxRate / 100);
    const totalCost = bid + buyerFee + taxAmt + titleFee + repair;
    const profit = resale - totalCost;
    const marginActual = resale > 0 ? (profit / resale) * 100 : 0;

    return {
      ...car,
      max_bid: bid,
      buyer_fee: Math.round(buyerFee),
      tax_amount_calc: Math.round(taxAmt),
      total_cost: Math.round(totalCost),
      profit: Math.round(profit),
      margin_actual: Number(marginActual.toFixed(1)),

      // 🔥 Needed for modal — fixes black screen
      repair,
      resale,
    };
  };

  // ----------------------------------------------------------
  // LOAD VEHICLES + INITIAL CALC (DEFAULT 15% MARGIN)
  // ----------------------------------------------------------
  useEffect(() => {
    const fetchCars = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          `${process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com"}/get_vehicles`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          }
        );

        let vehicles = [];
        const data = response.data;

        if (Array.isArray(data)) vehicles = data;
        else if (data && Array.isArray(data.vehicles)) vehicles = data.vehicles;

        vehicles = vehicles.map((car) => calculateCarWithMargin(car, 15));

        setCars(vehicles);
      } catch (err) {
        console.error(err);
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

  // ----------------------------------------------------------
  // UPDATE REPAIR, RESALE, OR MARGIN LIVE
  // ----------------------------------------------------------
  const updateCarValue = (id, field, value) => {
    setCars((prev) =>
      prev.map((car) => {
        if (car.id !== id) return car;
        return calculateCarWithMargin({ ...car, [field]: value }, tempMargin);
      })
    );
  };

  // ----------------------------------------------------------
  // LOADING + ERROR SCREENS
  // ----------------------------------------------------------
  if (loading)
    return (
      <div className="flex justify-center items-center h-screen text-gray-700">
        Loading vehicles...
      </div>
    );

  if (error)
    return (
      <div className="flex justify-center items-center h-screen text-red-600">
        {error}
      </div>
    );

  // ----------------------------------------------------------
  // FULL PAGE RENDER
  // ----------------------------------------------------------
  return (
    <main className="p-6 bg-gray-50 min-h-screen">

      {/* ======== MAIN GRID ======== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cars.map((car) => (
          <div
            key={car.id}
            className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition overflow-hidden"
          >
            {/* IMAGE */}
            <div className="relative">
              <img
                src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
                alt="Vehicle"
                className="w-full h-56 object-cover"
              />
              <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                {car.damage_description || "Unknown Damage"}
              </div>
            </div>

            {/* DETAILS */}
            <div className="p-4 space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {car.year} {car.make} {car.model}
              </h2>

              <p className="text-sm text-gray-500">Lot #: {car.lot_number}</p>
              <p className="text-sm text-gray-500">Location: {car.sale_name || "N/A"}</p>

              <p className="text-sm text-gray-500">
                Sale Date:{" "}
                {car.sale_date
                  ? new Date(car.sale_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "N/A"}
              </p>

              {/* REPAIR + RESALE */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <div className="flex items-center space-x-1 text-gray-700">
                  <Wrench size={16} />
                  <span>Repair:</span>
                  <span>$</span>
                  <input
                    type="number"
                    value={car.repair_estimate}
                    onChange={(e) =>
                      updateCarValue(car.id, "repair_estimate", Number(e.target.value))
                    }
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>

                <div className="flex items-center space-x-1 text-gray-700">
                  <DollarSign size={16} />
                  <span>Resale:</span>
                  <span>$</span>
                  <input
                    type="number"
                    value={car.resale_estimate}
                    onChange={(e) =>
                      updateCarValue(car.id, "resale_estimate", Number(e.target.value))
                    }
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>

              {/* MAX BID */}
              <div className="flex items-center space-x-1 mt-2 text-gray-700">
                <span className="font-medium">Max Bid:</span>
                <span>${car.max_bid?.toLocaleString()}</span>
              </div>

              {/* BUTTON */}
              <div className="flex justify-between pt-6">
                <button
                  onClick={() => {
                    setTempMargin(15); // reset on open
                    setSelectedCar(car);
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* =====================================================
          MODAL
      ===================================================== */}
      {selectedCar && (() => {
        const activeCar = cars.find((c) => c.id === selectedCar.id) || selectedCar;
        const live = calculateCarWithMargin(activeCar, tempMargin);

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative">

              {/* CLOSE */}
              <button
                onClick={() => setSelectedCar(null)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-xl"
              >
                ✕
              </button>

              {/* HEADER */}
              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                {activeCar.year} {activeCar.make} {activeCar.model}
              </h2>

              {/* INFO */}
              <div className="space-y-2 text-sm text-gray-700">
                <p><span className="font-medium">Lot Number:</span> {activeCar.lot_number}</p>
                <p><span className="font-medium">Sale Date:</span> {activeCar.sale_date || "N/A"}</p>
                <p><span className="font-medium">Damage:</span> {activeCar.damage_description || "Unknown"}</p>
                <p><span className="font-medium">Odometer:</span> {activeCar.odometer || "N/A"}</p>

                {/* INPUTS */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-300">
                  <div className="flex items-center space-x-1">
                    <Wrench size={16} />
                    <span>Repair:</span>
                    <span>$</span>
                    <input
                      type="number"
                      value={activeCar.repair_estimate}
                      onChange={(e) =>
                        updateCarValue(activeCar.id, "repair_estimate", Number(e.target.value))
                      }
                      className="w-24 border border-gray-300 rounded px-2 py-1"
                    />
                  </div>

                  <div className="flex items-center space-x-1">
                    <DollarSign size={16} />
                    <span>Resale:</span>
                    <span>$</span>
                    <input
                      type="number"
                      value={activeCar.resale_estimate}
                      onChange={(e) =>
                        updateCarValue(activeCar.id, "resale_estimate", Number(e.target.value))
                      }
                      className="w-24 border border-gray-300 rounded px-2 py-1"
                    />
                  </div>
                </div>

                {/* DESIRED MARGIN */}
                <div className="flex items-center space-x-2 mt-4">
                  <span className="font-medium">Desired Margin:</span>
                  <input
                    type="number"
                    value={tempMargin}
                    onChange={(e) => {
                      let val = Number(e.target.value);
                      if (isNaN(val)) val = 0;
                      if (val < 0) val = 0;
                      if (val > 90) val = 90;
                      setTempMargin(val);
                    }}
                    className="w-20 border border-gray-300 rounded px-2 py-1"
                  />
                  <span>%</span>
                </div>

                {/* MAX BID */}
                <div className="mt-4 text-gray-900 text-base font-bold">
                  Max Bid: ${live.max_bid.toLocaleString()}
                </div>

                {/* COST BREAKDOWN */}
                <div className="mt-3 text-sm text-gray-800">
                  <hr className="my-2" />
                  <p>Buyer Fee (7.5%): ${live.buyer_fee.toLocaleString()}</p>

                  <p>
                    Tax ({Number(activeCar.avg_tax_rate).toFixed(1)}%): $
                    {live.tax_amount_calc.toLocaleString()}
                  </p>

                  <p>Title Fee: ${Number(activeCar.title_fee || 0).toLocaleString()}</p>
                  <p>Repairs: ${Number(live.repair).toLocaleString()}</p>

                  <hr className="my-2" />

                  <p><span className="font-semibold">Total Cost:</span> ${live.total_cost.toLocaleString()}</p>
                  <p><span className="font-semibold">Profit:</span> ${live.profit.toLocaleString()}</p>
                  <p><span className="font-semibold">Margin:</span> {live.margin_actual}%</p>
				  <hr className="my-3 border-gray-300" />
                </div>

                {/* DETAILS */}
                <p className="mt-4">
                  <span className="font-medium">Repair Details:</span>{" "}
                  {activeCar.repair_details || "N/A"}
                </p>

                <p className="mt-1">
                  <span className="font-medium">Resale Details:</span>{" "}
                  {activeCar.resale_details || "N/A"}
                </p>

                {/* COPART LINK */}
                {activeCar.lot_url && (
                  <a
                    href={activeCar.lot_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-blue-600 hover:underline text-sm"
                  >
                    Open in Copart →
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
};

export default Dashboard;
