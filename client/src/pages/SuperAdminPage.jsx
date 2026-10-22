import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Search, LoaderCircle, RefreshCw, X, Trash2, History, KeyRound } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { inputClasses } from "../components/ui/TextField.jsx";
import StatusBadge from "../components/super-admin/StatusBadge.jsx";
import AccountActionDialog, { ACTION_LABELS } from "../components/super-admin/AccountActionDialog.jsx";
import DeleteAccountDialog, { confirmationName } from "../components/super-admin/DeleteAccountDialog.jsx";
import AccountHistoryPanel from "../components/super-admin/AccountHistoryPanel.jsx";
import ResetLinkDialog from "../components/super-admin/ResetLinkDialog.jsx";
import OverviewStrip from "../components/super-admin/OverviewStrip.jsx";
import { useAccounts } from "../hooks/useAccounts.js";
import { useSuperAdminData } from "../hooks/useSuperAdminData.js";
import { formatDate } from "../lib/format.js";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

// Each view is a preset filter; "pending" is the default so new requests come first.
const VIEWS = [
  { id: "pending", label: "Pending requests", params: { status: "pending" }, count: "pending", empty: "No pending requests. New signups will appear here." },
  { id: "expiring", label: "Expiring soon", params: { expiring: "true" }, count: "expiringSoon", empty: "No accounts expire in the next 7 days." },
  { id: "active", label: "Active", params: { status: "active" }, count: "active", empty: "No active accounts." },
  { id: "suspended", label: "Suspended", params: { status: "suspended" }, count: "suspended", empty: "No suspended accounts." },
  { id: "expired", label: "Expired", params: { status: "expired" }, count: "expired", empty: "No expired accounts." },
  { id: "rejected", label: "Rejected", params: { status: "rejected" }, count: "rejected", empty: "No rejected requests." },
  { id: "all", label: "All", params: { status: "all" }, count: "all", empty: "No accounts yet." },
];

// Which actions make sense for each status (the server enforces the same rules).
const ROW_ACTIONS = {
  pending: ["approve", "reject"],
  active: ["extend", "suspend"],
  expired: ["extend"],
  suspended: ["reactivate"],
  rejected: ["approve"],
};

function successMessage(account, action) {
  const until = account.accessExpiresAt ? `until ${formatDate(account.accessExpiresAt)}` : "with no end date";
  switch (action) {
    case "approve":
      return `Approved ${account.name}: access ${until}.`;
    case "reject":
      return `Rejected the request from ${account.name}.`;
    case "suspend":
      return `Suspended ${account.name}.`;
    case "reactivate":
      return `Reactivated ${account.name}: access ${until}.`;
    case "extend":
      return `Extended ${account.name}: access ${until}.`;
    default:
      return "Saved.";
  }
}

