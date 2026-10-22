import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Search, LoaderCircle, RefreshCw, Inbox } from "lucide-react";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import Chip, { ChipGroup } from "../components/ui/Chip.jsx";
import ListDetail, { ListDetailItem, ListDetailItems } from "../components/ui/ListDetail.jsx";
import Waveform from "../components/ui/Waveform.jsx";
import FilterPopover from "../components/ui/FilterPopover.jsx";
import { inputClasses } from "../components/ui/TextField.jsx";
import { ComplaintStatusBadge } from "../components/feedback/Badges.jsx";
import ExportCsvButton from "../components/feedback/ExportCsvButton.jsx";
import RetentionNotice from "../components/feedback/RetentionNotice.jsx";
import FeedbackDetail, { BackLink } from "../components/feedback/FeedbackDetail.jsx";
import { useHandleAccessError } from "../context/BusinessContext.jsx";
import { api } from "../lib/api.js";
import { formatDate, formatDuration, formatShortWhen, formatTime } from "../lib/format.js";
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
// Filters inside the "More filters" popover; its button counts the ones set.
const MORE_FILTER_KEYS = ["complaint", "transcript", "link", "from", "to"];

// Quick filter cards: each sets one existing filter param. `count` names the
// number to show, from the counts loaded below.
const QUICK_FILTERS = [
  { label: "New", key: "review", value: "new", count: "new" },
  { label: "Open complaints", key: "complaint", value: "open", count: "openComplaints" },
  { label: "In progress", key: "complaint", value: "in_progress", count: "inProgress" },
  { label: "Resolved", key: "complaint", value: "resolved", count: "resolved" },
  { label: "Voice", key: "type", value: "voice", count: "voice" },
];
// The open item, kept in the URL so the selection survives a reload and the
// browser's Back button returns to the list on small screens.
const SELECTED_KEY = "selected";

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

