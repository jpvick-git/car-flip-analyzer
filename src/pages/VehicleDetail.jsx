import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MapPin,
  Calendar,
  Maximize2,
  ExternalLink,
  Images,
} from "lucide-react";
import RepairPlanCard from "../components/RepairPlanCard";
import FlipDecisionCard from "../components/FlipDecisionCard";
import DealSummaryCard from "../components/DealSummaryCard";
import DealRisksCard from "../components/DealRisksCard";
import RawAIDetailsCard from "../components/RawAIDetailsCard";
import KnownIssuesCard from "../components/KnownIssuesCard";
import NegotiationCard from "../components/NegotiationCard";
import { parseRepairItems } from "../utils/repairBreakdown";
import { formatCurrency } from "../utils/formatCurrency";
import { formatVehicleTitle } from "../utils/vehicleName";
import { useFlipMetrics } from "../utils/useFlipMetrics";
import TransportCostCard from "../components/TransportCostCard";
import { useUserSettings } from "../context/UserSettingsContext";
import { getTransportCostForFlip } from "../utils/userSettings";
import { calculateFlipDecision } from "../utils/flipDecision";
import {
  isPrivateParty,
  buyerFeeRate,
  sourceLabel,
  costLabel,
  askingPrice,
} from "../utils/vehicleSource";

