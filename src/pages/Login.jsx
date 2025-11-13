import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const navigate = useNavigate();

  const apiBase =
    process.env.NODE_ENV === "development"
      ? "http://localhost:8000"
      : "https://api.carflipanalyzer.com";

  const handleAuth = async (endpoint) => {
    setStatus(endpoint === "login" ? "Logging in..." : "Registering...");
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

      const res = await fetch(`${apiBase}/${endpoint}`, {
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
          data?.access_token || data?.token || data?.data?.access_token;
        if (token) {
          localStorage.setItem("token", token);
          setStatus("✅ Login successful!");
          navigate("/");
        } else setStatus("❌ No token in response");
      } else {
        setStatus(data?.message || "✅ Registered! You can now log in.");
        setIsRegistering(false);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setStatus("❌ Connection error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 px-4">
      <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md border border-gray-200">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Car Flip Analyzer" className="h-12 mb-3" />
          <h1 className="text-2xl font-semibold text-gray-800">
            Car Flip Analyzer
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isRegistering ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        {/* Core fields */}
        <div className="space-y-4">
          {isRegistering && (
            <>
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
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
                <input
                  type="text"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  placeholder="State"
                  className="w-20 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="ZIP"
                  className="w-28 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
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

          <div>
            <label className="block text-gray-700 text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
        </div>

        <button
          onClick={() => handleAuth(isRegistering ? "register" : "login")}
          className="w-full mt-6 bg-gradient-to-r from-blue-600 to-teal-500 text-white py-2 rounded-lg font-medium hover:opacity-90 transition"
        >
          {isRegistering ? "Register" : "Login"}
        </button>

        <p className="text-center text-gray-500 text-sm mt-6">
          {isRegistering ? "Already have an account?" : "Don’t have an account?"}{" "}
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-blue-600 font-medium hover:text-blue-700"
          >
            {isRegistering ? "Login" : "Register"}
          </button>
        </p>

        {status && (
          <p className="text-center text-sm text-gray-600 mt-4">{status}</p>
        )}
      </div>
    </div>
  );
}
