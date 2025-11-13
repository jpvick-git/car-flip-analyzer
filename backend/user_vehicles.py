import React, { useEffect, useState } from "react";
import axios from "axios";

// --------------------------------------------------
// SAFE DATE PARSER (Prevents modal from crashing)
// --------------------------------------------------
const safeDate = (input) => {
  if (!input) return "N/A";

  // Try native JS parser first
  const d = new Date(input);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString();
  }

  // Try Copart-style:
  // "11/13/2025 12:00 pm CST"
  try {
    const parts = input.split(" ");
    const datePart = parts[0];       // "11/13/2025"
    const timePart = parts[1];       // "12:00"
    const ampmRaw = parts[2] || "";  // "pm"
    const ampm = ampmRaw.toUpperCase().replace("CST", "").trim(); 

    const formatted = `${datePart} ${timePart} ${ampm}`;
    const d2 = new Date(formatted);

    if (!isNaN(d2.getTime())) {
      return d2.toLocaleDateString();
    }
  } catch (err) {
    console.warn("Could not parse sale_date:", input, err);
  }

  return "N/A";
};

export default function Dashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [loading, setLoading] = useState(true);

  // Editable in modal only
  const [marginPercent, setMarginPercent] = useState(15);

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

        const data = response.data?.vehicles || [];
        const mapped = data.map((car) => ({
          ...car,

          // Convert to numbers to prevent NaN/profit explosion
          repair_estimate: Number(car.repair_estimate) || 0,
          resale_estimate: Number(car.resale_estimate) || 0,
          avg_tax_rate: Number(car.avg_tax_rate) || 0,
          title_fee: Number(car.title_fee) || 0,

          // Local edits
          userRepair: Number(car.repair_estimate) || 0,
          userResale: Number(car.resale_estimate) || 0,
        }));

        setCars(mapped);
      } catch (error) {
        console.error("Error fetching vehicles:", error);
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

    // Core formula:
    // maxBid * (1 + 0.075 + taxRate) + repair + titleFee + (resale * margin) = resale
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
  // UPDATE CARD (repair/resale edits)
  // --------------------------------------------------
  const updateCarLocal = (id, field, value) => {
    setCars((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, [field]: Number(value) || 0 }
          : c
      )
    );

    // Also sync selected modal
    if (selectedCar && selectedCar.id === id) {
      setSelectedCar((prev) => ({
        ...prev,
        [field]: Number(value) || 0,
      }));
    }
  };

  if (loading) return <div className="text-white p-6">Loading vehicles...</div>;

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

            {/* ---- IMAGE ---- */}
            <img
              src={car.image_url}
              alt=""
              className="w-full h-48 object-cover rounded-md mb-3"
            />

            {/* ---- TITLE ---- */}
            <h2 className="text-lg font-bold text-gray-900">
              {car.year} {car.make} {car.model}
            </h2>

            {/* ---- LOT ---- */}
            <p className="text-sm text-gray-600">Lot #: {car.lot_number}</p>

            {/* ---- SALE DATE ---- */}
            <p className="text-sm text-gray-600">
              Sale Date: {safeDate(car.sale_date)}
            </p>

            {/* ---- LOCATION ---- */}
            <p className="text-sm text-gray-600">
              Location: {car.location || "N/A"}
            </p>

            {/* ---- EDITABLE REPAIR ---- */}
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700">
                Repair:
              </label>
              <input
                type="number"
                value={car.userRepair}
                onChange={(e) =>
                  updateCarLocal(car.id, "userRepair", e.target.value)
                }
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            {/* ---- EDITABLE RESALE ---- */}
            <div className="mt-2">
              <label className="text-sm font-medium text-gray-700">
                Resale:
              </label>
              <input
                type="number"
                value={car.userResale}
                onChange={(e) =>
                  updateCarLocal(car.id, "userResale", e.target.value)
                }
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            {/* ---- MAX BID ---- */}
            <p className="mt-3 text-md font-semibold text-gray-900">
              Max Bid: ${calcMaxBid(car)}
            </p>

            {/* ---- PROFIT (visible on card now) ---- */}
            <p className="text-sm font-semibold text-gray-700">
              Potential Profit: ${calcProfit(car)}
            </p>

            {/* ---- DETAILS BUTTON ---- */}
            <button
              onClick={() => setSelectedCar(car)}
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700"
            >
              View Details
            </button>
          </div>
        ))}
      </div>

      {/* -------------------------------------------------- */}
      {/* MODAL */}
      {/* -------------------------------------------------- */}
      {selectedCar && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">

            {/* CLOSE */}
            <button
              onClick={() => setSelectedCar(null)}
              className="float-right text-gray-600 hover:text-black"
            >
              ✕
            </button>

            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h2>

            {/* SALE DATE */}
            <p className="text-sm">Sale Date: {safeDate(selectedCar.sale_date)}</p>

            {/* LOCATION */}
            <p className="text-sm mb-3">
              Location: {selectedCar.location || "N/A"}
            </p>

            {/* MARGIN EDIT */}
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700">
                Target Profit Margin (%):
              </label>
              <input
                type="number"
                value={marginPercent}
                onChange={(e) => setMarginPercent(Number(e.target.value) || 0)}
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            {/* REPAIR */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">
                Repair Estimate:
              </label>
              <input
                type="number"
                value={selectedCar.userRepair}
                onChange={(e) =>
                  updateCarLocal(selectedCar.id, "userRepair", e.target.value)
                }
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            {/* RESALE */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">
                Resale Estimate:
              </label>
              <input
                type="number"
                value={selectedCar.userResale}
                onChange={(e) =>
                  updateCarLocal(selectedCar.id, "userResale", e.target.value)
                }
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            {/* MAX BID */}
            <p className="mt-4 text-lg font-bold text-gray-900">
              Max Bid: ${calcMaxBid(selectedCar)}
            </p>

            {/* PROFIT */}
            <p className="text-md font-semibold text-gray-700">
              Potential Profit: ${calcProfit(selectedCar)}
            </p>

            <button
              onClick={() => setSelectedCar(null)}
              className="mt-6 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
