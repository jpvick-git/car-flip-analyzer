import React, { useEffect, useState } from "react";
import axios from "axios";
import CarCard from "../components/CarCard"; 
import Header from "../components/Header";


export default function Dashboard({ openCSVModal }) {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const API =
    process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com";

  // ---------------------------------------------
  // Load Vehicles
  // ---------------------------------------------
  useEffect(() => {
    const loadCars = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API}/get_vehicles`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setCars(res.data || []);
      } catch (err) {
        console.error("Failed to load vehicles:", err);
      } finally {
        setLoading(false);
      }
    };
    loadCars();
  }, [API]);

  return (
    <div className="p-4 max-w-5xl mx-auto">

      {/* Inject callbacks into Header */}
      <Header
        onAddVehicle={() => setShowAddModal(true)}
        onUploadCSV={openCSVModal}
        uploadUserFile={null}
        logout={() => {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }}
      />

      {/* --------------------------------- */}
      {/* Vehicle Grid */}
      {/* --------------------------------- */}
      {loading ? (
        <div className="text-white text-center mt-10">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      )}

      {/* --------------------------------- */}
      {/* Add Vehicle Modal */}
      {/* --------------------------------- */}
      {showAddModal && (
        <ManualVehicleModal
          API={API}
          close={() => setShowAddModal(false)}
          reload={() => window.location.reload()}
        />
      )}
    </div>
  );
}

//////////////////////////////////////////////////////////////////
//   ManualVehicleModal (same as working version)
//////////////////////////////////////////////////////////////////

function ManualVehicleModal({ API, close, reload }) {
  const [form, setForm] = useState({
    year: "",
    make: "",
    model: "",
    mileage: "",
    damage_description: "",
    title_code: "",
    location: "",
    listing_url: "",
  });

  const [images, setImages] = useState([]);

  const update = (e) =>
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

  const handleImageFiles = (e) => {
    const files = Array.from(e.target.files);
    setImages((prev) => [...prev, ...files]);
  };

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

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Add Vehicle</h2>

        {[
          ["year", "Year"],
          ["make", "Make"],
          ["model", "Model"],
          ["mileage", "Mileage"],
          ["damage_description", "Damage Description"],
          ["title_code", "Title Code"],
          ["location", "Location"],
          ["listing_url", "Listing URL (optional)"],
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
