import React, { useEffect, useState } from "react";
import axios from "axios";
import CarCard from "../components/CarCard";

export default function Dashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [modalMargin, setModalMargin] = useState(15); // default 15%

  // -----------------------------------------------
  // FETCH VEHICLES
  // -----------------------------------------------
  useEffect(() => {
    const fetchCars = async () => {
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com"}/get_vehicles`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        let data = response.data;
        if (Array.isArray(data)) {
          setCars(data);
        } else if (data && Array.isArray(data.vehicles)) {
          setCars(data.vehicles);
        } else {
          setCars([]);
        }
      } catch (err) {
        console.error("Failed to load vehicles:", err);
      }
    };

    fetchCars();
  }, []);

  // ----------------------------------------------------
  // UPDATE VALUES (for both card + modal)
  // ----------------------------------------------------
  const handleUpdateValues = (id, payload) => {
    setCars((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, ...payload } : c
      )
    );

    // keep modal in sync if it's open
    if (selectedCar && selectedCar.id === id) {
      setSelectedCar((prev) => ({ ...prev, ...payload }));
    }
  };

  // ----------------------------------------------------
  // CALCULATE FINANCIALS
  // ----------------------------------------------------
  const calculateFinancials = (car) => {
    const repair = Number(car.repair_estimate || 0);
    const resale = Number(car.resale_estimate || 0);
    const taxRate = Number(car.avg_tax_rate || 0);
    const titleFee = Number(car.title_fee || 0);
    const margin = Number(modalMargin) / 100;
    const copartFeeRate = 0.075;

    // Solve for max bid
    const denominator = 1 + taxRate / 100 + copartFeeRate;
    let maxBid = (resale - resale * margin - repair - titleFee) / denominator;
    if (maxBid < 0) maxBid = 0;

    const taxAmount = maxBid * (taxRate / 100);
    const copartFee = maxBid * copartFeeRate;

    const totalCost =
      maxBid + repair + titleFee + taxAmount + copartFee;

    const profit = resale - totalCost;

    return {
      maxBid: Math.round(maxBid),
      taxAmount: Math.round(taxAmount),
      copartFee: Math.round(copartFee),
      profit: Math.round(profit),
    };
  };

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cars.map((car) => (
          <CarCard
            key={car.id}
            car={car}
            setSelectedCar={setSelectedCar}
            onUpdate={(payload) => handleUpdateValues(car.id, payload)}
            financials={calculateFinancials(car)}
          />
        ))}
      </div>

      {/* ---------------------------- */}
      {/*           MODAL              */}
      {/* ---------------------------- */}
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

            <p className="text-sm text-gray-600 mb-4">
              Lot #{selectedCar.lot_number}
            </p>

            {/* ------------------ */}
            {/* Editable Inputs */}
            {/* ------------------ */}

            <p className="text-sm font-semibold text-gray-700">Repair Estimate:</p>
            <input
              type="number"
              className="w-full p-2 border rounded-md mb-3"
              value={selectedCar.repair_estimate}
              onChange={(e) =>
                handleUpdateValues(selectedCar.id, {
                  repair_estimate: Number(e.target.value),
                })
              }
            />

            <p className="text-sm font-semibold text-gray-700">Resale Estimate:</p>
            <input
              type="number"
              className="w-full p-2 border rounded-md mb-3"
              value={selectedCar.resale_estimate}
              onChange={(e) =>
                handleUpdateValues(selectedCar.id, {
                  resale_estimate: Number(e.target.value),
                })
              }
            />

            {/* NEW: TAX + FEES */}
            {(() => {
              const f = calculateFinancials(selectedCar);
              return (
                <div className="mb-4 text-sm text-gray-700">
                  <p>
                    Tax Amount:{" "}
                    <span className="font-semibold">${f.taxAmount}</span>
                  </p>
                  <p>
                    Copart Fee:{" "}
                    <span className="font-semibold">${f.copartFee}</span>
                  </p>
                </div>
              );
            })()}

            <p className="text-sm font-semibold text-gray-700">
              Margin (%):
            </p>
            <input
              type="number"
              className="w-full p-2 border rounded-md mb-3"
              value={modalMargin}
              onChange={(e) => setModalMargin(Number(e.target.value))}
            />

            {/* ------------------ */}
            {/*  Financial Results */}
            {/* ------------------ */}
            {(() => {
              const { maxBid, profit } = calculateFinancials(selectedCar);
              return (
                <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                  <p className="text-md font-semibold text-gray-800">
                    Max Bid: ${maxBid}
                  </p>
                  <p className="text-md font-semibold text-gray-800">
                    Potential Profit: ${profit}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
