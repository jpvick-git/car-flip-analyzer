import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Wrench,
  DollarSign,
  X,
  MapPin,
  Calendar,
  Hash,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Car,
} from "lucide-react";

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

  const fieldClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50 disabled:text-slate-400";
  const summaryClass =
    "cursor-pointer select-none pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <h2 className="mb-5 text-xl font-bold tracking-tight text-slate-900">Add Vehicle</h2>

        {/* SECTIONS */}
        <details className="mb-4 border-b border-slate-100 pb-4" open>
          <summary className={summaryClass}>Vehicle Info</summary>

          <select
            name="year"
            value={form.year}
            onChange={update}
            className={`mb-3 ${fieldClass}`}
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
            className={`mb-3 ${fieldClass}`}
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
            className={`mb-3 ${fieldClass}`}
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
            className={fieldClass}
          >
            <option value="">Select Trim</option>
            {trims.map((t, i) => (
              <option key={i} value={t}>
                {t}
              </option>
            ))}
          </select>
        </details>

        <details className="mb-4 border-b border-slate-100 pb-4" open>
          <summary className={summaryClass}>Vehicle Details</summary>

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
              className={`mb-3 ${fieldClass}`}
              placeholder={label}
            />
          ))}
        </details>

        <details className="mb-5" open>
          <summary className={summaryClass}>Photos</summary>
          {[
            ["front_image", "Front"],
            ["driver_image", "Driver Side"],
            ["passenger_image", "Passenger Side"],
            ["rear_image", "Rear"],
            ["interior_image", "Interior"],
            ["dash_image", "Dash"],
          ].map(([key, label]) => (
            <div key={key} className="mb-3">
              <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setImages({ ...images, [key]: e.target.files[0] })
                }
                className="w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
              />
            </div>
          ))}
        </details>

        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <h2 className="mb-1 text-xl font-bold tracking-tight text-slate-900">Upload CSV</h2>
        <p className="mb-5 text-sm text-slate-500">Import a batch of vehicles from a Copart export.</p>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => setUploadFile(e.target.files[0])}
          className="mb-5 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
        />

        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => setShowCSVModal(false)}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
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
  const navigate = useNavigate();
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
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading vehicles…</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-slate-100 px-6 text-center">
        <p className="text-lg font-semibold text-slate-700">Something went wrong</p>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );

  const visibleCars = downloading ? cars.filter((car) => car.image_url) : cars;

  return (
    <main className="min-h-screen bg-slate-100">

      {downloading && (
        <div className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Downloading images… ({cars.filter((c) => c.image_url).length} of {cars.length} ready)
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

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">

        {/* PAGE HEADER */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vehicle Inventory</h1>
            <p className="mt-1 text-sm text-slate-500">
              {cars.length} {cars.length === 1 ? "vehicle" : "vehicles"} in your pipeline
            </p>
          </div>
        </div>

        {/* GRID */}
        {visibleCars.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Car size={22} />
            </div>
            <p className="text-base font-semibold text-slate-700">No vehicles yet</p>
            <p className="mt-1 text-sm text-slate-500">Add a vehicle or upload a CSV to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleCars.map((car) => (
              <div
                key={car.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative">
                  <img
                    src={car.image_url || "https://placehold.co/400x250?text=No+Image"}
                    className="h-52 w-full object-cover"
                    alt=""
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    {car.damage_description || "Unknown Damage"}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">
                    {car.year} {car.make} {car.model}
                  </h2>

                  <div className="mt-2 space-y-1.5 text-sm text-slate-500">
                    <p className="flex items-center gap-2">
                      <Hash size={13} className="shrink-0 text-slate-400" />
                      Lot {car.lot_number || "Manual"}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin size={13} className="shrink-0 text-slate-400" />
                      {car.sale_name || car.location || "N/A"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Calendar size={13} className="shrink-0 text-slate-400" />
                      {car.sale_date
                        ? new Date(car.sale_date).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>

                  {/* Repairs / Resale */}
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-amber-600">
                        <Wrench size={13} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Repair</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="text-sm font-bold text-amber-700">$</span>
                        <input
                          type="number"
                          value={car.repair_estimate || car.ai_repair_estimate || 0}
                          onChange={(e) =>
                            updateCarValue(car.id, "repair_estimate", Number(e.target.value))
                          }
                          className="w-full min-w-0 bg-transparent text-base font-bold tabular-nums text-amber-700 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-emerald-600">
                        <DollarSign size={13} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Resale</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="text-sm font-bold text-emerald-700">$</span>
                        <input
                          type="number"
                          value={car.resale_estimate || car.ai_resale_estimate || 0}
                          onChange={(e) =>
                            updateCarValue(car.id, "resale_estimate", Number(e.target.value))
                          }
                          className="w-full min-w-0 bg-transparent text-base font-bold tabular-nums text-emerald-700 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Max Bid */}
                  <div className="mt-3 flex items-baseline justify-between rounded-xl bg-blue-50 px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Max Bid</span>
                    <span className="text-2xl font-extrabold tabular-nums text-blue-700">
                      ${car.max_bid?.toLocaleString()}
                    </span>
                  </div>

                  <button
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99]"
                    onClick={() => navigate(`/vehicle/${car.id}`)}
                  >
                    View Details
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

{/* DETAILS MODAL */}
{selectedCar && (() => {
  const activeCar =
    cars.find((c) => c.id === selectedCar.id) || selectedCar;

  const live = calculateCarWithMargin(activeCar, tempMargin);
  const profitPositive = live.profit >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <button
          onClick={() => setSelectedCar(null)}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={20} />
        </button>

        <h2 className="pr-8 text-xl font-bold tracking-tight text-slate-900">
          {activeCar.year} {activeCar.make} {activeCar.model}
        </h2>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Hash size={13} className="text-slate-400" />
            Lot {activeCar.lot_number || "Manual"}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="text-slate-400" />
            {activeCar.sale_name || activeCar.location || "N/A"}
          </span>
        </div>

        {/* REPAIR & RESALE */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-amber-600">
              <Wrench size={13} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Repair</span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-sm font-bold text-amber-700">$</span>
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
                className="w-full min-w-0 bg-transparent text-base font-bold tabular-nums text-amber-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-emerald-600">
              <DollarSign size={13} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Resale</span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-sm font-bold text-emerald-700">$</span>
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
                className="w-full min-w-0 bg-transparent text-base font-bold tabular-nums text-emerald-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* MARGIN */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Desired Margin:</span>
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
            className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <span className="text-sm text-slate-500">%</span>
        </div>

        {/* CALCULATED VALUES */}
        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Max Bid</span>
            <span className="text-3xl font-extrabold tabular-nums text-slate-900">
              ${live.max_bid.toLocaleString()}
            </span>
          </div>

          <div className="space-y-1.5 border-t border-slate-200 pt-3 text-sm text-slate-500">
            <div className="flex justify-between">
              <span>Buyer Fee (7.5%)</span>
              <span className="tabular-nums text-slate-700">${live.buyer_fee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax ({activeCar.avg_tax_rate}%)</span>
              <span className="tabular-nums text-slate-700">${live.tax_amount_calc.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Title Fee</span>
              <span className="tabular-nums text-slate-700">${Number(activeCar.title_fee).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Repairs</span>
              <span className="tabular-nums text-slate-700">${Number(activeCar.repair_estimate || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>Total Cost</span>
              <span className="tabular-nums">${live.total_cost.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* PROFIT / MARGIN */}
        <div
          className={`mt-3 flex items-center justify-between rounded-xl border px-4 py-3 ${
            profitPositive ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"
          }`}
        >
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${profitPositive ? "text-emerald-700" : "text-red-700"}`}>
            {profitPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            Profit
          </span>
          <span className={`text-lg font-bold tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-700"}`}>
            ${live.profit.toLocaleString()}
            <span className="ml-2 text-xs font-medium text-slate-400">({live.margin_actual}%)</span>
          </span>
        </div>

        {/* DESCRIPTIONS */}
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Wrench size={13} className="text-amber-500" /> Repair Details
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {activeCar.repair_details || "No repair details available."}
            </p>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <DollarSign size={13} className="text-emerald-500" /> Resale Details
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {activeCar.resale_details || "No resale details available."}
            </p>
          </div>
        </div>

        {activeCar.listing_url && (
          <a
            href={activeCar.listing_url}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Listing
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
})()}


    </main>
  );
}