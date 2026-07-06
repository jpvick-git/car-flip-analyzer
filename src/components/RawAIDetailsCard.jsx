import React, { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { isPrivateParty } from "../utils/vehicleSource";

export default function RawAIDetailsCard({ car }) {
  const [open, setOpen] = useState(false);

  const isPrivate = isPrivateParty(car);
  const sections = [
    car?.resale_details && {
      title: isPrivate ? "Retail Exit Analysis" : "Resale Analysis",
      body: car.resale_details,
    },
    car?.reliability_summary && {
      title: "Platform Reliability Summary",
      body: car.reliability_summary,
    },
    car?.offer_rationale && {
      title: "Offer Rationale",
      body: car.offer_rationale,
    },
  ].filter(Boolean);

  if (!sections.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
            <FileText size={13} />
          </span>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Raw AI Details
            </h3>
            <p className="text-[11px] text-slate-400">Full AI narratives not shown above</p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          {sections.map((section) => (
            <div key={section.title}>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section.title}
              </h4>
              <p className="text-sm leading-relaxed text-slate-600">{section.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
