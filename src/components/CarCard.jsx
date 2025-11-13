import React from "react";

export default function CarCard({
  car,
  onOpenModal,
  onUpdateValues
}) {
  const handleRepairChange = (e) => {
    onUpdateValues(car.id, {
      repair_estimate: e.target.value
    });
  };

  const handleResaleChange = (e) => {
    onUpdateValues(car.id, {
      resale_estimate: e.target.value
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-4">
      <img
        src={car.image_url}
        alt=""
        className="w-full h-64 object-cover rounded-xl"
      />

      <h2 className="text-xl font-semibold mt-4">
        {car.year} {car.make} {car.model}
      </h2>

      <p className="text-gray-600 text-sm">Lot #: {car.lot_number}</p>
      <p className="text-gray-600 text-sm">
        Location: {car.sale_name}
      </p>
      <p className="text-gray-600 text-sm">
        Sale Date: {car.sale_date}
      </p>

      {/* Repair / Resale - inline */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-medium w-20">Repair: $</span>
          <input
            type="number"
            className="border rounded p-2 w-32"
            value={car.repair_estimate || ""}
            onChange={handleRepairChange}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium w-20">Resale: $</span>
          <input
            type="number"
            className="border rounded p-2 w-32"
            value={car.resale_estimate || ""}
            onChange={handleResaleChange}
          />
        </div>
      </div>

      {/* Max Bid + Profit */}
      <div className="flex justify-between mt-4">
        <p className="text-sm font-semibold">
          Max Bid: ${Number(car.max_bid || 0).toLocaleString()}
        </p>

        <p className="text-sm font-semibold">
          Profit: ${Number(car.potential_profit || 0).toLocaleString()}
        </p>
      </div>

      <button
        className="mt-4 bg-black text-white px-4 py-2 rounded-lg"
        onClick={() => onOpenModal(car)}
      >
        View Details
      </button>
    </div>
  );
}
