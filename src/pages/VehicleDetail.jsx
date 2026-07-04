import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Wrench, DollarSign, X, ChevronLeft, ChevronRight } from "lucide-react";

const API = process.env.REACT_APP_API_BASE_URL ?? "";

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [car, setCar] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // index of open image

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
    return <div className="flex justify-center items-center h-screen text-gray-500">Loading…</div>;

  if (!car)
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-gray-500">Vehicle not found.</p>
        <button onClick={() => navigate("/")} className="text-blue-600 underline">
          Back to Dashboard
        </button>
      </div>
    );

  const repairCost = Number(car.repair_estimate || car.ai_repair_estimate || 0);
  const resaleVal = Number(car.resale_estimate || car.ai_resale_estimate || 0);

  return (
    <div className="min-h-screen bg-gray-100" style={{ background: "#f3f4f6" }}>
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

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Vehicle Info */}
        <div className="bg-white rounded-2xl shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-800">
              {car.year} {car.make} {car.model}
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
              {car.lot_number && <><span className="font-medium text-gray-800">Lot #</span><span>{car.lot_number}</span></>}
              {car.vin && <><span className="font-medium text-gray-800">VIN</span><span className="font-mono text-xs">{car.vin}</span></>}
              {car.sale_name && <><span className="font-medium text-gray-800">Location</span><span>{car.sale_name}</span></>}
              {car.sale_date && <><span className="font-medium text-gray-800">Sale Date</span><span>{new Date(car.sale_date).toLocaleDateString()}</span></>}
              {car.odometer && <><span className="font-medium text-gray-800">Odometer</span><span>{Number(car.odometer).toLocaleString()} mi</span></>}
              {car.title_code && <><span className="font-medium text-gray-800">Title</span><span>{car.title_code}</span></>}
              {car.engine_type && <><span className="font-medium text-gray-800">Engine</span><span>{car.engine_type}</span></>}
              {car.damage_description && <><span className="font-medium text-gray-800">Damage</span><span>{car.damage_description}</span></>}
            </div>
          </div>

          {/* Financials */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-orange-50 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-orange-600 mb-1">
                  <Wrench size={16} />
                  <span className="text-sm font-medium">Est. Repair</span>
                </div>
                <p className="text-2xl font-bold text-orange-700">
                  ${repairCost.toLocaleString()}
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                  <DollarSign size={16} />
                  <span className="text-sm font-medium">Est. Resale</span>
                </div>
                <p className="text-2xl font-bold text-green-700">
                  ${resaleVal.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-sm font-medium text-blue-600 mb-1">Max Bid (15% margin)</p>
              <p className="text-3xl font-bold text-blue-700">${car.maxBid?.toLocaleString() ?? "—"}</p>
            </div>
            {car.lot_url && (
              <a
                href={car.lot_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                View on Copart →
              </a>
            )}
          </div>
        </div>

        {/* AI Details */}
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

        {/* Photo Gallery */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">
            Photos ({images.length})
          </h3>
          {images.length === 0 ? (
            <p className="text-gray-400 text-sm">No photos available yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((src, i) => (
                <div
                  key={i}
                  className="aspect-video bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition hover:ring-2 hover:ring-blue-500"
                  onClick={() => setLightbox(i)}
                >
                  <img
                    src={src}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            onClick={() => setLightbox(null)}
          >
            <X size={32} />
          </button>

          {/* Prev */}
          <button
            className="absolute left-4 text-white hover:text-gray-300 z-10 bg-black/40 rounded-full p-2"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}
          >
            <ChevronLeft size={32} />
          </button>

          {/* Image */}
          <img
            src={images[lightbox]}
            alt={`Photo ${lightbox + 1}`}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          <button
            className="absolute right-4 text-white hover:text-gray-300 z-10 bg-black/40 rounded-full p-2"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}
          >
            <ChevronRight size={32} />
          </button>

          {/* Counter */}
          <div className="absolute bottom-4 text-white text-sm">
            {lightbox + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}