const API = process.env.REACT_APP_API_BASE_URL ?? "";

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [car, setCar] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [margin, setMargin] = useState(15);
  const { settings } = useUserSettings();
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [repairTotal, setRepairTotal] = useState(0);
  const [previewTransportCost, setPreviewTransportCost] = useState(null);

  const isDemo = localStorage.getItem("is_demo") === "1";
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [carRes, imagesRes] = await Promise.all([
          axios.get(`${API}/api/vehicle/${id}`, { headers }),
          axios.get(`${API}/api/vehicle/${id}/images`, { headers }),
        ]);
        setCar(carRes.data);
        setImages(imagesRes.data.images || []);
        setRepairTotal(
          parseRepairItems(carRes.data).reduce((sum, item) => sum + (Number(item.cost) || 0), 0) ||
            Number(carRes.data.repair_estimate || 0)
        );
      } catch (err) {
        console.error(err);
        setCar(null);
      } finally {
        setLoading(false);
      }
    };
    // Fetch states separately so a failure doesn't break the page
    const fetchStates = async () => {
      try {
        const res = await axios.get(`${API}/api/states`, { headers });
        setStates(res.data || []);
      } catch (err) {
        console.error("States load failed:", err);
      }
    };
    fetchData();
    fetchStates();
  }, [id]);

  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e) => {
      if (e.key === "ArrowRight") setLightbox((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft") setLightbox((i) => (i - 1 + images.length) % images.length);
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox, images.length]);

  useEffect(() => {
    setPreviewTransportCost(null);
  }, [car?.id]);

  useEffect(() => {
    setMargin(settings.default_margin_percent);
  }, [settings.default_margin_percent]);

  const stateData = states.find((s) => s.state_code === selectedState) || null;
  const overrideTax = stateData ? Number(stateData.avg_tax_rate) : null;
  const overrideTitle = stateData ? Number(stateData.title_fee) : null;

  const isPrivate = isPrivateParty(car);
  const asking = askingPrice(car);
  const transportCost =
    previewTransportCost !== null
      ? previewTransportCost
      : car
        ? getTransportCostForFlip(car, settings)
        : 0;

  const {
    bid,
    buyerFee,
    taxAmt,
    titleFee,
    repair,
    totalCost,
    profit,
    resale,
    taxRate,
    marginActual,
  } = useFlipMetrics({
    carId: car?.id ?? id,
    resale: car?.resale_estimate || car?.ai_resale_estimate || 0,
    repair: repairTotal,
    marginPercent: margin,
    taxRate: overrideTax !== null ? overrideTax : Number(car?.avg_tax_rate || 0),
    titleFee: overrideTitle !== null ? overrideTitle : Number(car?.title_fee || 0),
    buyerFeeRate: buyerFeeRate(car),
    transportCost,
  });

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading vehicle…</p>
        </div>
      </div>
    );

  if (!car)
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-slate-100 px-6 text-center">
        <p className="text-lg font-semibold text-slate-700">Vehicle not found</p>
        <p className="text-sm text-slate-500">This lot may have been removed or is no longer available.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );

  const odometer = Number(car.odometer);

  const details = [
    car.vin          && ["VIN",         car.vin],
    isPrivate && asking && ["Asking Price", formatCurrency(asking)],
    !isPrivate && car.lot_number && ["Lot #", car.lot_number],
    car.title_code   && ["Title",        car.title_code],
    !isNaN(odometer) && odometer > 0 && ["Odometer", `${odometer.toLocaleString()} mi`],
    car.engine_type  && ["Engine",       car.engine_type],
    car.transmission && ["Transmission", car.transmission],
    car.fuel_type    && ["Fuel",         car.fuel_type],
    car.drive_train  && ["Drivetrain",   car.drive_train],
    (car.sale_name || car.location) && ["Location", car.sale_name || car.location],
    !isPrivate && car.sale_date && ["Sale Date", new Date(car.sale_date).toLocaleDateString()],
    isPrivate && car.listing_description && ["Listing", car.listing_description],
    !isPrivate && car.damage_description && ["Damage", car.damage_description],
  ].filter(Boolean);

  const marginFill = (margin / 40) * 100;

  const flipDecision = calculateFlipDecision(
    car,
    { bid, buyerFee, taxAmt, titleFee, repair, totalCost, profit, resale, taxRate, marginActual, transportCost },
    { marginPercent: margin }
  );

  const handleTransportSave = (updatedVehicle) => {
    setCar(updatedVehicle);
    setPreviewTransportCost(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">

      {/* ── STICKY NAV ── */}
      <nav className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="flex w-full items-center px-4 py-3 sm:px-6 xl:px-8">
          <button
            onClick={() => navigate("/")}
            className="group flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft size={18} className="transition group-hover:-translate-x-0.5" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative w-full px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            {formatVehicleTitle(car)}
          </h1>

          {/* Title / location / date pills — below the name */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
              {sourceLabel(car)}
            </span>
            {car.title_code && (
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                {car.title_code}
              </span>
            )}
            {car.sale_name && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
                <MapPin size={13} className="text-blue-400" />
                {car.sale_name}
              </span>
            )}
            {car.sale_date && !isPrivate && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
                <Calendar size={13} className="text-blue-400" />
                {new Date(car.sale_date).toLocaleDateString()}
              </span>
            )}
          </div>

          {(car.lot_number || car.vin) && (
            <p className="mt-3 text-sm text-slate-400">
              {car.lot_number && (
                <>Lot <span className="font-semibold text-slate-200">{car.lot_number}</span></>
              )}
              {car.lot_number && car.vin && <span className="mx-2 text-slate-600">·</span>}
              {car.vin && <span className="font-mono text-slate-500">{car.vin}</span>}
            </p>
          )}
        </div>
      </header>

      {/* ── BODY ── */}
      <main className="w-full px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">

          {/* LEFT — Gallery + vehicle details */}
          <div className="space-y-4 xl:col-span-5 2xl:col-span-4">

            {/* Gallery */}
            {images.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* Main photo */}
                <div
                  className="group relative flex h-56 cursor-zoom-in items-center justify-center bg-slate-900 sm:h-72 xl:h-[320px]"
                  onClick={() => setLightbox(activePhoto)}
                >
                  <img
                    src={images[activePhoto]}
                    alt={`Photo ${activePhoto + 1}`}
                    className="h-full w-full object-contain"
                  />

                  {/* counter */}
                  <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                    <Images size={13} />
                    {activePhoto + 1} / {images.length}
                  </div>

                  {/* expand hint */}
                  <div className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                    <Maximize2 size={16} />
                  </div>

                  {images.length > 1 && (
                    <>
                      <button
                        aria-label="Previous photo"
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 backdrop-blur transition hover:bg-black/75 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setActivePhoto((activePhoto - 1 + images.length) % images.length); }}
                      ><ChevronLeft size={20} /></button>
                      <button
                        aria-label="Next photo"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 backdrop-blur transition hover:bg-black/75 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setActivePhoto((activePhoto + 1) % images.length); }}
                      ><ChevronRight size={20} /></button>
                    </>
                  )}
                </div>

                {/* Thumbnail strip */}
                <div className="grid grid-cols-5 gap-2 border-t border-slate-100 p-3 sm:grid-cols-6 xl:grid-cols-8">
                  {images.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePhoto(i)}
                      className={`relative aspect-[4/3] overflow-hidden rounded-lg transition ${
                        i === activePhoto
                          ? "ring-2 ring-blue-600 ring-offset-1"
                          : "opacity-70 ring-1 ring-slate-200 hover:opacity-100"
                      }`}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm font-medium text-slate-400">
                No photos available
              </div>
            )}

            {/* Vehicle Details */}
            {details.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Vehicle Details</h2>
                </div>
                <dl className="grid grid-cols-2 gap-px bg-slate-100 xl:grid-cols-3">
                  {details.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-col gap-0.5 bg-white px-3 py-2.5"
                    >
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
                      <dd className={`text-sm font-semibold text-slate-800 ${label === "VIN" ? "font-mono text-xs tracking-tight" : ""}`}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>

          {/* RIGHT — Flip decision, transport & controls side-by-side */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:col-span-7 xl:grid-cols-3 2xl:col-span-8">
              <FlipDecisionCard
                vehicle={car}
                flipMetrics={{ bid, profit, resale, repair, marginActual, transportCost }}
                decision={flipDecision}
                hideNarrative
              />

              <TransportCostCard
                vehicle={car}
                flipMetrics={{ bid, profit, transportCost }}
                apiBase={API}
                readOnly={isDemo}
                onSave={handleTransportSave}
                onPreviewChange={setPreviewTransportCost}
                userSettings={settings}
              />

              {/* Margin & tax controls */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:col-span-2 xl:col-span-1">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Deal Controls
                  </h3>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">Desired Margin</span>
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-sm font-bold tabular-nums text-blue-700">{margin}%</span>
                    </div>
                    <input
                      type="range" min={0} max={40} value={margin}
                      onChange={(e) => setMargin(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full accent-blue-600"
                      style={{
                        background: `linear-gradient(to right, #2563eb 0%, #2563eb ${marginFill}%, #e2e8f0 ${marginFill}%, #e2e8f0 100%)`,
                      }}
                    />
                    <div className="mt-1 flex justify-between text-xs text-slate-400">
                      <span>0%</span><span>40%</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Purchase State</label>
                    <div className="relative">
                      <select
                        value={selectedState}
                        onChange={(e) => setSelectedState(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-slate-800 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      >
                        <option value="">— Use vehicle defaults —</option>
                        {states.map((s) => (
                          <option key={s.state_code} value={s.state_code}>
                            {s.state_name} ({s.state_code}) — Tax: {s.avg_tax_rate}% | Title: {formatCurrency(s.title_fee)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                    {stateData && (
                      <p className="mt-1.5 text-xs text-slate-400">{stateData.notes}</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                    {!isPrivate && (
                      <div className="flex justify-between text-slate-500">
                        <span>Buyer Fee (7.5%)</span>
                        <span className="tabular-nums text-slate-700">{formatCurrency(buyerFee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500">
                      <span>Tax ({taxRate}%)</span>
                      <span className="tabular-nums text-slate-700">{formatCurrency(taxAmt)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Title Fee</span>
                      <span className="tabular-nums text-slate-700">{formatCurrency(titleFee)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>{costLabel(car)}</span>
                      <span className="tabular-nums text-slate-700">{formatCurrency(repair)}</span>
                    </div>
                    {transportCost > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Transport</span>
                        <span className="tabular-nums text-slate-700">{formatCurrency(transportCost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500">
                      <span>{isPrivate ? "Retail Exit" : "Resale"}</span>
                      <span className="tabular-nums text-slate-700">{formatCurrency(resale)}</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                      <span>Total Cost</span>
                      <span className="tabular-nums">{formatCurrency(totalCost)}</span>
                    </div>
                  </div>

                  {car.lot_url && (
                    <a
                      href={car.lot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99]"
                    >
                      {isPrivate ? "View Listing" : "View on Copart"}
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
          </div>
        </div>

        {/* ── Buying report (below the fold) ── */}
        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2 xl:gap-6">
          <div className="space-y-5">
            <DealSummaryCard
              vehicle={car}
              decision={flipDecision}
              flipMetrics={{ bid, profit, repair, transportCost }}
            />

            <DealRisksCard
              vehicle={car}
              decision={flipDecision}
              flipMetrics={{ profit, repair, transportCost }}
              transportCost={transportCost}
            />

            {isPrivate && (
              <NegotiationCard
                car={car}
                apiBase={API}
                readOnly={isDemo}
                onUpdate={(data) =>
                  setCar((prev) => ({
                    ...prev,
                    negotiation_summary: data.negotiation_summary,
                    negotiation_talking_points: data.negotiation_talking_points,
                    suggested_offer_low: data.suggested_offer_low,
                    suggested_offer_high: data.suggested_offer_high,
                    offer_rationale: data.offer_rationale,
                  }))
                }
              />
            )}

            <KnownIssuesCard
              car={car}
              apiBase={API}
              readOnly={isDemo}
              onUpdate={(data) =>
                setCar((prev) => ({
                  ...prev,
                  reliability_summary: data.reliability_summary,
                  known_issues: data.known_issues,
                  wear_items: data.wear_items,
                }))
              }
            />

            <RawAIDetailsCard car={car} />
          </div>

          <div className="space-y-5">
            <RepairPlanCard
              car={car}
              apiBase={API}
              readOnly={isDemo}
              onTotalChange={setRepairTotal}
              onUpdate={(data) => {
                if (data.repair_estimate != null) {
                  setRepairTotal(Number(data.repair_estimate) || 0);
                } else if (Array.isArray(data.repair_breakdown)) {
                  setRepairTotal(
                    data.repair_breakdown.reduce((s, i) => s + (Number(i.cost) || 0), 0)
                  );
                }
                setCar((prev) => ({
                  ...prev,
                  repair_difficulty_score: data.repair_difficulty_score,
                  repair_difficulty_label: data.repair_difficulty_label,
                  parts_availability: data.parts_availability,
                  estimated_labor_hours: data.estimated_labor_hours,
                  estimated_repair_days_min: data.estimated_repair_days_min,
                  estimated_repair_days_max: data.estimated_repair_days_max,
                  diy_friendly: data.diy_friendly,
                  parts_needed: data.parts_needed,
                  shop_services_needed: data.shop_services_needed,
                  repair_plan_summary: data.repair_plan_summary,
                  repair_plan_warnings: data.repair_plan_warnings,
                  hidden_damage_risks: data.hidden_damage_risks,
                  repair_estimate: data.repair_estimate ?? prev.repair_estimate,
                  repair_details: data.repair_details ?? prev.repair_details,
                  repair_breakdown: data.repair_breakdown ?? prev.repair_breakdown,
                }));
              }}
            />
          </div>
        </div>

        <p className="mt-10 border-t border-slate-200 pt-6 text-center text-xs leading-relaxed text-slate-400">
          AI-generated estimates may contain errors. All {isPrivate ? "recon" : "repair"} costs, resale values, and{" "}
          {isPrivate ? "offer" : "bid"} calculations should be independently verified before making any purchase decision.
        </p>
      </main>

      {/* ── LIGHTBOX ── */}
      {lightbox !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <button
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={() => setLightbox(null)}
          >
            <X size={28} />
          </button>
          <button
            aria-label="Previous photo"
            className="absolute left-4 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}
          ><ChevronLeft size={28} /></button>
          <img
            src={images[lightbox]}
            alt=""
            className="max-h-[88vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            aria-label="Next photo"
            className="absolute right-4 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}
          ><ChevronRight size={28} /></button>
          <div className="absolute bottom-5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
            {lightbox + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}