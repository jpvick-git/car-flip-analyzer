import React from "react";
import { AlertTriangle } from "lucide-react";
import { parseRedFlags } from "../utils/vehicleSource";

export default function RedFlagsCard({ car, className = "" }) {
  const flags = parseRedFlags(car);
  if (!flags.length) return null;

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm ${className}`}
    >
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-700">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-100 text-red-600">
          <AlertTriangle size={13} />
        </span>
        Red Flags
      </h3>
      <ul className="space-y-2">
        {flags.map((flag, idx) => (
          <li key={idx} className="flex gap-2 text-sm leading-relaxed text-red-800">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {flag}
          </li>
        ))}
      </ul>
    </section>
  );
}
