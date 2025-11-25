import React, { useEffect, useState } from "react";
import axios from "axios";
import { Wrench, DollarSign } from "lucide-react";

///////////////////////////////////////////////////////////////////////////////////////////
// MANUAL VEHICLE MODAL — NHTSA VERSION (NO UI CHANGES)
///////////////////////////////////////////////////////////////////////////////////////////
function ManualVehicleModal({ API, close, reload }) {
  const [form, setForm] = useState({
    year: "",
    make: "",
    model: "",
    trim: "",
    mileage: "",
    damage_description: "",
    title_code: "",
    location: "",
    listing_url: "",
  });

  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [trims, setTrims] = useState([]);
  const [images, setImages] = useState([]);

  // Years 1980–2026
  const years = Array.from({ length: 2026 - 1980 + 1 }, (_, i) => 1980 + i);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleImageFiles = (e) =>
    setImages([...images, ...Array.from(e.target.files)]);

  // -----------------------------
  // LOAD MAKES (NHTSA)
  // -----------------------------
  useEffect(() => {
    const loadMakes = async () => {
      try {
        const res = await axios.get(`${API}/nhtsa/makes`);
        setMakes(res.data.makes || []);
      } catch (err) {
        console.error("Failed to load makes:", err);
      }
    };
    loadMakes();
  }, [API]);

  // -----------------------------
  // LOAD MODELS WHEN MAKE CHANGES
  // -----------------------------
  useEffect(() => {
    if (!form.make) return;

    const loadModels = async () => {
      try {
        const res = await axios.get(`${API}/nhtsa/models?make=${form.make}`);
        setModels(res.data.models || []);
        setTrims([]);
        setForm((prev) => ({ ...prev, model: "", trim: "" }));
      } catch (err) {
        console.error("Failed to load models:", err);
      }
    };

    loadModels();
  }, [form.make, API]);

  // -----------------------------
  // LOAD TRIMS WHEN YEAR + MAKE + MODEL CHOSEN
  // -----------------------------
  useEffect(() => {
    if (!form.year || !form.make || !form.model) return;

    const loadTrims = async () => {
      try {
        const res = await axios.get(
          `${API}/nhtsa/trims?make=${form.make}&model=${form.model}&year=${form.year}`
        );
        setTrims(res.data.trims || []);
        setForm((prev) => ({ ...prev, trim: "" }));
      } catch (err) {
        console.error("Failed to load trims:", err);
      }
    };

    loadTrims();
  }, [form.year, form.make, form.model, API]);

  // -----------------------------
  // SUBMIT
  // -----------------------------
  const submit = async () => {
    try {
      const fd = new FormData();
      Object.keys(form).forEach((k) => fd.append(k, form[k]));
      images.forEach((img) => fd.append("files", img));

      await axios.post(`${API}/add_manual_vehicle`, fd, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "multipart/form-data",
        },
      });

      close();
      reload();
    } catch (err) {
      console.error("Manual upload failed:", err);
      alert("Failed to add vehicle.");
    }
  };

  // -----------------------------
  // RENDER (NO UI CHANGES)
  // -----------------------------
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl text-black">
        <h2 className="text-xl font-semibold mb-4 text-black">Add Vehicle</h2>

        {/* YEAR */}
        <select
          name="year"
          value={form.year}
          onChange={update}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* MAKE */}
        <select
          name="make"
          value={form.make}
          onChange={update}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Make</option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* MODEL */}
        <select
          name="model"
          value={form.model}
          onChange={update}
          disabled={!models.length}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Model</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* TRIM */}
        <select
          name="trim"
          value={form.trim}
          onChange={update}
          disabled={!trims.length}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Trim</option>
          {trims.map((t, i) => (
            <option key={i} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* OTHER INPUTS */}
        {[
          ["mileage", "Mileage"],
          ["damage_description", "Damage"],
          ["title_code", "Title Code"],
          ["location", "Location"],
          ["listing_url", "Listing URL (optional)"],
        ].map(([key, label]) => (
          <input
            key={key}
            name={key}
            value={form[key]}
            onChange={update}
            placeholder={label}
            className="w-full border rounded-lg p-2 mb-3 text-black"
          />
        ))}

        {/* PHOTOS */}
        <label className="font-medium text-black">Photos</label>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleImageFiles}
          className="w-full border p-2 rounded mb-3 text-black"
        />

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {images.map((img, i) => (
              <img
                key={i}
                src={URL.createObjectURL(img)}
                className="w-full h-20 object-cover rounded"
              />
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 bg-gray-300 rounded-lg text-black" onClick={close}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded-lg"
            onClick={submit}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}


///////////////////////////////////////////////////////////////////////////////////////////
// MAIN DASHBOARD
///////////////////////////////////////////////////////////////////////////////////////////
const Dashboard = ({ showAddModal, setShowAddModal }) => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [tempMargin, setTempMargin] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API = process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com";

  const calculateCarWithMargin = (car, marginInput) => {
    const resale = Number(car.resale_estimate || 0);
    const repair = Number(car.repair_estimate || 0);
    const taxRate = Number(car.avg_tax_rate || 0);
    const titleFee = Number(car.title_fee || 0);

    const margin = Number(marginInput) / 100;
    const divisor = 1 + 0.075 + taxRate / 100;

    let bid = (resale * (1 - margin) - titleFee - repair) / divisor;
    if (isNaN(bid) || bid < 0) bid = 0;
    bid = Math.round(bid);

    const buyerFee = bid * 0.075;
    const taxAmt = bid * (taxRate / 100);
    const totalCost = bid + buyerFee + taxAmt + titleFee + repair;
    const profit = resale - totalCost;
    const marginActual = resale > 0 ? (profit / resale) * 100 : 0;

    return {
      ...car,
      max_bid: bid,
      buyer_fee: Math.round(buyerFee),
      tax_amount_calc: Math.round(taxAmt),
      total_cost: Math.round(totalCost),
      profit: Math.round(profit),
      margin_actual: Number(marginActual.toFixed(1)),
      repair,
      resale,
    };
  };

  // LOAD VEHICLES
  useEffect(() => {
    const fetchCars = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API}/get_vehicles`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        let vehicles = [];
        const data = response.data;

        if (Array.isArray(data)) vehicles = data;
        else if (data && Array.isArray(data.vehicles)) vehicles = data.vehicles;

        vehicles = vehicles.map((car) => calculateCarWithMargin(car, 15));
        setCars(vehicles);
      } catch (err) {
        console.error(err);
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

  const updateCarValue = (id, field, value) => {
    setCars((prev) =>
      prev.map((car) => {
        if (car.id !== id) return car;
        return calculateCarWithMargin({ ...car, [field]: value }, tempMargin);
      })
    );
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen text-gray-700">
        Loading vehicles...
      </div>
    );

  if (error)
    return (
      <div className="flex justify-center items-center h-screen text-red-600">
        {error}
      </div>
    );

  return (
    <main className="p-6 bg-gray-50 min-h-screen">

      {/* ADD VEHICLE MODAL */}
      {showAddModal && (
        <ManualVehicleModal
          API={API}
          close={() => setShowAddModal(false)}
          reload={() => window.location.reload()}
        />
      )}

      {/* CAR GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cars.map((car) => (
          <div
            key={car.id}
            className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition overflow-hidden"
          >
            <div className="relative">
              <img
                src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
                alt="Vehicle"
                className="w-full h-56 object-cover"
              />
              <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                {car.damage_description || "Unknown Damage"}
              </div>
            </div>

            <div className="p-4 space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {car.year} {car.make} {car.model}
              </h2>

              <p className="text-sm text-gray-500">Lot #: {car.lot_number}</p>
              <p className="text-sm text-gray-500">Location: {car.sale_name || "N/A"}</p>

              <p className="text-sm text-gray-500">
                Sale Date:{" "}
                {car.sale_date
                  ? new Date(car.sale_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "N/A"}
              </p>

              {/* Repair + Resale Inputs */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <div className="flex items-center space-x-1 text-gray-700">
                  <Wrench size={16} />
                  <span>Repair:</span>
                  <span>$</span>
                  <input
                    type="number"
                    value={car.repair_estimate}
                    onChange={(e) =>
                      updateCarValue(car.id, "repair_estimate", Number(e.target.value))
                    }
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>

                <div className="flex items-center space-x-1 text-gray-700">
                  <DollarSign size={16} />
                  <span>Resale:</span>
                  <span>$</span>
                  <input
                    type="number"
                    value={car.resale_estimate}
                    onChange={(e) =>
                      updateCarValue(car.id, "resale_estimate", Number(e.target.value))
                    }
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-1 mt-2 text-gray-700">
                <span className="font-medium">Max Bid:</span>
                <span>${car.max_bid?.toLocaleString()}</span>
              </div>

              <div className="flex justify-between pt-6">
                <button
                  onClick={() => {
                    setTempMargin(15);
                    setSelectedCar(car);
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* VIEW DETAILS MODAL */}
      {selectedCar && (() => {
        const activeCar = cars.find((c) => c.id === selectedCar.id) || selectedCar;
        const live = calculateCarWithMargin(activeCar, tempMargin);

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative">
              <button
                onClick={() => setSelectedCar(null)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-xl"
              >
                ✕
              </button>

              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                {activeCar.year} {activeCar.make} {activeCar.model}
              </h2>

              <div className="space-y-2 text-sm text-gray-700">
                <p><span className="font-medium">Lot Number:</span> {activeCar.lot_number}</p>
                <p><span className="font-medium">Sale Date:</span> {activeCar.sale_date || "N/A"}</p>
                <p><span className="font-medium">Damage:</span> {activeCar.damage_description || "Unknown"}</p>
                <p><span className="font-medium">Odometer:</span> {activeCar.odometer || "N/A"}</p>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-300">
                  <div className="flex items-center space-x-1">
                    <Wrench size={16} />
                    <span>Repair:</span>
                    <span>$</span>
                    <input
                      type="number"
                      value={activeCar.repair_estimate}
                      onChange={(e) =>
                        updateCarValue(activeCar.id, "repair_estimate", Number(e.target.value))
                      }
                      className="w-24 border border-gray-300 rounded px-2 py-1"
                    />
                  </div>

                  <div className="flex items-center space-x-1">
                    <DollarSign size={16} />
                    <span>Resale:</span>
                    <span>$</span>
                    <input
                      type="number"
                      value={activeCar.resale_estimate}
                      onChange={(e) =>
                        updateCarValue(activeCar.id, "resale_estimate", Number(e.target.value))
                      }
                      className="w-24 border border-gray-300 rounded px-2 py-1"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 mt-4">
                  <span className="font-medium">Desired Margin:</span>
                  <input
                    type="number"
                    value={tempMargin}
                    onChange={(e) => {
                      let val = Number(e.target.value);
                      if (isNaN(val)) val = 0;
                      if (val < 0) val = 0;
                      if (val > 90) val = 90;
                      setTempMargin(val);
                    }}
                    className="w-20 border border-gray-300 rounded px-2 py-1"
                  />
                  <span>%</span>
                </div>

                <div className="mt-4 text-gray-900 text-base font-bold">
                  Max Bid: ${live.max_bid.toLocaleString()}
                </div>

                <div className="mt-3 text-sm text-gray-800">
                  <hr className="my-2" />
                  <p>Buyer Fee (7.5%): ${live.buyer_fee.toLocaleString()}</p>
                  <p>Tax ({Number(activeCar.avg_tax_rate).toFixed(1)}%): ${live.tax_amount_calc.toLocaleString()}</p>
                  <p>Title Fee: ${Number(activeCar.title_fee || 0).toLocaleString()}</p>
                  <p>Repairs: ${Number(live.repair).toLocaleString()}</p>

                  <hr className="my-2" />

                  <p><span className="font-semibold">Total Cost:</span> ${live.total_cost.toLocaleString()}</p>
                  <p><span className="font-semibold">Profit:</span> ${live.profit.toLocaleString()}</p>
                  <p><span className="font-semibold">Margin:</span> {live.margin_actual}%</p>

                  <hr className="my-3 border-gray-300" />
                </div>

                <p className="mt-4">
                  <span className="font-medium">Repair Details:</span>{" "}
                  {activeCar.repair_details || "N/A"}
                </p>

                <p className="mt-1">
                  <span className="font-medium">Resale Details:</span>{" "}
                  {activeCar.resale_details || "N/A"}
                </p>

                {activeCar.lot_url && (
                  <a
                    href={activeCar.lot_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-blue-600 hover:underline text-sm"
                  >
                    Open in Copart →
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
};

export default Dashboard;
