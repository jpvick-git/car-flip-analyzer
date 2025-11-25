import React, { useState, useEffect } from "react";
import { Menu, X } from "lucide-react"; // Keep icons used in your original file

export default function Header({
  uploadUserFile,
  logout,
  onAddVehicle,      // NEW: open "Add Vehicle" modal
  onUploadCSV,       // NEW: open CSV modal
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userIP, setUserIP] = useState("");
  const [isAllowed, setIsAllowed] = useState(false);

  const allowedIP = "68.186.200.184";

  // --------------------------------------------
  // GET USER IP
  // --------------------------------------------
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => {
        setUserIP(data.ip);
        setIsAllowed(data.ip === allowedIP);
      });
  }, []);

  return (
    <header className="bg-gray-900 text-white p-4 flex justify-between items-center shadow">
      {/* Left: Hamburger */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="focus:outline-none"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>

        <h1 className="text-xl font-bold">Car Flip Analyzer</h1>
      </div>

      {/* Right side was previously Upload CSV – now removed */}

      {/* -------------------------------------------- */}
      {/* Hamburger Menu */}
      {/* -------------------------------------------- */}
      {menuOpen && (
        <div className="absolute left-0 top-16 bg-gray-800 w-64 p-4 rounded-r-xl shadow-xl z-50">
          <div className="flex flex-col space-y-4">

            <button
              onClick={() => {
                setMenuOpen(false);
                onUploadCSV();
              }}
              className="text-left w-full px-2 py-2 rounded bg-gray-700 hover:bg-gray-600"
            >
              Upload CSV
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                onAddVehicle(); // Open manual modal in Dashboard
              }}
              className="text-left w-full px-2 py-2 rounded bg-gray-700 hover:bg-gray-600"
            >
              Add Vehicle
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="text-left w-full px-2 py-2 mt-4 rounded bg-red-600 hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
