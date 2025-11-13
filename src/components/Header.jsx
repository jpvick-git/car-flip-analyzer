import React, { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

export default function Header({
  uploadFile,
  setUploadFile,
  uploadUserFile,
  logout,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userIP, setUserIP] = useState("");
  const [isAllowed, setIsAllowed] = useState(false);

  const allowedIP = "68.186.200.184";

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => {
        setUserIP(data.ip);
        if (data.ip === allowedIP) setIsAllowed(true);
      })
      .catch((err) => console.error("Failed to get IP:", err));
  }, []);

  // --------------------------------------------------
  // HANDLE FILE SELECTION + VALIDATION
  // --------------------------------------------------
  const handleFileSelect = (e) => {
    setUploadError("");
    const file = e.target.files[0];

    if (!file) {
      setUploadFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Please upload a valid CSV file.");
      setUploadFile(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;

      const rows = text
        .split("\n")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      const dataRows = rows.length - 1;

      if (dataRows > 10) {
        setUploadError(
          `Maximum allowed cars is 10. Your CSV contains ${dataRows} rows.`
        );
        setUploadFile(null);
      } else {
        setUploadFile(file);
      }
    };

    reader.readAsText(file);
  };

  // --------------------------------------------------
  // UPLOAD BUTTON (INSIDE MODAL)
  // --------------------------------------------------
  const handleUploadClick = async () => {
    if (!uploadFile) {
      setUploadError("Please choose a CSV file first.");
      return;
    }

    const success = await uploadUserFile();
    if (success !== false) {
      setModalOpen(false);
      setUploadError("");
      setUploadFile(null);
    }
  };

  return (
    <>
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">

          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Car Flip Analyzer Logo"
              className="h-10 w-auto"
            />
            <h1 className="text-xl font-semibold text-gray-800">
              Car Flip Analyzer
            </h1>
          </div>

          {/* Right: Upload + Hamburger */}
          <div className="flex items-center gap-4">

            {/* Upload Button (no file input here!) */}
            {isAllowed && (
              <button
                onClick={() => {
                  setUploadError("");
                  setUploadFile(null);
                  setModalOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition"
              >
                Upload CSV
              </button>
            )}

            {/* Hamburger */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      alert("Settings feature coming soon!");
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      alert("Help section coming soon!");
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    💬 Help
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isAllowed && (
          <p className="text-center text-xs text-gray-400 pb-1">
            Uploads restricted — your IP:{" "}
            <span className="font-mono">{userIP || "..."}</span>
          </p>
        )}
      </header>

      {/* -------------------------------------------------- */}
      {/*               CSV UPLOAD MODAL                     */}
      {/* -------------------------------------------------- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-lg p-6 relative">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">
              Upload CSV File
            </h2>

            <p className="text-gray-600 mb-4">
              Please upload a CSV file containing **up to 10 vehicles**.
              Supported format: <strong>.csv</strong>
            </p>

            {/* FILE INPUT */}
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleFileSelect(e)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer focus:ring-2 focus:ring-blue-500"
            />

            {/* ERROR MESSAGE */}
            {uploadError && (
              <div className="mt-3 bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded-md text-sm">
                {uploadError}
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setModalOpen(false);
                  setUploadError("");
                  setUploadFile(null);
                }}
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-md text-gray-800"
              >
                Cancel
              </button>

              <button
                onClick={handleUploadClick}
                disabled={!uploadFile}
                className={`px-4 py-2 rounded-md text-white transition ${
                  uploadFile
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
