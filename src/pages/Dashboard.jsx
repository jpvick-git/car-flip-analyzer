import React, { useState, useEffect } from "react";
import Header from "../components/Header";

export default function Dashboard() {
  const [vehicles, setVehicles] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [status, setStatus] = useState("");
  const [selectedCar, setSelectedCar] = useState(null);
  const [polling, setPolling] = useState(false);
  const [repairs, setRepairs] = useState({});
  const [maxBidDetails, setMaxBidDetails] = useState(null);
  const [userIP, setUserIP] = useState("");
  const [isAllowed, setIsAllowed] = useState(false);

  const token = localStorage.getItem("token");
  const apiBase =
    process.env.NODE_ENV === "development"
      ? "http://localhost:8000"
      : "https://api.carflipanalyzer.com";

  // ✅ Your authorized IP
  const allowedIP = "68.186.200.184";

  // --------------------------------------------------
  // GET USER IP
  // --------------------------------------------------
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => {
        setUserIP(data.ip);
        if (data.ip === allowedIP) {
          setIsAllowed(true);
        }
      })
      .catch((err) => console.error("Failed to get IP:", err));
  }, []);

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
    fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------
  // FILE UPLOAD HANDLER (hidden unless isAllowed)
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
  // CALCULATION: Recommended Max Bid
  // --------------------------------------------------
  const calculateMaxBid = (car, localRepair) => {
    const resale = Number(car.resale_estimate) || 0;
    const repairsValue = Number(localRepair || car.repair_estimate || 0);
    const titleFee = Number(car.title_fee) || 0;
    const taxRate = (Number(car.avg_tax_rate) || 0) / 100;
    const buyerFeeRate = 0.0725;
    const margin = 0.3;

    if (resale <= 0) return 0;

    const totalTax = resale * taxRate;
    const totalBuyerFee = resale * buyerFeeRate;
    const grossTarget = resale * (1 - margin);
    const totalCosts = repairsValue + titleFee + totalTax + totalBuyerFee;
    const maxBid = Math.max(0, grossTarget - totalCosts);

    return maxBid;
  };

  // --------------------------------------------------
  // LOGOUT HANDLER
  // --------------------------------------------------
  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  // --------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <Header
        uploadFile={uploadFile}
        setUploadFile={setUploadFile}
        uploadUserFile={uploadUserFile}
        logout={logout}
      />

      <main className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
        {status && (
          <p className="text-center text-gray-600 mb-4 text-sm">{status}</p>
        )}

        {/* IP-based restriction message */}
        {!isAllowed && (
          <p className="text-center text-gray-400 mb-6 text-sm">
            Uploads restricted to authorized IP.  
            <br />
            Detected IP: <span className="font-mono">{userIP || "..."}</span>
          </p>
        )}

        {isAllowed && vehicles.length === 0 && (
          <p className="text-center text-gray-500 mb-6 text-sm">
            Upload a CSV to begin.
          </p>
        )}

        {Array.isArray(vehicles) && vehicles.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((car, idx) => {
              const localRepair =
                repairs[car.id] !== undefined
                  ? repairs[car.id]
                  : car.repair_estimate || "";
              const maxBid = calculateMaxBid(car, localRepair);

              return (
                <div
                  key={car.id || idx}
                  className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-lg transition cursor-pointer"
                  onClick={() => {
                    if (car?.lot_url)
                      window.open(car.lot_url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <img
                    loading="lazy"
                    src={
                      car?.image_url
                        ? car.image_url
                        : "https://placehold.co/600x400?text=No+Image"
                    }
                    alt={`${car.make || ""} ${car.model || ""}`}
                    className="w-full h-48 object-cover rounded-lg mb-3 bg-gray-100"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src =
                        "https://placehold.co/600x400?text=No+Image";
                    }}
                  />

                  <div className="pb-3 border-b border-gray-200 mb-3">
                    <h2 className="text-lg font-semibold mb-1 text-gray-900">
                      {car?.year ? Math.round(car.year) : "Unknown Year"}{" "}
                      {car?.make || ""} {car?.model || ""}
                    </h2>
                    <p className="text-sm text-gray-500 mb-1">
                      Odometer: {car?.odometer || "N/A"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Damage: {car?.damage_description || "Unknown"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 text-sm">
                    <div>
                      <p className="text-gray-500">AI Resale Value</p>
                      <p className="font-semibold text-green-600">
                        ${Number(car?.resale_estimate || 0).toLocaleString()}
                      </p>
                    </div>

                    <div className="relative">
                      <p className="text-gray-500">Est. Repairs</p>
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-red-500 font-semibold">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        className="font-semibold text-red-500 w-full border border-gray-200 rounded-md pl-6 pr-2 py-0.5 text-right focus:ring-1 focus:ring-blue-500"
                        value={localRepair}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const val = e.target.value;
                          setRepairs((prev) => ({
                            ...prev,
                            [car.id]: val === "" ? "" : val,
                          }));
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-gray-500">Recommended Max Bid</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const resale = Number(car.resale_estimate) || 0;
                          const repairsValue =
                            Number(localRepair || car.repair_estimate || 0);
                          const titleFee = Number(car.title_fee) || 0;
                          const taxRate = (Number(car.avg_tax_rate) || 0) / 100;
                          const buyerFeeRate = 0.0725;
                          const margin = 0.3;

                          const totalTax = resale * taxRate;
                          const totalBuyerFee = resale * buyerFeeRate;
                          const grossTarget = resale * (1 - margin);
                          const totalCosts =
                            repairsValue + titleFee + totalTax + totalBuyerFee;
                          const maxBid = Math.max(0, grossTarget - totalCosts);

                          setMaxBidDetails({
                            car,
                            resale,
                            repairsValue,
                            titleFee,
                            totalTax,
                            totalBuyerFee,
                            grossTarget,
                            margin,
                            maxBid,
                          });
                        }}
                        className="text-blue-600 text-xs hover:underline"
                      >
                        View Breakdown
                      </button>
                    </div>

                    <p className="font-semibold text-blue-600">
                      $
                      {calculateMaxBid(car, localRepair).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 }
                      )}
                    </p>
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCar(car);
                      }}
                      className="text-blue-600 text-sm hover:underline"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-gray-500 mt-20">
            No vehicles yet. Upload a CSV to begin.
          </p>
        )}
      </main>
    </div>
  );
}
