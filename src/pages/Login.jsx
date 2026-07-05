import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const navigate = useNavigate();
  const apiBase = process.env.REACT_APP_API_BASE_URL || "";

  const handleLogin = async () => {
    setStatus("Logging in...");

    try {
      const body = new URLSearchParams({
        username: email,
        password,
      });

      const res = await fetch(`${apiBase}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus(`❌ ${data?.detail || data?.message || "Request failed"}`);
        return;
      }

      const token =
        data?.access_token ||
        data?.token ||
        data?.accessToken ||
        data?.data?.access_token;

      if (token) {
        localStorage.setItem("token", token);
        localStorage.setItem("is_demo", data?.is_demo ? "1" : "0");
        setStatus("✅ Login successful!");
        navigate("/");
      } else {
        setStatus("❌ No token in response");
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
          <p className="text-gray-500 text-sm mt-1">Sign in to continue</p>
        </div>

        <div className="space-y-4">
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleLogin();
                }
              }}
              placeholder="••••••••"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
        </div>

        <button
          id="authButton"
          onClick={handleLogin}
          className="w-full mt-6 bg-gradient-to-r from-blue-600 to-teal-500 text-white py-2 rounded-lg font-medium hover:opacity-90 transition"
        >
          Login
        </button>

        {status && (
          <p className="text-center text-sm text-gray-600 mt-4">{status}</p>
        )}
      </div>
    </div>
  );
}
