import React, { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Header({ onAddVehicle, onUploadCSV, logout, isDemo }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white shadow">
      {/* Logo + Title */}
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="logo" className="h-10 w-auto" />
        <span className="text-xl font-semibold text-gray-900">
          Car Flip Analyzer
        </span>
        {isDemo && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            Demo
          </span>
        )}
      </div>

      {/* Hamburger Button */}
      <button onClick={() => setMenuOpen(!menuOpen)} className="p-1">
        {menuOpen ? (
          <X size={28} color="black" />
        ) : (
          <Menu size={28} color="black" />
        )}
      </button>

      {/* Slide-out Drawer */}
		{menuOpen && (
		  <div className="absolute right-4 top-16 w-64 bg-white border border-gray-200 rounded-md shadow-sm z-50">
			<div className="flex flex-col py-2">

			  {!isDemo && (
			    <>
			  {/* Upload CSV */}
			  <button
				onClick={() => {
				  setMenuOpen(false);
				  onUploadCSV();
				}}
				className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-gray-100"
			  >
				Upload CSV
			  </button>

			  {/* Add Vehicle */}
			  <button
				onClick={() => {
				  setMenuOpen(false);
				  onAddVehicle();
				}}
				className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-gray-100"
			  >
				Add Vehicle
			  </button>

			  <div className="border-t my-1"></div>
			    </>
			  )}

			  {/* Logout */}
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
