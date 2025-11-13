import React, { useEffect, useState } from "react";
import axios from "axios";
import { Wrench, DollarSign } from "lucide-react";

const Dashboard = () => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);

  // Modal state
  const [margin, setMargin] = useState(15); // default 15%
  const [modalRepair, setModalRepair] = useState(0);
  const [modalResale, setModalResale] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ----------------------------------------------------------
  // MAX BID CALCULATION
  // ----------------------------------------------------------
  const calculateMaxBid = (resale, repair, taxRate, titleFee, marginPercent) => {
    const marginMultiplier = 1 - marginPercent / 100;
    const feeMultiplier = 1 + 0.075 + taxRate / 100;

    const numerator = resale * marginMultiplier - repair - titleFee;
    return Math.max(0, numerator / feeMultiplier);
  };

  // ----------------------------------------------------------
  // PROFIT CALCULATION
  // ----------------------------------------------------------
  const calculateProfit = (bid, resale, repair, taxRate, titleFee) => {
    const copartFee = bid * 0.075;
    const taxAmount = bid * (taxRate / 100);

    const totalCost = bid + copartFee + taxAmount + repair + titleFee;
    return resale - totalCost;
  };

  // ----------------------------------------------------------
  // FETCH CARS
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

        const vehicles = response.data?.vehicles || response.data || [];

        // Add user-editable state per vehicle
        const enriched = vehicles.map((c) => ({
          ...c,
          userRepair: c.repair_estimate || 0,
          userResale: c.resale_estimate || 0,
        }));

        setCars(enriched);
      } catch (err) {
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

  // ----------------------------------------------------------
  // HANDLE CARD EDITS
  // ----------------------------------------------------------
  const updateCarField = (carId, field, value) => {
    setCars((prev) =>
      prev.map((c) =>
        c.id === carId ? { ...c, [field]: Number(value) } : c
      )
    );
  };

  // ----------------------------------------------------------
  // OPEN MODAL (sync values)
  // ----------------------------------------------------------
  const openModal = (car) => {
    setSelectedCar(car);
    setModalRepair(car.userRepair);
    setModalResale(car.userResale);
  };

  // ----------------------------------------------------------
  // SYNC MODAL UPDATES BACK TO CARD
  // ----------------------------------------------------------
  const syncModalBackToCard = () => {
    if (!selectedCar) return;

    setCars((prev) =>
      prev.map((c) =>
        c.id === selectedCar.id
          ? {
              ...c,
              userRepair: modalRepair,
              userResale: modalResale,
            }
          : c
      )
    );
  };

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (loading)
    return <div className="flex justify-center items-center h-screen text-gray-700">Loading vehicles...</div>;

  if (error)
    return <div className="flex justify-center items-center h-screen text-red-600">{error}</div>;

  return (
    <main className="p-6 bg-gray-50 min-h-screen">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cars.map((car) => {
          const maxBid = calculateMaxBid(
            car.userResale,
            car.userRepair,
            car.avg_tax_rate,
            car.title_fee,
            margin
          );

          const profit = calculateProfit(
            maxBid,
            car.userResale,
            car.userRepair,
            car.avg_tax_rate,
            car.title_fee
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
                  alt={`${car.make} ${car.model}`}
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
                <p className="text-sm text-gray-500">Location: {car.sale_name || "N/A"}</p>
                <p className="text-sm text-gray-500">
                  Sale Date:{" "}
                  {car.sale_date
                    ? new Date(car.sale_date).toLocaleDateString()
                    : "N/A"}
                </p>

                {/* REPAIR + RESALE */}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  {/* LEFT — Editable Inputs */}
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1 text-gray-700">
                      <Wrench size={16} />
                      <span className="text-sm font-medium">Repair: $</span>
                      <input
                        type="number"
                        value={car.userRepair}
                        onChange={(e) => updateCarField(car.id, "userRepair", e.target.value)}
                        className="w-20 p-1 border border-gray-300 rounded-md text-sm"
                      />
                    </div>

                    <div className="flex items-center space-x-1 text-gray-700">
                      <DollarSign size={16} />
                      <span className="text-sm font-medium">Resale: $</span>
                      <input
                        type="number"
                        value={car.userResale}
                        onChange={(e) => updateCarField(car.id, "userResale", e.target.value)}
                        className="w-20 p-1 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>

                  {/* RIGHT — Calculated */}
                  <div className="space-y-1 text-right">
                    <p className="text-sm font-medium text-gray-700">
                      Max Bid: ${maxBid.toFixed(0)}
                    </p>
                    <p className="text-sm font-medium text-gray-700">
                      Profit: ${profit.toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* FOOTER BUTTON */}
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

      {/* ----------------------------------------------------------
         MODAL
      ---------------------------------------------------------- */}
      {selectedCar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-xl w-full relative">

            <button
              onClick={() => {
                syncModalBackToCard();
                setSelectedCar(null);
              }}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
            >
              ✕
            </button>

            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>

            {/* Editable Inputs */}
            <div className="space-y-3 mb-4">

              <div>
                <label className="text-sm font-medium text-gray-700">Repair Cost</label>
                <input
                  type="number"
                  value={modalRepair}
                  onChange={(e) => setModalRepair(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Resale Value</label>
                <input
                  type="number"
                  value={modalResale}
                  onChange={(e) => setModalResale(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Profit Margin (%)</label>
                <input
                  type="number"
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            {/* Calculations */}
            <div className="space-y-2 text-sm text-gray-700">
              {(() => {
                const bid = calculateMaxBid(
                  modalResale,
                  modalRepair,
                  selectedCar.avg_tax_rate,
                  selectedCar.title_fee,
                  margin
                );

                const profit = calculateProfit(
                  bid,
                  modalResale,
                  modalRepair,
                  selectedCar.avg_tax_rate,
                  selectedCar.title_fee
                );

                const copart = bid * 0.075;
                const tax = bid * (selectedCar.avg_tax_rate / 100);

                return (
                  <>
                    <p>Max Bid: <strong>${bid.toFixed(0)}</strong></p>
                    <p>Potential Profit: <strong>${profit.toFixed(0)}</strong></p>

                    <hr className="my-2" />

                    <p>Copart Fee (7.5%): ${copart.toFixed(0)}</p>
                    <p>Tax Amount ({selectedCar.avg_tax_rate}%): ${tax.toFixed(0)}</p>
                    <p>Title Fee: ${selectedCar.title_fee}</p>
                    <p>Repair: ${modalRepair}</p>

                    <hr className="my-2" />

                    <p>
                      Total Cost:{" "}
                      <strong>
                        $
                        {(
                          bid +
                          copart +
                          tax +
                          modalRepair +
                          selectedCar.title_fee
                        ).toFixed(0)}
                      </strong>
                    </p>
                  </>
                );
              })()}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  syncModalBackToCard();
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
