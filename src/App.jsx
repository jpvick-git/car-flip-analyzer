import React, { useState, useEffect } from "react";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [status, setStatus] = useState("");
  const [selectedCar, setSelectedCar] = useState(null);
  const [polling, setPolling] = useState(false);

  const apiBase =
    process.env.NODE_ENV === "development"
      ? "http://localhost:8000"
      : "https://api.carflipanalyzer.com";

  // --------------------------------------------------
  // AUTH HANDLERS
  // --------------------------------------------------
  const register = async () => {
    setStatus("Registering...");
    const res = await fetch(`${apiBase}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    });
    const data = await res.json();
    setStatus(data.message || "Registered");
  };

  const login = async () => {
    setStatus("Logging in...");
    const res = await fetch(`${apiBase}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    });
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem("token", data.access_token);
      setToken(data.access_token);
      setStatus("Login successful ✅");
      fetchVehicles();
    } else {
      setStatus("Login failed ❌");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken("");
    setVehicles([]);
    setStatus("Logged out");
  };

  // --------------------------------------------------
  // FETCH VEHICLES (user-specific)
  // --------------------------------------------------
  const fetchVehicles = async () => {
    if (!token) return;
    setStatus("Loading your vehicles...");
    const res = await fetch(`${apiBase}/get_vehicles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setVehicles(data.vehicles || []);
      setStatus(`Loaded ${data.vehicles?.length || 0} vehicles`);
    } else {
      setVehicles([]);
      setStatus("Failed to load vehicles");
    }
  };

  useEffect(() => {
    if (token) fetchVehicles();
  }, [token]);

  // --------------------------------------------------
  // FILE UPLOAD (triggers Copart + AI)
  // --------------------------------------------------
  const uploadUserFile = async () => {
    if (!uploadFile || !token) return alert("Login and select a file first.");
    const formData = new FormData();
    formData.append("file", uploadFile);
    setStatus("Uploading and processing file...");
    const res = await fetch(`${apiBase}/upload_file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    setStatus(data.message || "File uploaded.");
    startPolling();
  };

  // --------------------------------------------------
  // POLLING UNTIL NEW VEHICLES + AI COMPLETE
  // --------------------------------------------------
  const startPolling = () => {
    if (polling) return;
    setPolling(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const res = await fetch(`${apiBase}/get_vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.vehicles || []);
        const ready = data.vehicles?.every(
          (v) => v.repair_estimate && v.resale_estimate
        );
        if (ready || attempts > 20) {
          clearInterval(interval);
          setPolling(false);
          setStatus("✅ All vehicles processed.");
        } else {
          setStatus(`Processing... (${attempts})`);
        }
      }
    }, 8000);
  };

  // --------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex flex-col md:flex-row md:items-center justify-between px-8 py-4 border-b border-neutral-800 bg-neutral-950 shadow-md">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            Car Flip Analyzer
          </h1>
          <img
            src="/logo.png"
            alt="Logo"
            className="h-14 md:h-16 object-contain opacity-90 hover:opacity-100 transition"
          />
        </div>

        {/* Upload + Auth */}
        <div className="mt-4 md:mt-0 flex flex-col items-end space-y-2">
          {!token ? (
            <>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="p-2 rounded text-black text-sm"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="p-2 rounded text-black text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={login}
                  className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white text-sm"
                >
                  Login
                </button>
                <button
                  onClick={register}
                  className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-white text-sm"
                >
                  Register
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadFile(e.target.files[0])}
                className="block text-sm text-gray-300"
              />
              <button
                onClick={uploadUserFile}
                className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-md text-white text-sm"
              >
                Upload CSV
              </button>
              <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded text-white text-xs"
              >
                Logout
              </button>
              {status && (
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {status}
                </p>
              )}
            </>
          )}
        </div>
      </header>

      {/* MAIN CONTENT */}
		<main className="flex-1 overflow-y-auto p-6">
		  {status.includes("Loading") && (
			<p className="text-center text-gray-400 mt-10">
			  ⏳ Loading vehicles...
			</p>
		  )}

		  {Array.isArray(vehicles) && vehicles.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((car, idx) => (
              <div
                key={car.id || idx}
                onClick={(e) => {
                  const tag = e.target.tagName.toLowerCase();
                  if (
                    !["input", "button", "summary", "details", "label", "a"].includes(tag)
                  ) {
                    if (car?.lot_url)
                      window.open(car.lot_url, "_blank", "noopener,noreferrer");
                  }
                }}
                className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-5 shadow-md hover:bg-neutral-700/70 hover:ring-2 hover:ring-blue-500 cursor-pointer transition-all"
              >
				<img
				  loading="lazy"
				  src={
					car?.image_url
					  ? car.image_url.startsWith("http")
						? car.image_url
						: `https://api.carflipanalyzer.com/backend/${car.image_url.replace(/^\/+/, "")}`
					  : "https://placehold.co/600x400?text=No+Image"
				  }
				  alt={`${car.make ?? ""} ${car.model ?? ""}`}
				  className="w-full h-48 object-cover rounded-lg mb-3"
				  onError={(e) =>
					(e.target.src = "https://placehold.co/600x400?text=No+Image")
				  }
				/>

                <div className="pb-3 border-b border-neutral-700 mb-3">
                  <h2 className="text-xl font-semibold mb-1 text-white">
                    {car?.year ? Math.round(car.year) : "Unknown Year"}{" "}
                    {car?.make ?? ""} {car?.model ?? ""}
                  </h2>
                  <p className="text-sm text-gray-400 mb-1">
                    Odometer: {car?.odometer || "N/A"}
                  </p>
                  <p className="text-sm text-gray-400">
                    Damage: {car?.damage_description || "Unknown"}
                  </p>
                </div>

                <div className="space-y-1 text-sm">
                  <p>
                    AI Resale Value: $
                    {Number(car?.resale_estimate || 0).toLocaleString()}
                  </p>
                  <p>
                    Est. Repairs: $
                    {Number(car?.repair_estimate || 0).toLocaleString()}
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
		  <p className="text-center text-gray-500 mt-10">
			No vehicles yet. Upload a CSV to begin.
		  </p>
		)}
      </main>

      {/* MODAL */}
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
