import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { LoaderCircle, RefreshCw, ArrowRight } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import PublicLink from "../components/PublicLink.jsx";
import TrendChart from "../components/analytics/TrendChart.jsx";
import { useBusiness, useHandleAccessError } from "../context/BusinessContext.jsx";
import { api } from "../lib/api.js";
import { publicFeedbackUrl } from "../lib/publicUrl.js";
import { formatShortWhen } from "../lib/format.js";
import { CATEGORY_LABELS, SUBMISSION_TYPE_LABELS } from "../lib/feedbackLabels.js";

const numberFormat = new Intl.NumberFormat();

const LATEST_COUNT = 5;

// Overview for the owner. Every number comes from /api/feedback/summary; the
// "Latest feedback" card is the newest page of the inbox's own list.
export default function DashboardPage() {
  const { business } = useBusiness();
  const handleAccessError = useHandleAccessError();
  const location = useLocation();
  const [state, setState] = useState({ loading: true, summary: null, error: null });
  const [latest, setLatest] = useState({ items: null, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    // Independent of the summary: if it fails, only its card says so.
    api(`/api/feedback?limit=${LATEST_COUNT}`)
      .then(({ feedback }) => setLatest({ items: feedback, error: null }))
      .catch((err) => {
        handleAccessError(err);
        setLatest({ items: null, error: err });
      });
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const summary = await api(`/api/feedback/summary?tz=${encodeURIComponent(tz)}`);
      setState({ loading: false, summary, error: null });
    } catch (err) {
      handleAccessError(err);
      setState((s) => ({ ...s, loading: false, error: err }));
    }
  }, [handleAccessError]);

  useEffect(() => {
    load();
  }, [load]);

  const { summary } = state;
  const last30 = summary?.volume.reduce((sum, day) => sum + day.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-text">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">{business.name}</p>
      </header>

      {location.state?.justCreated && (
        <Alert tone="success">
          {business.name} is set up. Share your public feedback link below to start collecting feedback.
        </Alert>
      )}

      {state.error && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{state.error.message}</Alert>
          <Button variant="secondary" onClick={load} loading={state.loading}>
            {!state.loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Retry
          </Button>
        </div>
      )}

      {state.loading && !summary && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}

      {summary && summary.total === 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-text">No feedback yet</h2>
          <p className="mt-1 text-sm text-muted">
            Share your link, or print a QR code for your counter, tables or rooms. New feedback appears here and in
            your inbox as soon as it's sent.
          </p>
          <div className="mt-4 max-w-2xl">
            <PublicLink url={publicFeedbackUrl(business.publicSlug)} />
          </div>
          <p className="mt-3 text-sm">
            <Link to="/app/links" className="font-semibold text-accentText hover:underline">
              Create links and QR codes
            </Link>
          </p>
        </Card>
      )}

      {summary && summary.total > 0 && (
        <>
          <section aria-label="Feedback summary" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Total feedback" value={summary.total} to="/app/feedback" />
            <StatTile label="Last 30 days" value={last30} to="/app/feedback" />
            <StatTile label="New, not reviewed" value={summary.new} to="/app/feedback?review=new" />
            <StatTile label="Open complaints" value={summary.openComplaints} to="/app/feedback?complaint=open" />
            <StatTile label="In progress" value={summary.inProgress} to="/app/feedback?complaint=in_progress" />
            <StatTile label="Resolved" value={summary.resolved} to="/app/feedback?complaint=resolved" />
          </section>

          <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-text">Last 30 days</h2>
              <p className="mt-1 text-xs text-muted">Feedback received per day.</p>
              <div className="mt-5">
                <TrendChart volume={summary.volume} />
              </div>
            </Card>
            <LatestFeedback latest={latest} />
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <CountTable
              title="By category"
              rows={summary.byCategory.map((c) => ({
                key: c.category,
                label: CATEGORY_LABELS[c.category],
                count: c.count,
                to: `/app/feedback?category=${c.category}`,
              }))}
            />
            <CountTable
              title="By source"
              rows={summary.byLink.map((l) => ({
                key: l.linkId,
                label: l.isActive ? l.name : `${l.name} (inactive)`,
                count: l.count,
                to: `/app/feedback?link=${l.linkId}`,
              }))}
            />
            <Card className="p-5 md:col-span-2 xl:col-span-1">
              <h2 className="text-sm font-semibold text-text">Public feedback link</h2>
              <div className="mt-3">
                <PublicLink url={publicFeedbackUrl(business.publicSlug)} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// The newest items, each opening in the inbox's detail pane.
function LatestFeedback({ latest }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">Latest feedback</h2>
        <Link
          to="/app/feedback"
          className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-accentText hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open inbox
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {latest.error && <Alert className="mt-4">{latest.error.message}</Alert>}
      {!latest.items && !latest.error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}
      {latest.items?.length === 0 && <p className="mt-4 text-sm text-muted">No feedback yet.</p>}
      {latest.items?.length > 0 && (
        <ul className="-mx-2 mt-3 divide-y divide-border">
          {latest.items.map((item) => {
            const isNew = item.reviewStatus === "new";
            return (
              <li key={item.id}>
                <Link
                  to={`/app/feedback?selected=${encodeURIComponent(item.id)}`}
                  className="flex gap-3 rounded-control px-2 py-3 transition-colors hover:bg-panel2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew ? "bg-accent" : "bg-border"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        {isNew && <span className="sr-only">New. </span>}
                        <span className="font-semibold text-accentText">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                        <span className="text-muted"> · {SUBMISSION_TYPE_LABELS[item.submissionType] ?? item.submissionType}</span>
                      </span>
                      <time dateTime={item.submittedAt} className="shrink-0 text-muted">
                        {formatShortWhen(item.submittedAt)}
                      </time>
                    </span>
                    <span className={`mt-1 line-clamp-2 block text-sm break-words text-text ${isNew ? "font-semibold" : ""}`}>
                      {item.submissionType === "voice" ? "Voice message" : item.excerpt}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Label + value. Values stay in ink; status colors are kept for statuses.
function StatTile({ label, value, to }) {
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

function CountTable({ title, rows }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">{title.replace("By ", "")}</th>
            <th scope="col">Feedback</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-2 pr-3">
                <Link to={row.to} className="break-words text-text hover:underline">
                  {row.label}
                </Link>
              </td>
              <td className={`py-2 text-right tabular-nums ${row.count ? "text-text" : "text-muted"}`}>
                {numberFormat.format(row.count)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
