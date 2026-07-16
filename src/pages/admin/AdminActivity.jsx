import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import adminApi from "../../utils/adminApi";
import { dateTime } from "../../utils/adminFormat";
import Pagination from "../../components/admin/Pagination";
import StatusBadge from "../../components/admin/StatusBadge";
import FilterBar, { SelectFilter } from "../../components/admin/FilterBar";
import { LoadingState, ErrorState, EmptyState } from "../../components/admin/AdminStates";

const ACTION_TONES = {
  login: "green",
  logout: "slate",
  register: "blue",
  vehicle_create: "blue",
  vehicle_status_change: "amber",
  vehicle_outcome_update: "amber",
  vehicle_delete: "red",
  vehicle_repair_update: "slate",
  vehicle_transport_update: "slate",
  admin_update_user: "purple",
  admin_archive_vehicle: "purple",
  admin_restore_vehicle: "purple",
};

export default function AdminActivity() {
  const navigate = useNavigate();
  const [actionType, setActionType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.activity({
        action_type: actionType,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: 50,
      });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [actionType, dateFrom, dateTo, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [actionType, dateFrom, dateTo]);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;

  const actionOptions = (data?.action_types || []).map((a) => ({
    value: a,
    label: a.replace(/_/g, " "),
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <FilterBar>
        <SelectFilter
          value={actionType}
          onChange={setActionType}
          options={actionOptions}
          placeholder="All actions"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </label>
      </FilterBar>

      {loading ? (
        <LoadingState />
      ) : !data?.activity || data.activity.length === 0 ? (
        <EmptyState message="No activity recorded for these filters." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.activity.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <StatusBadge value={a.action_type} tone={ACTION_TONES[a.action_type]} label={a.action_type.replace(/_/g, " ")} />
              <span className="flex-1 min-w-[160px] text-slate-700">{a.description || "—"}</span>
              {a.user_id ? (
                <button
                  onClick={() => navigate(`/admin/users/${a.user_id}`)}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  {a.user_name || a.user_email || `User #${a.user_id}`}
                </button>
              ) : (
                <span className="text-xs text-slate-400">System</span>
              )}
              <span className="text-xs text-slate-400">
                {a.location ? `${a.location} · ${a.ip_address || ""}` : a.ip_address || ""}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{dateTime(a.created_at)}</span>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={data?.page || 1}
        pageSize={data?.page_size || 50}
        total={data?.total || 0}
        onPageChange={setPage}
      />
    </div>
  );
}
