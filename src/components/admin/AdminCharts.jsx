import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { EmptyState } from "./AdminStates";

const PALETTE = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#ec4899", "#14b8a6"];

export function ChartCard({ title, children, action }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function TimeSeriesChart({ data, dataKey = "count", color = "#2563eb", name = "Count" }) {
  if (!data || data.length === 0) return <EmptyState message="No data for this range." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MultiTimeSeriesChart({ data, series }) {
  if (!data || data.length === 0) return <EmptyState message="No data for this range." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color || PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({ data, dataKey = "count", labelKey = "label" }) {
  if (!data || data.length === 0) return <EmptyState message="No data yet." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, left: 10, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={120}
          tick={{ fontSize: 11, fill: "#64748b" }}
        />
        <Tooltip />
        <Bar dataKey={dataKey} radius={[0, 6, 6, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DecisionPieChart({ data, dataKey = "count", labelKey = "label" }) {
  if (!data || data.length === 0) return <EmptyState message="No decisions yet." />;
  const colorFor = (label) => {
    const up = String(label).toUpperCase();
    if (up === "BUY") return "#10b981";
    if (up === "PASS") return "#ef4444";
    return "#94a3b8";
  };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={labelKey}
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={(e) => `${e.name}: ${e.value}`}
          labelLine={false}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={colorFor(entry[labelKey])} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
