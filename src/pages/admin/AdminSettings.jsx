import React from "react";
import { Shield, Database, Activity, Lock } from "lucide-react";
import { useUserSettings } from "../../context/UserSettingsContext";

function InfoCard({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-xl bg-brand-bg p-2 text-brand-navy">
          <Icon size={18} />
        </span>
        <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      </div>
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  );
}

export default function AdminSettings() {
  const { settings } = useUserSettings();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <InfoCard icon={Shield} title="Your access">
        <p>
          You are signed in as a <strong className="text-purple-600">super admin</strong>. You have
          full read access to all accounts and can manage user roles, account status, and vehicle
          archiving.
        </p>
        <p className="mt-2 text-xs text-slate-400">Role: {settings?.role || "user"}</p>
      </InfoCard>

      <InfoCard icon={Lock} title="Security">
        <ul className="list-disc space-y-1 pl-4">
          <li>All admin endpoints require the super admin role (server-enforced).</li>
          <li>Destructive actions are confirmed and never permanently delete data.</li>
          <li>Every admin action is written to the activity log.</li>
        </ul>
      </InfoCard>

      <InfoCard icon={Activity} title="Activity tracking">
        <p>
          Logins, registrations, vehicle changes, and admin actions are recorded with timestamp, IP,
          and device details. Review them under the Activity tab.
        </p>
      </InfoCard>

      <InfoCard icon={Database} title="Data & subscriptions">
        <p>
          Subscription status is a manual display field (no billing is wired). Archived vehicles are
          hidden from owner dashboards but retained for analytics and can be restored at any time.
        </p>
      </InfoCard>
    </div>
  );
}