// Current URL with `key` set (or removed when value is empty).
function withParam(params, key, value) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return `?${next}`;
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
  const [openFilter, setOpenFilter] = useState(null); // which toolbar popover is open
  const [counts, setCounts] = useState(null);
  const [countsKey, setCountsKey] = useState(0);
  const query = apiQuery(params);
  // The export takes the same filters, without paging.
  const exportQuery = apiQuery(params, { paged: false });
  const hasFilters = FILTER_KEYS.some((key) => params.get(key));
  const moreCount = MORE_FILTER_KEYS.filter((key) => params.get(key)).length;
  const selected = params.get(SELECTED_KEY);

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

  // Whole-inbox counts for the quick cards, all exact: the four statuses from
  // the dashboard's summary, voice from the list endpoint's total. They
  // ignore the current filters. Refreshed after any change made here.
  useEffect(() => {
    let cancelled = false;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    Promise.all([
      api(`/api/feedback/summary?tz=${encodeURIComponent(tz)}`),
      api("/api/feedback?submissionType=voice&limit=1"),
    ])
      .then(([summary, voice]) => {
        if (cancelled) return;
        const { new: unreviewed, openComplaints, inProgress, resolved } = summary;
        setCounts({ new: unreviewed, openComplaints, inProgress, resolved, voice: voice.total });
      })
      .catch((err) => {
        if (cancelled) return;
        handleAccessError(err);
        setCounts({ error: true }); // cards still work as filters, without numbers
      });
    return () => {
      cancelled = true;
    };
  }, [countsKey, reloadKey, handleAccessError]);

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

  // A change made in the detail pane (already confirmed by the server) is
  // copied into its list row, so the dot and status update without a reload.
  const onChanged = useCallback((feedback) => {
    setState((s) =>
      s.data
        ? {
            ...s,
            data: {
              ...s.data,
              feedback: s.data.feedback.map((item) =>
                item.id === feedback.id
                  ? { ...item, reviewStatus: feedback.reviewStatus, complaintStatus: feedback.complaintStatus }
                  : item
              ),
            },
          }
        : s
    );
    setCountsKey((k) => k + 1);
  }, []);

  const { data } = state;
  const items = data?.feedback ?? [];
  const listUrl = withParam(params, SELECTED_KEY, null);

  const list = (
    <>
      {location.state?.feedbackDeleted && (
        <Alert tone="success" className="m-5 mb-0">
          The feedback was permanently deleted.
        </Alert>
      )}

      {state.error && (
        <div className="m-5 mb-0 flex flex-col gap-3">
          <Alert>{state.error.message}</Alert>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)} className="self-start">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {state.loading && !data && (
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading feedback…
        </p>
      )}

      {data && items.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted">
          {hasFilters ? (
            "No feedback matches these filters."
          ) : (
            <>
              No feedback yet. Share your{" "}
              <Link to="/app/links" className="font-semibold text-accentText hover:underline">
                links and QR codes
              </Link>{" "}
              to start collecting it.
            </>
          )}
        </p>
      )}

      {items.length > 0 && (
        <div className={state.loading ? "opacity-60" : ""} aria-busy={state.loading || undefined}>
          <ListDetailItems label="Feedback">
            {items.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                to={withParam(params, SELECTED_KEY, item.id)}
                selected={item.id === selected}
              />
            ))}
          </ListDetailItems>
        </div>
      )}

    </>
  );

  const listFooter = (
    <>
      {data && data.total > 0 && (
        <div className="flex items-center justify-between gap-4 border-t border-border bg-bg px-5 py-3 text-sm text-muted">
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
    </>
  );

  const detail = selected ? (
    <FeedbackDetail
      key={selected}
      feedbackId={selected}
      back={<BackLink to={listUrl} className="min-[900px]:hidden" />}
      onChanged={onChanged}
      onDeleted={() => {
        navigate(listUrl, { replace: true, state: { feedbackDeleted: true } });
        setReloadKey((k) => k + 1);
      }}
    />
  ) : (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
      <Inbox className="h-6 w-6 text-faint" aria-hidden="true" />
      Select feedback to see it here.
    </div>
  );

  // Under 900px an open item is its own screen, so the header, cards and
  // toolbar step aside with the list.
  const hideOnSmallWhenSelected = selected ? "max-[899px]:hidden" : "";
  const popover = (name) => ({
    open: openFilter === name,
    onOpenChange: (open) => setOpenFilter(open ? name : null),
  });
  // Picking a single-choice value applies it and closes that popover.
  const choose = (key) => (value) => {
    update({ [key]: value });
    setOpenFilter(null);
  };
  const labelOf = (labels, key) => labels[params.get(key)] ?? "All";

  // From 900px the page fills the window below the top bar (3.5rem plus the
  // main area's 1.5rem top and bottom padding) and the panes take what is
  // left under the ~165px top area, each
  // scrolling on its own. On a very short window the panes keep a minimum
  // height and the page scrolls instead.
  return (
    <div className="flex flex-col gap-3 min-[900px]:h-[calc(100dvh-6.5rem)]">
      <header className={`flex shrink-0 flex-wrap items-center justify-between gap-3 ${hideOnSmallWhenSelected}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-lg font-semibold text-text">
            Feedback
            {data && (
              <span className="ml-2 text-sm font-normal text-muted">
                {data.total} {data.total === 1 ? "item" : "items"}
              </span>
            )}
          </h1>
          <RetentionNotice
            retentionDays={data?.retentionDays}
            pill
            intro="Everything customers have sent you, newest first."
          />
        </div>
        <ExportCsvButton query={exportQuery} disabled={data?.total === 0} onAccessError={handleAccessError} />
      </header>

      <div className={`shrink-0 ${hideOnSmallWhenSelected}`}>
        <QuickFilters
          params={params}
          counts={counts}
          onToggle={(key, value) => update({ [key]: params.get(key) === value ? null : value })}
        />
      </div>

      <div
        role="search"
        className={`relative flex shrink-0 flex-wrap items-center gap-3 rounded-card border border-border bg-panel p-[5px] max-[899px]:p-3 ${hideOnSmallWhenSelected}`}
      >
        <div className="relative basis-full min-[900px]:min-w-48 min-[900px]:flex-1 min-[900px]:basis-auto">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search feedback text and transcripts"
            aria-label="Search feedback text and transcripts"
            maxLength={200}
            className={`${inputClasses} h-9 border-border py-0 pl-9`}
          />
        </div>

        <FilterPopover label="Review" value={labelOf(REVIEW_STATUS_LABELS, "review")} active={Boolean(params.get("review"))}
          {...popover("review")}>
          <FilterChips label="Review" hideLabel value={params.get("review")} onChange={choose("review")}
            options={Object.entries(REVIEW_STATUS_LABELS)} />
        </FilterPopover>
        <FilterPopover label="Type" value={labelOf(SUBMISSION_TYPE_LABELS, "type")} active={Boolean(params.get("type"))}
          {...popover("type")}>
          <FilterChips label="Type" hideLabel value={params.get("type")} onChange={choose("type")}
            options={Object.entries(SUBMISSION_TYPE_LABELS)} />
        </FilterPopover>
        <FilterPopover label="Category" value={labelOf(CATEGORY_LABELS, "category")} active={Boolean(params.get("category"))}
          align="right" {...popover("category")}>
          <FilterChips label="Category" hideLabel value={params.get("category")} onChange={choose("category")}
            options={Object.entries(CATEGORY_LABELS)} />
        </FilterPopover>
        <FilterPopover label="More filters" badge={moreCount} active={moreCount > 0} align="right"
          {...popover("more")}>
          <div className="space-y-3">
            <FilterChips label="Complaint status" value={params.get("complaint")} onChange={(v) => update({ complaint: v })}
              options={Object.entries(COMPLAINT_STATUS_LABELS)} />
            <FilterChips label="Transcription" value={params.get("transcript")} onChange={(v) => update({ transcript: v })}
              options={Object.entries(TRANSCRIPT_STATUS_LABELS)} />
            <FilterSelect label="Source" value={params.get("link")} onChange={(v) => update({ link: v })}
              options={links.map((l) => [l.id, l.isActive ? l.name : `${l.name} (inactive)`])} />
            <DateFilter label="From" value={params.get("from")} max={params.get("to")} onChange={(v) => update({ from: v })} />
            <DateFilter label="To" value={params.get("to")} min={params.get("from")} onChange={(v) => update({ to: v })} />
          </div>
        </FilterPopover>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setOpenFilter(null);
              const next = new URLSearchParams();
              if (selected) next.set(SELECTED_KEY, selected);
              setParams(next, { replace: true });
            }}
            className="rounded-md px-2 text-sm font-semibold whitespace-nowrap text-accentText hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear all filters
          </button>
        )}
      </div>

      <ListDetail
        showDetail={Boolean(selected)}
        list={list}
        listFooter={listFooter}
        detail={detail}
        className="min-[900px]:mt-1 min-[900px]:min-h-60 min-[900px]:flex-1"
      />
    </div>
  );
}

function FeedbackRow({ item, to, selected }) {
  const isNew = item.reviewStatus === "new";
  const isVoice = item.submissionType === "voice";

  return (
    <ListDetailItem to={to} selected={selected}>
      <div className="flex gap-3">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew ? "bg-accent" : "bg-border"}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0">
              {isNew && <span className="sr-only">New. </span>}
              <span className="font-semibold text-accentText">{CATEGORY_LABELS[item.category] ?? item.category}</span>
              <span className="text-muted"> · {SUBMISSION_TYPE_LABELS[item.submissionType] ?? item.submissionType}</span>
            </span>
            <time
              dateTime={item.submittedAt}
              title={`${formatDate(item.submittedAt)}, ${formatTime(item.submittedAt)}`}
              className="shrink-0 text-muted"
            >
              {formatShortWhen(item.submittedAt)}
            </time>
          </div>

          <p className={`mt-2 line-clamp-2 break-words ${isNew ? "font-semibold text-text" : "text-text"}`}>
            {isVoice ? "Voice message" : item.excerpt}
          </p>

          {isVoice && (
            <div className="mt-2 flex items-center gap-2">
              <Waveform seed={item.id} bars={24} size="sm" />
              {item.audioDurationSec != null && (
                <span className="text-xs text-muted tabular-nums">{formatDuration(item.audioDurationSec)}</span>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="min-w-0 break-words">
              {item.customerName || "Anonymous"} · {item.link?.name ?? "—"}
              {!item.complaintStatus && <> · {REVIEW_STATUS_LABELS[item.reviewStatus]}</>}
            </span>
            {item.complaintStatus && <ComplaintStatusBadge status={item.complaintStatus} />}
          </div>
        </div>
      </div>
    </ListDetailItem>
  );
}

// Quick filter cards. Grid on wide screens; a sideways-scrolling row under
// 900px (the row scrolls, not the page). Selected = that filter is on.
function QuickFilters({ params, counts, onToggle }) {
  return (
    <div
      role="group"
      aria-label="Quick filters"
      className="-mx-1 flex gap-3 overflow-x-auto px-1 py-1 [scrollbar-width:thin] min-[900px]:mx-0 min-[900px]:grid min-[900px]:grid-cols-5 min-[900px]:overflow-visible min-[900px]:p-0"
    >
      {QUICK_FILTERS.map(({ label, key, value, count }) => {
        const selected = params.get(key) === value;
        const number = counts && !counts.error ? counts[count] : null;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(key, value)}
            className={`flex h-14 w-44 shrink-0 items-center justify-between gap-3 rounded-control border px-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent min-[900px]:w-auto ${
              selected ? "border-accent bg-accentSoft" : "border-border bg-panel hover:border-faint"
            }`}
          >
            <span className="text-xs leading-tight font-semibold text-muted">{label}</span>
            {/* Empty while loading or if the counts couldn't be loaded. */}
            <span className="text-xl leading-none font-bold text-text tabular-nums">{number}</span>
          </button>
        );
      })}
    </div>
  );
}

// Single-choice filter as chips; "All" clears it. `hideLabel` drops the
// visible heading where the popover's button already names the filter.
function FilterChips({ label, hideLabel = false, value, onChange, options }) {
  return (
    <div>
      {!hideLabel && (
        <p className="mb-1.5 text-xs font-semibold text-muted" aria-hidden="true">
          {label}
        </p>
      )}
      <ChipGroup label={label}>
        <Chip selected={!value} onClick={() => onChange("")}>
          All
        </Chip>
        {options.map(([optionValue, optionLabel]) => (
          <Chip key={optionValue} selected={value === optionValue} onClick={() => onChange(optionValue)}>
            {optionLabel}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClasses} border-border ${value ? "text-text" : "text-muted"}`}
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
      <span className="w-9 shrink-0 text-xs font-semibold text-muted">{label}</span>
      <input
        type="date"
        value={value ?? ""}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClasses} border-border`}
      />
    </label>
  );
}
