import React, { useState, useEffect } from "react";
import axios from "axios";
import CarCard from "../components/CarCard";

export default function Dashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);

  // Modal state
  const [modalRepair, setModalRepair] = useState("");
  const [modalResale, setModalResale] = useState("");
  const [modalMargin, setModalMargin] = useState(15); // default 15%

  useEffect(() => {
    fetchCars();
  }, []);

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

      const data = response.data.vehicles;

      const updated = data.map((car) => computeValues(car));
      setCars(updated);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  };

  // Fee + Bid Calculations
  const computeValues = (car) => {
    const repair = Number(car.repair_estimate || 0);
    const resale = Number(car.resale_estimate || 0);
    const bid = Number(car.max_bid || 0); // original AI max bid
    const tax_rate = Number(car.avg_tax_rate || 0);
    const title_fee = Number(car.title_fee || 0);
    const copart_fee_rate = 0.075;
    const margin = modalMargin / 100;

    // Calculate potential profit (based on the displayed bid)
    const tax_amount = bid * (tax_rate / 100);
    const copart_fee = bid * copart_fee_rate;
    const total_cost = bid + repair + tax_amount + copart_fee + title_fee;

    const potential_profit = resale - total_cost;

    return {
      ...car,
      max_bid: bid,
      potential_profit
    };
  };

  // When opening modal
  const onOpenModal = (car) => {
    setSelectedCar(car);
    setModalRepair(car.repair_estimate || "");
    setModalResale(car.resale_estimate || "");
  };

  // Update card from modal
  const applyModalEdits = () => {
    if (!selectedCar) return;

    const updatedCar = {
      ...selectedCar,
      repair_estimate: modalRepair,
      resale_estimate: modalResale
    };

    const recalculated = computeValues(updatedCar);

    setCars((prev) =>
      prev.map((c) => (c.id === selectedCar.id ? recalculated : c))
    );

    setSelectedCar(null);
  };

  // Update card inline values
  const onUpdateValues = (carId, updates) => {
    setCars((prev) =>
      prev.map((car) => {
        if (car.id !== carId) return car;
        const updated = computeValues({ ...car, ...updates });
        return updated;
      })
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Your Vehicles</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {cars.map((car) => (
          <CarCard
            key={car.id}
            car={car}
            onOpenModal={onOpenModal}
            onUpdateValues={onUpdateValues}
          />
        ))}
      </div>

      {/* Modal */}
      {selectedCar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg relative shadow-xl">

            <button
              className="absolute top-3 right-3 text-gray-600"
              onClick={applyModalEdits}
            >
              ✕
            </button>

            <h2 className="text-xl font-semibold mb-2">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>

            <p className="text-gray-600">{selectedCar.sale_name}</p>
            <p className="text-gray-600 mb-4">{selectedCar.sale_date}</p>

            {/* Repair */}
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium w-20">Repair: $</span>
              <input
                type="number"
                className="border p-2 rounded w-32"
                value={modalRepair}
                onChange={(e) => setModalRepair(e.target.value)}
              />
            </div>

            {/* Resale */}
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium w-20">Resale: $</span>
              <input
                type="number"
                className="border p-2 rounded w-32"
                value={modalResale}
                onChange={(e) => setModalResale(e.target.value)}
              />
            </div>

            {/* Margin */}
            <div className="flex items-center gap-2 mb-4">
              <span className="font-medium w-20">Margin:</span>
              <input
                type="number"
                className="border p-2 rounded w-20"
                value={modalMargin}
                onChange={(e) => setModalMargin(e.target.value)}
              />
              <span>%</span>
            </div>

            {/* Readout */}
            <div className="bg-gray-100 p-4 rounded-lg text-sm">
              <p><strong>Max Bid:</strong> ${Number(selectedCar.max_bid).toLocaleString()}</p>
              <p><strong>Potential Profit:</strong> ${Number(selectedCar.potential_profit).toLocaleString()}</p>
              <p><strong>Tax Rate:</strong> {selectedCar.avg_tax_rate}%</p>
              <p><strong>Title Fee:</strong> ${selectedCar.title_fee}</p>
              <p><strong>Copart Fee Rate:</strong> 7.5%</p>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
