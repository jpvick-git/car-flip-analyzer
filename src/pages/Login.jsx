import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const navigate = useNavigate();

  // 🔧 Force production API (works for both local + deployed)
  const apiBase =
    process.env.NODE_ENV === "development"
      ? "http://localhost:8000"
      : "https://api.carflipanalyzer.com";

  // -----------------------------------------
  // AUTH HANDLERS
  // -----------------------------------------
  const handleAuth = async (endpoint) => {
    setStatus(endpoint === "login" ? "Logging in..." : "Registering...");
    try {
      const res = await fetch(`${apiBase}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: email, password }),
      });

      // ✅ Corrected data parsing
      const data = await res.json().catch(() => null);
      console.log("🔍 Response:", data);

      if (!res.ok) {
        setStatus(
          `❌ ${data?.detail || data?.message || "Login request failed"}`
        );
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
          navigate("/"); // redirect to dashboard
        } else {
          setStatus("❌ No token found in response");
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
        {/* Logo and Title */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Car Flip Analyzer" className="h-12 mb-3" />
          <h1 className="text-2xl font-semibold text-gray-800">
            Car Flip Analyzer
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isRegistering ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-gray-700 text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={() => handleAuth(isRegistering ? "register" : "login")}
          className="w-full mt-6 bg-gradient-to-r from-blue-600 to-teal-500 text-white py-2 rounded-lg font-medium hover:opacity-90 transition"
        >
          {isRegistering ? "Register" : "Login"}
        </button>

        <div className="flex justify-between items-center text-sm text-gray-500 mt-4">
          <label className="flex items-center">
            <input type="checkbox" className="mr-2 rounded border-gray-300" />
            Remember me
          </label>
          <button
            type="button"
            className="text-blue-600 hover:text-blue-700"
            onClick={() => alert("Password reset coming soon!")}
          >
            Forgot password?
          </button>
        </div>

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
