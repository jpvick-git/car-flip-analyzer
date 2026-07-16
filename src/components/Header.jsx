import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X, Plus, Settings, LogOut, BarChart3, LayoutDashboard, Calculator, Shield, User, Store } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { useUserSettings } from "../context/UserSettingsContext";
import { isDealer } from "../utils/businessMode";
import { isSuperAdmin } from "../utils/userSettings";

export default function Header({ onAddVehicle, onUploadCSV, logout, isDemo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const navigate = useNavigate();
  const { settings, updateSettings } = useUserSettings();
  const dealer = isDealer(settings);
  const superAdmin = isSuperAdmin(settings);

  const switchMode = async (value) => {
    if (switching || value === (settings?.business_type || "flipper")) return;
    setSwitching(true);
    try {
      await updateSettings({ business_type: value });
    } catch (err) {
      console.error("Mode switch failed:", err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" />
          {isDemo && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              Demo
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isDemo && (
            <div
              className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-0.5"
              role="group"
              aria-label="Account mode"
            >
              {[
                ["flipper", "Flip", User],
                ["dealer", "Lot", Store],
              ].map(([value, label, Icon]) => {
                const active = (settings?.business_type || "flipper") === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => switchMode(value)}
                    disabled={switching}
                    title={value === "dealer" ? "Used Car Lot mode" : "Flipper mode"}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                      active
                        ? "bg-white text-brand-navy shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon size={13} className={active ? "text-brand-green" : "text-slate-400"} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-xl p-2 text-brand-navy transition hover:bg-brand-bg"
            aria-label="Open menu"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="absolute right-3 top-[calc(100%-0.25rem)] z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80 sm:right-5">
          <div className="flex flex-col p-1.5">
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-brand-bg"
            >
              <LayoutDashboard size={16} className="text-slate-500" />
              Dashboard
            </button>

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

            {dealer && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/appraise");
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-brand-bg"
              >
                <Calculator size={16} className="text-blue-600" />
                Buy Calculator
              </button>
            )}

            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/portfolio");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-brand-bg"
            >
              <BarChart3 size={16} className="text-emerald-600" />
              Portfolio
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/settings");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-brand-bg"
            >
              <Settings size={16} className="text-slate-500" />
              {dealer ? "Lot Preferences" : "Flip Preferences"}
            </button>

            {superAdmin && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/admin");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-brand-bg"
                >
                  <Shield size={16} className="text-purple-600" />
                  Admin
                </button>
              </>
            )}

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
