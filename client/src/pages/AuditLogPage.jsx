import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Search,
  RefreshCw,
  X,
  ChevronRight,
  ServerCog,
  CircleCheck,
  CircleX,
  CirclePause,
  CirclePlay,
  CalendarPlus,
  Trash2,
  KeyRound,
  Store,
  Pencil,
  Clock,
  UserPlus,
  Activity,
} from "lucide-react";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import Chip, { ChipGroup } from "../components/ui/Chip.jsx";
import StatusPill from "../components/ui/StatusPill.jsx";
import { inputClasses } from "../components/ui/TextField.jsx";
import StatusBadge from "../components/super-admin/StatusBadge.jsx";
import { useSuperAdminData } from "../hooks/useSuperAdminData.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { formatDate, formatShortWhen, formatTime } from "../lib/format.js";
import { ACCESS_STATUS_LABELS, HISTORY_ACTION_LABELS, auditActionLabel, describeAuditEntry } from "../lib/auditLabels.js";

const SEARCH_DELAY_MS = 300;
const ACCOUNT_LIMIT = 100; // the accounts endpoint's maximum page size
// Per-row activity is counted from the whole audit log, read in pages of 100.
// Beyond this many pages the counts would come from a partial log, so the
// rows leave them out instead of guessing.
const SUMMARY_PAGE_SIZE = 100;
const SUMMARY_MAX_PAGES = 5;
const DETAIL_PAGE_SIZE = 50;
const SYSTEM = "system";

const ACTION_ICONS = {
  requested: UserPlus,
  "access.approve": CircleCheck,
  "access.reject": CircleX,
  "access.suspend": CirclePause,
  "access.reactivate": CirclePlay,
  "access.extend": CalendarPlus,
  account_deleted: Trash2,
  reset_link_created: KeyRound,
  "business.created": Store,
  "business.updated": Pencil,
  "feedback.deleted": Trash2,
  "retention.cleanup": Clock,
};

const actionLabel = (action) => (action === "requested" ? HISTORY_ACTION_LABELS.requested : auditActionLabel(action));
const isAccountEntry = (entry) => entry.target.type === "Organization";

// An audit entry as one timeline item.
function fromAuditEntry(entry) {
  return {
    id: entry.id,
    action: entry.action,
    at: entry.createdAt,
    actor: entry.actor?.name ?? (entry.target.type === "Platform" ? "System" : "Unknown"),
    role: entry.actor?.role ? (entry.actor.role === "superadmin" ? "Super Admin" : "Owner") : null,
    lines: describeAuditEntry(entry),
    reason: entry.context.reason ?? null,
  };
}

