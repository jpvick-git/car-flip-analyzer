import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Clock, Globe } from "lucide-react";
import adminApi from "../../utils/adminApi";
import { money, num, dateShort, relativeTime, dateTime, vehicleName } from "../../utils/adminFormat";
import { LoadingState, ErrorState, EmptyState } from "../../components/admin/AdminStates";
import StatusBadge from "../../components/admin/StatusBadge";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import { SelectFilter } from "../../components/admin/FilterBar";
import AdminTable from "../../components/admin/AdminTable";

const ROLE_OPTS = [
  { value: "user", label: "User" },
  { value: "super_admin", label: "Super Admin" },
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

function InfoRow({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <Icon size={15} className="text-slate-400" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-brand-navy">{value}</p>
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [pendingChange, setPendingChange] = useState(null); // {field, value, label}
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, v, a] = await Promise.all([
        adminApi.user(id),
        adminApi.userVehicles(id, { page_size: 50 }),
        adminApi.userActivity(id, { page_size: 20 }),
      ]);
      setUser(u);
      setVehicles(v.vehicles);
      setActivity(a.activity);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const applyChange = async () => {
    if (!pendingChange) return;
    setBusy(true);
    try {
      const updated = await adminApi.updateUser(id, {
        [pendingChange.field]: pendingChange.value,
      });
      setUser(updated);
      setPendingChange(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading user…" />;
  if (error && !user) return <ErrorState message={error} onRetry={load} />;
  if (!user) return null;

  const s = user.activity_summary || {};

  const vehicleColumns = [
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
          <span className="font-medium text-brand-navy">{vehicleName(r)}</span>
        </div>
      ),
    },
    { key: "deal_status", label: "Status", render: (r) => <StatusBadge value={r.deal_status} /> },
    { key: "flip_recommendation", label: "Decision", render: (r) => <StatusBadge value={r.flip_recommendation} /> },
    { key: "actual_sale_price", label: "Sale", align: "right", render: (r) => money(r.actual_sale_price) },
    { key: "realized_profit", label: "Profit", align: "right", render: (r) => money(r.realized_profit) },
  ];

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate("/admin/users")}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-brand-navy"
      >
        <ArrowLeft size={15} /> All users
      </button>

      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Profile + actions */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-brand-navy">{user.name || "Unnamed user"}</h2>
            <div className="mt-3 space-y-2">
              <InfoRow icon={Mail}>{user.email}</InfoRow>
              {user.phone && <InfoRow icon={Phone}>{user.phone}</InfoRow>}
              {user.location && <InfoRow icon={MapPin}>{user.location}</InfoRow>}
              <InfoRow icon={Calendar}>Joined {dateShort(user.created_at)}</InfoRow>
              <InfoRow icon={Clock}>Last login {relativeTime(user.last_login_at)}</InfoRow>
              {user.last_login_location && (
                <InfoRow icon={Globe}>From {user.last_login_location}</InfoRow>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge value={user.role} />
              <StatusBadge value={user.account_status} />
              <StatusBadge value={user.subscription_status} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-brand-navy">Admin actions</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Role</span>
                <SelectFilter
                  value={user.role}
                  onChange={(value) =>
                    setPendingChange({ field: "role", value, label: `role to "${value}"` })
                  }
                  options={ROLE_OPTS}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Account status</span>
                <SelectFilter
                  value={user.account_status}
                  onChange={(value) =>
                    setPendingChange({ field: "account_status", value, label: `account status to "${value}"` })
                  }
                  options={STATUS_OPTS}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Subscription</span>
                <SelectFilter
                  value={user.subscription_status}
                  onChange={(value) =>
                    setPendingChange({ field: "subscription_status", value, label: `subscription to "${value}"` })
                  }
                  options={SUB_OPTS}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Activity summary + lists */}
        <div className="space-y-5 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatBox label="Total Vehicles" value={num(s.total_vehicles)} />
            <StatBox label="Evaluations" value={num(s.total_evaluations)} />
            <StatBox label="Sold" value={num(s.sold_count)} />
            <StatBox label="Buy calls" value={num(s.buy_count)} />
            <StatBox label="Passed" value={num(s.pass_count)} />
            <StatBox label="Realized profit" value={money(s.realized_profit_total)} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-brand-navy">Vehicles</h3>
            </div>
            <AdminTable
              columns={vehicleColumns}
              rows={vehicles}
              onRowClick={(r) => navigate(`/vehicle/${r.public_id}`)}
              emptyMessage="This user has no vehicles."
              rowKey={(r) => r.public_id || r.id}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-brand-navy">Recent activity</h3>
            </div>
            {!activity || activity.length === 0 ? (
              <EmptyState message="No recorded activity." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700">
                        {a.description || a.action_type}
                      </p>
                      <p className="text-xs text-slate-400">
                        {a.action_type}
                        {a.location ? ` · ${a.location}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{dateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingChange}
        title="Confirm change"
        message={pendingChange ? `Change ${user.name || user.email}'s ${pendingChange.label}?` : ""}
        confirmLabel="Apply"
        tone="primary"
        busy={busy}
        onConfirm={applyChange}
        onCancel={() => setPendingChange(null)}
      />
    </div>
  );
}
