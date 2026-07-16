import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, UserX, Car, PlusCircle, ClipboardCheck, TrendingUp, Crown } from "lucide-react";
import adminApi from "../../utils/adminApi";
import { num } from "../../utils/adminFormat";
import MetricCard from "../../components/admin/MetricCard";
import { LoadingState, ErrorState } from "../../components/admin/AdminStates";
import {
  ChartCard,
  TimeSeriesChart,
  MultiTimeSeriesChart,
  HorizontalBarChart,
  DecisionPieChart,
} from "../../components/admin/AdminCharts";

const RANGES = [7, 30, 90];

export default function AdminOverview() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, au, av, ae] = await Promise.all([
        adminApi.overview(),
        adminApi.analyticsUsers(days),
        adminApi.analyticsVehicles(days),
        adminApi.analyticsEvaluations(days),
      ]);
      setOverview(ov);
      // Merge user registrations + activity into one dataset keyed by date.
      const byDate = {};
      const put = (arr, key) => {
        (arr || []).forEach((r) => {
          byDate[r.date] = byDate[r.date] || { date: r.date };
          byDate[r.date][key] = r.count;
        });
      };
      put(au.registrations, "registrations");
      put(au.activity, "activity");
      const userSeries = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      setAnalytics({
        userSeries,
        vehiclesAdded: av.added,
        evaluations: ae.evaluations,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !overview) return <LoadingState label="Loading overview…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!overview) return null;

  const c = overview.cards;
  const rangeSelector = (
    <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => setDays(r)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            days === r ? "bg-brand-navy text-white" : "text-slate-500 hover:bg-brand-bg"
          }`}
        >
          {r}d
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Total Users"
          value={num(c.total_users)}
          icon={Users}
          tone="blue"
          onClick={() => navigate("/admin/users")}
        />
        <MetricCard
          label="Active Users"
          value={num(c.active_users)}
          sub="Active in last 30 days"
          icon={UserCheck}
          tone="emerald"
          onClick={() => navigate("/admin/users?last_login_days=30")}
        />
        <MetricCard
          label="Inactive Users"
          value={num(c.inactive_users)}
          sub="No recent activity"
          icon={UserX}
          tone="slate"
          onClick={() => navigate("/admin/users")}
        />
        <MetricCard
          label="Total Vehicles"
          value={num(c.total_vehicles)}
          icon={Car}
          tone="purple"
          onClick={() => navigate("/admin/vehicles")}
        />
        <MetricCard
          label="Vehicles Added (30d)"
          value={num(c.vehicles_added_30d)}
          icon={PlusCircle}
          tone="blue"
          onClick={() => navigate("/admin/vehicles")}
        />
        <MetricCard
          label="Total Evaluations"
          value={num(c.total_evaluations)}
          sub="Vehicles with AI estimates"
          icon={ClipboardCheck}
          tone="emerald"
          onClick={() => navigate("/admin/vehicles")}
        />
        <MetricCard
          label="Avg Vehicles / User"
          value={num(c.avg_vehicles_per_user)}
          icon={TrendingUp}
          tone="amber"
        />
        <MetricCard
          label="Most Active User"
          value={c.most_active_user ? (c.most_active_user.name || c.most_active_user.email || "—") : "—"}
          sub={c.most_active_user ? `${num(c.most_active_user.vehicle_count)} vehicles` : undefined}
          icon={Crown}
          tone="purple"
          onClick={c.most_active_user ? () => navigate(`/admin/users/${c.most_active_user.id}`) : undefined}
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Trends
        </h2>
        {rangeSelector}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="User activity & registrations">
          <MultiTimeSeriesChart
            data={analytics?.userSeries}
            series={[
              { key: "activity", name: "Activity", color: "#2563eb" },
              { key: "registrations", name: "New users", color: "#10b981" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Vehicles added over time">
          <TimeSeriesChart data={analytics?.vehiclesAdded} color="#8b5cf6" name="Vehicles" />
        </ChartCard>
        <ChartCard title="Evaluations over time">
          <TimeSeriesChart data={analytics?.evaluations} color="#f59e0b" name="Evaluations" />
        </ChartCard>
        <ChartCard title="Buy vs Pass decisions">
          <DecisionPieChart data={overview.decisions} />
        </ChartCard>
        <ChartCard title="Most active users">
          <HorizontalBarChart
            data={(overview.most_active_users || []).map((u) => ({
              label: u.name || u.email || `#${u.id}`,
              count: u.vehicle_count,
            }))}
          />
        </ChartCard>
        <ChartCard title="Common vehicle makes">
          <HorizontalBarChart data={overview.common_makes} />
        </ChartCard>
        <ChartCard title="Common makes & models">
          <HorizontalBarChart data={overview.common_models} />
        </ChartCard>
      </div>
    </div>
  );
}
