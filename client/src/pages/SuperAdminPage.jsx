import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Search, LoaderCircle, RefreshCw, X, Trash2, History, KeyRound, CircleCheck, CircleX, CirclePause, CirclePlay, CalendarPlus } from "lucide-react";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import Table from "../components/ui/Table.jsx";
import Chip, { ChipGroup } from "../components/ui/Chip.jsx";
import ActionMenu from "../components/ui/ActionMenu.jsx";
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

// Summary cards double as quick filters. `count` is the key in the list's counts.
const SUMMARY_CARDS = [
  { view: "pending", label: "Pending requests", count: "pending", warn: true },
  { view: "active", label: "Active", count: "active" },
  { view: "expiring", label: "Expiring in 7 days", count: "expiringSoon", warn: true },
  { view: "suspended", label: "Suspended", count: "suspended" },
  { view: "expired", label: "Expired", count: "expired" },
  { view: "rejected", label: "Rejected", count: "rejected" },
];

const ACTION_ICONS = {
  approve: CircleCheck,
  reject: CircleX,
  suspend: CirclePause,
  reactivate: CirclePlay,
  extend: CalendarPlus,
};

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

  const viewParam = (id) => (id === "pending" ? null : id);
  const numberFormat = new Intl.NumberFormat();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-text">Accounts</h1>
        <p className="mt-1 text-sm text-muted">Review access requests and manage account access periods.</p>
      </header>

      {/* Counts per status; each card filters the table, and clicking the
          selected card again shows all accounts. */}
      <section aria-label="Accounts by status" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {SUMMARY_CARDS.map((card) => {
          const selected = view.id === card.view;
          const count = counts?.[card.count];
          const highlight = card.warn && count > 0;
          return (
            <button
              key={card.view}
              type="button"
              aria-pressed={selected}
              onClick={() => updateParams({ view: selected ? "all" : viewParam(card.view), page: null })}
              className={`rounded-card border px-5 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected ? "border-accent bg-accentSoft" : "border-border bg-panel shadow-card hover:border-faint"
              }`}
            >
              <span className={`block text-3xl leading-none font-bold tabular-nums ${highlight ? "text-warn" : "text-text"}`}>
                {count !== undefined ? numberFormat.format(count) : "–"}
              </span>
              <span className="mt-2 block text-xs font-semibold text-muted">{card.label}</span>
            </button>
          );
        })}
      </section>

      <OverviewStrip overview={overview} />

      <div className="flex flex-col gap-3 rounded-card border border-border bg-panel p-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search business, name or email"
            aria-label="Search accounts"
            maxLength={100}
            className={`${inputClasses} border-border pl-9`}
          />
        </div>
        <ChipGroup label="Account views">
          {VIEWS.map((v) => {
            const count = counts?.[v.count];
            return (
              <Chip
                key={v.id}
                selected={v.id === view.id}
                onClick={() => updateParams({ view: viewParam(v.id), page: null })}
              >
                {v.label}
                {count !== undefined && <span className="tabular-nums opacity-80">{count}</span>}
              </Chip>
            );
          })}
        </ChipGroup>
      </div>

      {notice && (
        <Alert tone="success">
          <div className="flex items-start justify-between gap-3">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="rounded-sm text-okText hover:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Alert>
      )}

      {error && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{error.message}</Alert>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {loading && !data && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading accounts…
        </p>
      )}

      {data && accounts.length === 0 && (
        <p className="rounded-card border border-dashed border-faint/60 px-5 py-10 text-center text-sm text-muted">
          {q ? `No accounts match "${q}" in this view.` : view.empty}
        </p>
      )}

      {accounts.length > 0 && (
        <div className={loading ? "opacity-60" : ""} aria-busy={loading || undefined}>
          {/* Table from 900px; cards below that. */}
          <Table label="Accounts" className="max-[899px]:hidden">
            <thead>
              <tr>
                <th scope="col">Business</th>
                <th scope="col">Owner</th>
                <th scope="col">Status</th>
                <th scope="col">Requested</th>
                <th scope="col">Access</th>
                <th scope="col" className="text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <AccountRow key={account.id} account={account} onAction={(action) => setDialog({ account, action })} />
              ))}
            </tbody>
          </Table>
          <ul className="space-y-4 min-[900px]:hidden" aria-label="Accounts">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} onAction={(action) => setDialog({ account, action })} />
            ))}
          </ul>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="flex items-center justify-between gap-4 text-sm text-muted">
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
    </div>
  );
}

const displayName = (account) => account.businessName ?? account.name;

