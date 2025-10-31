import React, { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";

export default function CarFlipAnalyzer() {
  const [cars, setCars] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetMargin, setTargetMargin] = useState(30);
  const [selectedCar, setSelectedCar] = useState(null); // for popup modal

  const [filters, setFilters] = useState({
    year: "",
    make: "",
    model: "",
    damage: "",
    minMiles: "",
    maxMiles: "",
  });

  const handleFileSelect = (e) => setFile(e.target.files[0] || null);

  // --------------------------------------------------
  // LOAD EXISTING CARS FROM BACKEND
  // --------------------------------------------------
  useEffect(() => {
    const fetchCarsFromDB = async () => {
      setLoading(true);
      try {
        const res = await fetch("http://localhost:8000/cars/with_estimates");
        const data = await res.json();

        if (data && data.cars) {
          setCars(data.cars);
          setFiltered(data.cars);
        } else {
          console.warn("No cars returned from backend");
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
  // CSV FALLBACK
  // --------------------------------------------------
  const estimateResaleAI = (year, make, model, mileage, damage) => {
    const base = 28000 - (new Date().getFullYear() - parseInt(year || 2020)) * 1500;
    const mileageAdj = mileage > 150000 ? 0.6 : mileage > 100000 ? 0.75 : 0.9;
    const damageAdj = /front|rear|side|major/i.test(damage)
      ? 0.7
      : /minor|wear/i.test(damage)
      ? 0.85
      : 1.0;
    return Math.max(3000, Math.round(base * mileageAdj * damageAdj));
  };

  const calculateValues = (resale, repairs, bid) => {
    const safeResale = Number(resale) || 0;
    const safeRepairs = Number(repairs) || 0;
    const safeBid = Number(bid) || 0;
    const fees = safeResale * 0.0725;
    const totalCost = safeRepairs + fees + safeBid;
    const profit = safeResale - totalCost;
    const margin =
      safeResale > 0 && isFinite(profit)
        ? ((profit / safeResale) * 100).toFixed(1)
        : "0.0";
    return { fees, profit: Math.round(profit), margin };
  };

  const handleRunAnalysis = () => {
    if (!file) {
      alert("Please select a CSV file first.");
      return;
    }

    setLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: ({ data }) => {
        const result = data.map((row) => {
          const year = row["year"] || "";
          const make = row["make"] || "";
          const model = row["model"] || "";
          const damage =
            row["damage_description"] ||
            row["damage description"] ||
            row["primary damage"] ||
            row["damage"] ||
            "N/A";
          const odometer =
            parseFloat((row["odometer"] || "").replace(/[^0-9.]/g, "")) || 0;

          const lotUrlKey = Object.keys(row).find(
            (key) => key.toLowerCase().replace(/\s+/g, "") === "loturl"
          );
          const rawUrl = lotUrlKey ? row[lotUrlKey]?.trim() : "";
          const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

          const resale = estimateResaleAI(year, make, model, odometer, damage);
          const defaultRepair = (() => {
            const d = (damage || "").toLowerCase();
            if (d.includes("front")) return 3200;
            if (d.includes("rear")) return 2800;
            if (d.includes("side")) return 2200;
            if (d.includes("minor")) return 900;
            if (d.includes("wear")) return 1200;
            return 1500;
          })();

          const fees = resale * 0.0725;
          const targetMarginVal = resale * (targetMargin / 100);
          const maxBid = resale - (defaultRepair + fees + targetMarginVal);
          const bid = Math.max(0, Math.round(maxBid));
          const { profit, margin } = calculateValues(resale, defaultRepair, bid);

          return {
            id: `${year}-${make}-${model}-${Math.random()}`,
            year,
            make,
            model,
            damage,
            odometer,
            resale,
            repairs: defaultRepair,
            fees,
            maxBid: bid,
            profit,
            margin,
            url,
            repair_details: row["repair_details"] || "No details available.",
          };
        });

        setCars(result);
        setFiltered(result);
        setLoading(false);
      },
    });
  };

  // --------------------------------------------------
  // REPAIR EDIT
  // --------------------------------------------------
  const handleRepairChange = (id, newRepair) => {
    const repairVal = parseFloat(newRepair) || 0;

    const updatedCars = cars.map((car) => {
      if (car.id === id) {
        const { resale } = car;
        const fees = resale * 0.0725;
        const targetMarginVal = resale * (targetMargin / 100);
        const maxBid = Math.max(0, Math.round(resale - (repairVal + fees + targetMarginVal)));
        const { profit, margin } = calculateValues(resale, repairVal, maxBid);
        return { ...car, repairs: repairVal, fees, maxBid, profit, margin };
      }
      return car;
    });

    setCars(updatedCars);
    applyFilters(updatedCars, filters);
  };

  // --------------------------------------------------
  // FILTERS
  // --------------------------------------------------
  const applyFilters = (source, filterSet) => {
    let result = [...source];
    if (filterSet.year) result = result.filter((c) => String(c.year) === String(filterSet.year));
    if (filterSet.make) result = result.filter((c) => c.make === filterSet.make);
    if (filterSet.model) result = result.filter((c) => c.model === filterSet.model);
    if (filterSet.damage) result = result.filter((c) => c.damage === filterSet.damage);
    if (filterSet.minMiles) result = result.filter((c) => c.odometer >= +filterSet.minMiles);
    if (filterSet.maxMiles) result = result.filter((c) => c.odometer <= +filterSet.maxMiles);
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
      <header className="flex flex-col md:flex-row md:items-center md:justify-between p-6 border-b border-neutral-800 bg-neutral-950/70">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          🚗 Car Flip Analyzer (AI)
        </h1>
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          <input type="file" accept=".csv" onChange={handleFileSelect} className="text-sm text-gray-300" />
          <button
            onClick={handleRunAnalysis}
            disabled={loading}
            className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-6 py-2 rounded-full shadow-md hover:opacity-90"
          >
            {loading ? "Loading…" : "Run Analysis"}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {loading && <p className="text-center text-gray-400 mt-10">⏳ Loading vehicle data...</p>}

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
                <div className="pb-3 border-b border-neutral-700 mb-3">
                  <h2 className="text-xl font-semibold mb-1 text-white">
                    {car.year} {car.make} {car.model}
                  </h2>
                  <p className="text-sm text-gray-400 mb-1">Odometer: {car.odometer?.toLocaleString?.()} mi</p>
                  <p className="text-sm text-gray-400">Damage: {car.damage}</p>
                </div>

				<div className="space-y-1 text-sm">
				  {/* 🖼️ Vehicle Image */}
				  {car.image_url && (
					<img
					  src={`http://localhost:8000${car.image_url}`}
					  alt={`${car.make} ${car.model}`}
					  className="card-image"
					  loading="lazy"
					/>
				  )}

				  <p>
					AI Resale Value:{" "}
					<span className="text-gray-300">
					  ${car.resale?.toLocaleString?.()}
					</span>
				  </p>
				  <p>
					Repairs:{" "}
					<input
					  type="number"
					  value={car.repairs}
					  onClick={(e) => e.stopPropagation()}
					  onChange={(e) => handleRepairChange(car.id, e.target.value)}
					  onKeyDown={(e) => e.stopPropagation()}
					  className="bg-neutral-700 text-white px-2 py-1 w-24 rounded-md ml-2"
					/>
				  </p>

                  <p>Max Bid ({targetMargin}% Margin): <span className="font-semibold text-yellow-400">${car.maxBid?.toLocaleString?.()}</span></p>
                  <p>Profit: <span className={`font-semibold ${car.profit >= 0 ? "text-green-400" : "text-red-400"}`}>${car.profit?.toLocaleString?.()}</span></p>
                  <p>Margin: <span className={`font-semibold ${car.margin >= 30 ? "text-green-400" : "text-blue-400"}`}>{car.margin}%</span></p>
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
            <div className="flex flex-col items-center justify-center mt-16 text-center">
              <img src="/logo.png" alt="Automotive Analyst Logo" className="w-64 md:w-80 lg:w-96 mb-6" />
              <p className="text-gray-500">
                Upload a CSV or wait for backend data from <b>/cars/with_estimates</b>.
              </p>
            </div>
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
            <p className="text-sm text-gray-300 whitespace-pre-wrap">
              {selectedCar.repair_details || "No repair details available."}
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
