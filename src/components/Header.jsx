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

  // ✅ Your authorized IP
  const allowedIP = "68.186.200.184";

  // --------------------------------------------------
  // GET USER IP
  // --------------------------------------------------
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => {
        setUserIP(data.ip);
        if (data.ip === allowedIP) {
          setIsAllowed(true);
        }
      })
      .catch((err) => console.error("Failed to get IP:", err));
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        {/* Left: Logo + App Name */}
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

        {/* Right: Upload + Menu */}
        <div className="flex items-center gap-4">
          {/* Upload Section (only visible to allowed IP) */}
          {isAllowed && (
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadFile(e.target.files[0])}
                className="text-sm text-gray-700 border border-gray-300 rounded-md px-2 py-1 bg-gray-50 hover:bg-gray-100 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                onClick={uploadUserFile}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition"
              >
                Upload CSV
              </button>
            </div>
          )}

          {/* Hamburger Menu */}
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

      {/* Optional: show detected IP in small footer line for you */}
      {!isAllowed && (
        <p className="text-center text-xs text-gray-400 pb-1">
          Uploads restricted — your IP: <span className="font-mono">{userIP || "..."}</span>
        </p>
      )}
    </header>
  );
}
