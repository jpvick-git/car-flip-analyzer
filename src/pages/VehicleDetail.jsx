import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Wrench, DollarSign, X, ChevronLeft, ChevronRight } from "lucide-react";

const API = process.env.REACT_APP_API_BASE_URL ?? "";

function calcMaxBid(car, margin, overrideTaxRate, overrideTitleFee) {
  const resale = Number(car.resale_estimate || car.ai_resale_estimate || 0);
  const repair = Number(car.repair_estimate || car.ai_repair_estimate || 0);
  const taxRate = overrideTaxRate !== null ? overrideTaxRate : Number(car.avg_tax_rate || 0);
  const titleFee = overrideTitleFee !== null ? overrideTitleFee : Number(car.title_fee || 0);
  const m = Number(margin) / 100;
  const divisor = 1 + 0.075 + taxRate / 100;
  let bid = (resale * (1 - m) - titleFee - repair) / divisor;
  if (isNaN(bid) || bid < 0) bid = 0;
  bid = Math.round(bid);
  const buyerFee = Math.round(bid * 0.075);
  const taxAmt = Math.round(bid * (taxRate / 100));
  const totalCost = bid + buyerFee + taxAmt + titleFee + repair;
  const profit = Math.round(resale - totalCost);
  return { bid, buyerFee, taxAmt, titleFee, repair, totalCost, profit, resale, taxRate };
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

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen" style={{ background: "#f3f4f6" }}>
        <p className="text-gray-500">Loading…</p>
      </div>
    );

  if (!car)
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: "#f3f4f6" }}>
        <p className="text-gray-500">Vehicle not found.</p>
        <button onClick={() => navigate("/")} className="text-blue-600 underline">Back to Dashboard</button>
      </div>
    );

  const stateData = states.find((s) => s.state_code === selectedState) || null;
  const overrideTax = stateData ? Number(stateData.avg_tax_rate) : null;
  const overrideTitle = stateData ? Number(stateData.title_fee) : null;
  const { bid, buyerFee, taxAmt, titleFee, repair, totalCost, profit, resale, taxRate } = calcMaxBid(car, margin, overrideTax, overrideTitle);
  const odometer = Number(car.odometer);

  const details = [
    car.vin          && ["VIN",         car.vin],
    car.lot_number   && ["Lot #",        car.lot_number],
    car.title_code   && ["Title",        car.title_code],
    !isNaN(odometer) && odometer > 0 && ["Odometer", `${odometer.toLocaleString()} mi`],
    car.engine_type  && ["Engine",       car.engine_type],
    car.transmission && ["Transmission", car.transmission],
    car.fuel_type    && ["Fuel",         car.fuel_type],
    car.drive_train  && ["Drivetrain",   car.drive_train],
    car.sale_name    && ["Location",     car.sale_name],
    car.sale_date    && ["Sale Date",    new Date(car.sale_date).toLocaleDateString()],
    car.damage_description && ["Damage", car.damage_description],
  ].filter(Boolean);

  return (
    <div className="min-h-screen" style={{ background: "#f3f4f6" }}>

      {/* ── TOP BAR ── */}
      <div className="bg-white border-b px-6 py-3 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-600 hover:text-black transition"
        >
          <ArrowLeft size={18} />
          <span className="font-medium text-sm">Back to Dashboard</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* ── MAIN ROW: Photo Left | Bid+Details Right ── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* LEFT — Photo gallery */}
          <div className="lg:w-[55%] space-y-2">
            {images.length > 0 ? (
              <>
                {/* Main photo */}
                <div
                  className="relative bg-black rounded-xl overflow-hidden cursor-zoom-in"
                  style={{ height: "380px" }}
                  onClick={() => setLightbox(activePhoto)}
                >
                  <img
                    src={images[activePhoto]}
                    alt={`Photo ${activePhoto + 1}`}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                    🖼 {activePhoto + 1}/{images.length}
                  </div>
                  {images.length > 1 && (
                    <>
                      <button
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full p-1.5 transition"
                        onClick={(e) => { e.stopPropagation(); setActivePhoto((activePhoto - 1 + images.length) % images.length); }}
                      ><ChevronLeft size={20} /></button>
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full p-1.5 transition"
                        onClick={(e) => { e.stopPropagation(); setActivePhoto((activePhoto + 1) % images.length); }}
                      ><ChevronRight size={20} /></button>
                    </>
                  )}
                </div>
                {/* Thumbnail grid */}
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
                  {images.map((src, i) => (
                    <div
                      key={i}
                      onClick={() => setActivePhoto(i)}
                      className={`h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition ${
                        i === activePhoto ? "border-blue-500" : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl h-64 flex items-center justify-center text-gray-400">
                No photos available
              </div>
            )}

            {/* Vehicle Details — fills remaining left column space */}
            {details.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">Vehicle Details</h3>
                <div className="space-y-2">
                  {details.map(([label, value]) => (
                    <div key={label} className="flex justify-between text-sm border-b border-gray-50 pb-1.5 last:border-0">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-800 text-right max-w-[60%]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Bid + Vehicle Details */}
          <div className="lg:w-[45%] space-y-4">

            {/* Car name + location */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {car.year} {car.make} {car.model}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm">
                {car.lot_number && <span className="text-gray-500">Lot: <span className="font-medium text-gray-700">{car.lot_number}</span></span>}
                {car.sale_name  && <span className="text-blue-600 font-semibold">{car.sale_name}</span>}
                {car.sale_date  && <span className="text-gray-400">Sale: {new Date(car.sale_date).toLocaleDateString()}</span>}
              </div>
            </div>

            {/* Repair / Resale */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-orange-500 mb-1">
                  <Wrench size={14} />
                  <span className="text-xs font-semibold uppercase tracking-wide">Est. Repair</span>
                </div>
                <p className="text-2xl font-bold text-orange-700">${repair.toLocaleString()}</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                  <DollarSign size={14} />
                  <span className="text-xs font-semibold uppercase tracking-wide">Est. Resale</span>
                </div>
                <p className="text-2xl font-bold text-green-700">${resale.toLocaleString()}</p>
              </div>
            </div>

            {/* Max Bid + Margin */}
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Bid</p>
                <p className="text-5xl font-extrabold text-blue-700">${bid.toLocaleString()}</p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-sm font-medium text-gray-700">
                  <span>Desired Margin</span>
                  <span className="text-blue-600 font-bold">{margin}%</span>
                </div>
                <input
                  type="range" min={0} max={40} value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400"><span>0%</span><span>40%</span></div>
              </div>

              {/* State selector */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Purchase State</label>
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Use vehicle defaults —</option>
                  {states.map((s) => (
                    <option key={s.state_code} value={s.state_code}>
                      {s.state_name} ({s.state_code}) — Tax: {s.avg_tax_rate}% | Title: ${Number(s.title_fee).toLocaleString()}
                    </option>
                  ))}
                </select>
                {stateData && (
                  <p className="text-xs text-gray-400">{stateData.notes}</p>
                )}
              </div>

              <div className="text-sm text-gray-500 space-y-1 border-t pt-3">
                <div className="flex justify-between"><span>Buyer Fee (7.5%)</span><span>${buyerFee.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Tax ({taxRate}%)</span><span>${taxAmt.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Title Fee</span><span>${titleFee.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Repairs</span><span>${repair.toLocaleString()}</span></div>
                <div className="flex justify-between font-semibold text-gray-800 border-t pt-1 mt-1">
                  <span>Total Cost</span><span>${totalCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-green-700">
                  <span>Profit</span><span>${profit.toLocaleString()}</span>
                </div>
              </div>

              {car.lot_url && (
                <a
                  href={car.lot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold text-sm transition"
                >
                  View on Copart →
                </a>
              )}
            </div>

          </div>
        </div>

        {/* ── AI DETAILS BELOW ── */}
        {(car.repair_details || car.resale_details) && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {car.repair_details && (
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                  <Wrench size={14} className="text-orange-500" /> Repair Details
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">{car.repair_details}</p>
              </div>
            )}
            {car.resale_details && (
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                  <DollarSign size={14} className="text-green-600" /> Resale Details
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">{car.resale_details}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── LIGHTBOX ── */}
      {lightbox !== null && (
        <div className="fixed inset-0 bg-black/92 z-50 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300" onClick={() => setLightbox(null)}>
            <X size={32} />
          </button>
          <button
            className="absolute left-4 bg-black/40 text-white rounded-full p-2 hover:bg-black/60"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}
          ><ChevronLeft size={30} /></button>
          <img
            src={images[lightbox]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute right-4 bg-black/40 text-white rounded-full p-2 hover:bg-black/60"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}
          ><ChevronRight size={30} /></button>
          <div className="absolute bottom-4 text-white text-sm bg-black/40 px-3 py-1 rounded-full">
            {lightbox + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}
