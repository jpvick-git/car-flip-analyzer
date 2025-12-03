import React, { useEffect, useState } from "react";
import axios from "axios";
import CarCard from "./CarCard";

export default function Dashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCars = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("https://api.carflipanalyzer.com/get_vehicles", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCars(res.data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching vehicles:", err);
      setError("Failed to load vehicles");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCars();
  }, []);

  const updateValues = (id, updates) => {
    setCars((prev) =>
      prev.map((car) => (car.id === id ? { ...car, ...updates } : car))
    );
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">My Vehicles</h1>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {/* Vehicle Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cars.map((car) => (
          <CarCard
            key={car.id}
            car={car}
            setSelectedCar={setSelectedCar}
            onUpdateValues={updateValues}
          />
        ))}
      </div>

      {/* ------------------------------ */}
      {/* MODAL — rewritten only section */}
      {/* ------------------------------ */}
      {selectedCar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-xl w-full">
            <h2 className="text-xl font-bold mb-4">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>

            {/* Lot Number */}
            <p className="text-sm mb-2">
              <strong>Lot:</strong> {selectedCar.lot_number}
            </p>

            {/* Sale Name */}
            <p className="text-sm mb-2">
              <strong>Location:</strong> {selectedCar.sale_name}
            </p>

            {/* Repair Estimate */}
            <p className="text-sm mb-2">
              <strong>Repair Estimate:</strong> ${selectedCar.repair_estimate}
            </p>

            {/* Resale Estimate */}
            <p className="text-sm mb-2">
              <strong>Resale Estimate:</strong> ${selectedCar.resale_estimate}
            </p>

            {/* NEW — AI Repair Details */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold">AI Repair Details</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">
                {selectedCar.repair_details || "N/A"}
              </p>
            </div>

            {/* NEW — AI Resale Details */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold">AI Resale Details</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">
                {selectedCar.resale_details || "N/A"}
              </p>
            </div>

            {/* Close */}
            <button
              className="mt-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              onClick={() => setSelectedCar(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
