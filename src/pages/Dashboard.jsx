import React, { useEffect, useState } from "react";
import axios from "axios";

const Dashboard = () => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // -----------------------------------------------
  // FETCH VEHICLES
  // -----------------------------------------------
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
          console.error("Unexpected data shape:", data);
          setCars([]);
        }
      } catch (err) {
        console.error("Error fetching cars:", err);
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

  // -----------------------------------------------
  // RENDER STATES
  // -----------------------------------------------
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

  // -----------------------------------------------
  // MAIN RENDER
  // -----------------------------------------------
  return (
    <main className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">
        🚗 Vehicle Dashboard
      </h1>

      {Array.isArray(cars) && cars.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cars.map((car) => (
            <div
              key={car.id}
              className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow relative"
            >
              <img
                src={
                  car.image_url ||
                  "https://placehold.co/400x250?text=No+Image"
                }
                alt={`${car.make} ${car.model}`}
                className="w-full h-40 object-cover rounded-lg mb-3"
              />

              <h2 className="text-lg font-semibold text-gray-800 truncate">
                {car.year} {car.make} {car.model}
              </h2>

              <p className="text-gray-600 text-sm">
                <span className="font-medium">Lot #:</span> {car.lot_number}
              </p>

              <p className="text-gray-600 text-sm">
                <span className="font-medium">Damage:</span>{" "}
                {car.damage_description || "Unknown"}
              </p>

              <p className="text-gray-600 text-sm">
                <span className="font-medium">Repair:</span> $
                {car.repair_estimate || "0"}
              </p>

              <p className="text-gray-600 text-sm mb-2">
                <span className="font-medium">Resale:</span> $
                {car.resale_estimate || "0"}
              </p>

              <div className="flex justify-between items-center mt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCar(car);
                  }}
                  className="text-blue-600 text-sm hover:underline"
                >
                  View Details
                </button>

                {car.lot_url && (
                  <a
                    href={car.lot_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm hover:underline"
                  >
                    Copart →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-600 text-center p-6">
          {cars && !Array.isArray(cars)
            ? "Invalid data received from server."
            : "No vehicles found or server unreachable."}
        </div>
      )}

      {/* --------------------------------------------------
         CAR DETAILS MODAL
      -------------------------------------------------- */}
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

            <img
              src={
                selectedCar.image_url ||
                "https://placehold.co/600x400?text=No+Image"
              }
              alt={`${selectedCar.make} ${selectedCar.model}`}
              className="w-full h-48 object-cover rounded-lg mb-4"
            />

            <div className="space-y-2 text-sm text-gray-700">
              <p>
                <span className="font-medium">Lot Number:</span>{" "}
                {selectedCar.lot_number}
              </p>
              <p>
                <span className="font-medium">Sale Date:</span>{" "}
                {selectedCar.sale_date || "N/A"}
              </p>
              <p>
                <span className="font-medium">Damage:</span>{" "}
                {selectedCar.damage_description || "Unknown"}
              </p>
              <p>
                <span className="font-medium">Odometer:</span>{" "}
                {selectedCar.odometer || "N/A"}
              </p>
              <p>
                <span className="font-medium">Repair Estimate:</span>{" "}
                ${selectedCar.repair_estimate || "0"}
              </p>
              <p>
                <span className="font-medium">Resale Estimate:</span>{" "}
                ${selectedCar.resale_estimate || "0"}
              </p>
              <p>
                <span className="font-medium">Repair Details:</span>{" "}
                {selectedCar.repair_details || "N/A"}
              </p>
              <p>
                <span className="font-medium">Resale Details:</span>{" "}
                {selectedCar.resale_details || "N/A"}
              </p>
            </div>

            {selectedCar.lot_url && (
              <a
                href={selectedCar.lot_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-blue-600 hover:underline text-sm"
              >
                Open in Copart →
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
};

export default Dashboard;
