import React, { useState } from "react";
import axios from "axios";
import { Check, CircleDashed, Ban, ClipboardList } from "lucide-react";
import OutcomeLogModal from "./OutcomeLogModal";
import StageCaptureModal from "./StageCaptureModal";
import { useUserSettings } from "../context/UserSettingsContext";
import { isDealer } from "../utils/businessMode";
import {
  DEAL_STATUS,
  DEAL_STATUS_FLOW,
  dealStatus,
  statusLabel,
  computeRealizedProfit,
  formatSignedCurrency,
  ACQUIRED_STATUSES,
} from "../utils/dealLifecycle";

/**
 * Deal lifecycle tracker for the vehicle detail sidebar. One-tap status
 * advancement plus outcome logging. Marking a deal acquired freezes the
 * current app prediction so accuracy can be scored later.
 */
export default function DealTrackerCard({ car, apiBase = "", predictions = {}, readOnly = false, onUpdate, embedded = false }) {
  const { settings } = useUserSettings();
  const dealer = isDealer(settings);
  const status = dealStatus(car);
  const [busy, setBusy] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [capture, setCapture] = useState(null);
  const [error, setError] = useState(null);

  const currentIndex = DEAL_STATUS_FLOW.indexOf(status);
  const realized = computeRealizedProfit(car);

  const patchStatus = async (nextStatus, captureValues) => {
    if (readOnly) return false;
    setBusy(true);
    setError(null);
    try {
      const body = { deal_status: nextStatus };
      if (ACQUIRED_STATUSES.has(nextStatus) && car?.predicted_max_bid == null) {
        body.snapshot = {
          predicted_max_bid: toInt(predictions.maxBid),
          predicted_repair: toInt(predictions.repair),
          predicted_resale: toInt(predictions.resale),
          predicted_profit: Math.round(Number(predictions.profit) || 0),
        };
      }
      if (captureValues && Object.keys(captureValues).length) {
        body.capture = captureValues;
      }
      const res = await axios.patch(`${apiBase}/api/vehicle/${car.public_id}/status`, body, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      onUpdate?.(res.data);
      return true;
    } catch (err) {
      console.error("Status update failed:", err);
      setError(err.response?.data?.detail || "Could not update status.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAction = (nextStatus) => {
    if (nextStatus === DEAL_STATUS.SOLD) {
      setShowOutcome(true);
      return;
    }
    const cfg = captureConfig(status, nextStatus, car, predictions, dealer);
    if (cfg) {
      setCapture({ ...cfg, targetStatus: nextStatus });
      return;
    }
    patchStatus(nextStatus);
  };

  const submitCapture = async (values) => {
    const ok = await patchStatus(capture.targetStatus, values);
    if (ok) setCapture(null);
  };

  const skipCapture = async () => {
    const ok = await patchStatus(capture.targetStatus);
    if (ok) setCapture(null);
  };

  const actions = nextActions(status);

  return (
    <div className={embedded ? "" : "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"}>
      {!embedded && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Deal Tracker
          </h3>
          {status === DEAL_STATUS.PASSED && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
              <Ban size={12} /> Passed
            </span>
          )}
        </div>
      )}

      <div className={embedded ? "space-y-4" : "space-y-4 p-4"}>
        {/* Stepper */}
        <ol className="flex items-center justify-between">
          {DEAL_STATUS_FLOW.map((step, i) => {
            const done = currentIndex >= 0 && i <= currentIndex;
            const isCurrent = i === currentIndex;
            return (
              <li key={step} className="flex flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <span
                    className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done ? "bg-blue-500" : "bg-slate-200"}`}
                  />
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      done
                        ? "bg-blue-600 text-white"
                        : "border border-slate-300 bg-white text-slate-400"
                    } ${isCurrent ? "ring-2 ring-blue-500/30" : ""}`}
                  >
                    {done ? <Check size={13} /> : i + 1}
                  </span>
                  <span
                    className={`h-0.5 flex-1 ${
                      i === DEAL_STATUS_FLOW.length - 1
                        ? "opacity-0"
                        : currentIndex > i
                          ? "bg-blue-500"
                          : "bg-slate-200"
                    }`}
                  />
                </div>
                <span
                  className={`mt-1.5 text-[10px] font-medium ${
                    isCurrent ? "text-blue-700" : done ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  {statusLabel(step)}
                </span>
              </li>
            );
          })}
        </ol>

        {realized != null && (
          <div
            className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
              realized >= 0 ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Realized Profit
            </span>
            <span
              className={`text-lg font-bold tabular-nums ${
                realized >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {formatSignedCurrency(realized)}
            </span>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.status}
                type="button"
                disabled={busy}
                onClick={() => handleAction(action.status)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                  action.primary
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : action.danger
                      ? "border border-red-200 text-red-600 hover:bg-red-50"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <CircleDashed size={14} className={action.primary ? "" : "opacity-60"} />
                {action.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setShowOutcome(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ClipboardList size={14} className="opacity-60" />
              {realized != null ? "Edit outcome" : "Log outcome"}
            </button>
          </div>
        )}

        {readOnly && (
          <p className="text-xs text-slate-400">
            Status: <span className="font-semibold text-slate-600">{statusLabel(status)}</span>
          </p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {capture && (
        <StageCaptureModal
          title={capture.title}
          subtitle={capture.subtitle}
          fields={capture.fields}
          onSave={submitCapture}
          onSkip={skipCapture}
          onClose={() => setCapture(null)}
        />
      )}

      {showOutcome && (
        <OutcomeLogModal
          car={car}
          apiBase={apiBase}
          predictions={predictions}
          onClose={() => setShowOutcome(false)}
          onSaved={(updated) => onUpdate?.(updated)}
        />
      )}
    </div>
  );
}

/**
 * Which numbers to capture for a given stage transition.
 * Returns { title, subtitle, fields } or null when no prompt is needed.
 */
function captureConfig(fromStatus, toStatus, car, predictions, dealer) {
  const reconLabel = dealer ? "Total recon cost" : "Total repair cost";
  const buyLabel = dealer ? "Purchase price" : "What you paid";
  const listLabel = dealer ? "List price (retail)" : "List price";

  const purchaseField = {
    key: "actual_purchase_price",
    label: buyLabel,
    predicted: predictions.maxBid,
    predictedLabel: dealer ? "Est. max buy" : "Est. max bid",
    initial: car?.actual_purchase_price ?? predictions.maxBid,
  };
  const reconField = {
    key: "actual_repair_cost",
    label: reconLabel,
    predicted: predictions.repair,
    predictedLabel: dealer ? "Est. recon" : "Est. repair",
    initial: car?.actual_repair_cost ?? predictions.repair,
  };
  const listField = {
    key: "list_price",
    label: listLabel,
    predicted: predictions.resale,
    predictedLabel: dealer ? "Est. retail" : "Est. resale",
    initial: car?.list_price ?? predictions.resale,
  };

  if (toStatus === DEAL_STATUS.BOUGHT) {
    return {
      title: "Mark as bought",
      subtitle: "Lock in what you actually paid — we'll score it against the estimate.",
      fields: [purchaseField],
    };
  }

  if (toStatus === DEAL_STATUS.LISTED) {
    if (fromStatus === DEAL_STATUS.IN_REPAIR) {
      return {
        title: "Mark as listed",
        subtitle: "Wrap up recon and set your list price.",
        fields: [reconField, listField],
      };
    }
    return {
      title: "Mark as listed",
      subtitle: "What are you listing it for?",
      fields: [listField],
    };
  }

  return null;
}

function nextActions(status) {
  switch (status) {
    case DEAL_STATUS.ANALYZING:
      return [
        { status: DEAL_STATUS.WATCHING, label: "Watch" },
        { status: DEAL_STATUS.BOUGHT, label: "Mark bought", primary: true },
        { status: DEAL_STATUS.PASSED, label: "Pass", danger: true },
      ];
    case DEAL_STATUS.WATCHING:
      return [
        { status: DEAL_STATUS.BOUGHT, label: "Mark bought", primary: true },
        { status: DEAL_STATUS.PASSED, label: "Pass", danger: true },
      ];
    case DEAL_STATUS.BOUGHT:
      return [
        { status: DEAL_STATUS.IN_REPAIR, label: "In repair" },
        { status: DEAL_STATUS.LISTED, label: "Listed", primary: true },
      ];
    case DEAL_STATUS.IN_REPAIR:
      return [{ status: DEAL_STATUS.LISTED, label: "Mark listed", primary: true }];
    case DEAL_STATUS.LISTED:
      return [{ status: DEAL_STATUS.SOLD, label: "Mark sold", primary: true }];
    case DEAL_STATUS.PASSED:
      return [{ status: DEAL_STATUS.WATCHING, label: "Reopen" }];
    default:
      return [];
  }
}

function toInt(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}
