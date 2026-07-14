import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import BrandLogo from "./BrandLogo";

export default function Header({ onAddVehicle, onUploadCSV, logout, isDemo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="relative flex items-center justify-between px-4 py-3 bg-white shadow-sm border-b border-slate-200/80">
      {/* Logo + Title */}
      <div className="flex items-center gap-3">
        <BrandLogo size="md" />
        {isDemo && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            Demo
          </span>
        )}
      </div>

      {/* Hamburger Button */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="p-1 text-brand-navy"
        aria-label="Open menu"
      >
        {menuOpen ? <X size={28} /> : <Menu size={28} />}
      </button>

      {/* Slide-out Drawer */}
      {menuOpen && (
        <div className="absolute right-4 top-16 w-64 bg-white border border-gray-200 rounded-md shadow-sm z-50">
          <div className="flex flex-col py-2">
            {!isDemo && (
              <>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onAddVehicle();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-brand-bg"
                >
                  Add Vehicle
                </button>

                <div className="border-t my-1"></div>
              </>
            )}

            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/settings");
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-brand-bg"
            >
              Flip Preferences
            </button>

            <div className="border-t my-1"></div>

            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
