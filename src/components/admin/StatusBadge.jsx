import React from "react";

const TONES = {
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  slate: "bg-slate-100 text-slate-600",
};

const STATUS_TONES = {
  active: "green",
  inactive: "slate",
  suspended: "red",
  disabled: "red",
  pending: "amber",
  super_admin: "purple",
  user: "slate",
  free: "slate",
  trial: "blue",
  past_due: "amber",
  canceled: "red",
  // deal statuses
  analyzing: "slate",
  watching: "blue",
  bought: "amber",
  in_repair: "amber",
  listed: "blue",
  sold: "green",
  passed: "slate",
  BUY: "green",
  PASS: "red",
  PENDING: "slate",
};

export default function StatusBadge({ value, tone, label }) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-400">—</span>;
  const key = String(value);
  const resolved = tone || STATUS_TONES[key] || "slate";
  const text = label || key.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TONES[resolved]}`}
    >
      {text}
    </span>
  );
}
