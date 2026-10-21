import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { LoaderCircle, RefreshCw, Info } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { inputClasses } from "../components/ui/TextField.jsx";
import VolumeChart from "../components/analytics/VolumeChart.jsx";
import BarTable from "../components/analytics/BarTable.jsx";
import RetentionNotice from "../components/feedback/RetentionNotice.jsx";
import { useHandleAccessError } from "../context/BusinessContext.jsx";
import { api } from "../lib/api.js";
import { formatDay, shiftDay, toDayString } from "../lib/format.js";
import { CATEGORY_LABELS } from "../lib/feedbackLabels.js";

const numberFormat = new Intl.NumberFormat();
const MAX_DAYS = 366; // mirrors the server
const DEFAULT_DAYS = 30;
const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

// 35.3 -> "35.3 hours", 70 -> "2.9 days", 0.4 -> "24 minutes".
function formatHours(hours) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} hours`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

// Owner analytics. Every number is counted by the server from stored
// feedback for the chosen dates; nothing here is estimated or generated.
export default function AnalyticsPage() {
  const handleAccessError = useHandleAccessError();
  const [params, setParams] = useSearchParams();
  const today = toDayString(new Date());
  const to = params.get("to") || today;
  const from = params.get("from") || shiftDay(to, -(DEFAULT_DAYS - 1));
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const days = daysBetween(from, to);
  const rangeError =
    Number.isNaN(days) ? "Choose both dates." : days < 1 ? "The end date must be on or after the start date." : days > MAX_DAYS ? `Choose at most ${MAX_DAYS} days.` : null;

  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (rangeError) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const query = new URLSearchParams({ from, to, tz: timeZone });
    api(`/api/analytics?${query}`)
      .then((data) => !cancelled && setState({ loading: false, data, error: null }))
      .catch((err) => {
        if (cancelled) return;
        handleAccessError(err);
        setState((s) => ({ ...s, loading: false, error: err }));
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, timeZone, rangeError, reloadKey, handleAccessError]);

  function setRange(next) {
    const p = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setParams(p, { replace: true });
  }

  const { data } = state;
  // Inbox links for the same dates (the inbox takes local days too).
  const inbox = (extra = {}) => `/app/feedback?${new URLSearchParams({ ...extra, from, to })}`;

  return (
    <>
      <h1 className="text-lg font-semibold text-ink">Analytics</h1>
      <p className="mt-1 text-sm text-ink-muted">Counted from your stored feedback for the dates you choose.</p>
      <RetentionNotice retentionDays={data?.retentionDays} className="mt-1.5" />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Quick ranges">
          {PRESETS.map((preset) => {
            const active = to === today && days === preset.days;
            return (
              <button
                key={preset.days}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setRange(preset.days === DEFAULT_DAYS ? { from: null, to: null } : { from: shiftDay(today, -(preset.days - 1)), to: today })
                }
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active ? "border-accent bg-accent-soft font-medium text-accent" : "border-border-strong bg-surface text-ink hover:bg-subtle"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <DateInput label="From" value={from} max={to} onChange={(v) => setRange({ from: v })} />
          <DateInput label="To" value={to} min={from} onChange={(v) => setRange({ to: v })} />
        </div>
      </div>

      {rangeError && <Alert className="mt-4">{rangeError}</Alert>}

      {!rangeError && state.error && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{state.error.details ? Object.values(state.error.details).join(" ") : state.error.message}</Alert>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)} loading={state.loading}>
            {!state.loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Retry
          </Button>
        </div>
      )}

      {!rangeError && state.loading && !data && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-ink-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading analytics…
        </div>
      )}

      {!rangeError && data && (
        <div className={`mt-6 space-y-4 ${state.loading ? "opacity-60" : ""}`} aria-busy={state.loading}>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Feedback received" value={data.total} to={inbox()} />
            <Tile label="Written" value={data.bySubmissionType.text} to={inbox({ type: "text" })} />
            <Tile label="Voice" value={data.bySubmissionType.voice} to={inbox({ type: "voice" })} />
            <Tile label="Complaints" value={data.complaints.received} to={inbox({ category: "complaint" })} />
          </section>

          {data.total === 0 ? (
            <Card>
              <h2 className="text-sm font-semibold text-ink">No feedback in this period</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Nothing was received between {formatDay(data.range.from, { withYear: true })} and{" "}
                {formatDay(data.range.to, { withYear: true })}. Try a longer range, or share your{" "}
                <Link to="/app/links" className="font-medium text-accent hover:underline">
                  links and QR codes
                </Link>
                .
              </p>
            </Card>
          ) : (
            <>
              <Card>
                <h2 className="text-sm font-semibold text-ink">Feedback over time</h2>
                <div className="mt-3">
                  <VolumeChart volume={data.volume} />
                </div>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <h2 className="text-sm font-semibold text-ink">By category</h2>
                  <div className="mt-3">
                    <BarTable
                      caption="Feedback by category"
                      labelHeading="Category"
                      rows={data.byCategory.map((c) => ({
                        key: c.category,
                        label: CATEGORY_LABELS[c.category],
                        count: c.count,
                        to: inbox({ category: c.category }),
                      }))}
                    />
                  </div>
                </Card>
                <Card>
                  <h2 className="text-sm font-semibold text-ink">By source</h2>
                  <div className="mt-3">
                    <BarTable
                      caption="Feedback by source"
                      labelHeading="Source"
                      rows={[
                        ...data.byLink.map((l) => ({
                          key: l.linkId,
                          label: l.name,
                          note: l.isActive ? null : "(inactive)",
                          count: l.count,
                          to: inbox({ link: l.linkId }),
                        })),
                        ...(data.unlinkedCount > 0 ? [{ key: "none", label: "No source", count: data.unlinkedCount }] : []),
                      ]}
                    />
                  </div>
                </Card>
              </div>
            </>
          )}

          <ComplaintsCard complaints={data.complaints} inbox={inbox} />
          <KeywordsCard keywords={data.keywords} />
        </div>
      )}
    </>
  );
}

function DateInput({ label, value, min, max, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-xs text-ink-muted sm:w-auto">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        required
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={`${inputClasses} border-border-strong`}
      />
    </label>
  );
}

function Tile({ label, value, to }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-surface px-4 py-3 shadow-xs transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{numberFormat.format(value)}</p>
    </Link>
  );
}

function ComplaintsCard({ complaints, inbox }) {
  const rows = [
    ["Open", complaints.open, inbox({ category: "complaint", complaint: "open" })],
    ["In progress", complaints.inProgress, inbox({ category: "complaint", complaint: "in_progress" })],
    ["Resolved", complaints.resolved, inbox({ category: "complaint", complaint: "resolved" })],
  ];
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink">Complaints</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs text-ink-muted">
            Current status of the {numberFormat.format(complaints.received)} complaints received in this period
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {rows.map(([label, value, to]) => (
              <Link key={label} to={to} className="rounded-md border border-border px-3 py-2 hover:border-border-strong">
                <p className="text-xs text-ink-muted">{label}</p>
                <p className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{numberFormat.format(value)}</p>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Resolved during this period, whenever they were received</p>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border px-3 py-2">
              <dt className="text-xs text-ink-muted">Resolved</dt>
              <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{numberFormat.format(complaints.resolvedInRange)}</dd>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <dt className="text-xs text-ink-muted">Average time to resolve</dt>
              <dd className="mt-0.5 text-lg font-semibold text-ink">
                {complaints.averageHoursToResolve === null ? (
                  <span className="text-sm font-normal text-ink-muted">None resolved</span>
                ) : (
                  formatHours(complaints.averageHoursToResolve)
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-muted">
            Measured from when the complaint was received to its latest resolution.
          </p>
        </div>
      </div>
    </Card>
  );
}

function KeywordsCard({ keywords }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink">Repeated words in complaints</h2>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Simple keyword counts, not AI: words and two-word phrases that appear in at least {keywords.minCount}{" "}
          complaints, after removing common words like "the" and "was". Based on{" "}
          {numberFormat.format(keywords.complaintsAnalyzed)} complaints in this period.
        </span>
      </p>

      {keywords.items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          {keywords.complaintsAnalyzed === 0
            ? "No complaints in this period."
            : `No word or phrase appears in ${keywords.minCount} or more complaints in this period.`}
        </p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Repeated words and phrases in complaints, with the number of complaints that mention each</caption>
          <thead className="border-b border-border text-xs text-ink-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 text-left font-medium">Word or phrase</th>
              <th scope="col" className="py-2 text-right font-medium">Complaints</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keywords.items.map((item) => (
              <tr key={item.term}>
                <td className="py-1.5 pr-3 break-words text-ink">
                  <Link to={`/app/feedback?${new URLSearchParams({ category: "complaint", q: item.term })}`} className="hover:underline">
                    {item.term}
                  </Link>
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink">{numberFormat.format(item.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
