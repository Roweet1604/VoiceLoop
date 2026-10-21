import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Search, LoaderCircle, RefreshCw, X } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { inputClasses } from "../components/ui/TextField.jsx";
import { useSuperAdminData } from "../hooks/useSuperAdminData.js";
import { formatDate, formatTime } from "../lib/format.js";
import { auditActionLabel, describeAuditEntry } from "../lib/auditLabels.js";

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;
const FILTER_KEYS = ["q", "action", "from", "to", "target"];
const OBJECT_ID = /^[a-f0-9]{24}$/i;

// <input type="date"> values are local days; send the matching instants.
const startOfDay = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toISOString();
};
const endOfDay = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
};

function apiQuery(params) {
  const query = new URLSearchParams({ page: params.get("page") || "1", limit: String(PAGE_SIZE) });
  if (params.get("q")) query.set("q", params.get("q"));
  if (params.get("action")) query.set("action", params.get("action"));
  if (params.get("target")) query.set("targetId", params.get("target"));
  if (params.get("from")) query.set("from", startOfDay(params.get("from")));
  if (params.get("to")) query.set("to", endOfDay(params.get("to")));
  return query.toString();
}

// The platform audit trail for the Super Admin, newest first.
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const [targetInput, setTargetInput] = useState(params.get("target") ?? "");
  const target = params.get("target") ?? "";
  // Don't send an id the server would reject; say so next to the field.
  const targetInvalid = Boolean(target) && !OBJECT_ID.test(target);
  const { loading, data, error, reload } = useSuperAdminData(targetInvalid ? null : `/audit-logs?${apiQuery(params)}`);
  const hasFilters = FILTER_KEYS.some((key) => params.get(key));

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (searchInput.trim() === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => update({ q: searchInput.trim() }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Keep the inputs in step when the URL changes from elsewhere (a link, clearing).
  useEffect(() => setTargetInput(target), [target]);

  const entries = data?.entries ?? [];

  return (
    <>
      <h1 className="text-lg font-semibold text-ink">Audit log</h1>
      <p className="mt-1 text-sm text-ink-muted">Access changes, deletions and business changes across the platform, newest first.</p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search action, account or reason"
            aria-label="Search the audit log"
            maxLength={100}
            className={`${inputClasses} border-border-strong pl-9`}
          />
        </div>
        <label className="block">
          <span className="sr-only">Action</span>
          <select
            value={params.get("action") ?? ""}
            onChange={(e) => update({ action: e.target.value })}
            className={`${inputClasses} border-border-strong ${params.get("action") ? "text-ink" : "text-ink-muted"}`}
          >
            <option value="">Action: all</option>
            {(data?.actions ?? []).map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action)}
              </option>
            ))}
          </select>
        </label>
        <DateFilter label="From" value={params.get("from")} max={params.get("to")} onChange={(v) => update({ from: v })} />
        <DateFilter label="To" value={params.get("to")} min={params.get("from")} onChange={(v) => update({ to: v })} />
      </div>

      <form
        className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          update({ target: targetInput.trim() });
        }}
      >
        <label className="block sm:w-80">
          <span className="sr-only">Account id</span>
          <input
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder="Account id (24 characters)"
            maxLength={24}
            spellCheck={false}
            aria-invalid={targetInvalid || undefined}
            className={`${inputClasses} font-mono ${targetInvalid ? "border-danger" : "border-border-strong"}`}
          />
        </label>
        <Button type="submit" variant="secondary">
          Filter by account
        </Button>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setParams(new URLSearchParams(), { replace: true });
            }}
            className="self-center text-sm font-medium text-accent hover:underline"
          >
            Clear all filters
          </button>
        )}
      </form>
      {targetInvalid && <p className="mt-1.5 text-xs text-danger">An account id is 24 characters, letters a–f and digits.</p>}

      {error && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{error.details ? Object.values(error.details).join(" ") : error.message}</Alert>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {target && !targetInvalid && (
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
          Showing one account: <span className="font-mono">{target}</span>
          <button type="button" onClick={() => update({ target: null })} aria-label="Show all accounts" className="hover:text-ink">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </p>
      )}

      {!targetInvalid && (
      <Card className="mt-4 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-border bg-canvas text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Time</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Action</th>
                <th scope="col" className="px-4 py-2.5 font-medium">By</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Account</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-border ${loading && data ? "opacity-60" : ""}`}>
              {loading && !data && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    <span className="inline-flex items-center gap-2" role="status">
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading the audit log…
                    </span>
                  </td>
                </tr>
              )}

              {data && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    {hasFilters ? "No entries match these filters." : "Nothing has been recorded yet."}
                  </td>
                </tr>
              )}

              {entries.map((entry) => (
                <tr key={entry.id} className="align-top hover:bg-canvas">
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                    <div>{formatDate(entry.createdAt)}</div>
                    <div className="text-xs">{formatTime(entry.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{auditActionLabel(entry.action)}</td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{entry.actor?.name ?? (entry.target.type === "Platform" ? "System" : "Unknown")}</div>
                    {entry.actor?.role && (
                      <div className="text-xs text-ink-muted">{entry.actor.role === "superadmin" ? "Super Admin" : "Owner"}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="break-words text-ink">
                      {entry.target.type === "Platform"
                        ? "All accounts"
                        : (entry.target.name ?? <span className="text-ink-muted">Unnamed</span>)}
                      {entry.target.exists === false && <span className="ml-1 text-xs text-ink-muted">(deleted)</span>}
                    </div>
                    {entry.target.id && target !== String(entry.target.id) && (
                      <button
                        type="button"
                        onClick={() => update({ target: String(entry.target.id) })}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Only this account
                      </button>
                    )}
                  </td>
                  <td className="max-w-sm px-4 py-3">
                    {describeAuditEntry(entry).map((line) => (
                      <div key={line} className="text-ink-muted">
                        {line}
                      </div>
                    ))}
                    {entry.context.reason && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-ink">“{entry.context.reason}”</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-sm text-ink-muted">
            <span>
              {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={loading || data.page <= 1}
                onClick={() => update({ page: data.page > 2 ? String(data.page - 1) : null })}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={loading || data.page >= data.totalPages}
                onClick={() => update({ page: String(data.page + 1) })}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
      )}
    </>
  );
}

function DateFilter({ label, value, onChange, min, max }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-xs text-ink-muted">{label}</span>
      <input
        type="date"
        value={value ?? ""}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClasses} border-border-strong`}
      />
    </label>
  );
}
