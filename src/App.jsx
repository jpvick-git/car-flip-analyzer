import React, { useState, useEffect } from "react";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [mode, setMode] = useState("login"); // "login" or "register"
  const [form, setForm] = useState({ username: "", password: "" });
  const [message, setMessage] = useState("");

  const API_URL =
    process.env.NODE_ENV === "development"
      ? "http://localhost:8000"
      : "https://api.carflipanalyzer.com";

  // --------------------------------------------------
  // AUTH HANDLERS
  // --------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    const endpoint = mode === "login" ? "login" : "register";
    const body = new URLSearchParams({
      username: form.username,
      password: form.password,
    });

    try {
      const res = await fetch(`${API_URL}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed");
      }

      const data = await res.json();

      if (mode === "login" && data.access_token) {
        localStorage.setItem("token", data.access_token);
        setToken(data.access_token);
      } else if (mode === "register") {
        setMessage("✅ Account created! Please log in.");
        setMode("login");
      }
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
  };

  // --------------------------------------------------
  // CONDITIONAL RENDERING
  // --------------------------------------------------
  if (!token) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="bg-neutral-900 p-8 rounded-2xl shadow-md w-96 border border-neutral-700">
          <h1 className="text-2xl font-bold mb-4 text-center">
            {mode === "login" ? "Login" : "Create Account"}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              className="w-full px-3 py-2 rounded-md bg-neutral-800 text-white"
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="w-full px-3 py-2 rounded-md bg-neutral-800 text-white"
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded-md font-semibold"
            >
              {mode === "login" ? "Login" : "Register"}
            </button>
          </form>

          {message && (
            <p className="mt-3 text-center text-sm text-gray-300">{message}</p>
          )}

          <p className="mt-4 text-center text-sm text-gray-400">
            {mode === "login" ? (
              <>
                Don’t have an account?{" "}
                <button
                  className="text-blue-400 hover:text-blue-300"
                  onClick={() => setMode("register")}
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  className="text-blue-400 hover:text-blue-300"
                  onClick={() => setMode("login")}
                >
                  Login
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // MAIN APP WHEN LOGGED IN
  // --------------------------------------------------
  return <MainApp token={token} onLogout={handleLogout} API_URL={API_URL} />;
}

// --------------------------------------------------
// MAIN APP COMPONENT
// --------------------------------------------------

function MainApp({ token, onLogout, API_URL }) {
  const [cars, setCars] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(false);
  const [targetMargin, setTargetMargin] = useState(30);
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
  });

  useEffect(() => {
    const fetchCars = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/cars/with_estimates`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Server ${res.status}`);
        const data = await res.json();
        const carsArray = data?.cars || data || [];
        setCars(carsArray);
        setFiltered(carsArray);

        const years = [...new Set(carsArray.map((c) => c.year))].sort((a, b) => b - a);
        const makes = [...new Set(carsArray.map((c) => c.make))].sort();
        const models = [...new Set(carsArray.map((c) => c.model))].sort();
        const damages = [...new Set(carsArray.map((c) => c.damage))].sort();

        setOptions({ years, makes, models, damages });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCars();
  }, [token, API_URL]);

  const applyFilters = () => {
    let results = [...cars];
    if (filters.year) results = results.filter((c) => c.year === parseInt(filters.year));
    if (filters.make) results = results.filter((c) => c.make === filters.make);
    if (filters.model) results = results.filter((c) => c.model === filters.model);
    if (filters.damage) results = results.filter((c) => c.damage === filters.damage);
    setFiltered(results);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-neutral-800 bg-neutral-950 shadow-md">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          Car Flip Analyzer
        </h1>
        <button
          onClick={onLogout}
          className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-md"
        >
          Logout
        </button>
      </header>

      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="bg-neutral-900 p-4 rounded-xl shadow-md flex flex-wrap gap-4">
          <select
            value={filters.year}
            onChange={(e) => setFilters({ ...filters, year: e.target.value })}
            className="bg-neutral-800 rounded-md px-3 py-2"
          >
            <option value="">Year</option>
            {options.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={filters.make}
            onChange={(e) => setFilters({ ...filters, make: e.target.value })}
            className="bg-neutral-800 rounded-md px-3 py-2"
          >
            <option value="">Make</option>
            {options.makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filters.model}
            onChange={(e) => setFilters({ ...filters, model: e.target.value })}
            className="bg-neutral-800 rounded-md px-3 py-2"
          >
            <option value="">Model</option>
            {options.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filters.damage}
            onChange={(e) => setFilters({ ...filters, damage: e.target.value })}
            className="bg-neutral-800 rounded-md px-3 py-2"
          >
            <option value="">Damage</option>
            {options.damages.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            onClick={applyFilters}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md font-semibold"
          >
            Apply Filters
          </button>
        </div>

        {/* Vehicle Grid */}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((car) => (
              <div
                key={car.lot_number}
                className="bg-neutral-900 p-4 rounded-xl shadow hover:shadow-lg transition"
              >
                <h2 className="text-lg font-semibold mb-2">
                  {car.year} {car.make} {car.model}
                </h2>
                <p className="text-sm text-gray-400">{car.damage}</p>
                <p className="text-sm mt-2">Repair: ${car.repair_estimate}</p>
                <p className="text-sm">Resale: ${car.resale_estimate}</p>
                <a
                  href={car.lot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 mt-2 block"
                >
                  View Lot →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
