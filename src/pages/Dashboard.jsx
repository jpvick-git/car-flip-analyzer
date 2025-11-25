///////////////////////////////////////////////////////////////////////////////////////////
// MANUAL VEHICLE MODAL — BACKEND CARQUERY VERSION (NO UI CHANGES)
///////////////////////////////////////////////////////////////////////////////////////////
function ManualVehicleModal({ API, close, reload }) {
  const [form, setForm] = useState({
    year: "",
    make: "",
    model: "",
    trim: "",
    mileage: "",
    damage_description: "",
    title_code: "",
    location: "",
    listing_url: "",
  });

  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [trims, setTrims] = useState([]);
  const [images, setImages] = useState([]);

  // -----------------------------
  // Years 1980–2026
  // -----------------------------
  const years = Array.from({ length: 2026 - 1980 + 1 }, (_, i) => 1980 + i);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleImageFiles = (e) =>
    setImages([...images, ...Array.from(e.target.files)]);

  // -----------------------------
  // LOAD MAKES FROM BACKEND
  // -----------------------------
  useEffect(() => {
    const loadMakes = async () => {
      try {
        const res = await axios.get(`${API}/carquery/makes`);
        setMakes(res.data.makes || []);
      } catch (err) {
        console.error("Failed to load makes:", err);
      }
    };

    loadMakes();
  }, [API]);

  // -----------------------------
  // LOAD MODELS WHEN MAKE CHANGES
  // -----------------------------
  useEffect(() => {
    if (!form.make) return;

    const loadModels = async () => {
      try {
        const res = await axios.get(`${API}/carquery/models?make=${form.make}`);
        setModels(res.data.models || []);
        setTrims([]);
        setForm((prev) => ({ ...prev, model: "", trim: "" }));
      } catch (err) {
        console.error("Failed to load models:", err);
      }
    };

    loadModels();
  }, [form.make, API]);

  // -----------------------------
  // LOAD TRIMS WHEN YEAR + MAKE + MODEL SELECTED
  // -----------------------------
  useEffect(() => {
    if (!form.year || !form.make || !form.model) return;

    const loadTrims = async () => {
      try {
        const url = `${API}/carquery/trims?make=${form.make}&model=${form.model}&year=${form.year}`;
        const res = await axios.get(url);
        setTrims(res.data.trims || []);
        setForm((prev) => ({ ...prev, trim: "" }));
      } catch (err) {
        console.error("Failed to load trims:", err);
      }
    };

    loadTrims();
  }, [form.year, form.make, form.model, API]);

  // -----------------------------
  // SUBMIT
  // -----------------------------
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

  // -----------------------------
  // RENDER (NO UI CHANGES)
  // -----------------------------
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl text-black">
        <h2 className="text-xl font-semibold mb-4 text-black">Add Vehicle</h2>

        {/* YEAR */}
        <select
          name="year"
          value={form.year}
          onChange={update}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* MAKE */}
        <select
          name="make"
          value={form.make}
          onChange={update}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Make</option>
          {makes.map((m) => (
            <option key={m.make_id} value={m.make_id}>
              {m.make_display}
            </option>
          ))}
        </select>

        {/* MODEL */}
        <select
          name="model"
          value={form.model}
          onChange={update}
          disabled={!models.length}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Model</option>
          {models.map((m) => (
            <option key={m.model_id} value={m.model_name}>
              {m.model_name}
            </option>
          ))}
        </select>

        {/* TRIM */}
        <select
          name="trim"
          value={form.trim}
          onChange={update}
          disabled={!trims.length}
          className="w-full border rounded-lg p-2 mb-3 text-black"
        >
          <option value="">Select Trim</option>
          {trims.map((t, i) => (
            <option key={i} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* OTHER FIELDS */}
        {[
          ["mileage", "Mileage"],
          ["damage_description", "Damage"],
          ["title_code", "Title Code"],
          ["location", "Location"],
          ["listing_url", "Listing URL (optional)"],
        ].map(([key, label]) => (
          <input
            key={key}
            name={key}
            value={form[key]}
            onChange={update}
            placeholder={label}
            className="w-full border rounded-lg p-2 mb-3 text-black"
          />
        ))}

        {/* PHOTOS */}
        <label className="font-medium text-black">Photos</label>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleImageFiles}
          className="w-full border p-2 rounded mb-3 text-black"
        />

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {images.map((img, i) => (
              <img
                key={i}
                src={URL.createObjectURL(img)}
                className="w-full h-20 object-cover rounded"
              />
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 bg-gray-300 rounded-lg text-black" onClick={close}>
            Cancel
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg" onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
export default Dashboard;
