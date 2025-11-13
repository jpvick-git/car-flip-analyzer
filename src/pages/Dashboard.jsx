import React, { useEffect, useState } from "react";
import axios from "axios";
import { Wrench, DollarSign } from "lucide-react";

const Dashboard = () => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // -----------------------------------------------
  // FETCH VEHICLES + INITIAL MAX BID CALC
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

        let vehicles = [];

        if (Array.isArray(data)) {
          vehicles = data;
        } else if (data && Array.isArray(data.vehicles)) {
          vehicles = data.vehicles;
        } else {
          console.error("Unexpected data format:", data);
          vehicles = [];
        }

        // -------------------------------------------
        // ADD MAX BID TO EACH VEHICLE
        // -------------------------------------------
        vehicles = vehicles.map((car) => {
          const resale = Number(car.resale_estimate || 0);
          const repair = Number(car.repair_estimate || 0);
          const tax = Number(car.tax_amount || 0); // flat tax $
          const fees = Number(car.fees_amount || 0); // flat fees $

          let maxBid =
            (0.85 * resale - tax - fees - repair) / 1.075;

          if (isNaN(maxBid) || maxBid < 0) {
            maxBid = 0;
          }

          return {
            ...car,
            max_bid: Math.round(maxBid),
          };
        });

        setCars(vehicles);
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
  // LIVE UPDATE CAR VALUES + LIVE MAX BID RECALC
  // -----------------------------------------------
  const updateCarValue = (id, field, value) => {
    setCars((prevCars) =>
      prevCars.map((car) => {
        if (car.id !== id) return car;

        const updatedCar = { ...car, [field]: value };

        // Recalculate max bid
        const resale = Number(updatedCar.resale_estimate || 0);
        const repair = Number(updatedCar.repair_estimate || 0);
        const tax = Number(updatedCar.tax_amount || 0);
        const fees = Number(updatedCar.fees_amount || 0);

        let maxBid =
          (0.85 * resale - tax - fees - repair) / 1.075;

        if (isNaN(maxBid) || maxBid < 0) maxBid = 0;

        updatedCar.max_bid = Math.round(maxBid);

        return updatedCar;
      })
    );
  };

  // -----------------------------------------------
  // RENDER
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

  return (
    <main className="p-6 bg-gray-50 min-h-screen">
      {!Array.isArray(cars) || cars.length === 0 ? (
        <p className="text-gray-600">No vehicles found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cars.map((car) => (
            <div
              key={car.id}
              className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
            >
              {/* IMAGE */}
              <div className="relative">
                <img
                  src={
                    car.image_url ||
                    "https://placehold.co/400x250?text=No+Image"
                  }
                  alt={`${car.make} ${car.model}`}
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

                {/* REPAIR & RESALE */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  {/* REPAIR */}
                  <div className="flex items-center space-x-1 text-gray-700">
                    <Wrench size={16} />
                    <span className="text-sm font-medium">Repair:</span>
                    <span className="text-sm">$</span>
                    <input
                      type="number"
                      value={car.repair_estimate}
                      onChange={(e) =>
                        updateCarValue(
                          car.id,
                          "repair_estimate",
                          Number(e.target.value)
                        )
                      }
                      className="w-20 text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* RESALE */}
                  <div className="flex items-center space-x-1 text-gray-700">
                    <DollarSign size={16} />
                    <span className="text-sm font-medium">Resale:</span>
                    <span className="text-sm">$</span>
                    <input
                      type="number"
                      value={car.resale_estimate}
                      onChange={(e) =>
                        updateCarValue(
                          car.id,
                          "resale_estimate",
                          Number(e.target.value)
                        )
                      }
                      className="w-20 text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                {/* MAX BID */}
                <div className="flex items-center space-x-1 mt-2 text-gray-700">
                  <span className="text-sm font-medium">Max Bid:</span>
                  <span className="text-sm">
                    ${car.max_bid?.toLocaleString() ?? ""}
                  </span>
                </div>

                {/* VIEW DETAILS */}
                <div className="flex justify-between items-center pt-6">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCar(car);
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 transition"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
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
			  <p><span className="font-medium">Lot Number:</span> {activeCar.lot_number}</p>
			  <p><span className="font-medium">Sale Date:</span> {activeCar.sale_date || "N/A"}</p>
			  <p><span className="font-medium">Damage:</span> {activeCar.damage_description || "Unknown"}</p>
			  <p><span className="font-medium">Odometer:</span> {activeCar.odometer || "N/A"}</p>

			  {/* REPAIR & RESALE INPUTS */}
			  <div className="flex items-center justify-between space-x-4 mt-4 pt-3 border-t border-gray-200">

				{/* REPAIR */}
				<div className="flex items-center space-x-1 text-gray-700">
				  <Wrench size={16} />
				  <span className="text-sm font-medium">Repair:</span>
				  <span className="text-sm">$</span>
				  <input
					type="number"
					value={activeCar.repair_estimate}
					onChange={(e) =>
					  updateCarValue(activeCar.id, "repair_estimate", Number(e.target.value))
					}
					className="w-24 text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500"
				  />
				</div>

				{/* RESALE */}
				<div className="flex items-center space-x-1 text-gray-700">
				  <DollarSign size={16} />
				  <span className="text-sm font-medium">Resale:</span>
				  <span className="text-sm">$</span>
				  <input
					type="number"
					value={activeCar.resale_estimate}
					onChange={(e) =>
					  updateCarValue(activeCar.id, "resale_estimate", Number(e.target.value))
					}
					className="w-24 text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-green-500"
				  />
				</div>

			  </div>

			  {/* MAX BID DISPLAY */}
			  <div className="flex items-center space-x-2 mt-4 text-gray-800">
				<span className="text-sm font-semibold">Max Bid:</span>
				<span className="text-base font-bold">
				  ${activeCar.max_bid?.toLocaleString() ?? ""}
				</span>
			  </div>
			</div>


              <p><span className="font-medium">Repair Details:</span> {selectedCar.repair_details || "N/A"}</p>
              <p><span className="font-medium">Resale Details:</span> {selectedCar.resale_details || "N/A"}</p>
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
