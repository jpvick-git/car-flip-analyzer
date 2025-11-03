import React, { useState, useEffect } from "react";

function App() {
  const [cars, setCars] = useState([]);
  const [filteredCars, setFilteredCars] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDamage, setSelectedDamage] = useState("");

  useEffect(() => {
    fetch("https://api.carflipanalyzer.com/cars/with_estimates")
      .then((res) => res.json())
      .then((data) => {
        setCars(data);
        setFilteredCars(data);
      })
      .catch((err) => console.error("Error fetching cars:", err));
  }, []);

  const uniqueYears = [...new Set(cars.map((car) => car.year).filter(Boolean))];
  const uniqueMakes = [...new Set(cars.map((car) => car.make).filter(Boolean))];
  const uniqueDamages = [
    ...new Set(cars.map((car) => car.damage).filter(Boolean)),
  ];

  const handleFilter = () => {
    let filtered = cars;

    if (search)
      filtered = filtered.filter((car) =>
        `${car.make} ${car.model}`.toLowerCase().includes(search.toLowerCase())
      );

    if (selectedMake)
      filtered = filtered.filter((car) => car.make === selectedMake);

    if (selectedYear)
      filtered = filtered.filter((car) => car.year === selectedYear);

    if (selectedDamage)
      filtered = filtered.filter((car) => car.damage === selectedDamage);

    setFilteredCars(filtered);
  };

  useEffect(() => {
    handleFilter();
  }, [search, selectedMake, selectedYear, selectedDamage]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-blue-400">Car Flip Analyzer</h1>
        <p className="text-neutral-400 text-sm">Find your next profitable flip</p>
      </header>

      {/* FILTER BAR */}
      <div className="sticky top-[76px] z-40 p-4 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-sm flex flex-wrap gap-3 justify-center">
        <input
          type="text"
          placeholder="Search make/model..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-md bg-neutral-800 text-white border border-neutral-700 w-60 focus:outline-none focus:ring focus:ring-blue-500"
        />

        <select
          value={selectedMake}
          onChange={(e) => setSelectedMake(e.target.value)}
          className="px-3 py-2 rounded-md bg-neutral-800 text-white border border-neutral-700"
        >
          <option value="">All Makes</option>
          {uniqueMakes.map((make) => (
            <option key={make} value={make}>
              {make}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="px-3 py-2 rounded-md bg-neutral-800 text-white border border-neutral-700"
        >
          <option value="">All Years</option>
          {uniqueYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <select
          value={selectedDamage}
          onChange={(e) => setSelectedDamage(e.target.value)}
          className="px-3 py-2 rounded-md bg-neutral-800 text-white border border-neutral-700"
        >
          <option value="">All Damage</option>
          {uniqueDamages.map((damage) => (
            <option key={damage} value={damage}>
              {damage}
            </option>
          ))}
        </select>
      </div>

      {/* MAIN CONTENT */}
      <main className="p-6 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredCars.length === 0 ? (
          <p className="text-neutral-400 text-center col-span-full">
            No cars found.
          </p>
        ) : (
          filteredCars.map((car, index) => (
            <div
              key={index}
              className="bg-neutral-900 rounded-xl shadow-md overflow-hidden border border-neutral-800 hover:border-blue-500 transition"
            >
              <img
                loading="lazy"
                src={
                  car?.image_url
                    ? car.image_url
                    : "https://placehold.co/600x400?text=No+Image"
                }
                alt={`${car.make ?? ""} ${car.model ?? ""}`}
                className="w-full h-48 object-cover"
                onError={(e) =>
                  (e.target.src = "https://placehold.co/600x400?text=No+Image")
                }
              />
              <div className="p-4">
                <h2 className="text-lg font-semibold mb-1">
                  {car.year} {car.make} {car.model}
                </h2>
                <p className="text-sm text-neutral-400 mb-2">
                  {car.damage || "No damage info"}
                </p>
                <div className="text-sm text-neutral-300 space-y-1">
                  <p>
                    <span className="text-neutral-500">Est. Retail:</span>{" "}
                    ${car.resale?.toLocaleString() || "N/A"}
                  </p>
                  <p>
                    <span className="text-neutral-500">Est. Repair:</span>{" "}
                    ${car.repairs?.toLocaleString() || "N/A"}
                  </p>
                </div>
                <a
                  href={car.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-3 text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
                >
                  View Lot
                </a>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}

export default App;
