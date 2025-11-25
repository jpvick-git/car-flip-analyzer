import React, { useEffect, useState } from "react";
import axios from "axios";
import CarCard from "./CarCard";
import { Plus } from "lucide-react";

export default function Dashboard() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showManualModal, setShowManualModal] = useState(false);

  const API = process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com";

  // ---------------------------------------------------------
  // LOAD VEHICLES
  // ---------------------------------------------------------
  useEffect(() => {
    const loadCars = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API}/get_vehicles`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setCars(res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadCars();
  }, [API]);

  return (
    <div className="p-4 max-w-5xl mx-auto">

      {/* ---------------------------------------------- */}
      {/* HEADER + BUTTON */}
      {/* ---------------------------------------------- */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-white">Dashboard</h1>

        <button
          onClick={() => setShowManualModal(true)}
          className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 transition"
        >
          <Plus className="mr-2" size={20} />
          Add Manual Vehicle
        </button>
      </div>

      {/* ---------------------------------------------- */}
      {/* LOADING STATE */}
      {/* ---------------------------------------------- */}
      {loading ? (
        <div className="text-white text-center mt-10">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      )}

      {/* ---------------------------------------------- */}
      {/* MODAL COMPONENT */}
      {/* ---------------------------------------------- */}
      {showManualModal && (
        <ManualVehicleModal
          API={API}
          close={() => setShowManualModal(false)}
          reload={() => window.location.reload()}
        />
      )}

    </div>
  );
}

//////////////////////////////////////////////////////////////////
//   MANUAL VEHICLE MODAL
//////////////////////////////////////////////////////////////////

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

  const [images, setImages] = useState([]);

  // Update form fields
  const update = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  // Handle image selection
  const handleImageFiles = (e) => {
    const files = Array.from(e.target.files);
    setImages((prev) => [...prev, ...files]);
  };

  // ---------------------------------------------------------
  // SUBMIT MANUAL VEHICLE
  // ---------------------------------------------------------
  const submit = async () => {
    try {
      const fd = new FormData();

      Object.entries(form).forEach(([key, value]) =>
        fd.append(key, value)
      );

      images.forEach((img) => fd.append("files", img));

      await axios.post(`${API}/add_manual_vehicle`, fd, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "multipart/form-data",
        },
      });

      close();
      reload(); // refresh dashboard
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to add vehicle.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">

        <h2 className="text-lg font-bold mb-4">Add Manual Vehicle</h2>

        {/* ---------------------------------------------- */}
        {/* FORM FIELDS */}
        {/* ---------------------------------------------- */}

        {[
          ["year", "Year"],
          ["make", "Make"],
          ["model", "Model"],
          ["trim", "Trim"],
          ["mileage", "Mileage"],
          ["damage_description", "Damage Description"],
          ["title_status", "Title Status"],
          ["asking_price", "Asking Price"],
          ["location", "Location"],
          ["listing_url", "Listing URL"],
          ["vin", "VIN (optional)"],
        ].map(([name, label]) => (
          <input
            key={name}
            name={name}
            placeholder={label}
            value={form[name]}
            onChange={update}
            className="w-full border rounded-lg p-2 mb-3"
          />
        ))}

        <textarea
          name="description"
          placeholder="Description (optional)"
          value={form.description}
          onChange={update}
          className="w-full border rounded-lg p-2 mb-3"
        />

        {/* ---------------------------------------------- */}
        {/* IMAGE UPLOAD */}
        {/* ---------------------------------------------- */}
        <div className="border border-gray-300 rounded-lg p-3 bg-gray-50 mb-4">
          <label className="block mb-2 font-semibold text-gray-700">
            Upload Photos
          </label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageFiles}
            className="w-full"
          />

          {/* Preview thumbnails */}
          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={URL.createObjectURL(img)}
                  alt="preview"
                  className="w-full h-20 object-cover rounded"
                />
              ))}
            </div>
          )}
        </div>

        {/* ---------------------------------------------- */}
        {/* BUTTONS */}
        {/* ---------------------------------------------- */}
        <div className="flex gap-3 justify-end mt-4">
          <button
            onClick={close}
            className="px-4 py-2 bg-gray-300 rounded-lg"
          >
            Cancel
          </button>

          <button
            onClick={submit}
            className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700"
          >
            Save Vehicle
          </button>
        </div>
      </div>
    </div>
  );
}
