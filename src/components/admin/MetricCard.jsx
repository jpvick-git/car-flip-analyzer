import React from "react";

export default function MetricCard({ label, value, sub, icon: Icon, onClick, tone = "blue" }) {
  const tones = {
    blue: "text-blue-600 bg-blue-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    purple: "text-purple-600 bg-purple-50",
    slate: "text-slate-600 bg-slate-100",
  };
  const clickable = typeof onClick === "function";
  const Wrapper = clickable ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition ${
        clickable ? "hover:border-blue-300 hover:shadow-md" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-brand-navy">{value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
      </div>
      {Icon && (
        <span className={`shrink-0 rounded-xl p-2 ${tones[tone] || tones.blue}`}>
          <Icon size={18} />
        </span>
      )}
    </Wrapper>
  );
}
