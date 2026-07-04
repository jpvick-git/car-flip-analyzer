import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Wrench, DollarSign, X, ChevronLeft, ChevronRight } from "lucide-react";

const API = process.env.REACT_APP_API_BASE_URL ?? "";

function calcMaxBid(car, margin) {
  const resale = Number(car.resale_estimate || car.ai_resale_estimate || 0);
  const repair = Number(car.repair_estimate || car.ai_repair_estimate || 0);
  const taxRate = Number(car.avg_tax_rate || 0);
  const titleFee = Number(car.title_fee || 0);
  const m = Number(margin) / 100;
  const divisor = 1 + 0.075 + taxRate / 100;
  let bid = (resale * (1 - m) - titleFee - repair) / divisor;
  if (isNaN(bid) || bid < 0) bid = 0;
  bid = Math.round(bid);
  const buyerFee = Math.round(bid * 0.075);
  const taxAmt = Math.round(bid * (taxRate / 100));
  const totalCost = bid + buyerFee + taxAmt + titleFee + repair;
  const profit = Math.round(resale - totalCost);
  return { bid, buyerFee, taxAmt, titleFee, repair, totalCost, profit, resale };
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
    fetchData();
  }, [id]);

  // Keyboard navigation for lightbox
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
        <button onClick={() => navigate("/")} className="text-blue-600 underline">
          Back to Dashboard
        </button>
      </div>
    );

  const { bid, buyerFee, taxAmt, titleFee, repair, totalCost, profit, resale } = calcMaxBid(car, margin);
  const odometer = Number(car.odometer);

  return (
    <div className="min-h-screen" style={{ background: "#f3f4f6" }}>

      {/* Header bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-600 hover:text-black transition"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Dashboard</span>
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-semibold text-gray-800">
          {car.year} {car.make} {car.model}
        </h1>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── PHOTO GALLERY ────────────────────────────────────── */}
        {images.length > 0 && (
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            {/* Main photo */}
            <div
              className="relative w-full bg-black cursor-zoom-in"
              style={{ height: "420px" }}
              onClick={() => setLightbox(activePhoto)}
            >
              <img
                src={images[activePhoto]}
                alt={`Photo ${activePhoto + 1}`}
                className="w-full h-full object-contain"
              />
              {/* Counter badge */}
              <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm px-3 py-1 rounded-full flex items-center gap-1">
                <span>🖼</span>
                <span>{activePhoto + 1}/{images.length}</span>
              </div>
              {/* Prev/Next on main image */}
              {images.length > 1 && (
                <>
                  <button
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition"
                    onClick={(e) => { e.stopPropagation(); setActivePhoto((activePhoto - 1 + images.length) % images.length); }}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition"
                    onClick={(e) => { e.stopPropagation(); setActivePhoto((activePhoto + 1) % images.length); }}
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
            </div>
            {/* Thumbnail strip */}
            <div className="flex gap-2 overflow-x-auto p-3 bg-gray-50" style={{ scrollbarWidth: "thin" }}>
              {images.map((src, i) => (
                <div
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  className={`flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden cursor-pointer transition border-2 ${
                    i === activePhoto ? "border-blue-500 opacity-100" : "border-transparent opacity-60 hover:opacity-90"
                  }`}
                >
                  <img src={src} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VEHICLE INFO + FINANCIALS ────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Left — vehicle details */}
          <div className="bg-white rounded-2xl shadow p-6 space-y-3">
            <h2 className="text-2xl font-bold text-gray-800">
              {car.year} {car.make} {car.model}
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-600">
              {car.lot_number && <><span className="font-semibold text-gray-800">Lot #</span><span>{car.lot_number}</span></>}
              {car.vin && <><span className="font-semibold text-gray-800">VIN</span><span className="font-mono text-xs break-all">{car.vin}</span></>}
              {car.sale_name && <><span className="font-semibold text-gray-800">Location</span><span>{car.sale_name}</span></>}
              {car.sale_date && <><span className="font-semibold text-gray-800">Sale Date</span><span>{new Date(car.sale_date).toLocaleDateString()}</span></>}
              {!isNaN(odometer) && odometer > 0 && <><span className="font-semibold text-gray-800">Odometer</span><span>{odometer.toLocaleString()} mi</span></>}
              {car.title_code && <><span className="font-semibold text-gray-800">Title</span><span>{car.title_code}</span></>}
              {car.engine_type && <><span className="font-semibold text-gray-800">Engine</span><span>{car.engine_type}</span></>}
              {car.damage_description && <><span className="font-semibold text-gray-800">Damage</span><span>{car.damage_description}</span></>}
            </div>
            {car.lot_url && (
              <a
                href={car.lot_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-center bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                View on Copart →
              </a>
            )}
          </div>

          {/* Right — financials */}
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">

            {/* Repair / Resale */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-orange-50 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-orange-600 mb-1">
                  <Wrench size={15} />
                  <span className="text-xs font-semibold uppercase tracking-wide">Est. Repair</span>
                </div>
                <p className="text-2xl font-bold text-orange-700">${repair.toLocaleString()}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                  <DollarSign size={15} />
                  <span className="text-xs font-semibold uppercase tracking-wide">Est. Resale</span>
                </div>
                <p className="text-2xl font-bold text-green-700">${resale.toLocaleString()}</p>
              </div>
            </div>

            {/* Margin slider */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-gray-700">Desired Margin</span>
                <span className="font-bold text-blue-600">{margin}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0%</span><span>40%</span>
              </div>
            </div>

            {/* Max Bid */}
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">
                Max Bid ({margin}% margin)
              </p>
              <p className="text-4xl font-extrabold text-blue-700">${bid.toLocaleString()}</p>
            </div>

            {/* Cost breakdown */}
            <div className="text-xs text-gray-500 space-y-0.5 border-t pt-3">
              <div className="flex justify-between"><span>Buyer Fee (7.5%)</span><span>${buyerFee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>${taxAmt.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Title Fee</span><span>${titleFee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Repairs</span><span>${repair.toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold text-gray-700 border-t mt-1 pt-1">
                <span>Total Cost</span><span>${totalCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold text-green-700">
                <span>Profit</span><span>${profit.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── AI DETAILS ───────────────────────────────────────── */}
        {(car.repair_details || car.resale_details) && (
          <div className="bg-white rounded-2xl shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {car.repair_details && (
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Repair Details</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{car.repair_details}</p>
              </div>
            )}
            {car.resale_details && (
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Resale Details</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{car.resale_details}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── LIGHTBOX ─────────────────────────────────────────── */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            onClick={() => setLightbox(null)}
          >
            <X size={32} />
          </button>

          <button
            className="absolute left-4 text-white hover:text-gray-300 z-10 bg-black/40 rounded-full p-2"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}
          >
            <ChevronLeft size={32} />
          </button>

          <img
            src={images[lightbox]}
            alt={`Photo ${lightbox + 1}`}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            className="absolute right-4 text-white hover:text-gray-300 z-10 bg-black/40 rounded-full p-2"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}
          >
            <ChevronRight size={32} />
          </button>

          <div className="absolute bottom-4 text-white text-sm bg-black/40 px-3 py-1 rounded-full">
            {lightbox + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}
