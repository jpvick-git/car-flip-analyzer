import React, { useEffect, useState } from "react";
import axios from "axios";
import { Wrench, DollarSign } from "lucide-react";

const Dashboard = () => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);

  // Modal values
  const [modalRepair, setModalRepair] = useState(0);
  const [modalResale, setModalResale] = useState(0);
  const [margin, setMargin] = useState(15); // default 15%

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ----------------------------------------------
  // MATH HELPERS — Always safe numeric conversions
  // ----------------------------------------------
  const number = (v) => {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  };

  const calcMaxBid = (resale, repair, taxRate, titleFee, marginPct) => {
    resale = number(resale);
    repair = number(repair);
    taxRate = number(taxRate);
    titleFee = number(titleFee);
    marginPct = number(marginPct);

    const marginMultiplier = 1 - marginPct / 100;
    const feeMultiplier = 1 + 0.075 + taxRate / 100;

    const numerator = resale * marginMultiplier - repair - titleFee;
    if (feeMultiplier <= 0) return 0;

    const result = numerator / feeMultiplier;
    return isFinite(result) ? Math.max(result, 0) : 0;
  };

  const calcProfit = (bid, resale, repair, taxRate, titleFee) => {
    bid = number(bid);
    resale = number(resale);
    repair = number(repair);
    taxRate = number(taxRate);
    titleFee = number(titleFee);

    const copartFee = bid * 0.075;
    const taxAmount = bid * (taxRate / 100);

    const totalCost = bid + copartFee + taxAmount + repair + titleFee;

    const profit = resale - totalCost;
    return isFinite(profit) ? profit : 0;
  };

  // ----------------------------------------------
  // Load vehicles
  // ----------------------------------------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const res = await axios.get(
          `${process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com"}/get_vehicles`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        const vehicles = res.data?.vehicles || [];

        // Convert numeric fields to numbers to prevent NaN
        const cleaned = vehicles.map((c) => ({
          ...c,
          title_fee: number(c.title_fee),
          avg_tax_rate: number(c.avg_tax_rate),
          userRepair: number(c.repair_estimate),
          userResale: number(c.resale_estimate),
        }));

        setCars(cleaned);
      } catch (e) {
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // ----------------------------------------------
  // Update card input (repair/resale)
  // ----------------------------------------------
  const updateCarField = (carId, field, value) => {
    setCars((prev) =>
      prev.map((car) =>
        car.id === carId
          ? { ...car, [field]: number(value) }
          : car
      )
    );
  };

  // ----------------------------------------------
  // Modal open
  // ----------------------------------------------
  const openModal = (car) => {
    setSelectedCar(car);
    setModalRepair(number(car.userRepair));
    setModalResale(number(car.userResale));
  };

  // ----------------------------------------------
  // Sync modal edits back to card
  // ----------------------------------------------
  const syncModalBack = () => {
    if (!selectedCar) return;
    setCars((prev) =>
      prev.map((car) =>
        car.id === selectedCar.id
          ? {
              ...car,
              userRepair: number(modalRepair),
              userResale: number(modalResale),
            }
          : car
      )
    );
  };

  // ----------------------------------------------
  // Render
  // ----------------------------------------------
  if (loading)
    return (
      <div className="flex justify-center items-center h-screen text-gray-700">
        Loading…
      </div>
    );

  if (error)
    return (
      <div className="flex justify-center items-center h-screen text-red-600">
        {error}
      </div>
    );

  return (
    <main className="p-6 bg-gray-50 min-h-screen">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

        {cars.map((car) => {
          const tax = number(car.avg_tax_rate);
          const title = number(car.title_fee);

          const maxBid = calcMaxBid(
            car.userResale,
            car.userRepair,
            tax,
            title,
            margin
          );

          const profit = calcProfit(
            maxBid,
            car.userResale,
            car.userRepair,
            tax,
            title
          );

          return (
            <div
              key={car.id}
              className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
            >
              {/* IMAGE */}
              <div className="relative">
                <img
                  src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
                  alt=""
                  className="w-full h-56 object-cover"
                />
                <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                  {car.damage_description || "Unknown Damage"}
                </div>
              </div>

              {/* CONTENT */}
              <div className="p-4 space-y-2">

                <h2 className="text-lg font-semibold text-gray-900">
                  {car.year} {car.make} {car.model}
                </h2>

                <p className="text-sm text-gray-500">Lot #: {car.lot_number}</p>
                <p className="text-sm text-gray-500">
                  Location: {car.sale_name || "N/A"}
                </p>
                <p className="text-sm text-gray-500">
                  Sale Date:{" "}
                  {car.sale_date
                    ? new Date(car.sale_date).toLocaleDateString()
                    : "N/A"}
                </p>

                {/* Editable Repair + Resale / Calculated Max Bid + Profit */}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  
                  {/* LEFT - Inputs */}
                  <div className="space-y-1">
                    {/* Repair */}
                    <div className="flex items-center space-x-1 text-gray-700">
                      <Wrench size={16} />
                      <span className="text-sm font-medium">Repair: $</span>
                      <input
                        type="number"
                        value={car.userRepair}
                        onChange={(e) =>
                          updateCarField(car.id, "userRepair", e.target.value)
                        }
                        className="w-20 p-1 border border-gray-300 rounded-md text-sm"
                      />
                    </div>

                    {/* Resale */}
                    <div className="flex items-center space-x-1 text-gray-700">
                      <DollarSign size={16} />
                      <span className="text-sm font-medium">Resale: $</span>
                      <input
                        type="number"
                        value={car.userResale}
                        onChange={(e) =>
                          updateCarField(car.id, "userResale", e.target.value)
                        }
                        className="w-20 p-1 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>

                  {/* RIGHT - Calculated */}
                  <div className="space-y-1 text-right">
                    <p className="text-sm font-medium text-gray-700">
                      Max Bid: ${maxBid.toFixed(0)}
                    </p>
                    <p className="text-sm font-medium text-gray-700">
                      Profit: ${profit.toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* VIEW DETAILS */}
                <div className="flex justify-start items-center pt-3">
                  <button
                    onClick={() => openModal(car)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 transition"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          );
        })}

      </div>

      {/* ----------------------------------------------
          MODAL
      ---------------------------------------------- */}
      {selectedCar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-xl w-full relative">

            <button
              onClick={() => {
                syncModalBack();
                setSelectedCar(null);
              }}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
            >
              ✕
            </button>

            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>

            {/* Editable Fields */}
            <div className="space-y-3 mb-4">
              
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Repair Cost
                </label>
                <input
                  type="number"
                  value={modalRepair}
                  onChange={(e) => setModalRepair(number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Resale Value
                </label>
                <input
                  type="number"
                  value={modalResale}
                  onChange={(e) => setModalResale(number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Profit Margin (%)
                </label>
                <input
                  type="number"
                  value={margin}
                  onChange={(e) => setMargin(number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            {/* Cost Breakdown */}
            {(() => {
              const tax = number(selectedCar.avg_tax_rate);
              const title = number(selectedCar.title_fee);

              const bid = calcMaxBid(
                modalResale,
                modalRepair,
                tax,
                title,
                margin
              );

              const profit = calcProfit(
                bid,
                modalResale,
                modalRepair,
                tax,
                title
              );

              const copart = bid * 0.075;
              const taxAmt = bid * (tax / 100);
              const totalCost =
                bid + copart + taxAmt + modalRepair + title;

              return (
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    Max Bid: <strong>${bid.toFixed(0)}</strong>
                  </p>
                  <p>
                    Potential Profit:{" "}
                    <strong>${profit.toFixed(0)}</strong>
                  </p>

                  <hr className="my-2" />

                  <p>Copart Fee (7.5%): ${copart.toFixed(0)}</p>
                  <p>
                    Tax ({tax}%): ${taxAmt.toFixed(0)}
                  </p>
                  <p>Title Fee: ${title}</p>
                  <p>Repair: ${modalRepair}</p>

                  <hr className="my-2" />

                  <p>
                    Total Cost: <strong>${totalCost.toFixed(0)}</strong>
                  </p>
                </div>
              );
            })()}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  syncModalBack();
                  setSelectedCar(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Dashboard;
