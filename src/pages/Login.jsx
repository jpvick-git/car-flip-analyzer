import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchUserSettings } from "../utils/userSettings";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const apiBase = process.env.REACT_APP_API_BASE_URL || "";

  const handleLogin = async (e) => {
    if (e) e.preventDefault();

    if (!email || !password) {
      setStatus("Please enter your email and password.");
      setStatusType("error");
      return;
    }

    setIsLoading(true);
    setStatus("Logging in...");
    setStatusType("info");

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
        setStatus(data?.detail || data?.message || "Login failed.");
        setStatusType("error");
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

        await fetchUserSettings(apiBase).catch(() => {});

        window.dispatchEvent(new Event("auth-changed"));

        setStatus("Login successful.");
        setStatusType("success");

        navigate("/");
      } else {
        setStatus("No token was returned from the server.");
        setStatusType("error");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setStatus("Connection error. Please try again.");
      setStatusType("error");
    } finally {
      setIsLoading(false);
    }
  };

  const statusStyles = {
    info: "bg-blue-50 text-blue-700 border-blue-200",
    success: "bg-green-50 text-green-700 border-green-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left image / brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1600&q=80"
          alt="Professional car showroom"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/65 to-blue-950/40" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="Car Flip Analyzer"
                className="h-7 w-7 object-contain"
              />
            </div>

            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Car Flip Analyzer
              </h1>
              <p className="text-sm text-slate-300">
                Smarter decisions for every flip
              </p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-slate-200 backdrop-blur">
              AI-powered vehicle analysis
            </div>

            <h2 className="mt-6 text-5xl font-bold tracking-tight leading-tight">
              Find the right car before your money is tied up.
            </h2>

            <p className="mt-5 text-lg text-slate-200 leading-8">
              Analyze purchase price, repair costs, market value, transportation,
              and resale potential from one clean dashboard.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4 max-w-lg">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl font-bold">ROI</p>
                <p className="mt-1 text-sm text-slate-300">Profit estimates</p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl font-bold">AI</p>
                <p className="mt-1 text-sm text-slate-300">Deal scoring</p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl font-bold">VIN</p>
                <p className="mt-1 text-sm text-slate-300">Vehicle details</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Built for independent car flippers, side hustlers, and small dealers.
          </p>
        </div>
      </div>

      {/* Login panel */}
      <div className="flex min-h-screen w-full lg:w-1/2 items-center justify-center px-5 py-10 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img src="/logo.png" alt="Car Flip Analyzer" className="h-14 mb-3" />
            <h1 className="text-2xl font-bold text-slate-900">
              Car Flip Analyzer
            </h1>
            <p className="text-slate-500 text-sm mt-1">Sign in to continue</p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200 p-8">
            <div className="mb-8">
              <p className="text-sm font-medium text-blue-600">
                Welcome back
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                Sign in to your account
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Enter your credentials to access your vehicle dashboard.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                </div>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <button
                id="authButton"
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            {status && (
              <div
                className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                  statusStyles[statusType] || statusStyles.info
                }`}
              >
                {status}
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Secure access to your Car Flip Analyzer workspace.
          </p>
        </div>
      </div>
    </div>
  );
}