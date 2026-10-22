import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Search, LoaderCircle, RefreshCw, Mic } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { inputClasses } from "../components/ui/TextField.jsx";
import { CategoryBadge, ComplaintStatusBadge, NewIndicator } from "../components/feedback/Badges.jsx";
import ExportCsvButton from "../components/feedback/ExportCsvButton.jsx";
import RetentionNotice from "../components/feedback/RetentionNotice.jsx";
import { useHandleAccessError } from "../context/BusinessContext.jsx";
import { api } from "../lib/api.js";
import { formatDate, formatDuration, formatTime } from "../lib/format.js";
import {
  CATEGORY_LABELS,
  COMPLAINT_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  SUBMISSION_TYPE_LABELS,
  TRANSCRIPT_STATUS_LABELS,
} from "../lib/feedbackLabels.js";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;
const FILTER_KEYS = ["q", "category", "review", "complaint", "type", "transcript", "link", "from", "to"];

// <input type="date"> values are local days; send the matching instants.
const startOfDay = (value) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
};
const endOfDay = (value) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
};

// URL filters -> API query.
function apiQuery(params, { paged = true } = {}) {
  const query = new URLSearchParams(paged ? { page: params.get("page") || "1", limit: String(PAGE_SIZE) } : {});
  const map = {
    q: "q",
    category: "category",
    review: "reviewStatus",
    complaint: "complaintStatus",
    type: "submissionType",
    transcript: "transcriptStatus",
    link: "linkId",
  };
  for (const [key, apiKey] of Object.entries(map)) {
    const value = params.get(key);
    if (value) query.set(apiKey, value);
  }
  if (params.get("from")) query.set("from", startOfDay(params.get("from")));
  if (params.get("to")) query.set("to", endOfDay(params.get("to")));
  return query.toString();
}

