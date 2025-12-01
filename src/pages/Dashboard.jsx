import React, { useEffect, useState } from "react";
import axios from "axios";
import { Wrench, DollarSign } from "lucide-react";

///////////////////////////////////////////////////////////////////////////////////////////
// MANUAL VEHICLE MODAL (unchanged)
///////////////////////////////////////////////////////////////////////////////////////////
function ManualVehicleModal({ API, close, reload }) {
  ...
  // (KEEP YOUR ORIGINAL MODAL — unchanged)
  ...
}

///////////////////////////////////////////////////////////////////////////////////////////
// CSV UPLOAD MODAL  ⭐ NEW ⭐
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
      <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl text-black">
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
// DASHBOARD — ADD CSV MODAL + EXISTING VEHICLE GRID
///////////////////////////////////////////////////////////////////////////////////////////
const Dashboard = ({
  showAddModal,
  setShowAddModal,
  showCSVModal,
  setShowCSVModal,
  uploadFile,
  setUploadFile,
  uploadUserFile,
}) => {
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [tempMargin, setTempMargin] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API =
    process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com";

  // UNIFIED MAX BID CALC
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
    const totalCost = bid + buyerFee + taxAmt + titleFee + repair;
    const profit = resale - totalCost;
    const marginActual = resale > 0 ? (profit / resale) * 100 : 0;

    return {
      ...car,
      max_bid: bid,
      buyer_fee: Math.round(buyerFee),
      tax_amount_calc: Math.round(taxAmt),
      total_cost: Math.round(totalCost),
      profit: Math.round(profit),
      margin_actual: Number(marginActual.toFixed(1)),
    };
  };

  // LOAD VEHICLES
  useEffect(() => {
    const fetchCars = async () => {
      try {
        setLoading(true);

        const response = await axios.get(`${API}/get_vehicles`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        let vehicles = [];
        if (Array.isArray(response.data)) vehicles = response.data;
        else if (Array.isArray(response.data.vehicles))
          vehicles = response.data.vehicles;

        vehicles = vehicles.map((car) => {
          if (car.image_urls && car.image_urls.length > 0) {
            car.image_url = car.image_urls[0];
          }
          return calculateCarWithMargin(car, 15);
        });

        setCars(vehicles);
      } catch (err) {
        console.error("Failed to load vehicles:", err);
        setError("Failed to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
  }, []);

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
      <div className="flex justify-center items-center h-screen text-gray-700">
        Loading vehicles...
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

      {/* ADD VEHICLE MODAL */}
      {showAddModal && (
        <ManualVehicleModal
          API={API}
          close={() => setShowAddModal(false)}
          reload={() => window.location.reload()}
        />
      )}

      {/* CSV UPLOAD MODAL ⭐ NEW ⭐ */}
      <CSVUploadModal
        showCSVModal={showCSVModal}
        setShowCSVModal={setShowCSVModal}
        uploadFile={uploadFile}
        setUploadFile={setUploadFile}
        uploadUserFile={uploadUserFile}
      />

      {/* CAR GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {cars.map((car) => (
          <div
            key={car.id}
            className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition overflow-hidden"
          >
            <div className="relative">
              <img
                src={
                  car.image_url ||
                  "https://placehold.co/400x250?text=No+Image"
                }
                className="w-full h-56 object-cover"
                alt=""
              />
              <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
                {car.damage_description || "Unknown Damage"}
              </div>
            </div>

            <div className="p-4 space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {car.year} {car.make} {car.model}
              </h2>

              <p className="text-sm text-gray-500">
                Lot #: {car.lot_number || "Manual"}
              </p>

              <p className="text-sm text-gray-500">
                Location: {car.sale_name || car.location || "N/A"}
              </p>

              <p className="text-sm text-gray-500">
                Sale Date:{" "}
                {car.sale_date
                  ? new Date(car.sale_date).toLocaleDateString()
                  : "N/A"}
              </p>

              {/* Repair + Resale */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center space-x-1 text-gray-700">
                  <Wrench size={16} />
                  <span>Repair:</span>
                  <input
                    type="number"
                    value={
                      car.repair_estimate || car.ai_repair_estimate || 0
                    }
                    onChange={(e) =>
                      updateCarValue(
                        car.id,
                        "repair_estimate",
                        Number(e.target.value)
                      )
                    }
                    className="w-20 border rounded px-2 py-1"
                  />
                </div>

                <div className="flex items-center space-x-1 text-gray-700">
                  <DollarSign size={16} />
                  <span>Resale:</span>
                  <input
                    type="number"
                    value={
                      car.resale_estimate || car.ai_resale_estimate || 0
                    }
                    onChange={(e) =>
                      updateCarValue(
                        car.id,
                        "resale_estimate",
                        Number(e.target.value)
                      )
                    }
                    className="w-20 border rounded px-2 py-1"
                  />
                </div>
              </div>

              {/* Max Bid */}
              <div className="mt-2 text-gray-700">
                <span className="font-medium">Max Bid: </span>$
                {car.max_bid?.toLocaleString()}
              </div>

              <button
                onClick={() => setSelectedCar(car)}
                className="mt-4 px-4 py-2 border rounded-lg text-gray-800 hover:bg-gray-50 text-sm"
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* DETAILS MODAL (unchanged) */}
      {selectedCar && (
        ...
        // KEEP YOUR ORIGINAL DETAILS MODAL — unchanged
        ...
      )}
    </main>
  );
};

export default Dashboard;
