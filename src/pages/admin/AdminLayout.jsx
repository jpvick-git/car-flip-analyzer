import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Car,
  Activity,
  Settings as SettingsIcon,
  ArrowLeft,
  Shield,
} from "lucide-react";

const TABS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/vehicles", label: "Vehicles", icon: Car },
  { to: "/admin/activity", label: "Activity", icon: Activity },
  { to: "/admin/settings", label: "System Settings", icon: SettingsIcon },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-xl bg-purple-100 p-2 text-purple-600">
            <Shield size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-brand-navy">Admin Console</h1>
            <p className="text-xs text-slate-500">Platform-wide visibility & controls</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-brand-navy text-white"
                  : "text-slate-600 hover:bg-brand-bg"
              }`
            }
          >
            <tab.icon size={15} />
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
