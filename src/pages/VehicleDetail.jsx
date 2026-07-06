import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  Wrench,
  DollarSign,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MapPin,
  Calendar,
  TrendingUp,
  TrendingDown,
  Maximize2,
  ExternalLink,
  Images,
} from "lucide-react";
import RepairBreakdown from "../components/RepairBreakdown";
import KnownIssuesCard from "../components/KnownIssuesCard";
import NegotiationCard from "../components/NegotiationCard";
import RedFlagsCard from "../components/RedFlagsCard";
import { parseRepairItems } from "../utils/repairBreakdown";
import { formatCurrency } from "../utils/formatCurrency";
import { formatVehicleTitle } from "../utils/vehicleName";
import { useFlipMetrics } from "../utils/useFlipMetrics";
import {
  isPrivateParty,
  buyerFeeRate,
  sourceLabel,
  costLabel,
  maxOfferLabel,
  askingPrice,
  parseRedFlags,
} from "../utils/vehicleSource";
import { getDealVerdict } from "../utils/dealVerdict";

const API = process.env.REACT_APP_API_BASE_URL ?? "";

function VerdictSplitCard({ verdict, bid, asking, isPrivate, margin, profit }) {
  const s = verdict.styles;
  const offerLabel = isPrivate ? "Max Offer" : "Max Bid";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
      <div className="grid grid-cols-2 divide-x divide-slate-200">
        <div className={`flex min-h-[140px] flex-col justify-between p-5 sm:p-6 ${s.bgLight}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Verdict</p>
          <div>
            <p className={`text-3xl font-black tracking-tight sm:text-4xl ${s.text}`}>{verdict.label}</p>
            <p className={`mt-1.5 text-xs leading-snug sm:text-sm ${s.textMuted}`}>{verdict.summary}</p>
          </div>
          <p
            className={`text-xs font-semibold tabular-nums ${
              profit >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            Est. profit {formatCurrency(profit)}
          </p>
        </div>

        <div className="flex min-h-[140px] flex-col justify-between bg-white p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Your {offerLabel}
          </p>
          <div>
            <p className="text-4xl font-extrabold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
              {formatCurrency(bid)}
            </p>
            {asking != null && (
              <p className="mt-1 text-xs text-slate-500">
                Ask{" "}
                <span className="font-semibold text-slate-700">{formatCurrency(asking)}</span>
              </p>
            )}
          </div>
          <p className="text-xs text-slate-400">@ {margin}% target margin</p>
        </div>
      </div>
    </div>
  );
}

function FormulaRibbon({
  resale,
  repair,
  buyerFee,
  taxAmt,
  titleFee,
  targetProfit,
  bid,
  isPrivate,
  repairLabel,
}) {
  const feesAndTax = buyerFee + taxAmt + titleFee;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        The math
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs font-medium leading-relaxed text-slate-300 sm:text-sm">
        <span className="text-emerald-400">{formatCurrency(resale)}</span>
        <span className="text-slate-500">resale</span>
        <span className="text-slate-600">−</span>
        <span className="text-amber-400">{formatCurrency(repair)}</span>
        <span className="text-slate-500">{repairLabel.toLowerCase()}</span>
        <span className="text-slate-600">−</span>
        <span>{formatCurrency(feesAndTax)}</span>
        <span className="text-slate-500">{isPrivate ? "tax & title" : "fees, tax & title"}</span>
        <span className="text-slate-600">−</span>
        <span className="text-blue-400">{formatCurrency(targetProfit)}</span>
        <span className="text-slate-500">target profit</span>
        <span className="text-slate-600">=</span>
        <span className="text-base font-bold text-white sm:text-lg">{formatCurrency(bid)}</span>
      </p>
    </div>
  );
}

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [car, setCar] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [margin, setMargin] = useState(15);
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [repairTotal, setRepairTotal] = useState(0);

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

  const stateData = states.find((s) => s.state_code === selectedState) || null;
  const overrideTax = stateData ? Number(stateData.avg_tax_rate) : null;
  const overrideTitle = stateData ? Number(stateData.title_fee) : null;

  const isPrivate = isPrivateParty(car);
  const asking = askingPrice(car);

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
    targetProfit,
  } = useFlipMetrics({
    carId: car?.id ?? id,
    resale: car?.resale_estimate || car?.ai_resale_estimate || 0,
    repair: repairTotal,
    marginPercent: margin,
    taxRate: overrideTax !== null ? overrideTax : Number(car?.avg_tax_rate || 0),
    titleFee: overrideTitle !== null ? overrideTitle : Number(car?.title_fee || 0),
    buyerFeeRate: buyerFeeRate(car),
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

  const profitPositive = profit >= 0;
  const marginFill = (margin / 40) * 100;
  const repairLabel = costLabel(car);
  const verdict = getDealVerdict({
    profit,
    marginActual,
    targetMargin: margin,
    bid,
    asking,
    resale,
    redFlagCount: parseRedFlags(car).length,
  });

  const splitCard = (
    <>
      <VerdictSplitCard
        verdict={verdict}
        bid={bid}
        asking={asking}
        isPrivate={isPrivate}
        margin={margin}
        profit={profit}
      />
      <FormulaRibbon
        resale={resale}
        repair={repair}
        buyerFee={buyerFee}
        taxAmt={taxAmt}
        titleFee={titleFee}
        targetProfit={targetProfit}
        bid={bid}
        isPrivate={isPrivate}
        repairLabel={repairLabel}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ── STICKY NAV ── */}
      <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate("/")}
            className="group flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            <ArrowLeft size={18} className="transition group-hover:-translate-x-0.5" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </nav>

      {/* ── BODY ── */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Vehicle identity — report header */}
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
            {formatVehicleTitle(car)}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {sourceLabel(car)}
            </span>
            {car.title_code && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {car.title_code}
              </span>
            )}
            {(car.sale_name || car.location) && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                <MapPin size={13} className="text-slate-400" />
                {car.sale_name || car.location}
              </span>
            )}
            {car.sale_date && !isPrivate && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                <Calendar size={13} className="text-slate-400" />
                {new Date(car.sale_date).toLocaleDateString()}
              </span>
            )}
          </div>
          {(car.lot_number || car.vin) && (
            <p className="mt-2 text-sm text-slate-500">
              {car.lot_number && (
                <>Lot <span className="font-semibold text-slate-700">{car.lot_number}</span></>
              )}
              {car.lot_number && car.vin && <span className="mx-2 text-slate-300">·</span>}
              {car.vin && <span className="font-mono text-slate-500">{car.vin}</span>}
            </p>
          )}
        </header>

        {/* Mobile: verdict split card above gallery */}
        <div className="mb-6 space-y-3 lg:hidden">{splitCard}</div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

          {/* LEFT — Gallery + details + analysis */}
          <div className="space-y-6 lg:col-span-7">

            {/* Gallery */}
            {images.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* Main photo */}
                <div
                  className="group relative flex aspect-[16/10] cursor-zoom-in items-center justify-center bg-slate-900"
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
                <div className="grid grid-cols-5 gap-2 border-t border-slate-100 p-3 sm:grid-cols-6">
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
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Vehicle Details</h2>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2">
                  {details.map(([label, value], idx) => (
                    <div
                      key={label}
                      className={`flex items-start justify-between gap-4 px-5 py-3 ${
                        idx % 2 === 0 ? "sm:border-r sm:border-slate-100" : ""
                      } border-b border-slate-100`}
                    >
                      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
                      <dd className={`text-right text-sm font-semibold text-slate-800 ${label === "VIN" ? "font-mono tracking-tight" : ""}`}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* AI Details */}
            {(car.repair_details || car.repair_breakdown || car.resale_details) && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {(car.repair_details || car.repair_breakdown) && (
                  <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                        <Wrench size={13} />
                      </span>
                      {isPrivate ? "Recon Analysis" : "Repair Analysis"}
                    </h3>
                    <RepairBreakdown
                      car={car}
                      apiBase={API}
                      readOnly={isDemo}
                      onTotalChange={setRepairTotal}
                    />
                  </section>
                )}
                {car.resale_details && (
                  <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                        <DollarSign size={13} />
                      </span>
                      {isPrivate ? "Retail Exit" : "Resale Analysis"}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-600">{car.resale_details}</p>
                  </section>
                )}
              </div>
            )}

            <RedFlagsCard car={car} />
          </div>

          {/* RIGHT — 2a sticky sidebar: verdict split + controls */}
          <div className="lg:col-span-5">
            <div className="space-y-4 lg:sticky lg:top-16">

              {/* Desktop: split card + formula ribbon */}
              <div className="hidden space-y-3 lg:block">{splitCard}</div>

              {/* Estimates row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <div className="mb-0.5 flex items-center gap-1.5 text-amber-600">
                    <Wrench size={13} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Est. {repairLabel}</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-amber-800">{formatCurrency(repair)}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div className="mb-0.5 flex items-center gap-1.5 text-emerald-600">
                    <DollarSign size={13} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      Est. {isPrivate ? "Retail Exit" : "Resale"}
                    </span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-emerald-800">{formatCurrency(resale)}</p>
                </div>
              </div>

              {/* Controls card */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Adjust your numbers
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {maxOfferLabel(car)} updates with margin · profit updates when you edit {isPrivate ? "recon" : "repair"}
                  </p>
                </div>

                <div className="space-y-5 p-5">
                  {/* Margin slider */}
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

                  {/* State selector */}
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

                  {/* Cost breakdown */}
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
                    <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                      <span>Total Cost</span>
                      <span className="tabular-nums">{formatCurrency(totalCost)}</span>
                    </div>
                  </div>

                  {/* Profit highlight */}
                  <div
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                      profitPositive
                        ? "border-emerald-100 bg-emerald-50"
                        : "border-red-100 bg-red-50"
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 text-sm font-semibold ${profitPositive ? "text-emerald-700" : "text-red-700"}`}>
                      {profitPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      Estimated Profit
                      <span className="ml-1 text-xs font-normal text-slate-400">({marginActual}% of resale)</span>
                    </span>
                    <span className={`text-lg font-bold tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-700"}`}>
                      {formatCurrency(profit)}
                    </span>
                  </div>

                  {car.lot_url && (
                    <a
                      href={car.lot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99]"
                    >
                      {isPrivate ? "View Listing" : "View on Copart"}
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>

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

            </div>
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