import React from "react";
import { Loader2, AlertTriangle, Inbox } from "lucide-react";

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="animate-spin" size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="text-red-500" size={28} />
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = "Nothing to show yet.", icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Icon size={28} className="text-slate-300" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
