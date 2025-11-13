import React, { useEffect, useState } from "react";
import axios from "axios";

const Dashboard = () => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --------------------------------------------------
  // FETCH VEHICLES
  // --------------------------------------------------
  useEffect(() => {
    const fetchCars = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          `${process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com"}/get_vehicles`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        const data = response.data;
        if (Array.isArray(data)) {
          setCars(data);
        } else if (data && Array.isArray(data.vehicles)) {
          setCars(data.vehicles);
        } else {
          console.error("Unexpected data format:", data);
          setCars([]);
        }
      } catch (err) {
        console.error("Error fetching vehicles:", err);
        setError("Failed to load vehicles.");
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

  // --------------------------------------------------
  // UI HELPERS
  // --------------------------------------------------
  const formatCurrency = (value) => {
    if (!value || isNaN(value)) return "—";
    return `$${Number(value).toLocaleString()}`;
  };

  const getStatus = (car) => {
    if (!car.repair_estimate && !car.resale_estimate) return "🧠 Awaiting AI";
    if (car.repair_estimate && car.resale_estimate) return "✅ Complete";
    return "⚙️ Processing";
  };

  const getImage = (car) => {
    if (car.image_url) return car.image_url;
    if (car.lot_number)
      return `https://api.carflipanalyzer.com/backend/downloads/${car.lot_number}/${car.lot_number}_Image_1.jpg`;
    return "https://via.placeholder.com/300x200?text=No+Image";
  };

  // --------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------
  if (loading) return <div className="text-center mt-10 text-gray-400">Loading vehicles...</div>;
  if (error) return <div className="text-center mt-10 text-red-500">{error}</div>;
  if (!cars.length) return <div className="text-center mt-10 text-gray-400">No vehicles found.</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 px-4 py-6">
      <h1 className="text-3xl font-bold text-center mb-8 tracking-tight">
        🚗 Car Flip Analyzer Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cars.map((car) => (
          <div
            key={car.id}
            className="bg-gray-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition duration-300 cursor-pointer"
            onClick={() => setSelectedCar(car)}
          >
            <div className="relative">
              <img
                src={getImage(car)}
                alt={`${car.year} ${car.make} ${car.model}`}
                className="w-full h-48 object-cover"
                onError={(e) => (e.target.src = "https://via.placeholder.com/300x200?text=No+Image")}
              />
              <span
                className={`absolute top-3 right-3 text-xs px-3 py-1 rounded-full ${
                  getStatus(car) === "✅ Complete"
                    ? "bg-green-600"
                    : getStatus(car) === "🧠 Awaiting AI"
                    ? "bg-yellow-600"
                    : "bg-blue-600"
                }`}
              >
                {getStatus(car)}
              </span>
            </div>

            <div className="p-4">
              <h2 className="font-semibold text-lg mb-1">
                {car.year} {car.make} {car.model}
              </h2>
              <p className="text-sm text-gray-400 mb-1">
                {car.damage_description || "No damage info"}
              </p>
              <p className="text-sm text-gray-400">
                <strong>Title:</strong> {car.title_code || "Unknown"}
              </p>

              <div className="mt-3 flex justify-between text-sm">
                <span>Repair: {formatCurrency(car.repair_estimate)}</span>
                <span>Resale: {formatCurrency(car.resale_estimate)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ------------------------ DETAILS MODAL ------------------------ */}
      {selectedCar && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-6"
          onClick={() => setSelectedCar(null)}
        >
          <div
            className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl p-6 relative overflow-y-auto max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl"
              onClick={() => setSelectedCar(null)}
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold mb-2">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>
            <p className="text-sm text-gray-400 mb-2">
              Lot: {selectedCar.lot_number} • Title: {selectedCar.title_code || "Unknown"}
            </p>

            <img
              src={getImage(selectedCar)}
              alt="Car"
              className="w-full h-72 object-cover rounded-lg mb-4"
            />

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-300 mb-1">Damage</h3>
                <p className="text-gray-400">{selectedCar.damage_description || "N/A"}</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-300 mb-1">Repair Estimate</h3>
                <p className="text-gray-400">
                  {formatCurrency(selectedCar.repair_estimate)}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  {selectedCar.repair_details || "No details available."}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-300 mb-1">Resale Estimate</h3>
                <p className="text-gray-400">
                  {formatCurrency(selectedCar.resale_estimate)}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  {selectedCar.resale_details || "No resale details yet."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
