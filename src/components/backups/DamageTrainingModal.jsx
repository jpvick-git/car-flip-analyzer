import React, { useState } from "react";
import axios from "axios";

const DamageTrainingModal = ({ car, onClose }) => {
  const [label, setLabel] = useState(car.damage_description || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  if (!car) return null;

  // --------------------------------------------------------
  // SEND LABEL TO BACKEND /training/add_label
  // --------------------------------------------------------
  const saveLabel = async () => {
    if (!label.trim()) {
      setError("Please enter a damage label.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await axios.post(
        `${process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com"}/training/add_label`,
        {
          lot_number: car.lot_number,
          damage_label: label,
          image_url: car.image_url,
        }
      );

      setSaving(false);
      setSuccess("Saved! This damage type was added to the training model.");
    } catch (err) {
      setSaving(false);
      setError("Failed to save label. Check backend logs.");
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md relative">

        {/* CLOSE */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-xl"
        >
          ✕
        </button>

        {/* HEADER */}
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Train Damage Model
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          You're adding a custom damage label to improve the AI model.
        </p>

        {/* LOT INFO */}
        <div className="text-sm text-gray-700 mb-4 space-y-1">
          <p>
            <span className="font-medium">Lot:</span> {car.lot_number}
          </p>
          <p>
            <span className="font-medium">Current label:</span>{" "}
            {car.damage_description || "Unknown"}
          </p>
        </div>

        {/* IMAGE PREVIEW */}
        {car.image_url && (
          <img
            src={car.image_url}
            alt="Preview"
            className="w-full h-48 object-cover rounded-md mb-4 shadow"
          />
        )}

        {/* INPUT */}
        <label className="text-sm font-medium text-gray-700">New Damage Label:</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded px-3 py-2 mt-1 mb-3"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        {/* STATUS */}
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-2">{success}</p>}

        {/* SAVE BUTTON */}
        <button
          onClick={saveLabel}
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400"
        >
          {saving ? "Saving..." : "Save Damage Label"}
        </button>
      </div>
    </div>
  );
};

export default DamageTrainingModal;