export default function FeedbackInboxPage() {
  const handleAccessError = useHandleAccessError();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const [links, setLinks] = useState([]);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const query = apiQuery(params);
  // The export takes the same filters, without paging.
  const exportQuery = apiQuery(params, { paged: false });
  const hasFilters = FILTER_KEYS.some((key) => params.get(key));

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page"); // any filter change starts at page 1
    setParams(next, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(`/api/feedback?${query}`)
      .then((data) => !cancelled && setState({ loading: false, data, error: null }))
      .catch((err) => {
        if (cancelled) return;
        handleAccessError(err);
        setState((s) => ({ ...s, loading: false, error: err }));
      });
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey, handleAccessError]);

  // Link names for the source filter. A failure only empties that dropdown.
  useEffect(() => {
    api("/api/links")
      .then(({ links }) => setLinks(links))
      .catch(() => setLinks([]));
  }, []);

  useEffect(() => {
    const q = params.get("q") ?? "";
    if (searchInput.trim() === q) return;
    const timer = setTimeout(() => update({ q: searchInput.trim() }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data } = state;
  const items = data?.feedback ?? [];
  const openDetail = (id) => navigate(`/app/feedback/${id}`, { state: { fromSearch: location.search } });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Feedback</h1>
          <p className="mt-1 text-sm text-ink-muted">Everything customers have sent you, newest first.</p>
          <RetentionNotice retentionDays={data?.retentionDays} className="mt-1.5" />
        </div>
        <ExportCsvButton query={exportQuery} disabled={data?.total === 0} onAccessError={handleAccessError} />
      </div>

      {location.state?.feedbackDeleted && (
        <Alert tone="success" className="mt-4">
          The feedback was permanently deleted.
        </Alert>
      )}

      <div className="mt-6 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search feedback text and transcripts"
            aria-label="Search feedback text and transcripts"
            maxLength={200}
            className={`${inputClasses} border-border-strong pl-9`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <FilterSelect label="Category" value={params.get("category")} onChange={(v) => update({ category: v })}
            options={Object.entries(CATEGORY_LABELS)} />
          <FilterSelect label="Review" value={params.get("review")} onChange={(v) => update({ review: v })}
            options={Object.entries(REVIEW_STATUS_LABELS)} />
          <FilterSelect label="Complaint status" value={params.get("complaint")} onChange={(v) => update({ complaint: v })}
            options={Object.entries(COMPLAINT_STATUS_LABELS)} />
          <FilterSelect label="Type" value={params.get("type")} onChange={(v) => update({ type: v })}
            options={Object.entries(SUBMISSION_TYPE_LABELS)} />
          <FilterSelect label="Transcription" value={params.get("transcript")} onChange={(v) => update({ transcript: v })}
            options={Object.entries(TRANSCRIPT_STATUS_LABELS)} />
          <FilterSelect label="Source" value={params.get("link")} onChange={(v) => update({ link: v })}
            options={links.map((l) => [l.id, l.isActive ? l.name : `${l.name} (inactive)`])} />
          <DateFilter label="From" value={params.get("from")} max={params.get("to")} onChange={(v) => update({ from: v })} />
          <DateFilter label="To" value={params.get("to")} min={params.get("from")} onChange={(v) => update({ to: v })} />
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setParams(new URLSearchParams(), { replace: true });
            }}
            className="text-sm font-medium text-accent hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {state.error && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{state.error.message}</Alert>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      <Card className="mt-4 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border bg-canvas text-xs text-ink-muted">
              <tr>
                <th scope="col" className="w-16 px-4 py-2.5 font-medium">
                  <span className="sr-only">Review status</span>
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">Received</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Feedback</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-border ${state.loading && data ? "opacity-60" : ""}`}>
              {state.loading && !data && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    <span className="inline-flex items-center gap-2" role="status">
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading feedback…
                    </span>
                  </td>
                </tr>
              )}

              {data && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    {hasFilters ? (
                      "No feedback matches these filters."
                    ) : (
                      <>
                        No feedback yet. Share your{" "}
                        <Link to="/app/links" className="font-medium text-accent hover:underline">
                          links and QR codes
                        </Link>{" "}
                        to start collecting it.
                      </>
                    )}
                  </td>
                </tr>
              )}

              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openDetail(item.id)}
                  className={`cursor-pointer hover:bg-canvas ${item.reviewStatus === "new" ? "bg-accent-soft/40" : ""}`}
                >
                  <td className="px-4 py-3 align-top">{item.reviewStatus === "new" && <NewIndicator />}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-ink-muted">
                    <div>{formatDate(item.submittedAt)}</div>
                    <div className="text-xs">{formatTime(item.submittedAt)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <CategoryBadge category={item.category} />
                  </td>
                  <td className="max-w-md px-4 py-3 align-top">
                    <Link
                      to={`/app/feedback/${item.id}`}
                      state={{ fromSearch: location.search }}
                      onClick={(e) => e.stopPropagation()}
                      className={`line-clamp-2 break-words hover:underline ${item.reviewStatus === "new" ? "font-medium text-ink" : "text-ink"}`}
                    >
                      {item.submissionType === "voice" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mic className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                          Voice message
                          {item.audioDurationSec != null && (
                            <span className="font-normal text-ink-muted">· {formatDuration(item.audioDurationSec)}</span>
                          )}
                        </span>
                      ) : (
                        item.excerpt
                      )}
                    </Link>
                    <div className="mt-0.5 text-xs text-ink-muted">{item.customerName || "Anonymous"}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">{item.link?.name ?? "—"}</td>
                  <td className="px-4 py-3 align-top">
                    {item.complaintStatus ? (
                      <ComplaintStatusBadge status={item.complaintStatus} />
                    ) : (
                      <span className="text-xs text-ink-muted">{REVIEW_STATUS_LABELS[item.reviewStatus]}</span>
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
              <Button variant="secondary" size="sm" disabled={state.loading || data.page <= 1}
                onClick={() => update({ page: data.page > 2 ? String(data.page - 1) : null })}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={state.loading || data.page >= data.totalPages}
                onClick={() => update({ page: String(data.page + 1) })}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClasses} border-border-strong ${value ? "text-ink" : "text-ink-muted"}`}
      >
        <option value="">{label}: all</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
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