// The Super Admin audit trail, arranged by account: a list of accounts on the
// left, everything recorded about the selected one on the right.
// The Super Admin audit trail, arranged by account: a grid of account cards,
// each opening everything recorded about it in a slide-over panel.
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  // `target` is the older link format (e.g. from the account History panel).
  const selected = params.get("account") ?? params.get("target");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const accounts = useSuperAdminData(
    `/accounts?${new URLSearchParams({ status: "all", limit: String(ACCOUNT_LIMIT), ...(q && { q }) })}`
  );
  const summary = useAuditSummary();

  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const rows = useMemo(() => buildRows(accounts.data?.accounts ?? [], summary.data, q), [accounts.data, summary.data, q]);
  const system = systemRow(summary.data);
  const selectedRow =
    selected === SYSTEM
      ? system
      : (rows.find((r) => r.id === selected) ?? (selected ? { kind: "account", id: selected, name: null } : null));

  // Filter chips: the statuses actually present, Deleted if any, and System.
  const statuses = STATUS_FILTERS.filter((status) => rows.some((r) => r.kind === "account" && r.account.accessStatus === status));
  const hasDeleted = rows.some((r) => r.kind === "deleted");
  const visible = [
    ...(filter === "all" || filter === SYSTEM ? [system] : []),
    ...rows.filter((r) =>
      filter === "all" ? true : filter === "deleted" ? r.kind === "deleted" : r.kind === "account" && r.account.accessStatus === filter
    ),
  ];
  const loading = (accounts.loading && !accounts.data) || summary.loading;

  function open(id) {
    setParams(new URLSearchParams({ account: id }));
  }

  function close() {
    const next = new URLSearchParams(params);
    next.delete("account");
    next.delete("target");
    setParams(next);
    // Focus goes back to the open account's card (also after a deep link),
    // once the dialog has closed so focus isn't pulled back into it.
    const id = selected;
    requestAnimationFrame(() => document.querySelector(`[data-account-card="${CSS.escape(id ?? "")}"]`)?.focus());
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-text">Audit log</h1>
        <p className="mt-1 text-sm text-muted">
          Access changes, deletions and business changes across the platform, newest first.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-panel p-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search accounts"
            aria-label="Search accounts"
            maxLength={100}
            className={`${inputClasses} border-border pl-9`}
          />
        </div>
        <ChipGroup label="Show">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Chip>
          {statuses.map((status) => (
            <Chip key={status} selected={filter === status} onClick={() => setFilter(status)}>
              {ACCESS_STATUS_LABELS[status]}
            </Chip>
          ))}
          {hasDeleted && (
            <Chip selected={filter === "deleted"} onClick={() => setFilter("deleted")}>
              Deleted
            </Chip>
          )}
          <Chip selected={filter === SYSTEM} onClick={() => setFilter(SYSTEM)}>
            System
          </Chip>
        </ChipGroup>
      </div>

      {(accounts.error || summary.error) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{(accounts.error ?? summary.error).message}</Alert>
          <Button
            variant="secondary"
            onClick={() => {
              if (accounts.error) accounts.reload();
              if (summary.error) summary.reload();
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      <ul
        aria-label="Accounts"
        aria-busy={loading || undefined}
        className="grid gap-5 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3 min-[1600px]:grid-cols-4"
      >
        {loading ? <CardSkeletons /> : visible.map((row) => <AccountCard key={row.id} row={row} selected={row.id === selected} onOpen={open} />)}
      </ul>

      {!loading && visible.length === 0 && (
        <p className="rounded-card border border-dashed border-faint/60 px-5 py-10 text-center text-sm text-muted">
          {q ? "No accounts match this search." : "No accounts to show here."}
        </p>
      )}

      {accounts.data && accounts.data.total > accounts.data.accounts.length && (
        <p className="text-xs text-muted">
          Showing {accounts.data.accounts.length} of {accounts.data.total} accounts. Search to find others.
        </p>
      )}
      {summary.data && !summary.data.complete && (
        <p className="text-xs text-muted">
          The audit log is too long to count here, so cards don't show their last activity or number of entries.
          Open an account to see all of its activity.
        </p>
      )}

      {selectedRow && <ActivityPanel key={selected} row={selectedRow} onClose={close} />}
    </div>
  );
}

const STATUS_FILTERS = ["active", "pending", "suspended", "expired", "rejected"];

// --- Data -----------------------------------------------------------------------

// Reads the whole audit log (up to SUMMARY_MAX_PAGES pages) and counts it per
// account. `complete` is false when the log was longer than that; then no
// per-account numbers are given, because they would be wrong.
function useAuditSummary() {
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      const entries = [];
      let page = 1;
      let totalPages = 1;
      do {
        const data = await api(`/api/super-admin/audit-logs?page=${page}&limit=${SUMMARY_PAGE_SIZE}`);
        entries.push(...data.entries);
        totalPages = data.totalPages;
        page += 1;
      } while (!cancelled && page <= totalPages && page <= SUMMARY_MAX_PAGES);
      return { entries, complete: page > totalPages };
    })()
      .then(({ entries, complete }) => !cancelled && setState({ loading: false, data: summarize(entries, complete), error: null }))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) refresh().catch(() => {});
        setState((s) => ({ ...s, loading: false, error: err }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, refresh]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { ...state, reload };
}