export default function SuperAdminPage() {
  const overview = useSuperAdminData("/overview");
  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.find((v) => v.id === searchParams.get("view")) ?? VIEWS[0];
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(q);
  const [dialog, setDialog] = useState(null); // { account, action }
  const [notice, setNotice] = useState(null);

  const query = new URLSearchParams({ ...view.params, ...(q && { q }), page: String(page), limit: String(PAGE_SIZE) });
  const { loading, data, error, reload, removeAccount } = useAccounts(query.toString());

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  // Debounce typing into the URL (which triggers the fetch).
  useEffect(() => {
    if (searchInput.trim() === q) return;
    const timer = setTimeout(() => updateParams({ q: searchInput.trim(), page: null }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function handleDone(account, action) {
    setDialog(null);
    setNotice(successMessage(account, action));
    reload();
    overview.reload();
  }

  // Called only after the server confirmed the deletion.
  function handleDeleted(account) {
    setDialog(null);
    removeAccount(account.id);
    setNotice(`Deleted ${confirmationName(account)} and all its data permanently.`);
    reload(); // refresh the counts in the view tabs
    overview.reload();
  }

  const counts = data?.counts;
  const accounts = data?.accounts ?? [];
  const firstShown = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const lastShown = data ? Math.min(data.page * data.limit, data.total) : 0;

  return (
    <>
      <OverviewStrip overview={overview} />

      <div className="mt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ink">Accounts</h1>
            <p className="mt-1 text-sm text-ink-muted">Review access requests and manage account access periods.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search business, name or email"
              aria-label="Search accounts"
              maxLength={100}
              className={`${inputClasses} border-border-strong pl-9`}
            />
          </div>
        </div>

        <nav aria-label="Account views" className="mt-6 -mb-px flex gap-1 overflow-x-auto border-b border-border">
          {VIEWS.map((v) => {
            const selected = v.id === view.id;
            const count = counts?.[v.count];
            return (
              <button
                key={v.id}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => updateParams({ view: v.id === "pending" ? null : v.id, page: null })}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  selected ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {v.label}
                {count !== undefined && (
                  <span
                    className={`rounded-sm px-1.5 text-xs ${
                      selected ? "bg-accent-soft text-accent" : "bg-subtle text-ink-muted"
                    } ${v.id === "pending" && count > 0 && !selected ? "bg-warning-soft text-warning" : ""}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {notice && (
          <Alert tone="success" className="mt-4">
            <div className="flex items-start justify-between gap-3">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-success hover:opacity-70">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </Alert>
        )}

        <Card className="mt-4 overflow-hidden p-0">
          {error && (
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <Alert className="flex-1">{error.message}</Alert>
              <Button variant="secondary" onClick={reload}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] text-left text-sm">
              <thead className="border-b border-border bg-canvas text-xs font-medium text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Business</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Owner</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Requested</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Starts</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Ends</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Days left</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-border ${loading && data ? "opacity-60" : ""}`}>
                {loading && !data && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Loading accounts…
                      </span>
                    </td>
                  </tr>
                )}

                {data && accounts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                      {q ? `No accounts match "${q}" in this view.` : view.empty}
                    </td>
                  </tr>
                )}

                {accounts.map((account) => (
                  <AccountRow key={account.id} account={account} onAction={(action) => setDialog({ account, action })} />
                ))}
              </tbody>
            </table>
          </div>

          {data && data.total > 0 && (
            <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-sm text-ink-muted">
              <span>
                Showing {firstShown}–{lastShown} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loading || data.page <= 1}
                  onClick={() => updateParams({ page: data.page - 1 > 1 ? String(data.page - 1) : null })}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loading || data.page >= data.totalPages}
                  onClick={() => updateParams({ page: String(data.page + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {dialog?.action === "history" && <AccountHistoryPanel account={dialog.account} onClose={() => setDialog(null)} />}
      {dialog?.action === "delete" && (
        <DeleteAccountDialog account={dialog.account} onClose={() => setDialog(null)} onDeleted={handleDeleted} />
      )}
      {dialog?.action === "reset-link" && <ResetLinkDialog account={dialog.account} onClose={() => setDialog(null)} />}
      {dialog && !["delete", "history", "reset-link"].includes(dialog.action) && (
        <AccountActionDialog
          account={dialog.account}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onDone={handleDone}
        />
      )}
    </>
  );
}

function AccountRow({ account, onAction }) {
  const { accessStatus, accessExpiresAt, daysRemaining } = account;
  const noExpiry = accessStatus === "active" && !accessExpiresAt;

  return (
    <tr className="hover:bg-canvas">
      <td className="px-4 py-3">
        <div className="font-medium text-ink">{account.businessName ?? account.name}</div>
        {account.businessName && account.businessName !== account.name && (
          <div className="text-xs text-ink-muted">{account.name}</div>
        )}
        {!account.businessName && <div className="text-xs text-ink-muted">No business set up</div>}
      </td>
      <td className="px-4 py-3">
        {account.owner ? (
          <>
            <div className="text-ink">{account.owner.name}</div>
            <div className="text-xs text-ink-muted">{account.owner.email}</div>
          </>
        ) : (
          <span className="text-ink-subtle">No owner</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={accessStatus} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{formatDate(account.requestedAt)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
        {account.accessStartsAt ? formatDate(account.accessStartsAt) : "—"}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
        {accessExpiresAt ? formatDate(accessExpiresAt) : noExpiry ? "No expiry" : "—"}
      </td>
      <td
        className={`px-4 py-3 text-right whitespace-nowrap tabular-nums ${
          daysRemaining !== null && daysRemaining <= 7 ? "font-medium text-warning" : "text-ink-muted"
        }`}
      >
        {daysRemaining !== null ? daysRemaining : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {(ROW_ACTIONS[accessStatus] ?? []).map((action, i) => (
            <Button
              key={action}
              size="sm"
              variant={i === 0 && (action === "approve" || action === "reactivate") ? "primary" : "secondary"}
              onClick={() => onAction(action)}
              aria-label={`${ACTION_LABELS[action]} ${account.name}`}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAction("history")}
            aria-label={`History of ${account.businessName ?? account.name}`}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            History
          </Button>
          {account.owner && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onAction("reset-link")}
              aria-label={`Create a password reset link for ${account.businessName ?? account.name}`}
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Reset link
            </Button>
          )}
          {/* Kept apart from the routine actions so it isn't clicked by habit. */}
          <span className="ml-1.5 border-l border-border pl-1.5">
            <Button
              size="sm"
              variant="dangerOutline"
              onClick={() => onAction("delete")}
              aria-label={`Delete ${account.businessName ?? account.name} permanently`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </Button>
          </span>
        </div>
      </td>
    </tr>
  );
}
