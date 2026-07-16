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
  MoreVertical,
  Trash2,
  LayoutGrid,
  List,
} from "lucide-react";
import RepairBreakdown from "../components/RepairBreakdown";
import VehicleListRow from "../components/VehicleListRow";
import CarCard from "../components/CarCard";
import CurrencyInput from "../components/CurrencyInput";
import OutcomeLogModal from "../components/OutcomeLogModal";
import { formatCurrency, parseCurrencyInput } from "../utils/formatCurrency";
import { formatVehicleTitle } from "../utils/vehicleName";
import { calculateFlipMetrics } from "../utils/flipCalculator";
import { getTransportCostForFlip } from "../utils/userSettings";
import { useUserSettings } from "../context/UserSettingsContext";
import {
  clearTransportEstimateCache,
  prefetchTransportEstimates,
} from "../utils/transportEstimate";
import { useFlipMetrics } from "../utils/useFlipMetrics";
import {
  buyerFeeRate,
  sourceLabel,
  costLabel,
  maxOfferLabel,
  askingPrice,
  formatSaleDate,
} from "../utils/vehicleSource";
import {
  DEAL_STATUS,
  dealStatus,
  isActiveDeal,
  isSold,
  daysSincePurchaseUnsold,
  formatSignedCurrency,
} from "../utils/dealLifecycle";
import { Trophy, Target, Clock } from "lucide-react";

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
    extra_image_1: null,
    extra_image_2: null,
    extra_image_3: null,
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
          `${API}/api/specs/models/${form.year}/${encodeURIComponent(form.make)}`
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
          `${API}/api/specs/trims/${form.year}/${encodeURIComponent(form.make)}/${encodeURIComponent(form.model)}`
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
      const msg = err.response?.data?.detail || "Failed to add vehicle.";
      alert(msg);
    }
  };

  const fieldClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50 disabled:text-slate-400";
  const summaryClass =
    "cursor-pointer select-none pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <h2 className="mb-5 text-xl font-bold tracking-tight text-slate-900">Add Private Listing</h2>

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
            ["title_status", "Title Status"],
            ["asking_price", "Asking Price"],
            ["location", "Location"],
            ["listing_url", "Listing URL (Facebook, Craigslist, etc.)"],
            ["description", "Seller Description"],
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
            ["extra_image_1", "Additional Photo 1 (optional)"],
            ["extra_image_2", "Additional Photo 2 (optional)"],
            ["extra_image_3", "Additional Photo 3 (optional)"],
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
//  VEHICLE DETAIL MODAL
///////////////////////////////////////////////////////////////////////////////////////////

