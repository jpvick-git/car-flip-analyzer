import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X, Plus, Settings, LogOut } from "lucide-react";
import BrandLogo from "./BrandLogo";

export default function Header({ onAddVehicle, onUploadCSV, logout, isDemo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" />
          {isDemo && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              Demo
            </span>
          )}
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-xl p-2 text-brand-navy transition hover:bg-brand-bg"
          aria-label="Open menu"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-4 top-[calc(100%-0.25rem)] z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80 sm:right-6">
          <div className="flex flex-col p-1.5">
            {!isDemo && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onAddVehicle();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-brand-bg"
              >
                <Plus size={16} className="text-blue-600" />
                Add Vehicle
              </button>
            )}

            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/settings");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-brand-bg"
            >
              <Settings size={16} className="text-slate-500" />
              Flip Preferences
            </button>

            <div className="my-1 border-t border-slate-100" />

            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
