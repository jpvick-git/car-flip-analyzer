import React, { useEffect, useState } from "react";
import axios from "axios";
import { Wrench, DollarSign } from "lucide-react";

///////////////////////////////////////////////////////////////////////////////////////////
//  ADD VEHICLE MODAL (ManualVehicleModal)
///////////////////////////////////////////////////////////////////////////////////////////

function ManualVehicleModal({ API, close, reload }) {
  const [form, setForm] = useState({
    year: "",
    make: "",
    model: "",
    trim: "",
    mileage: "",
    damage_description: "",
    title_status: "",
    asking_price: "",
    location: "",
    listing_url: "",
    description: "",
    vin: "",
  });

  const [years, setYears] = useState([]);
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [trims, setTrims] = useState([]);

  const [images, setImages] = useState({
    front_image: null,
    driver_image: null,
    passenger_image: null,
    rear_image: null,
    interior_image: null,
    dash_image: null,
  });

  const update = (e) =>
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

  // LOAD YEARS
  useEffect(() => {
    const loadYears = async () => {
      try {
        const res = await axios.get(`${API}/api/specs/years`);
        setYears(res.data || []);
      } catch (err) {
        console.error("Failed to load years:", err);
      }
    };
    loadYears();
  }, [API]);

  // LOAD MAKES
  useEffect(() => {
    if (!form.year) return;
    const loadMakes = async () => {
      try {
        const res = await axios.get(`${API}/api/specs/makes/${form.year}`);
        setMakes(res.data || []);
        setModels([]);
        setTrims([]);
        setForm((prev) => ({ ...prev, make: "", model: "", trim: "" }));
      } catch (err) {
        console.error("Failed to load makes:", err);
      }
    };
    loadMakes();
  }, [form.year, API]);

  // LOAD MODELS
  useEffect(() => {
    if (!form.year || !form.make) return;
    const loadModels = async () => {
      try {
        const res = await axios.get(
          `${API}/api/specs/models/${form.year}/${form.make}`
        );
        setModels(res.data || []);
        setTrims([]);
        setForm((prev) => ({ ...prev, model: "", trim: "" }));
      } catch (err) {
        console.error("Failed to load models:", err);
      }
    };
    loadModels();
  }, [form.year, form.make, API]);

  // LOAD TRIMS
  useEffect(() => {
    if (!form.year || !form.make || !form.model) return;
    const loadTrims = async () => {
      try {
        const res = await axios.get(
          `${API}/api/specs/trims/${form.year}/${form.make}/${form.model}`
        );
        setTrims(res.data || []);
      } catch (err) {
        console.error("Failed to load trims:", err);
      }
    };
    loadTrims();
  }, [form.year, form.make, form.model, API]);

  const submit = async () => {
    try {
      const fd = new FormData();
      Object.keys(form).forEach((k) => fd.append(k, form[k]));
      Object.keys(images).forEach((k) => {
        if (images[k]) fd.append(k, images[k]);
      });

      await axios.post(`${API}/api/add_manual_vehicle`, fd, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "multipart/form-data",
        },
      });

      close();
      reload();
    } catch (err) {
      console.error("Manual vehicle upload failed:", err);
      alert("Failed to add vehicle.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl text-black max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Add Vehicle</h2>

        {/* SECTIONS */}
        <details className="mb-4" open>
          <summary className="font-semibold pb-2">Vehicle Info</summary>

          <select
            name="year"
            value={form.year}
            onChange={update}
            className="w-full border rounded-lg p-2 mb-3"
          >
            <option value="">Select Year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            name="make"
            value={form.make}
            onChange={update}
            disabled={!makes.length}
            className="w-full border rounded-lg p-2 mb-3"
          >
            <option value="">Select Make</option>
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            name="model"
            value={form.model}
            onChange={update}
            disabled={!models.length}
            className="w-full border rounded-lg p-2 mb-3"
          >
            <option value="">Select Model</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            name="trim"
            value={form.trim}
            onChange={update}
            disabled={!trims.length}
            className="w-full border rounded-lg p-2 mb-3"
          >
            <option value="">Select Trim</option>
            {trims.map((t, i) => (
              <option key={i} value={t}>
                {t}
              </option>
            ))}
          </select>
        </details>

        <details className="mb-4" open>
          <summary className="font-semibold pb-2">Vehicle Details</summary>

          {[
            ["mileage", "Mileage"],
            ["damage_description", "Damage"],
            ["title_status", "Title Status"],
            ["asking_price", "Asking Price"],
            ["location", "Location"],
            ["listing_url", "Listing URL (optional)"],
            ["description", "Description"],
            ["vin", "VIN"],
          ].map(([key, label]) => (
            <input
              key={key}
              name={key}
              value={form[key]}
              onChange={update}
              className="w-full border rounded-lg p-2 mb-3"
              placeholder={label}
            />
          ))}
        </details>

        <details className="mb-4" open>
          <summary className="font-semibold pb-2">Photos</summary>
          {[
            ["front_image", "Front"],
            ["driver_image", "Driver Side"],
            ["passenger_image", "Passenger Side"],
            ["rear_image", "Rear"],
            ["interior_image", "Interior"],
            ["dash_image", "Dash"],
          ].map(([key, label]) => (
            <div key={key} className="mb-3">
              <label className="font-medium">{label}</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setImages({ ...images, [key]: e.target.files[0] })
                }
                className="w-full border p-2 rounded"
              />
            </div>
          ))}
        </details>

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 bg-gray-300 rounded" onClick={close}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded"
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
//  CSV UPLOAD MODAL
///////////////////////////////////////////////////////////////////////////////////////////

function CSVUploadModal({
  showCSVModal,
  setShowCSVModal,
  uploadFile,
  setUploadFile,
  uploadUserFile,
}) {
  if (!showCSVModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-xl w-full max-w-md text-black shadow-xl">
        <h2 className="text-xl font-semibold mb-4">Upload CSV</h2>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => setUploadFile(e.target.files[0])}
          className="w-full border p-2 rounded mb-4"
        />

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 bg-gray-300 rounded"
            onClick={() => setShowCSVModal(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded"
            onClick={uploadUserFile}
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

///////////////////////////////////////////////////////////////////////////////////////////
//  DASHBOARD
///////////////////////////////////////////////////////////////////////////////////////////

export default function Dashboard({
  showAddModal,
  setShowAddModal,
  showCSVModal,
  setShowCSVModal,
  uploadFile,
  setUploadFile,
  uploadUserFile,
  uploadComplete,
}) {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [tempMargin, setTempMargin] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const API =
    process.env.REACT_APP_API_BASE_URL ?? "";

  // MAX BID CALC
  const calculateCarWithMargin = (car, marginInput) => {
    const resale = Number(car.resale_estimate || car.ai_resale_estimate || 0);
    const repair = Number(car.repair_estimate || car.ai_repair_estimate || 0);
    const taxRate = Number(car.avg_tax_rate || 0);
    const titleFee = Number(car.title_fee || 0);
    const margin = Number(marginInput) / 100;

    const divisor = 1 + 0.075 + taxRate / 100;
    let bid = (resale * (1 - margin) - titleFee - repair) / divisor;

    if (isNaN(bid) || bid < 0) bid = 0;
    bid = Math.round(bid);

    const buyerFee = bid * 0.075;
    const taxAmt = bid * (taxRate / 100);

    return {
      ...car,
      max_bid: bid,
      buyer_fee: Math.round(buyerFee),
      tax_amount_calc: Math.round(taxAmt),
      total_cost: Math.round(bid + buyerFee + taxAmt + titleFee + repair),
      profit: Math.round(resale - (bid + buyerFee + taxAmt + titleFee + repair)),
      margin_actual: resale
        ? Number(
            (((resale - (bid + buyerFee + taxAmt + titleFee + repair)) /
              resale) *
              100
            ).toFixed(1)
          )
        : 0,
    };
  };

  // LOAD VEHICLES
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/api/get_vehicles`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        let list = Array.isArray(res.data)
          ? res.data
          : res.data.vehicles || [];

        list = list.map((car) => {
          if (car.image_urls?.length > 0) {
            car.image_url = car.image_urls[0];
          }
          return calculateCarWithMargin(car, 15);
        });

        setCars(list);
      } catch (err) {
        console.error(err);
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Reload vehicles and start polling after CSV upload
  useEffect(() => {
    if (!uploadComplete) return;

    const fetchVehicles = async () => {
      try {
        const res = await axios.get(`${API}/api/get_vehicles`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        let list = Array.isArray(res.data) ? res.data : res.data.vehicles || [];
        list = list.map((car) => {
          if (car.image_urls?.length > 0) car.image_url = car.image_urls[0];
          return calculateCarWithMargin(car, 15);
        });
        setCars(list);
        return list;
      } catch (err) {
        console.error(err);
      }
    };

    setDownloading(true);
    fetchVehicles();

    const interval = setInterval(async () => {
      const list = await fetchVehicles();
      if (list && list.every((car) => car.image_url)) {
        setDownloading(false);
        clearInterval(interval);
      }
    }, 5000);

    const timeout = setTimeout(() => {
      setDownloading(false);
      clearInterval(interval);
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [uploadComplete]);

  const updateCarValue = (id, field, value) => {
    setCars((prev) =>
      prev.map((car) =>
        car.id === id
          ? calculateCarWithMargin({ ...car, [field]: value }, tempMargin)
          : car
      )
    );
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        Loading…
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

      {downloading && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 text-sm font-medium animate-pulse">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Downloading images from Copart…
        </div>
      )}

      {/* ADD VEHICLE MODAL */}
      {showAddModal && (
        <ManualVehicleModal
          API={API}
          close={() => setShowAddModal(false)}
          reload={() => window.location.reload()}
        />
      )}

      {/* CSV MODAL */}
      <CSVUploadModal
        showCSVModal={showCSVModal}
        setShowCSVModal={setShowCSVModal}
        uploadFile={uploadFile}
        setUploadFile={setUploadFile}
        uploadUserFile={uploadUserFile}
      />

      {/* GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cars.map((car) => (
          <div
            key={car.id}
            className="bg-white border rounded-xl shadow hover:shadow-lg transition"
          >
            <div className="relative">
              <img
                src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
                className="w-full h-56 object-cover"
                alt=""
              />
              <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
                {car.damage_description || "Unknown Damage"}
              </div>
            </div>

            <div className="p-4 space-y-2">
              <h2 className="text-lg font-semibold">
                {car.year} {car.make} {car.model}
              </h2>

              <p className="text-sm text-gray-500">Lot #: {car.lot_number || "Manual"}</p>
              <p className="text-sm text-gray-500">
                Location: {car.sale_name || car.location || "N/A"}
              </p>
              <p className="text-sm text-gray-500">
                Sale Date:{" "}
                {car.sale_date
                  ? new Date(car.sale_date).toLocaleDateString()
                  : "N/A"}
              </p>

              {/* Repairs / Resale */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center space-x-1">
                  <Wrench size={16} />
                  <span>Repair:</span>
                  <input
                    type="number"
                    value={car.repair_estimate || car.ai_repair_estimate || 0}
                    onChange={(e) =>
                      updateCarValue(car.id, "repair_estimate", Number(e.target.value))
                    }
                    className="w-20 border rounded px-2 py-1"
                  />
                </div>

                <div className="flex items-center space-x-1">
                  <DollarSign size={16} />
                  <span>Resale:</span>
                  <input
                    type="number"
                    value={car.resale_estimate || car.ai_resale_estimate || 0}
                    onChange={(e) =>
                      updateCarValue(car.id, "resale_estimate", Number(e.target.value))
                    }
                    className="w-20 border rounded px-2 py-1"
                  />
                </div>
              </div>

              {/* Max Bid */}
              <div className="mt-2">
                <span className="font-medium">Max Bid:</span>{" "}
                ${car.max_bid?.toLocaleString()}
              </div>

              <button
                className="mt-4 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                onClick={() => setSelectedCar(car)}
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

{/* DETAILS MODAL */}
{selectedCar && (() => {
  const activeCar =
    cars.find((c) => c.id === selectedCar.id) || selectedCar;

  const live = calculateCarWithMargin(activeCar, tempMargin);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl relative text-black overflow-y-auto max-h-[90vh]">
        <button
          onClick={() => setSelectedCar(null)}
          className="absolute top-3 right-3 text-2xl text-gray-600 hover:text-black"
        >
          ✕
        </button>

        <h2 className="text-xl font-semibold mb-2">
          {activeCar.year} {activeCar.make} {activeCar.model}
        </h2>

        <p className="text-gray-700 mb-1">
          <strong>Lot:</strong> {activeCar.lot_number || "Manual"}
        </p>

        <p className="text-gray-700 mb-1">
          <strong>Location:</strong>{" "}
          {activeCar.sale_name || activeCar.location || "N/A"}
        </p>

        <hr className="my-3" />

        {/* REPAIR & RESALE */}
        <div className="flex justify-between mb-3">
          <div className="flex items-center space-x-1">
            <Wrench size={16} />
            <span>Repair:</span>
            <input
              type="number"
              value={
                activeCar.repair_estimate ||
                activeCar.ai_repair_estimate ||
                0
              }
              onChange={(e) =>
                updateCarValue(
                  activeCar.id,
                  "repair_estimate",
                  Number(e.target.value)
                )
              }
              className="w-24 border rounded px-2 py-1"
            />
          </div>

          <div className="flex items-center space-x-1">
            <DollarSign size={16} />
            <span>Resale:</span>
            <input
              type="number"
              value={
                activeCar.resale_estimate ||
                activeCar.ai_resale_estimate ||
                0
              }
              onChange={(e) =>
                updateCarValue(
                  activeCar.id,
                  "resale_estimate",
                  Number(e.target.value)
                )
              }
              className="w-24 border rounded px-2 py-1"
            />
          </div>
        </div>

        {/* MARGIN */}
        <div className="flex items-center space-x-2 mb-3">
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
            className="w-20 border rounded px-2 py-1"
          />
          <span>%</span>
        </div>

        {/* CALCULATED VALUES */}
        <div className="text-lg font-bold mb-2">
          Max Bid: ${live.max_bid.toLocaleString()}
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <p>Buyer Fee (7.5%): ${live.buyer_fee.toLocaleString()}</p>
          <p>
            Tax ({activeCar.avg_tax_rate}%): $
            {live.tax_amount_calc.toLocaleString()}
          </p>
          <p>Title Fee: ${Number(activeCar.title_fee).toLocaleString()}</p>
          <p>
            Repairs: $
            {Number(activeCar.repair_estimate || 0).toLocaleString()}
          </p>
        </div>

        <hr className="my-3" />

        <p>
          <strong>Total Cost:</strong> ${live.total_cost.toLocaleString()}
        </p>
        <p>
          <strong>Profit:</strong> ${live.profit.toLocaleString()}
        </p>
        <p>
          <strong>Margin:</strong> {live.margin_actual}%
        </p>

        <hr className="my-3" />

        {/* FIXED DESCRIPTION SECTION */}
        <div>
          <p className="font-semibold mb-1">Repair Details:</p>
          <p className="text-sm text-gray-700 whitespace-pre-line mb-3">
            {activeCar.repair_details || "No repair details available."}
          </p>

          <p className="font-semibold mb-1">Resale Details:</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">
            {activeCar.resale_details || "No resale details available."}
          </p>
        </div>

        {activeCar.listing_url && (
          <a
            href={activeCar.listing_url}
            className="text-blue-600 underline mt-4 inline-block"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Listing →
          </a>
        )}
      </div>
    </div>
  );
})()}


    </main>
  );
}
