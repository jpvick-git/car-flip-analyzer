import React, { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

export default function Header({ onAddVehicle, onUploadCSV, logout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userIP, setUserIP] = useState("");
  const [isAllowed, setIsAllowed] = useState(false);

  const allowedIP = "68.186.200.184";

  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => {
        setUserIP(data.ip);
        setIsAllowed(data.ip === allowedIP);
      });
  }, []);

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white shadow">
      {/* Logo + Title */}
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="logo" className="h-10 w-auto" />
        <span className="text-xl font-semibold text-gray-900">
          Car Flip Analyzer
        </span>
      </div>

      {/* Hamburger Button */}
      <button onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <X size={28} /> : <Menu size={28} />}
      </button>

      {/* Slide-out Drawer */}
      {menuOpen && (
        <div className="absolute right-0 top-16 bg-white w-64 shadow-xl p-4 z-50 rounded-l-lg border">
          <div className="flex flex-col space-y-4">

            {/* Upload CSV */}
            <button
              onClick={() => {
                setMenuOpen(false);
                onUploadCSV();
              }}
              className="text-left w-full px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 transition"
            >
              Upload CSV
            </button>

            {/* Add Vehicle */}
            <button
              onClick={() => {
                setMenuOpen(false);
                onAddVehicle();
              }}
              className="text-left w-full px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 transition"
            >
              Add Vehicle
            </button>

            {/* Logout */}
            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="text-left w-full px-3 py-2 mt-6 rounded bg-red-500 text-white hover:bg-red-600 transition"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
