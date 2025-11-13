import React, { useEffect, useState } from "react";
import axios from "axios";


// --------------------------------------------------
// SAFE DATE PARSER
// --------------------------------------------------
const safeDate = (input) => {
  if (!input) return "N/A";

  // Try native parse first
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toLocaleDateString();

  // Try Copart format: "11/13/2025 12:00 pm CST"
  try {
    const parts = input.split(" ");
    const datePart = parts[0];
    const timePart = parts[1];
    const ampmRaw = parts[2] || "";
    const ampm = ampmRaw.replace("CST", "").trim().toUpperCase();

    const formatted = `${datePart} ${timePart} ${ampm}`;
    const d2 = new Date(formatted);

    if (!isNaN(d2.getTime())) return d2.toLocaleDateString();
  } catch (err) {
    console.warn("Failed to parse sale_date:", input);
  }

  return "N/A";
};


export default function Dashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [loading, setLoading] = useState(true);

  // margin % editable ONLY in modal
  const [marginPercent, setMarginPercent] = useState(15);


  // --------------------------------------------------
  // FETCH VEHICLES
  // --------------------------------------------------
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

        const data = response.data?.vehicles || [];

        const mapped = data.map((car) => ({
          ...car,
          repair_estimate: Number(car.repair_estimate) || 0,
          resale_estimate: Number(car.resale_estimate) || 0,
          avg_tax_rate: Number(car.avg_tax_rate) || 0,
          title_fee: Number(car.title_fee) || 0,

          // local editable values
          userRepair: Number(car.repair_estimate) || 0,
          userResale: Number(car.resale_estimate) || 0,
        }));

        setCars(mapped);
      } catch (error) {
        console.error("Error loading cars:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);


  // --------------------------------------------------
  // CALCULATIONS
  // --------------------------------------------------
  const calcMaxBid = (car) => {
    const repair = Number(car.userRepair) || 0;
    const resale = Number(car.userResale) || 0;
    const titleFee = Number(car.title_fee) || 0;
    const taxRate = Number(car.avg_tax_rate) || 0;
    const margin = Number(marginPercent) / 100;

    const feeMultiplier = 1 + 0.075 + taxRate / 100;
    const totalOtherCosts = repair + titleFee + resale * margin;

    const maxBid = (resale - totalOtherCosts) / feeMultiplier;
    return Math.max(0, Math.round(maxBid));
  };


  const calcProfit = (car) => {
    const maxBid = calcMaxBid(car);
    const repair = Number(car.userRepair) || 0;
    const resale = Number(car.userResale) || 0;
    const titleFee = Number(car.title_fee) || 0;
    const taxRate = Number(car.avg_tax_rate) || 0;

    const copartFee = maxBid * 0.075;
    const taxAmount = maxBid * (taxRate / 100);
    const totalCost = maxBid + copartFee + repair + taxAmount + titleFee;

    return Math.round(resale - totalCost);
  };


  // --------------------------------------------------
  // UPDATE REPAIR/RESALE ON CARD (AND SYNC MODAL)
  // --------------------------------------------------
  const updateCarLocal = (id, field, value) => {
    setCars((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, [field]: Number(value) || 0 } : c
      )
    );

    if (selectedCar && selectedCar.id === id) {
      setSelectedCar((prev) => ({
        ...prev,
        [field]: Number(value) || 0,
      }));
    }
  };


  if (loading) return <div className="text-white p-6">Loading...</div>;


  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-4">Your Vehicles</h1>


      {/* -------------------------------------------------- */}
      {/* CAR GRID */}
      {/* -------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cars.map((car) => (
          <div
            key={car.id}
            className="bg-white border border-gray-200 rounded-xl shadow-md p-4"
          >
            <img
              src={car.image_url}
              alt=""
              className="w-full h-48 object-cover rounded-lg mb-3"
            />

            <h2 className="text-lg font-bold text-gray-900">
              {car.year} {car.make} {car.model}
            </h2>

            <p className="text-sm text-gray-600">Lot #: {car.lot_number}</p>

            <p className="text-sm text-gray-600">
              Sale Date: {safeDate(car.sale_date)}
            </p>

            <p className="text-sm text-gray-600">
              Location: {car.location || car.sale_name || "N/A"}
            </p>

            {/* Editable repair */}
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700">Repair:</label>
              <input
                type="number"
                value={car.userRepair}
                onChange={(e) =>
                  updateCarLocal(car.id, "userRepair", e.target.value)
                }
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            {/* Editable resale */}
            <div className="mt-2">
              <label className="text-sm font-medium text-gray-700">Resale:</label>
              <input
                type="number"
                value={car.userResale}
                onChange={(e) =>
                  updateCarLocal(car.id, "userResale", e.target.value)
                }
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            {/* Max bid */}
            <p className="mt-4 text-md font-semibold text-gray-900">
              Max Bid: $
              {(() => {
                try {
                  return calcMaxBid(car);
                } catch {
                  return 0;
                }
              })()}
            </p>

            {/* Profit */}
            <p className="text-sm font-semibold text-gray-700">
              Potential Profit: $
              {(() => {
                try {
                  return calcProfit(car);
                } catch {
                  return 0;
                }
              })()}
            </p>

            {/* View Details */}
            <button
              onClick={() =>
                setSelectedCar({
                  ...car,
                  userRepair: Number(car.userRepair ?? car.repair_estimate) || 0,
                  userResale: Number(car.userResale ?? car.resale_estimate) || 0,
                  title_fee: Number(car.title_fee) || 0,
                  avg_tax_rate: Number(car.avg_tax_rate) || 0,
                })
              }
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700"
            >
              View Details
            </button>
          </div>
        ))}
      </div>




      {/* -------------------------------------------------- */}
      {/* MODAL (STABLE VERSION WITH NEW FEATURES) */}
      {/* -------------------------------------------------- */}
      {selectedCar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative">

            {/* Close */}
            <button
              onClick={() => setSelectedCar(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
            >
              ✕
            </button>

            {/* Title */}
            <h2 className="text-xl font-semibold mb-2 text-gray-800">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>

            {/* Location */}
            <p className="text-sm text-gray-500">
              Location: {selectedCar.location || selectedCar.sale_name || "N/A"}
            </p>

            {/* Sale date */}
            <p className="text-sm text-gray-500 mb-3">
              Sale Date: {safeDate(selectedCar.sale_date)}
            </p>

            {/* Margin */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700">
                Target Profit Margin (%)
              </label>
              <input
                type="number"
                value={marginPercent}
                onChange={(e) => setMarginPercent(Number(e.target.value) || 0)}
                className="w-full p-2 border rounded-lg mt-1"
              />
            </div>

            {/* Editable repair */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700">Repair Cost</label>
              <input
                type="number"
                value={selectedCar.userRepair}
                onChange={(e) =>
                  updateCarLocal(selectedCar.id, "userRepair", e.target.value)
                }
                className="w-full p-2 border rounded-lg mt-1"
              />
            </div>

            {/* Editable resale */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700">Resale Value</label>
              <input
                type="number"
                value={selectedCar.userResale}
                onChange={(e) =>
                  updateCarLocal(selectedCar.id, "userResale", e.target.value)
                }
                className="w-full p-2 border rounded-lg mt-1"
              />
            </div>

            {/* Max bid */}
            <p className="text-lg font-bold text-gray-900">
              Max Bid: $
              {(() => {
                try {
                  return calcMaxBid(selectedCar);
                } catch {
                  return 0;
                }
              })()}
            </p>

            {/* Profit */}
            <p className="text-md font-semibold text-gray-700">
              Potential Profit: $
              {(() => {
                try {
                  return calcProfit(selectedCar);
                } catch {
                  return 0;
                }
              })()}
            </p>

            {/* Close button */}
            <button
              onClick={() => setSelectedCar(null)}
              className="mt-6 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
