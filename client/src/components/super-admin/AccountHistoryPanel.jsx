import { useEffect, useId, useRef } from "react";
import { Link } from "react-router";
import { X, LoaderCircle, RefreshCw } from "lucide-react";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import { useSuperAdminData } from "../../hooks/useSuperAdminData.js";
import { formatDate, formatTime } from "../../lib/format.js";
import {
  HISTORY_ACTION_LABELS,
  auditActionLabel,
  statusChange,
  accessUntil,
  describeAuditEntry,
} from "../../lib/auditLabels.js";

const when = (value) => `${formatDate(value)}, ${formatTime(value)}`;
const SETS_PERIOD = ["approve", "reactivate", "extend"];

// Side panel with one account's status changes and other recorded activity.
// A native <dialog> provides focus trapping, Escape and an inert background.
export default function AccountHistoryPanel({ account, onClose }) {
  const ref = useRef(null);
  const titleId = useId();
  const { loading, data, error, reload } = useSuperAdminData(`/accounts/${encodeURIComponent(account.id)}/history`);

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  // Status changes are already listed from accessHistory; show the rest here.
  const otherActivity = data?.auditEntries.filter((e) => !e.action.startsWith("access.")) ?? [];

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-lg border-l border-border bg-surface p-0 text-ink shadow-sm backdrop:bg-ink/40"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              Account history
            </h2>
            <p className="mt-0.5 truncate text-sm text-ink-muted">{account.businessName ?? account.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !data && (
            <p className="flex items-center gap-2 py-6 text-sm text-ink-muted" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading history…
            </p>
          )}

          {error && (
            <Alert>
              <p>{error.status === 404 ? "This account no longer exists." : error.message}</p>
              {error.status !== 404 && (
                <Button size="sm" variant="secondary" className="mt-2" onClick={reload}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Try again
                </Button>
              )}
            </Alert>
          )}

          {data && (
            <>
              <h3 className="text-sm font-semibold text-ink">Status changes</h3>
              {data.accessHistory.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No status changes recorded.</p>
              ) : (
                <ol className="mt-3 space-y-4 border-l border-border pl-4">
                  {data.accessHistory.map((h, i) => (
                    <li key={`${h.at}-${i}`} className="text-sm">
                      <p className="text-ink">
                        <span className="font-medium">{HISTORY_ACTION_LABELS[h.action] ?? h.action}</span>
                        <span className="text-ink-muted"> · {statusChange(h.fromStatus, h.toStatus)}</span>
                      </p>
                      {SETS_PERIOD.includes(h.action) && <p className="text-xs text-ink-muted">{accessUntil(h.accessExpiresAt)}</p>}
                      {h.reason && (
                        <p className="mt-1 rounded-md bg-subtle px-2.5 py-1.5 whitespace-pre-wrap break-words text-ink">{h.reason}</p>
                      )}
                      <p className="mt-1 text-xs text-ink-muted">
                        {h.by ? h.by.name : "System"} · {when(h.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}

              <h3 className="mt-6 text-sm font-semibold text-ink">Other activity</h3>
              {otherActivity.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Nothing else recorded.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {otherActivity.map((e) => (
                    <li key={e.id} className="text-sm">
                      <p className="font-medium text-ink">{auditActionLabel(e.action)}</p>
                      {describeAuditEntry(e).map((line) => (
                        <p key={line} className="text-xs text-ink-muted">
                          {line}
                        </p>
                      ))}
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {e.actor?.name ?? "Unknown"} · {when(e.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border bg-canvas px-5 py-3 text-sm">
          <Link to={`/super-admin/audit-logs?target=${account.id}`} className="font-medium text-accent hover:underline">
            View in the audit log
          </Link>
        </div>
      </div>
    </dialog>
  );
}
