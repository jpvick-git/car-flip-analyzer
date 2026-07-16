import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-brand-green focus:ring-4 focus:ring-brand-green/15";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const apiBase = process.env.REACT_APP_API_BASE_URL || "";

  const handleRegister = async (e) => {
    if (e) e.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setStatus("Please enter your email and password.");
      setStatusType("error");
      return;
    }

    if (!emailPattern.test(trimmedEmail)) {
      setStatus("Please enter a valid email address.");
      setStatusType("error");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      setStatusType("error");
      return;
    }

    setIsLoading(true);
    setStatus("Creating your account...");
    setStatusType("info");

    try {
      const body = new URLSearchParams({
        username: trimmedEmail,
        password,
      });

      if (name.trim()) body.append("name", name.trim());
      if (phone.trim()) body.append("phone", phone.trim());
      if (street.trim()) body.append("street", street.trim());
      if (city.trim()) body.append("city", city.trim());
      if (stateCode.trim()) body.append("state_code", stateCode.trim());
      if (zipCode.trim()) body.append("zip_code", zipCode.trim());

      const res = await fetch(`${apiBase}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = data?.detail;
        setStatus(
          typeof detail === "string"
            ? detail
            : data?.message || "Registration failed."
        );
        setStatusType("error");
        return;
      }

      setStatus("Account created. Redirecting to sign in...");
      setStatusType("success");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      console.error("Fetch error:", err);
      setStatus("Connection error. Please try again.");
      setStatusType("error");
    } finally {
      setIsLoading(false);
    }
  };

  const statusStyles = {
    info: "bg-brand-green-light text-brand-navy border-brand-green/30",
    success: "bg-green-50 text-green-700 border-green-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="min-h-screen bg-brand-navy flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1600&q=80"
          alt="Professional car showroom"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-br from-brand-navy/95 via-brand-navy/70 to-brand-green/30" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <BrandLogo size="lg" variant="onDark" />
            <p className="mt-2 text-sm text-slate-300">
              Smarter decisions for every flip
            </p>
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
                <p className="text-2xl font-bold text-brand-green">ROI</p>
                <p className="mt-1 text-sm text-slate-300">Profit estimates</p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-brand-green">AI</p>
                <p className="mt-1 text-sm text-slate-300">Deal scoring</p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-brand-green">VIN</p>
                <p className="mt-1 text-sm text-slate-300">Vehicle details</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-screen w-full lg:w-1/2 items-center justify-center px-5 py-10 bg-brand-bg">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <BrandLogo size="xl" />
            <p className="text-slate-500 text-sm mt-2">Create your account</p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200 p-8">
            <div className="mb-8">
              <p className="text-sm font-medium text-brand-green">Get started</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy">
                Create your account
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Email and password are required. Profile details are optional.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
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
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-500 mb-3">
                  Profile details (optional)
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Full name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      autoComplete="name"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                      autoComplete="tel"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Street address
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="123 Main St"
                      autoComplete="street-address"
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        City
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Austin"
                        autoComplete="address-level2"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        State
                      </label>
                      <input
                        type="text"
                        value={stateCode}
                        onChange={(e) => setStateCode(e.target.value)}
                        placeholder="TX"
                        autoComplete="address-level1"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      ZIP code
                    </label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="78701"
                      autoComplete="postal-code"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-brand-green px-4 py-3 font-semibold text-white shadow-lg shadow-brand-green/25 transition hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Creating account..." : "Create account"}
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

            <p className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-medium text-brand-green hover:text-brand-green-dark"
              >
                Sign in
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Secure access to your CarFlipAnalyzer workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
