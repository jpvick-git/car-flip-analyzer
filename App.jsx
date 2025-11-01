import React, { useState, useEffect } from "react";

export default function CarFlipAnalyzer() {
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
    const fetchCarsFromDB = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/cars/with_estimates");
        const data = await res.json();
        if (data && data.cars) {
          const cars = data.cars;
          setCars(cars);
          setFiltered(cars);

          // Extract unique dropdown options
          const years = [...new Set(cars.map((c) => c.year))].sort((a, b) => b - a);
          const makes = [...new Set(cars.map((c) => c.make))].sort();
          const models = [...new Set(cars.map((c) => c.model))].sort();
          const damages = [...new Set(cars.map((c) => c.damage))].sort();

          setOptions({ years, makes, models, damages });
        } else {
          console.warn("⚠️ No cars returned from backend");
        }
      } catch (err) {
        console.error("❌ Error fetching cars:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCarsFromDB();
  }, []);

  // --------------------------------------------------
  // FILTER LOGIC
  // --------------------------------------------------
  const applyFilters = (source, filterSet) => {
    let result = [...source];
    if (filterSet.year)
      result = result.filter((c) => String(c.year) === String(filterSet.year));
    if (filterSet.make)
      result = result.filter((c) => c.make === filterSet.make);
    if (filterSet.model)
      result = result.filter((c) => c.model === filterSet.model);
    if (filterSet.damage)
      result = result.filter((c) => c.damage === filterSet.damage);
    if (filterSet.minMiles)
      result = result.filter((c) => c.odometer >= +filterSet.minMiles);
    if (filterSet.maxMiles)
      result = result.filter((c) => c.odometer <= +filterSet.maxMiles);
    setFiltered(result);
  };

  useEffect(() => {
    if (cars.length) applyFilters(cars, filters);
  }, [filters]);

  // --------------------------------------------------
  // UI
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col relative">
		<header className="flex items-center justify-between px-8 py-4 border-b border-neutral-800 bg-neutral-950/90">
		  <div className="flex items-center gap-2">
			
			<h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
			  Car Flip Analyzer (AI)
			</h1>
		  </div>

		  <img
			src="/logo.png"
			alt="Automotive Analyst Logo"
			className="h-16 md:h-20 lg:h-24 object-contain opacity-90 hover:opacity-100 transition-opacity duration-200"
		  />
		</header>



      {/* FILTER BAR */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex flex-wrap gap-3 justify-center">
        {/* Year */}
        <select
          value={filters.year}
          onChange={(e) => setFilters({ ...filters, year: e.target.value })}
          className="bg-neutral-800 text-white px-3 py-2 rounded-md w-32 text-sm"
        >
          <option value="">All Years</option>
          {options.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {/* Make */}
        <select
          value={filters.make}
          onChange={(e) => setFilters({ ...filters, make: e.target.value })}
          className="bg-neutral-800 text-white px-3 py-2 rounded-md w-40 text-sm"
        >
          <option value="">All Makes</option>
          {options.makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Model */}
        <select
          value={filters.model}
          onChange={(e) => setFilters({ ...filters, model: e.target.value })}
          className="bg-neutral-800 text-white px-3 py-2 rounded-md w-44 text-sm"
        >
          <option value="">All Models</option>
          {options.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Damage */}
        <select
          value={filters.damage}
          onChange={(e) => setFilters({ ...filters, damage: e.target.value })}
          className="bg-neutral-800 text-white px-3 py-2 rounded-md w-48 text-sm"
        >
          <option value="">All Damages</option>
          {options.damages.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Mileage Range */}
        <input
          placeholder="Min Miles"
          type="number"
          value={filters.minMiles}
          onChange={(e) => setFilters({ ...filters, minMiles: e.target.value })}
          className="bg-neutral-800 text-white px-3 py-2 rounded-md w-28 text-sm"
        />
        <input
          placeholder="Max Miles"
          type="number"
          value={filters.maxMiles}
          onChange={(e) => setFilters({ ...filters, maxMiles: e.target.value })}
          className="bg-neutral-800 text-white px-3 py-2 rounded-md w-28 text-sm"
        />
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-6">
        {loading && (
          <p className="text-center text-gray-400 mt-10">
            ⏳ Loading vehicle data...
          </p>
        )}

        {!loading && filtered.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((car) => (
              <div
                key={car.id}
                onClick={(e) => {
                  const tag = e.target.tagName.toLowerCase();
                  if (!["input", "button", "summary", "details", "label", "a"].includes(tag)) {
                    window.open(car.url, "_blank", "noopener,noreferrer");
                  }
                }}
                className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-5 shadow-md hover:bg-neutral-700/70 hover:ring-2 hover:ring-blue-500 cursor-pointer transition-all"
              >
                {/* IMAGE */}
                {car.image_url && (
				  <img
					src={
					  car.image_url.startsWith("http")
						? car.image_url
						: `${import.meta.env.MODE === "development"
							? "http://localhost:8000"
							: "http://45.55.43.140"

						  }${car.image_url}`
					}
					alt={`${car.make} ${car.model}`}
					className="w-full h-48 object-cover rounded-lg mb-3"
					onError={(e) => {
					  e.target.src = "https://placehold.co/600x400?text=No+Image";
					}}
				  />
				)}


                {/* TITLE */}
                <div className="pb-3 border-b border-neutral-700 mb-3">
                  <h2 className="text-xl font-semibold mb-1 text-white">
                    {car.year} {car.make} {car.model}
                  </h2>
                  <p className="text-sm text-gray-400 mb-1">
                    Odometer: {car.odometer?.toLocaleString?.()} mi
                  </p>
                  <p className="text-sm text-gray-400">Damage: {car.damage}</p>
                </div>

                {/* STATS */}
                <div className="space-y-1 text-sm">
                  <p>
                    AI Resale Value:{" "}
                    <span className="text-gray-300">
                      ${car.resale?.toLocaleString?.()}
                    </span>
                  </p>
                  <p>
                    Repairs:{" "}
                    <span className="text-gray-300">
                      ${car.repairs?.toLocaleString?.()}
                    </span>
                  </p>
                  <p>
                    Max Bid ({targetMargin}% Margin):{" "}
                    <span className="font-semibold text-yellow-400">
                      ${car.maxBid?.toLocaleString?.()}
                    </span>
                  </p>
                  <p>
                    Profit:{" "}
                    <span
                      className={`font-semibold ${
                        car.profit >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      ${car.profit?.toLocaleString?.()}
                    </span>
                  </p>
                  <p>
                    Margin:{" "}
                    <span
                      className={`font-semibold ${
                        car.margin >= 30 ? "text-green-400" : "text-blue-400"
                      }`}
                    >
                      {car.margin}%
                    </span>
                  </p>
                </div>

                <div className="mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCar(car);
                    }}
                    className="text-blue-400 underline text-sm hover:text-blue-300"
                  >
                    View Details
                  </button>
                </div>
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

      {/* POPUP MODAL */}
      {selectedCar && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setSelectedCar(null)}
        >
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-96 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-2">
              {selectedCar.year} {selectedCar.make} {selectedCar.model}
            </h3>
            <p className="text-sm text-gray-300 whitespace-pre-wrap mb-3">
              <strong>Repair Details:</strong>{" "}
              {selectedCar.repair_details || "No details available."}
            </p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">
              <strong>Resale Details:</strong>{" "}
              {selectedCar.resale_details || "No resale details available."}
            </p>
            <button
              onClick={() => setSelectedCar(null)}
              className="mt-4 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md text-white w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