// Entries are newest first, so the first one seen per account is its latest.
function summarize(entries, complete) {
  const byAccount = new Map();
  const deleted = new Map(); // accounts that no longer exist, by id
  const system = { count: 0, latest: null };
  for (const entry of entries) {
    if (!isAccountEntry(entry)) {
      system.count += 1;
      system.latest ??= entry;
      continue;
    }
    const id = String(entry.target.id);
    const activity = byAccount.get(id) ?? { count: 0, latest: entry };
    activity.count += 1;
    byAccount.set(id, activity);
    if (entry.target.exists === false && !deleted.has(id)) deleted.set(id, entry.target.name);
  }
  return { complete, byAccount, deleted, system };
}

function systemRow(summary) {
  return {
    kind: "system",
    id: SYSTEM,
    name: "System",
    subtitle: "Platform events not tied to one account",
    activity: summary?.complete ? summary.system : null,
  };
}

// Live accounts plus (when the whole log was read) deleted ones, most recent
// activity first; accounts without activity follow, newest request first.
function buildRows(accounts, summary, q) {
  const activityOf = (id) => (summary?.complete ? (summary.byAccount.get(id) ?? { count: 0, latest: null }) : null);
  const live = accounts.map((a) => ({
    kind: "account",
    id: String(a.id),
    name: a.businessName ?? a.name,
    subtitle: a.owner?.email ?? null,
    account: a,
    sortAt: a.requestedAt,
    activity: activityOf(String(a.id)),
  }));
  const needle = q.toLowerCase();
  const gone = summary?.complete
    ? [...summary.deleted]
        .filter(([, name]) => !needle || (name ?? "").toLowerCase().includes(needle))
        .map(([id, name]) => ({ kind: "deleted", id, name: name ?? "Unnamed", subtitle: "Deleted account", activity: activityOf(id) }))
    : [];
  const time = (row) => new Date(row.activity?.latest?.createdAt ?? 0).getTime();
  return [...live, ...gone].sort((a, b) => time(b) - time(a) || new Date(b.sortAt ?? 0) - new Date(a.sortAt ?? 0));
}

// The selected account's timeline: the History endpoint for live accounts;
// the audit log itself (paged) for deleted accounts and System events.
function useTimeline(row) {
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: true, items: [], header: null, error: null, page: 0, hasMore: false });
  const [request, setRequest] = useState({ source: row.kind === "account" ? "history" : "audit", page: 1, key: 0 });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const done = (next) => !cancelled && setState((s) => ({ ...s, loading: false, ...next(s) }));
    const fail = (err) => {
      if (cancelled) return;
      if (err.status === 401 || err.status === 403) refresh().catch(() => {});
      // A live-looking id the History endpoint no longer knows: read the log instead.
      if (request.source === "history" && err.status === 404) {
        setRequest({ source: "audit", page: 1, key: request.key });
        return;
      }
      setState((s) => ({ ...s, loading: false, error: err }));
    };

    if (request.source === "history") {
      api(`/api/super-admin/accounts/${encodeURIComponent(row.id)}/history`)
        .then((data) => {
          const requested = data.accessHistory
            .filter((h) => h.action === "requested")
            .map((h, i) => ({ id: `requested-${i}`, action: "requested", at: h.at, actor: h.by ? h.by.name : "System", role: null, lines: [], reason: null }));
          const items = [...data.auditEntries.map(fromAuditEntry), ...requested].sort((a, b) => new Date(b.at) - new Date(a.at));
          done(() => ({ items, header: data.account, page: 1, hasMore: false }));
        })
        .catch(fail);
    } else {
      const query = new URLSearchParams({ page: String(request.page), limit: String(row.kind === "system" ? 100 : DETAIL_PAGE_SIZE) });
      if (row.kind !== "system") query.set("targetId", row.id);
      api(`/api/super-admin/audit-logs?${query}`)
        .then((data) => {
          const entries = row.kind === "system" ? data.entries.filter((e) => !isAccountEntry(e)) : data.entries;
          done((s) => ({
            items: [...(request.page === 1 ? [] : s.items), ...entries.map(fromAuditEntry)],
            page: data.page,
            hasMore: data.page < data.totalPages,
          }));
        })
        .catch(fail);
    }
    return () => {
      cancelled = true;
    };
  }, [request, row.id, row.kind, refresh]);

  return {
    ...state,
    source: request.source,
    loadMore: () => setRequest((r) => ({ ...r, page: state.page + 1 })),
    reload: () => setRequest((r) => ({ ...r, page: 1, key: r.key + 1 })),
  };
}