// The one or two main actions as buttons (Approve and Reject for a pending
// request), everything else in the "More" menu, Delete last and apart.
function rowActions(account, onAction) {
  const statusActions = ROW_ACTIONS[account.accessStatus] ?? [];
  const shown = account.accessStatus === "pending" ? statusActions.slice(0, 2) : statusActions.slice(0, 1);
  const name = displayName(account);
  const buttons = shown.map((action, i) => (
    <Button
      key={action}
      size="sm"
      variant={i === 0 && (action === "approve" || action === "reactivate") ? "primary" : "secondary"}
      onClick={() => onAction(action)}
      aria-label={`${ACTION_LABELS[action]} ${account.name}`}
    >
      {ACTION_LABELS[action]}
    </Button>
  ));
  const menuItems = [
    ...statusActions
      .filter((action) => !shown.includes(action))
      .map((action) => ({ label: ACTION_LABELS[action], Icon: ACTION_ICONS[action], onSelect: () => onAction(action) })),
    { label: "History", Icon: History, onSelect: () => onAction("history") },
    ...(account.owner ? [{ label: "Reset link", Icon: KeyRound, onSelect: () => onAction("reset-link") }] : []),
    // Kept apart from the routine actions so it isn't clicked by habit.
    { label: "Delete", Icon: Trash2, danger: true, separated: true, onSelect: () => onAction("delete") },
  ];
  const menu = <ActionMenu srLabel={`More actions for ${name}`} items={menuItems} />;
  return { buttons, menu };
}

function AccessPeriod({ account }) {
  const { accessStatus, accessExpiresAt, daysRemaining } = account;
  const noExpiry = accessStatus === "active" && !accessExpiresAt;
  return (
    <div className="text-sm">
      {account.accessStartsAt || accessExpiresAt || noExpiry ? (
        <div className="whitespace-nowrap text-text">
          {account.accessStartsAt ? formatDate(account.accessStartsAt) : "—"}
          <span className="text-muted"> → </span>
          {accessExpiresAt ? formatDate(accessExpiresAt) : noExpiry ? "No expiry" : "—"}
        </div>
      ) : (
        <div className="text-muted">—</div>
      )}
      {daysRemaining !== null && (
        <div className={`text-xs tabular-nums ${daysRemaining <= 7 ? "font-semibold text-warn" : "text-muted"}`}>
          {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
        </div>
      )}
    </div>
  );
}

function BusinessCell({ account }) {
  return (
    <>
      <div className="font-semibold break-words text-text">{displayName(account)}</div>
      {account.businessName && account.businessName !== account.name && (
        <div className="text-xs text-muted">{account.name}</div>
      )}
      {!account.businessName && <div className="text-xs text-muted">No business set up</div>}
    </>
  );
}

function OwnerCell({ account }) {
  return account.owner ? (
    <>
      <div className="text-text">{account.owner.name}</div>
      <div className="text-xs break-all text-muted">{account.owner.email}</div>
    </>
  ) : (
    <span className="text-faint">No owner</span>
  );
}

// Pending requests get a warn-coloured stripe on the left edge.
const PENDING_STRIPE = "[box-shadow:inset_3px_0_0_var(--warn)]";

function AccountRow({ account, onAction }) {
  const { buttons, menu } = rowActions(account, onAction);
  const pending = account.accessStatus === "pending";
  return (
    <tr className="align-top transition-colors hover:bg-panel2">
      <td className={`!py-4 ${pending ? PENDING_STRIPE : ""}`}>
        <BusinessCell account={account} />
      </td>
      <td className="!py-4">
        <OwnerCell account={account} />
      </td>
      <td className="!py-4">
        <StatusBadge status={account.accessStatus} />
      </td>
      <td className="!py-4 whitespace-nowrap text-muted">{formatDate(account.requestedAt)}</td>
      <td className="!py-4">
        <AccessPeriod account={account} />
      </td>
      <td className="!py-4">
        <div className="flex items-center justify-end gap-2">
          {buttons}
          {menu}
        </div>
      </td>
    </tr>
  );
}

function AccountCard({ account, onAction }) {
  const { buttons, menu } = rowActions(account, onAction);
  const pending = account.accessStatus === "pending";
  return (
    <li className={`rounded-card border border-border bg-panel p-5 shadow-card ${pending ? "border-l-4 border-l-warn" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <BusinessCell account={account} />
        </div>
        <StatusBadge status={account.accessStatus} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm min-[420px]:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Owner</dt>
          <dd className="mt-0.5">
            <OwnerCell account={account} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Requested</dt>
          <dd className="mt-0.5 text-text">{formatDate(account.requestedAt)}</dd>
        </div>
        <div className="min-[420px]:col-span-2">
          <dt className="text-xs text-muted">Access</dt>
          <dd className="mt-0.5">
            <AccessPeriod account={account} />
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {buttons}
        <span className="ml-auto">{menu}</span>
      </div>
    </li>
  );
}
