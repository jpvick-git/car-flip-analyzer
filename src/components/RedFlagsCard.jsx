import React from "react";
import { AlertTriangle } from "lucide-react";
import { parseRedFlags } from "../utils/vehicleSource";

export default function RedFlagsCard({ car, className = "" }) {
  const flags = parseRedFlags(car);

  return (
    <section
      className={`overflow-hidden rounded-2xl border p-5 shadow-sm ${
        flags.length
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-white"
      } ${className}`}
    >
      <h3
        className={`mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
          flags.length ? "text-red-700" : "text-slate-400"
        }`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md ${
            flags.length ? "bg-red-100 text-red-600" : "bg-brand-bg text-slate-500"
          }`}
        >
          <AlertTriangle size={13} />
        </span>
        Red Flags
      </h3>
      {flags.length > 0 ? (
        <ul className="space-y-2">
          {flags.map((flag, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed text-red-800">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              {flag}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No red flags identified for this listing.</p>
      )}
    </section>
  );
}
