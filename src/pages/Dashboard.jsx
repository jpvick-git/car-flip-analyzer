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

        if (Array.isArray(data)) vehicles = data;
        else if (data && Array.isArray(data.vehicles)) vehicles = data.vehicles;
        else vehicles = [];

        // ADD MAX BID
        vehicles = vehicles.map((car) => {
          const resale = Number(car.resale_estimate || 0);
          const repair = Number(car.repair_estimate || 0);
          const tax = Number(car.tax_amount || 0);
          const fees = Number(car.fees_amount || 0);

          let maxBid = (0.85 * resale - tax - fees - repair) / 1.075;
          if (isNaN(maxBid) || maxBid < 0) maxBid = 0;

          return { ...car, max_bid: Math.round(maxBid) };
        });

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

  // -----------------------------------------------
  // UPDATE ANY CAR FIELD + RECALCULATE MAX BID
  // -----------------------------------------------
  const updateCarValue = (id, field, value) => {
    setCars((prevCars) =>
      prevCars.map((car) => {
        if (car.id !== id) return car;

        const updatedCar = { ...car, [field]: value };

        // Recalc
        const resale = Number(updatedCar.resale_estimate || 0);
        const repair = Number(updatedCar.repair_estimate || 0);
        const tax = Number(updatedCar.tax_amount || 0);
        const fees = Number(updatedCar.fees_amount || 0);

        let maxBid = (0.85 * resale - tax - fees - repair) / 1.075;
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

      {/* MAIN DASH GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cars.map((car) => (
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

            {/* VEHICLE DETAILS */}
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

              {/* REPAIR + RESALE INPUTS */}
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
                      updateCarValue(car.id, "repair_estimate", Number(e.target.value))
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
                      updateCarValue(car.id, "resale_estimate", Number(e.target.value))
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
                  onClick={() => setSelectedCar(car)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 transition"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

		{/* --------------------------------------------------
			CAR DETAILS MODAL
		-------------------------------------------------- */}
		{selectedCar && (() => {
		  const activeCar = cars.find((c) => c.id === selectedCar.id) || selectedCar;

		  // --- Cost Breakdown ---
		  const bid = Number(activeCar.max_bid || 0);
		  const buyerFee = bid * 0.075;
		  const tax = Number(activeCar.tax_amount || 0);
		  const fees = Number(activeCar.fees_amount || 0);
		  const repair = Number(activeCar.repair_estimate || 0);
		  const resale = Number(activeCar.resale_estimate || 0);

		  const totalCost = bid + buyerFee + tax + fees + repair;
		  const profit = resale - totalCost;
		  const margin = resale > 0 ? ((profit / resale) * 100).toFixed(1) : "0";

		  return (
			<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto">
			  <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative">

				{/* CLOSE BUTTON */}
				<button
				  onClick={() => setSelectedCar(null)}
				  className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-xl"
				>
				  ✕
				</button>

				{/* TITLE */}
				<h2 className="text-xl font-semibold mb-4 text-gray-800 pr-8">
				  {activeCar.year} {activeCar.make} {activeCar.model}
				</h2>

				{/* MAIN INFO */}
				<div className="space-y-2 text-sm text-gray-700">

				  <p><span className="font-medium">Lot Number:</span> {activeCar.lot_number}</p>
				  <p><span className="font-medium">Sale Date:</span> {activeCar.sale_date || "N/A"}</p>
				  <p><span className="font-medium">Damage:</span> {activeCar.damage_description || "Unknown"}</p>
				  <p><span className="font-medium">Odometer:</span> {activeCar.odometer || "N/A"}</p>

				  {/* INPUTS */}
				  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-300">

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
						className="w-24 text-sm border border-gray-300 rounded-md px-2 py-1 
								   focus:ring-2 focus:ring-blue-500"
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
						className="w-24 text-sm border border-gray-300 rounded-md px-2 py-1 
								   focus:ring-2 focus:ring-green-500"
					  />
					</div>

				  </div>

				  {/* MAX BID */}
				  <div className="flex items-center space-x-2 mt-4 text-gray-900">
					<span className="text-sm font-semibold">Max Bid:</span>
					<span className="text-base font-bold">
					  ${activeCar.max_bid?.toLocaleString() ?? ""}
					</span>
				  </div>

				  {/* COST BREAKDOWN */}
				  <div className="mt-4 text-gray-800 text-sm">
					<p><span className="font-semibold">Max Bid:</span> ${bid.toLocaleString()}</p>
					<hr className="my-2" />
					<p>Buyer Fee (7.5%): ${buyerFee.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
					<p>Tax: ${tax.toLocaleString()}</p>
					<p>Fees: ${fees.toLocaleString()}</p>
					<p>Repairs: ${repair.toLocaleString()}</p>
					<hr className="my-2" />
					<p><span className="font-semibold">Total Cost:</span> ${totalCost.toLocaleString()}</p>
					<p><span className="font-semibold">Profit:</span> ${profit.toLocaleString()}</p>
					<p><span className="font-semibold">Margin:</span> {margin}%</p>
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

				</div>

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
		  );
		})()}


    </main>
  );
};

export default Dashboard;
