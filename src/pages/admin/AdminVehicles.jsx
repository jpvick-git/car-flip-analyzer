import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, RotateCcw } from "lucide-react";
import adminApi from "../../utils/adminApi";
import { money, num, dateShort, vehicleName } from "../../utils/adminFormat";
import AdminTable from "../../components/admin/AdminTable";
import Pagination from "../../components/admin/Pagination";
import StatusBadge from "../../components/admin/StatusBadge";
import MetricCard from "../../components/admin/MetricCard";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import FilterBar, { SearchInput, SelectFilter } from "../../components/admin/FilterBar";
import { ErrorState } from "../../components/admin/AdminStates";
import { Car, CheckCircle2, DollarSign, TrendingUp } from "lucide-react";

const STATUS_OPTS = [
  { value: "analyzing", label: "Analyzing" },
  { value: "watching", label: "Watching" },
  { value: "bought", label: "Bought" },
  { value: "in_repair", label: "In repair" },
  { value: "listed", label: "Listed" },
  { value: "sold", label: "Sold" },
  { value: "passed", label: "Passed" },
];
const DECISION_OPTS = [
  { value: "BUY", label: "Buy" },
  { value: "PASS", label: "Pass" },
];

export default function AdminVehicles() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [dealStatus, setDealStatus] = useState("");
  const [decision, setDecision] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState({ sortBy: "created_at", sortDir: "desc" });
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.vehicles({
        search,
        deal_status: dealStatus,
        decision,
        include_archived: includeArchived,
        sort_by: sort.sortBy,
        sort_dir: sort.sortDir,
        page,
        page_size: 25,
      });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, dealStatus, decision, includeArchived, sort, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, dealStatus, decision, includeArchived, sort]);

  const toggleArchive = async () => {
    if (!pendingArchive) return;
    setBusy(true);
    try {
      if (pendingArchive.archived_at) {
        await adminApi.restoreVehicle(pendingArchive.public_id);
      } else {
        await adminApi.archiveVehicle(pendingArchive.public_id);
      }
      setPendingArchive(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const summary = data?.summary || {};

  const columns = [
    {
      key: "vehicle",
      label: "Vehicle",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          {r.image_url ? (
            <img src={r.image_url} alt="" className="h-9 w-12 rounded object-cover" />
          ) : (
            <div className="h-9 w-12 rounded bg-slate-100" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-brand-navy">{vehicleName(r)}</p>
            {r.vin && <p className="truncate text-xs text-slate-400">{r.vin}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      label: "Owner",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-slate-700">{r.owner_name || "—"}</p>
          <p className="truncate text-xs text-slate-400">{r.owner_email}</p>
        </div>
      ),
    },
    { key: "deal_status", label: "Status", render: (r) => <StatusBadge value={r.deal_status} /> },
    { key: "flip_recommendation", label: "Decision", render: (r) => <StatusBadge value={r.flip_recommendation} /> },
    { key: "actual_sale_price", label: "Sale", sortable: true, align: "right", render: (r) => money(r.actual_sale_price) },
    { key: "profit", label: "Profit", sortable: true, align: "right", render: (r) => money(r.realized_profit) },
    { key: "created_at", label: "Added", sortable: true, render: (r) => dateShort(r.created_at) },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPendingArchive(r);
          }}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          title={r.archived_at ? "Restore" : "Archive"}
        >
          {r.archived_at ? <RotateCcw size={16} /> : <Archive size={16} />}
        </button>
      ),
    },
  ];

  if (error && !data) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Vehicles (filtered)" value={num(summary.count)} icon={Car} tone="blue" />
        <MetricCard label="Sold" value={num(summary.sold)} icon={CheckCircle2} tone="emerald" />
        <MetricCard label="Realized profit" value={money(summary.realized_profit_total)} icon={DollarSign} tone="amber" />
        <MetricCard label="Avg profit / sale" value={money(summary.avg_profit)} icon={TrendingUp} tone="purple" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search VIN, make, model, owner…" />
          <SelectFilter value={dealStatus} onChange={setDealStatus} options={STATUS_OPTS} placeholder="All statuses" />
          <SelectFilter value={decision} onChange={setDecision} options={DECISION_OPTS} placeholder="All decisions" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show archived
          </label>
        </FilterBar>

        <AdminTable
          columns={columns}
          rows={data?.vehicles}
          sort={sort}
          onSort={(sortBy, sortDir) => setSort({ sortBy, sortDir })}
          onRowClick={(r) => navigate(`/vehicle/${r.public_id}`)}
          loading={loading}
          emptyMessage="No vehicles match these filters."
          rowKey={(r) => r.public_id || r.id}
        />

        <Pagination
          page={data?.page || 1}
          pageSize={data?.page_size || 25}
          total={data?.total || 0}
          onPageChange={setPage}
        />
      </div>

      <ConfirmDialog
        open={!!pendingArchive}
        title={pendingArchive?.archived_at ? "Restore vehicle" : "Archive vehicle"}
        message={
          pendingArchive
            ? `${pendingArchive.archived_at ? "Restore" : "Archive"} ${vehicleName(pendingArchive)}? ${
                pendingArchive.archived_at
                  ? "It will reappear in the owner's dashboard."
                  : "It will be hidden from the owner's dashboard (not deleted)."
              }`
            : ""
        }
        confirmLabel={pendingArchive?.archived_at ? "Restore" : "Archive"}
        tone={pendingArchive?.archived_at ? "primary" : "danger"}
        busy={busy}
        onConfirm={toggleArchive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  );
}
