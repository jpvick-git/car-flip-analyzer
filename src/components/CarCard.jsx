import { Wrench, DollarSign } from "lucide-react";

export default function CarCard({ car, setSelectedCar }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
      {/* Image Section */}
      <div className="relative">
        <img
          src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
          alt={`${car.make} ${car.model}`}
          className="w-full h-56 object-cover"
        />

        {/* Damage Badge */}
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

        {/* Repair & Resale Row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center space-x-1 text-gray-700">
            <Wrench size={16} />
            <span className="text-sm font-medium">
              Repair: ${car.repair_estimate || "0"}
            </span>
          </div>
          <div className="flex items-center space-x-1 text-gray-700">
            <DollarSign size={16} />
            <span className="text-sm font-medium">
              Resale: ${car.resale_estimate || "0"}
            </span>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-between items-center pt-3">
          <button
            onClick={() => setSelectedCar(car)}
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
