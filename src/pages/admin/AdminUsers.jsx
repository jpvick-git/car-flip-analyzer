import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import adminApi from "../../utils/adminApi";
import { num, relativeTime } from "../../utils/adminFormat";
import AdminTable from "../../components/admin/AdminTable";
import Pagination from "../../components/admin/Pagination";
import StatusBadge from "../../components/admin/StatusBadge";
import FilterBar, { SearchInput, SelectFilter } from "../../components/admin/FilterBar";
import { ErrorState } from "../../components/admin/AdminStates";

const ROLE_OPTS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "user", label: "User" },
];
const STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "pending", label: "Pending" },
  { value: "disabled", label: "Disabled" },
];
const SUB_OPTS = [
  { value: "free", label: "Free" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
];

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days));
  return d.toISOString();
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [subStatus, setSubStatus] = useState("");
  const [lastLoginFrom, setLastLoginFrom] = useState(
    searchParams.get("last_login_days") ? daysAgoISO(searchParams.get("last_login_days")) : ""
  );
  const [sort, setSort] = useState({ sortBy: "created_at", sortDir: "desc" });
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.users({
        search,
        role,
        account_status: accountStatus,
        subscription_status: subStatus,
        last_login_from: lastLoginFrom,
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
  }, [search, role, accountStatus, subStatus, lastLoginFrom, sort, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, role, accountStatus, subStatus, lastLoginFrom, sort]);

  const columns = [
    {
      key: "name",
      label: "User",
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-brand-navy">{r.name || "—"}</p>
          <p className="truncate text-xs text-slate-500">{r.email}</p>
        </div>
      ),
    },
    { key: "role", label: "Role", render: (r) => <StatusBadge value={r.role} /> },
    { key: "account_status", label: "Status", render: (r) => <StatusBadge value={r.account_status} /> },
    { key: "subscription_status", label: "Plan", render: (r) => <StatusBadge value={r.subscription_status} /> },
    { key: "total_vehicles", label: "Vehicles", sortable: true, align: "right", render: (r) => num(r.total_vehicles) },
    { key: "total_evaluations", label: "Evals", sortable: true, align: "right", render: (r) => num(r.total_evaluations) },
    { key: "login_count", label: "Logins", sortable: true, align: "right", render: (r) => num(r.login_count) },
    { key: "last_login_at", label: "Last login", sortable: true, render: (r) => relativeTime(r.last_login_at) },
  ];

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name or email…" />
        <SelectFilter value={role} onChange={setRole} options={ROLE_OPTS} placeholder="All roles" />
        <SelectFilter value={accountStatus} onChange={setAccountStatus} options={STATUS_OPTS} placeholder="All statuses" />
        <SelectFilter value={subStatus} onChange={setSubStatus} options={SUB_OPTS} placeholder="All plans" />
      </FilterBar>

      <AdminTable
        columns={columns}
        rows={data?.users}
        sort={sort}
        onSort={(sortBy, sortDir) => setSort({ sortBy, sortDir })}
        onRowClick={(r) => navigate(`/admin/users/${r.id}`)}
        loading={loading}
        emptyMessage="No users match these filters."
      />

      <Pagination
        page={data?.page || 1}
        pageSize={data?.page_size || 25}
        total={data?.total || 0}
        onPageChange={setPage}
      />
    </div>
  );
}