function VehicleDetailModal({
  car,
  tempMargin,
  setTempMargin,
  onClose,
  onUpdateCarValue,
  apiBase,
  isDemo,
}) {
  const { settings } = useUserSettings();
  const repair = Number(car.repair_estimate || car.ai_repair_estimate || 0);
  const metrics = useFlipMetrics({
    carId: car.id,
    resale: car.resale_estimate || car.ai_resale_estimate || 0,
    repair,
    marginPercent: tempMargin,
    taxRate: car.avg_tax_rate || 0,
    titleFee: car.title_fee || 0,
    buyerFeeRate: buyerFeeRate(car),
    transportCost: getTransportCostForFlip(car, settings),
  });
  const profitPositive = metrics.profit >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={20} />
        </button>

        <h2 className="pr-8 text-xl font-bold tracking-tight text-slate-900">
          {formatVehicleTitle(car)}
        </h2>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Hash size={13} className="text-slate-400" />
            Lot {car.lot_number || "Manual"}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="text-slate-400" />
            {car.sale_name || car.location || "N/A"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-amber-600">
              <Wrench size={13} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Repair</span>
            </div>
            <CurrencyInput
              value={repair}
              onChange={(value) => onUpdateCarValue(car.id, "repair_estimate", value)}
              inputClassName="w-full min-w-0 bg-transparent text-base font-bold tabular-nums text-amber-700 focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-emerald-600">
              <DollarSign size={13} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Resale</span>
            </div>
            <CurrencyInput
              value={car.resale_estimate || car.ai_resale_estimate || 0}
              onChange={(value) => onUpdateCarValue(car.id, "resale_estimate", value)}
              inputClassName="w-full min-w-0 bg-transparent text-base font-bold tabular-nums text-emerald-700 focus:outline-none"
            />
          </div>
        </div>

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

        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              {maxOfferLabel(car)}
            </span>
            <span className="text-3xl font-extrabold tabular-nums text-slate-900">
              {formatCurrency(metrics.bid)}
            </span>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            set at {tempMargin}% margin · profit updates when repair costs change
          </p>

          <div className="space-y-1.5 border-t border-slate-200 pt-3 text-sm text-slate-500">
            <div className="flex justify-between">
              <span>Buyer Fee (7.5%)</span>
              <span className="tabular-nums text-slate-700">{formatCurrency(metrics.buyerFee)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax ({car.avg_tax_rate || 0}%)</span>
              <span className="tabular-nums text-slate-700">{formatCurrency(metrics.taxAmt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Title Fee</span>
              <span className="tabular-nums text-slate-700">{formatCurrency(car.title_fee)}</span>
            </div>
            <div className="flex justify-between">
              <span>Repairs</span>
              <span className="tabular-nums text-slate-700">{formatCurrency(metrics.repair)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>Total Cost</span>
              <span className="tabular-nums">{formatCurrency(metrics.totalCost)}</span>
            </div>
          </div>
        </div>

        <div
          className={`mt-3 flex items-center justify-between rounded-xl border px-4 py-3 ${
            profitPositive ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"
          }`}
        >
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${profitPositive ? "text-emerald-700" : "text-red-700"}`}>
            {profitPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            Estimated Profit
          </span>
          <span className={`text-lg font-bold tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-700"}`}>
            {formatCurrency(metrics.profit)}
            <span className="ml-2 text-xs font-medium text-slate-400">({metrics.marginActual}%)</span>
          </span>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Wrench size={13} className="text-amber-500" /> Repair Details
            </p>
            <RepairBreakdown
              car={car}
              apiBase={apiBase}
              readOnly={isDemo}
              onTotalChange={(total) => onUpdateCarValue(car.id, "repair_estimate", total)}
            />
          </div>

          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <DollarSign size={13} className="text-emerald-500" /> Resale Details
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {car.resale_details || "No resale details available."}
            </p>
          </div>
        </div>

        {car.listing_url && (
          <a
            href={car.listing_url}
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
}

///////////////////////////////////////////////////////////////////////////////////////////
//  HELPERS
///////////////////////////////////////////////////////////////////////////////////////////

const PROCESSING_WINDOW_MS = 60 * 60 * 1000;

function vehicleTimestamp(car) {
  const raw = car.updated_at || car.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function isCarReady(car) {
  if (!car.image_url) return false;
  const repairSet =
    car.repair_estimate != null && String(car.repair_estimate).trim() !== "";
  const resale = parseCurrencyInput(
    car.resale_estimate ?? car.ai_resale_estimate ?? 0
  );
  return repairSet && resale > 0;
}

function isCarProcessing(car) {
  if (isCarReady(car)) return false;
  const ts = vehicleTimestamp(car);
  return ts != null && Date.now() - ts < PROCESSING_WINDOW_MS;
}

///////////////////////////////////////////////////////////////////////////////////////////
//  SCOREBOARD STRIP
///////////////////////////////////////////////////////////////////////////////////////////

function ScoreboardStrip({ summary, onOpen }) {
  const profit = summary.realized_profit_total || 0;
  const stats = [
    {
      icon: Trophy,
      label: "Realized profit",
      value: formatSignedCurrency(profit),
      tone: profit >= 0 ? "text-emerald-600" : "text-red-600",
    },
    {
      icon: TrendingUp,
      label: "Active deals",
      value: String(summary.active_count ?? 0),
      tone: "text-slate-800",
    },
    {
      icon: Target,
      label: "Win rate",
      value: summary.win_rate != null ? `${summary.win_rate}%` : "—",
      tone: "text-slate-800",
    },
    {
      icon: Clock,
      label: "Avg days to sell",
      value: summary.avg_days_to_sell != null ? `${summary.avg_days_to_sell}d` : "—",
      tone: "text-slate-800",
    },
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-5 grid w-full grid-cols-2 gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-lg shadow-slate-200/60 transition hover:border-blue-200 hover:shadow-xl sm:grid-cols-4 sm:gap-4"
    >
      {stats.map(({ icon: Icon, label, value, tone }) => (
        <div key={label} className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-bg text-slate-400">
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className={`truncate text-lg font-bold tabular-nums ${tone}`}>{value}</p>
          </div>
        </div>
      ))}
    </button>
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
  isDemo = false,
}) {
  const navigate = useNavigate();
  const { settings } = useUserSettings();
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [tempMargin, setTempMargin] = useState(settings.default_margin_percent);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [carToDelete, setCarToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [outcomeTarget, setOutcomeTarget] = useState(null);
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem("dashboard-view-mode") === "list" ? "list" : "grid"
  );

  const setInventoryViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("dashboard-view-mode", mode);
  };

  const API =
    process.env.REACT_APP_API_BASE_URL ?? "";

  useEffect(() => {
    setTempMargin(settings.default_margin_percent);
  }, [settings.default_margin_percent]);

  useEffect(() => {
    clearTransportEstimateCache();
  }, [settings.shop_location, settings.default_transport_type]);

  // MAX BID CALC
  const calculateCarWithMargin = (car, marginInput) => {
    const transportCost = getTransportCostForFlip(car, settings);
    const metrics = calculateFlipMetrics({
      resale: car.resale_estimate || car.ai_resale_estimate || 0,
      repair: car.repair_estimate || car.ai_repair_estimate || 0,
      marginPercent: marginInput,
      taxRate: car.avg_tax_rate || 0,
      titleFee: car.title_fee || 0,
      buyerFeeRate: buyerFeeRate(car),
      transportCost,
    });

    return {
      ...car,
      max_bid: metrics.bid,
      buyer_fee: metrics.buyerFee,
      tax_amount_calc: metrics.taxAmt,
      total_cost: metrics.totalCost,
      profit: metrics.profit,
      margin_actual: metrics.marginActual,
      transport_cost: transportCost,
    };
  };

  useEffect(() => {
    if (loading || cars.length === 0 || !settings.shop_location?.trim()) return;

    let alive = true;

    (async () => {
      await prefetchTransportEstimates(cars, settings);
      if (!alive) return;

      setCars((prev) => {
        const next = prev.map((car) =>
          calculateCarWithMargin(car, settings.default_margin_percent)
        );
        const changed = next.some(
          (car, i) =>
            car.transport_cost !== prev[i].transport_cost ||
            car.profit !== prev[i].profit ||
            car.max_bid !== prev[i].max_bid
        );
        return changed ? next : prev;
      });
    })();

    return () => {
      alive = false;
    };
  }, [
    loading,
    cars.length,
    settings.shop_location,
    settings.default_transport_type,
    settings.default_margin_percent,
  ]);

  // LOAD VEHICLES
  const fetchVehicles = async () => {
    const res = await axios.get(`${API}/api/get_vehicles`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    let list = Array.isArray(res.data) ? res.data : res.data.vehicles || [];
    list = list.map((car) => {
      if (car.image_urls?.length > 0) car.image_url = car.image_urls[0];
      return calculateCarWithMargin(car, settings.default_margin_percent);
    });
    setCars(list);
    return list;
  };

  const fetchSummary = async () => {
    try {
      const res = await axios.get(`${API}/api/portfolio/summary`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setSummary(res.data);
    } catch (err) {
      console.error("Portfolio summary load failed:", err);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchVehicles();
        if (list.some(isCarProcessing)) setDownloading(true);
      } catch (err) {
        console.error(err);
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    load();
    fetchSummary();
  }, []);

  // Poll while any vehicle is still processing (images + AI)
  useEffect(() => {
    if (!downloading) return;

    const interval = setInterval(async () => {
      try {
        const list = await fetchVehicles();
        if (!list.some(isCarProcessing)) setDownloading(false);
      } catch (err) {
        console.error(err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [downloading]);

  // Start polling after CSV upload
  useEffect(() => {
    if (!uploadComplete) return;
    setDownloading(true);
    fetchVehicles().catch(console.error);
  }, [uploadComplete]);

  useEffect(() => {
    if (menuOpenId === null) return;
    const close = () => setMenuOpenId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpenId]);

  const deleteVehicle = async (car) => {
    setDeleting(true);
    try {
      await axios.delete(`${API}/api/delete_vehicle/${car.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setCars((prev) => prev.filter((c) => c.id !== car.id));
      if (selectedCar?.id === car.id) setSelectedCar(null);
      setCarToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete vehicle. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const updateCarValue = (id, field, value) => {
    setCars((prev) =>
      prev.map((car) =>
        car.id === id
          ? calculateCarWithMargin({ ...car, [field]: value }, tempMargin)
          : car
      )
    );
  };

  const mergeCar = (updated) => {
    if (!updated?.id) return;
    setCars((prev) =>
      prev.map((car) =>
        car.id === updated.id
          ? calculateCarWithMargin({ ...car, ...updated }, tempMargin)
          : car
      )
    );
    fetchSummary();
  };

  const handleQuickStatus = async (car, status, predictions) => {
    if (isDemo) return;
    try {
      const body = { deal_status: status };
      if (
        ["bought", "in_repair", "listed", "sold"].includes(status) &&
        car?.predicted_max_bid == null &&
        predictions
      ) {
        body.snapshot = {
          predicted_max_bid: Math.round(Number(predictions.maxBid) || 0),
          predicted_repair: Math.round(Number(predictions.repair) || 0),
          predicted_resale: Math.round(Number(predictions.resale) || 0),
          predicted_profit: Math.round(Number(predictions.profit) || 0),
        };
      }
      const res = await axios.patch(`${API}/api/vehicle/${car.id}/status`, body, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      mergeCar(res.data);
    } catch (err) {
      console.error("Quick status update failed:", err);
      alert(err.response?.data?.detail || "Could not update deal status.");
    }
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-brand-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading vehicles…</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-brand-bg px-6 text-center">
        <p className="text-lg font-semibold text-brand-navy">Something went wrong</p>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );

  const readyCars = cars.filter(isCarReady);
  const processingCars = cars.filter(isCarProcessing);
  const readyCount = readyCars.length;
  const processingCount = processingCars.length;

  const STATUS_TABS = [
    { key: "all", label: "All" },
    { key: DEAL_STATUS.WATCHING, label: "Watching" },
    { key: DEAL_STATUS.BOUGHT, label: "Bought" },
    { key: DEAL_STATUS.IN_REPAIR, label: "In Repair" },
    { key: DEAL_STATUS.LISTED, label: "Listed" },
    { key: DEAL_STATUS.SOLD, label: "Sold" },
  ];
  const statusCountFor = (key) =>
    key === "all" ? readyCars.length : readyCars.filter((c) => dealStatus(c) === key).length;

  const visibleCars =
    statusFilter === "all"
      ? readyCars
      : readyCars.filter((c) => dealStatus(c) === statusFilter);

  const nudgeCars = readyCars.filter((c) => (daysSincePurchaseUnsold(c) ?? -1) > 30);

  return (
    <main className="relative min-h-screen bg-brand-bg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-white via-brand-bg/80 to-transparent" />

      {downloading && processingCount > 0 && (
        <div className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-xl shadow-blue-600/25">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Processing vehicles… ({readyCount} of {readyCount + processingCount} ready)
        </div>
      )}

      {showAddModal && (
        <ManualVehicleModal
          API={API}
          close={() => setShowAddModal(false)}
          reload={() => window.location.reload()}
        />
      )}

      <CSVUploadModal
        showCSVModal={showCSVModal}
        setShowCSVModal={setShowCSVModal}
        uploadFile={uploadFile}
        setUploadFile={setUploadFile}
        uploadUserFile={uploadUserFile}
      />

      <div className="relative w-full px-3 py-5 sm:px-4 sm:py-6 lg:px-5">
        {summary && (summary.sold_count > 0 || summary.active_count > 0) && (
          <ScoreboardStrip summary={summary} onOpen={() => navigate("/portfolio")} />
        )}

        <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Your pipeline</p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
              Vehicle Inventory
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">
              {readyCount} {readyCount === 1 ? "vehicle" : "vehicles"}
              {isDemo ? " in demo preview" : " ready for flip decisions"}
              {processingCount > 0 ? ` · ${processingCount} processing` : ""}
            </p>
          </div>

          {visibleCars.length > 0 && (
            <div
              className="flex shrink-0 items-center self-start rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-200/60 sm:self-auto"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                aria-pressed={viewMode === "grid"}
                onClick={() => setInventoryViewMode("grid")}
                className={`rounded-xl p-2.5 transition ${
                  viewMode === "grid"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                    : "text-slate-500 hover:bg-brand-bg hover:text-slate-700"
                }`}
                title="Tile view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "list"}
                onClick={() => setInventoryViewMode("list")}
                className={`rounded-xl p-2.5 transition ${
                  viewMode === "list"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                    : "text-slate-500 hover:bg-brand-bg hover:text-slate-700"
                }`}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
          )}
        </div>

        {isDemo && (
          <div className="mb-5 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3.5 text-sm text-amber-800 shadow-sm shadow-amber-100/50">
            Demo mode — browse only. Upload, add, and delete are disabled.
          </div>
        )}

        {!isDemo && nudgeCars.length > 0 && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-200/80 bg-blue-50 px-4 py-3.5 text-sm text-blue-900 shadow-sm shadow-blue-100/50">
            <Clock size={18} className="shrink-0 text-blue-600" />
            <span>
              {nudgeCars.length === 1
                ? "1 bought deal hasn't been closed out yet."
                : `${nudgeCars.length} bought deals haven't been closed out yet.`}{" "}
              Did they sell? Log the outcome to score the flip.
            </span>
          </div>
        )}

        {readyCount > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => {
              const count = statusCountFor(tab.key);
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {visibleCars.length === 0 ? (
          <div className="flex min-h-[calc(100vh-11rem)] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-xl shadow-slate-200/70">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-bg text-slate-400">
              <Car size={26} />
            </div>
            {readyCount > 0 && statusFilter !== "all" ? (
              <>
                <p className="text-xl font-bold tracking-tight text-brand-navy">
                  No deals in this stage
                </p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                  Nothing is marked “{STATUS_TABS.find((t) => t.key === statusFilter)?.label}” yet.
                </p>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Show all vehicles
                </button>
              </>
            ) : processingCount > 0 && downloading ? (
              <>
                <p className="text-xl font-bold tracking-tight text-brand-navy">
                  Processing vehicles…
                </p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                  Cards will appear one at a time as images and AI estimates finish.
                </p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold tracking-tight text-brand-navy">
                  No vehicles yet
                </p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                  Add a vehicle from the menu to start analyzing your next flip.
                </p>
              </>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="min-h-[calc(100vh-11rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            <div className="hidden border-b border-slate-200 bg-brand-navy px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-white/90 lg:grid lg:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-5">
              <span>Image</span>
              <span>Lot info</span>
              <span>Vehicle info</span>
              <span>Condition</span>
              <span>Flip decision</span>
              <span>Action</span>
            </div>
            {visibleCars.map((car) => (
              <VehicleListRow
                key={car.id}
                car={car}
                isDemo={isDemo}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                setCarToDelete={setCarToDelete}
                marginPercent={tempMargin}
                updateCarValue={updateCarValue}
                onViewDetails={() => navigate(`/vehicle/${car.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6">
            {visibleCars.map((car) => (
              <CarCard
                key={car.id}
                car={car}
                isDemo={isDemo}
                marginPercent={tempMargin}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                setCarToDelete={setCarToDelete}
                onViewDetails={() => navigate(`/vehicle/${car.id}`)}
                onQuickStatus={handleQuickStatus}
                onLogOutcome={(target, predictions) =>
                  setOutcomeTarget({ car: target, predictions })
                }
                onUpdateValues={(carId, updates) => {
                  Object.entries(updates).forEach(([field, value]) => {
                    updateCarValue(carId, field, value);
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {carToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl shadow-slate-900/20">
            <h2 className="text-xl font-bold tracking-tight text-brand-navy">
              Delete vehicle?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Are you sure you want to delete the{" "}
              <span className="font-semibold text-slate-800">
                {formatVehicleTitle(carToDelete)}
              </span>
              ? This action is permanent and cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setCarToDelete(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-brand-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => deleteVehicle(carToDelete)}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCar && (
        <VehicleDetailModal
          car={cars.find((c) => c.id === selectedCar.id) || selectedCar}
          tempMargin={tempMargin}
          setTempMargin={setTempMargin}
          onClose={() => setSelectedCar(null)}
          onUpdateCarValue={updateCarValue}
          apiBase={API}
          isDemo={isDemo}
        />
      )}

      {outcomeTarget && (
        <OutcomeLogModal
          car={outcomeTarget.car}
          apiBase={API}
          predictions={outcomeTarget.predictions}
          onClose={() => setOutcomeTarget(null)}
          onSaved={mergeCar}
        />
      )}
    </main>
  );
}