import { Wrench, DollarSign } from "lucide-react";

export default function CarCard({
  car,
  setSelectedCar,
  onUpdateValues,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
      
      {/* Image Section */}
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

      {/* Info Section */}
      <div className="p-4 space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {car.year} {car.make} {car.model}
        </h2>

        <p className="text-sm text-gray-500">Lot #: {car.lot_number}</p>

        <p className="text-sm text-gray-500">
          Location: {car.sale_name || car.location || "N/A"}
        </p>

        <p className="text-sm text-gray-500">
          Sale Date:{" "}
          {car.sale_date
            ? new Date(car.sale_date).toLocaleDateString()
            : "N/A"}
        </p>

        {/* Repair & Resale Inputs */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">

          {/* Repair */}
          <div className="flex items-center space-x-1 text-gray-700">
            <Wrench size={16} />
            <span className="text-sm font-medium">Repair: $</span>

            <input
              type="number"
              className="w-20 border border-gray-300 rounded-md px-1 py-0.5 text-sm text-black"
              value={car.repair_estimate}
              onChange={(e) =>
                onUpdateValues(car.id, {
                  repair_estimate: Number(e.target.value),
                })
              }
            />
          </div>

          {/* Resale */}
          <div className="flex items-center space-x-1 text-gray-700">
            <DollarSign size={16} />
            <span className="text-sm font-medium">Resale: $</span>

            <input
              type="number"
              className="w-24 border border-gray-300 rounded-md px-1 py-0.5 text-sm text-black"
              value={car.resale_estimate}
              onChange={(e) =>
                onUpdateValues(car.id, {
                  resale_estimate: Number(e.target.value),
                })
              }
            />
          </div>
        </div>

        {/* Max Bid Row */}
        <div className="flex items-center space-x-1 mt-3 text-gray-800">
          <span className="font-semibold text-sm">Max Bid:</span>
          <span className="text-sm">
            ${car.max_bid?.toLocaleString() || 0}
          </span>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-between items-center pt-3">
          <button
            onClick={() => setSelectedCar({
              ...car,
              repair_details: car.repair_details,
              resale_details: car.resale_details,
            })}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 transition"
          >
            View Details
          </button>

          {car.lot_url && (
            <a
              href={car.lot_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition"
            >
              Copart →
            </a>
          )}
        </div>
      </div>

    </div>
  );
}
