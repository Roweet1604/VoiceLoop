import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { LoaderCircle, RefreshCw, Info } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { inputClasses } from "../components/ui/TextField.jsx";
import Chip, { ChipGroup } from "../components/ui/Chip.jsx";
import Table from "../components/ui/Table.jsx";
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
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-text">Analytics</h1>
        <p className="mt-1 text-sm text-muted">Counted from your stored feedback for the dates you choose.</p>
        <RetentionNotice retentionDays={data?.retentionDays} className="mt-1.5" />
      </header>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-panel p-4 lg:flex-row lg:items-center lg:justify-between">
        <ChipGroup label="Quick ranges">
          {PRESETS.map((preset) => (
            <Chip
              key={preset.days}
              selected={to === today && days === preset.days}
              onClick={() =>
                setRange(preset.days === DEFAULT_DAYS ? { from: null, to: null } : { from: shiftDay(today, -(preset.days - 1)), to: today })
              }
              className="px-3.5 py-1.5 text-[13px]"
            >
              {preset.label}
            </Chip>
          ))}
        </ChipGroup>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:items-center">
          <DateInput label="From" value={from} max={to} onChange={(v) => setRange({ from: v })} />
          <DateInput label="To" value={to} min={from} onChange={(v) => setRange({ to: v })} />
        </div>
      </div>

      {rangeError && <Alert>{rangeError}</Alert>}

      {!rangeError && state.error && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{state.error.details ? Object.values(state.error.details).join(" ") : state.error.message}</Alert>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)} loading={state.loading}>
            {!state.loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Retry
          </Button>
        </div>
      )}

      {!rangeError && state.loading && !data && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading analytics…
        </div>
      )}

      {!rangeError && data && (
        <div className={`space-y-6 ${state.loading ? "opacity-60" : ""}`} aria-busy={state.loading}>
          <section aria-label="Totals" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Feedback received" value={data.total} to={inbox()} />
            <Tile label="Written" value={data.bySubmissionType.text} to={inbox({ type: "text" })} />
            <Tile label="Voice" value={data.bySubmissionType.voice} to={inbox({ type: "voice" })} />
            <Tile label="Complaints" value={data.complaints.received} to={inbox({ category: "complaint" })} />
          </section>

          {data.total === 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-text">No feedback in this period</h2>
              <p className="mt-1 text-sm text-muted">
                Nothing was received between {formatDay(data.range.from, { withYear: true })} and{" "}
                {formatDay(data.range.to, { withYear: true })}. Try a longer range, or share your{" "}
                <Link to="/app/links" className="font-semibold text-accentText hover:underline">
                  links and QR codes
                </Link>
                .
              </p>
            </Card>
          )}

          {/* Two columns from 1100px. */}
          <div className="grid items-start gap-6 min-[1100px]:grid-cols-2">
            {data.total > 0 && (
              <>
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-text">Feedback over time</h2>
                  <div className="mt-3">
                    <VolumeChart volume={data.volume} />
                  </div>
                </Card>
                <ComplaintsCard complaints={data.complaints} inbox={inbox} />
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-text">By category</h2>
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
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-text">By source</h2>
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
              </>
            )}
            {data.total === 0 && <ComplaintsCard complaints={data.complaints} inbox={inbox} />}
            <KeywordsCard keywords={data.keywords} />
          </div>
        </div>
      )}
    </div>
  );
}

function DateInput({ label, value, min, max, onChange }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-9 shrink-0 text-xs text-muted sm:w-auto">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        required
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={`${inputClasses} min-w-0 border-border-strong`}
      />
    </label>
  );
}

function Tile({ label, value, to }) {
  return (
    <Link
      to={to}
      className="rounded-card border border-border bg-panel px-5 py-4 shadow-card transition-colors hover:border-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <p className="text-3xl leading-none font-bold text-text tabular-nums">{numberFormat.format(value)}</p>
      <p className="mt-2 text-xs font-semibold text-muted">{label}</p>
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
    <Card className="@container p-5">
      <h2 className="text-sm font-semibold text-text">Complaints</h2>
      <div className="mt-3 grid gap-4 @xl:grid-cols-2">
        <div>
          <p className="text-xs text-muted">
            Current status of the {numberFormat.format(complaints.received)} complaints received in this period
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {rows.map(([label, value, to]) => (
              <Link key={label} to={to} className="rounded-control border border-border px-3 py-2 hover:border-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-0.5 text-lg font-semibold text-text tabular-nums">{numberFormat.format(value)}</p>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted">Resolved during this period, whenever they were received</p>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-control border border-border px-3 py-2">
              <dt className="text-xs text-muted">Resolved</dt>
              <dd className="mt-0.5 text-lg font-semibold text-text tabular-nums">{numberFormat.format(complaints.resolvedInRange)}</dd>
            </div>
            <div className="rounded-control border border-border px-3 py-2">
              <dt className="text-xs text-muted">Average time to resolve</dt>
              <dd className="mt-0.5 text-lg font-semibold text-text">
                {complaints.averageHoursToResolve === null ? (
                  <span className="text-sm font-normal text-muted">None resolved</span>
                ) : (
                  formatHours(complaints.averageHoursToResolve)
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">
            Measured from when the complaint was received to its latest resolution.
          </p>
        </div>
      </div>
    </Card>
  );
}

function KeywordsCard({ keywords }) {
  return (
    <Card className="p-5 min-[1100px]:col-span-2">
      <h2 className="text-sm font-semibold text-text">Repeated words in complaints</h2>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Simple keyword counts, not AI: words and two-word phrases that appear in at least {keywords.minCount}{" "}
          complaints, after removing common words like "the" and "was". Based on{" "}
          {numberFormat.format(keywords.complaintsAnalyzed)} complaints in this period.
        </span>
      </p>

      {keywords.items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {keywords.complaintsAnalyzed === 0
            ? "No complaints in this period."
            : `No word or phrase appears in ${keywords.minCount} or more complaints in this period.`}
        </p>
      ) : (
        <Table label="Repeated words in complaints" className="mt-4">
          <caption className="sr-only">Repeated words and phrases in complaints, with the number of complaints that mention each</caption>
          <thead>
            <tr>
              <th scope="col">Word or phrase</th>
              <th scope="col" className="text-right">Complaints</th>
            </tr>
          </thead>
          <tbody>
            {keywords.items.map((item) => (
              <tr key={item.term}>
                <td className="break-words">
                  <Link
                    to={`/app/feedback?${new URLSearchParams({ category: "complaint", q: item.term })}`}
                    className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {item.term}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{numberFormat.format(item.count)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