// --- Cards ----------------------------------------------------------------------

// One account as a card; the whole card is a link that opens the panel (it
// also keeps working as a real link, e.g. opened in a new tab).
function AccountCard({ row, selected, onOpen }) {
  const { activity } = row;
  const deleted = row.kind === "deleted";
  return (
    <li className="flex">
      <Link
        to={`?${new URLSearchParams({ account: row.id })}`}
        data-account-card={row.id}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onOpen(row.id);
        }}
        className={`group flex w-full flex-col rounded-card border border-l-4 bg-panel p-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          selected ? "border-accent border-l-accent" : "border-border border-l-faint/50 hover:border-accent hover:border-l-accent"
        } ${deleted ? "opacity-70" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {row.kind === "system" && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-panel2 text-muted">
                <ServerCog className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            <span className="font-semibold break-words text-text">{row.name}</span>
          </span>
          {row.kind === "account" && <StatusBadge status={row.account.accessStatus} />}
          {deleted && <StatusPill>Deleted</StatusPill>}
        </div>
        {row.subtitle && <p className="mt-1 truncate text-sm text-muted">{row.subtitle}</p>}

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Last activity</p>
          <p className="mt-1 text-sm text-text">
            {activity === null ? (
              <span className="text-muted">Open to see activity</span>
            ) : activity.latest ? (
              <>
                {auditActionLabel(activity.latest.action)}
                <span className="text-muted"> · {formatShortWhen(activity.latest.createdAt)}</span>
              </>
            ) : (
              <span className="text-muted">No log entries yet</span>
            )}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          {activity ? (
            <span className="rounded-full bg-panel2 px-2.5 py-0.5 text-xs font-semibold text-muted tabular-nums">
              {activity.count} {activity.count === 1 ? "entry" : "entries"}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-accentText group-hover:underline">
            View activity
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </li>
  );
}

function CardSkeletons() {
  return Array.from({ length: 6 }, (_, i) => (
    <li key={i} className="rounded-card border border-l-4 border-border border-l-faint/50 bg-panel p-5" aria-hidden="true">
      <div className="h-4 w-1/2 animate-pulse rounded bg-panel2 motion-reduce:animate-none" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-panel2 motion-reduce:animate-none" />
      <div className="mt-6 h-3 w-1/3 animate-pulse rounded bg-panel2 motion-reduce:animate-none" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-panel2 motion-reduce:animate-none" />
    </li>
  ));
}

// --- Detail ---------------------------------------------------------------------

// Slide-over panel with one account's activity. A modal <dialog> provides the
// dim backdrop, keeps focus inside and closes on Escape; a click on the
// backdrop (the dialog element itself) closes it too.
function ActivityPanel({ row, onClose }) {
  const ref = useRef(null);
  const titleId = useId();
  const timeline = useTimeline(row);
  const [action, setAction] = useState(null);
  const actions = [...new Set(timeline.items.map((item) => item.action))];
  const shown = action ? timeline.items.filter((item) => item.action === action) : timeline.items;
  const name = row.name ?? timeline.header?.name ?? "Account";
  const deleted = row.kind === "deleted" || (row.kind === "account" && timeline.source === "audit");

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(720px,100%)] max-w-none border-l border-border bg-bg p-0 text-text backdrop:bg-scrim open:translate-x-0 starting:open:translate-x-full transition-transform duration-200 ease-out motion-reduce:transition-none max-[899px]:w-full"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border bg-panel px-5 py-5 sm:px-6">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 id={titleId} className="text-xl font-semibold break-words text-text">
                {name}
              </h2>
              {row.account && <StatusBadge status={row.account.accessStatus} />}
              {deleted && <StatusPill>Deleted</StatusPill>}
            </div>
            {row.kind === "system" && <p className="text-sm text-muted">{row.subtitle}, such as deleting expired feedback.</p>}
            {row.account && <AccessSummary account={row.account} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-control p-1.5 text-muted hover:bg-panel2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-6">
          {actions.length > 1 && (
            <ChipGroup label="Filter by action">
              <Chip selected={!action} onClick={() => setAction(null)}>
                All
              </Chip>
              {actions.map((a) => (
                <Chip key={a} selected={action === a} onClick={() => setAction(a)}>
                  {actionLabel(a)}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {timeline.error && (
            <Alert>
              <p>{timeline.error.message}</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={timeline.reload}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </Button>
            </Alert>
          )}

          {timeline.loading && timeline.items.length === 0 && !timeline.error && <TimelineSkeleton />}

          {!timeline.loading && !timeline.error && timeline.items.length === 0 && (
            <div className="rounded-card border border-dashed border-faint/60 px-5 py-8 text-center text-sm text-muted">
              Nothing has been recorded for {row.kind === "system" ? "the platform" : "this account"} yet.
            </div>
          )}

          {shown.length > 0 && <Timeline items={shown} />}

          {timeline.hasMore && (
            <Button variant="secondary" onClick={timeline.loadMore} loading={timeline.loading} className="w-full">
              Load more
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}

// Access period as the Accounts page shows it.
function AccessSummary({ account }) {
  const { accessStatus, accessStartsAt, accessExpiresAt, daysRemaining } = account;
  const noExpiry = accessStatus === "active" && !accessExpiresAt;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm min-[480px]:grid-cols-3">
      {account.owner?.email && (
        <div className="min-[480px]:col-span-3">
          <dt className="sr-only">Owner</dt>
          <dd className="break-all text-muted">{account.owner.email}</dd>
        </div>
      )}
      <div>
        <dt className="text-xs text-muted">Starts</dt>
        <dd className="text-text">{accessStartsAt ? formatDate(accessStartsAt) : "—"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Expires</dt>
        <dd className="text-text">{accessExpiresAt ? formatDate(accessExpiresAt) : noExpiry ? "No expiry" : "—"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Days left</dt>
        <dd className={daysRemaining !== null && daysRemaining <= 7 ? "font-semibold text-warn" : "text-text"}>
          {daysRemaining !== null ? daysRemaining : "—"}
        </dd>
      </div>
    </dl>
  );
}

// Newest first, grouped by day.
function Timeline({ items }) {
  const days = [];
  for (const item of items) {
    const day = new Date(item.at).toDateString();
    if (days.at(-1)?.day !== day) days.push({ day, at: item.at, items: [] });
    days.at(-1).items.push(item);
  }
  return (
    <div className="space-y-6">
      {days.map(({ day, at, items: dayItems }) => (
        <section key={day} aria-label={formatDate(at)}>
          <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">{formatDate(at)}</h3>
          <ol className="mt-3 space-y-3 border-l border-border pl-4">
            {dayItems.map((item) => (
              <TimelineItem key={item.id} item={item} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TimelineItem({ item }) {
  const Icon = ACTION_ICONS[item.action] ?? Activity;
  return (
    <li className="relative">
      <span className="absolute top-4 -left-[21px] h-2 w-2 rounded-full bg-border" aria-hidden="true" />
      <div className="flex gap-3 rounded-card border border-border bg-panel2 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-panel text-accentText">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-text">{actionLabel(item.action)}</p>
            <time dateTime={item.at} className="text-xs text-muted tabular-nums">
              {formatDate(item.at)}, {formatTime(item.at)}
            </time>
          </div>
          {item.lines.map((line) => (
            <p key={line} className="mt-0.5 text-sm text-muted">
              {line}
            </p>
          ))}
          {item.reason && (
            <p className="mt-2 rounded-control bg-panel px-3 py-2 text-sm whitespace-pre-wrap break-words text-text">
              “{item.reason}”
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            By {item.actor}
            {item.role && <> · {item.role}</>}
          </p>
        </div>
      </div>
    </li>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3" role="status">
      <span className="sr-only">Loading activity…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-card border border-border p-4" aria-hidden="true">
          <div className="h-9 w-9 animate-pulse rounded-control bg-panel2 motion-reduce:animate-none" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-panel2 motion-reduce:animate-none" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-panel2 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}
