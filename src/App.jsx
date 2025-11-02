import React, { useState, useEffect } from "react";

export default function App() {
  const [cars, setCars] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(false);
  const [targetMargin, setTargetMargin] = useState(30);
  const [selectedCar, setSelectedCar] = useState(null);
  const [options, setOptions] = useState({
    years: [],
    makes: [],
    models: [],
    damages: [],
  });

  const [filters, setFilters] = useState({
    year: "",
    make: "",
    model: "",
    damage: "",
    minMiles: "",
    maxMiles: "",
  });

  // --------------------------------------------------
  // LOAD CARS FROM BACKEND
  // --------------------------------------------------
  useEffect(() => {
    const fetchCars = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/cars/with_estimates");
        const data = await res.json();
        const carsArray = Array.isArray(data) ? data : data.cars || [];

        setCars(carsArray);
        setFiltered(carsArray);

        const years = [...new Set(carsArray.map((c) => c.year))].sort((a, b) => b - a);
        const makes = [...new Set(carsArray.map((c) => c.make))].sort();
        const models = [...new Set(carsArray.map((c) => c.model))].sort();
        const damages = [...new Set(carsArray.map((c) => c.damage))].sort();

        setOptions({ years, makes, models, damages });
      } catch (err) {
        console.error("❌ Error fetching cars:", err);
        setCars([]);
        setFiltered([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

  // --------------------------------------------------
  // FILTER LOGIC
  // --------------------------------------------------
  const applyFilters = (source, filters) => {
    let result = [...source];
    if (filters.year)
      result = result.filter((c) => String(c.year) === String(filters.year));
    if (filters.make)
      result = result.filter((c) => c.make === filters.make);
    if (filters.model)
      result = result.filter((c) => c.model === filters.model);
    if (filters.damage)
      result = result.filter((c) => c.damage === filters.damage);
    if (filters.minMiles)
      result = result.filter((c) => +c.odometer >= +filters.minMiles);
    if (filters.maxMiles)
      result = result.filter((c) => +c.odometer <= +filters.maxMiles);
    setFiltered(result);
  };

  useEffect(() => {
    if (cars.length) applyFilters(cars, filters);
  }, [filters]);

  // ✅ SAFE environment check (works in all builds)
  const isDev =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.MODE === "development") ||
    process.env.NODE_ENV === "development";

  // --------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col relative">
      <header className="flex items-center justify-between px-8 py-4 border-b border-neutral-800 bg-neutral-950/90">
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          Car Flip Analyzer
        </h1>
        <img
          src="/logo.png"
          alt="Logo"
          className="h-14 md:h-16 object-contain opacity-90 hover:opacity-100 transition"
        />
      </header>

      {/* FILTER BAR */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex flex-wrap gap-3 justify-center">
        {/* ... your existing filter inputs ... */}
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-6">
        {loading && (
          <p className="text-center text-gray-400 mt-10">⏳ Loading vehicles...</p>
        )}

        {!loading && Array.isArray(filtered) && filtered.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered
              .filter((car) => car && typeof car === "object")
              .map((car, idx) => (
                <div
                  key={car.id || idx}
                  onClick={(e) => {
                    const tag = e.target.tagName.toLowerCase();
                    if (
                      !["input", "button", "summary", "details", "label", "a"].includes(tag)
                    ) {
                      if (car?.url)
                        window.open(car.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                  className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-5 shadow-md hover:bg-neutral-700/70 hover:ring-2 hover:ring-blue-500 cursor-pointer transition-all"
                >
                  {/* IMAGE */}
                  {car?.image_url && (
				 {/* IMAGE */}
				<img
				  src={
					car?.image_url
					  ? (car.image_url.startsWith("http")
						  ? car.image_url
						  : `${isDev ? "http://localhost:8000" : "http://45.55.43.140:8000"}${car.image_url}`)
					  : "https://placehold.co/600x400?text=No+Image"
				  }
				  alt={`${car?.make ?? ""} ${car?.model ?? ""}`}
				  className="w-full h-48 object-cover rounded-lg mb-3"
				  onError={(e) => {
					e.target.src = "https://placehold.co/600x400?text=No+Image";
				  }}
				/>

				{/* TITLE */}
				<div className="pb-3 border-b border-neutral-700 mb-3">
				  <h2 className="text-xl font-semibold mb-1 text-white">
					{car?.year ? Math.round(car.year) : "Unknown Year"}{" "}
					{car?.make ?? ""} {car?.model ?? ""}
				  </h2>
				  <p className="text-sm text-gray-400 mb-1">
					Odometer: {car?.odometer || "N/A"}
				  </p>
				  <p className="text-sm text-gray-400">
					Damage: {car?.damage || "Unknown"}
				  </p>
				</div>

				{/* STATS */}
				<div className="space-y-1 text-sm">
				  <p>AI Resale Value: ${Number(car?.resale || 0).toLocaleString()}</p>
				  <p>Repairs: ${Number(car?.repairs || 0).toLocaleString()}</p>
				  <p>
					Max Bid ({targetMargin}% Margin):{" "}
					<span className="font-semibold text-yellow-400">
					  ${Number(car?.maxBid || 0).toLocaleString()}
					</span>
				  </p>
				  <p>
					Profit:{" "}
					<span
					  className={`font-semibold ${
						(car?.profit ?? 0) >= 0 ? "text-green-400" : "text-red-400"
					  }`}
					>
					  ${Number(car?.profit || 0).toLocaleString()}
					</span>
				  </p>
				  <p>
					Margin:{" "}
					<span
					  className={`font-semibold ${
						(car?.margin ?? 0) >= 30 ? "text-green-400" : "text-blue-400"
					  }`}
					>
					  {Number(car?.margin || 0).toFixed(1)}%
					</span>
				  </p>
				</div>

				<div className="mt-4">
				  <button
					onClick={(e) => {
					  e.stopPropagation();
					  if (car) setSelectedCar(car);
					}}
					className="text-blue-400 underline text-sm hover:text-blue-300"
				  >
					View Details
				  </button>
				</div>

              ))}
          </div>
        ) : (
          !loading && (
            <p className="text-center text-gray-500 mt-10">
              No cars found. Try adjusting your filters.
            </p>
          )
        )}
      </main>
    </div>
  );
}
