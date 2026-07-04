import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Registration fields
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");

  const [zipError, setZipError] = useState("");
  const [status, setStatus] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const navigate = useNavigate();

  const apiBase = process.env.REACT_APP_API_BASE_URL || "";

  // ZIP Validator
  const validateZip = (value) => {
    const zipRegex = /^\d{5}(-\d{4})?$/;
    return zipRegex.test(value);
  };

  // -----------------------------------------
  // AUTH HANDLER
  // -----------------------------------------
  const handleAuth = async (endpoint) => {
    setStatus(endpoint === "login" ? "Logging in..." : "Registering...");

    // ZIP validation gate for registration
    if (isRegistering && zipCode && !validateZip(zipCode)) {
      setStatus("❌ Please enter a valid ZIP code");
      return;
    }

    try {
      const body = new URLSearchParams({
        username: email,
        password,
      });

      if (endpoint === "register") {
        body.append("name", name);
        body.append("street", street);
        body.append("city", city);
        body.append("state_code", stateCode);
        body.append("zip_code", zipCode);
        body.append("phone", phone);
      }

      const res = await fetch(`${apiBase}/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus(`❌ ${data?.detail || data?.message || "Request failed"}`);
        return;
      }

      if (endpoint === "login") {
        const token =
          data?.access_token ||
          data?.token ||
          data?.accessToken ||
          data?.data?.access_token;

        if (token) {
          localStorage.setItem("token", token);
          setStatus("✅ Login successful!");
          navigate("/");
        } else {
          setStatus("❌ No token in response");
        }
      } else {
        setStatus(data?.message || "✅ Registered! You can now log in.");
        setIsRegistering(false);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setStatus("❌ Connection error");
    }
  };

  // -----------------------------------------
  // UI
  // -----------------------------------------
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 px-4">
      <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md border border-gray-200">

        {/* Logo + Title */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Car Flip Analyzer" className="h-12 mb-3" />
          <h1 className="text-2xl font-semibold text-gray-800">
            Car Flip Analyzer
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isRegistering ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">

          {/* Registration-only fields */}
          {isRegistering && (
            <>
              {/* Name */}
              <div>
                <label className="block text-gray-700 text-sm mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>

              {/* Street */}
              <div>
                <label className="block text-gray-700 text-sm mb-1">Street</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>

              {/* City / State / ZIP */}
              <div className="flex space-x-2">
                {/* City */}
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                />

                {/* State */}
                <select
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-24 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">State</option>
                  {[
                    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID",
                    "IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS",
                    "MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
                    "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
                    "WI","WY"
                  ].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {/* ZIP */}
                <div className="flex flex-col w-28">
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setZipCode(val);

                      if (val.length > 0 && !validateZip(val)) {
                        setZipError("Invalid ZIP");
                      } else {
                        setZipError("");
                      }
                    }}
                    placeholder="ZIP"
                    className={`p-2 border ${
                      zipError ? "border-red-500" : "border-gray-300"
                    } rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900`}
                  />
                  {zipError && (
                    <p className="text-red-500 text-xs mt-1">{zipError}</p>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-gray-700 text-sm mb-1">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
            </>
          )}

          {/* Email */}
          <div>
            <label className="block text-gray-700 text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-gray-700 text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                // Prevent Enter from submitting the form from password field
                if (e.key === "Enter") {
                  e.preventDefault();
                }
              }}
              placeholder="••••••••"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
        </div>

        {/* Action Button */}
        <button
          id="authButton"
          onClick={() => handleAuth(isRegistering ? "register" : "login")}
          className="w-full mt-6 bg-gradient-to-r from-blue-600 to-teal-500 text-white py-2 rounded-lg font-medium hover:opacity-90 transition"
        >
          {isRegistering ? "Register" : "Login"}
        </button>

        {/* Switch Mode */}
        <p className="text-center text-gray-500 text-sm mt-6">
          {isRegistering ? "Already have an account?" : "Don’t have an account?"}{" "}
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-blue-600 font-medium hover:text-blue-700"
          >
            {isRegistering ? "Login" : "Register"}
          </button>
        </p>

        {/* Status */}
        {status && (
          <p className="text-center text-sm text-gray-600 mt-4">{status}</p>
        )}
      </div>
    </div>
  );
}
