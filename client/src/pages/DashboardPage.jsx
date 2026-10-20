import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { LoaderCircle, RefreshCw } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import PublicLink from "../components/PublicLink.jsx";
import { useBusiness, useHandleAccessError } from "../context/BusinessContext.jsx";
import { api } from "../lib/api.js";
import { publicFeedbackUrl } from "../lib/publicUrl.js";
import { CATEGORY_LABELS } from "../lib/feedbackLabels.js";

const numberFormat = new Intl.NumberFormat();

// Overview for the owner. Every number comes from /api/feedback/summary.
export default function DashboardPage() {
  const { business } = useBusiness();
  const handleAccessError = useHandleAccessError();
  const location = useLocation();
  const [state, setState] = useState({ loading: true, summary: null, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
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
    <>
      <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-muted">{business.name}</p>

      {location.state?.justCreated && (
        <Alert tone="success" className="mt-4">
          {business.name} is set up. Share your public feedback link below to start collecting feedback.
        </Alert>
      )}

      {state.error && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{state.error.message}</Alert>
          <Button variant="secondary" onClick={load} loading={state.loading}>
            {!state.loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Retry
          </Button>
        </div>
      )}

      {state.loading && !summary && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-ink-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}

      {summary && summary.total === 0 && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-ink">No feedback yet</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Share your link, or print a QR code for your counter, tables or rooms. New feedback appears here and in
            your inbox as soon as it's sent.
          </p>
          <div className="mt-4">
            <PublicLink url={publicFeedbackUrl(business.publicSlug)} />
          </div>
          <p className="mt-3 text-sm">
            <Link to="/app/links" className="font-medium text-accent hover:underline">
              Create links and QR codes
            </Link>
          </p>
        </Card>
      )}

      {summary && summary.total > 0 && (
        <>
          <section aria-label="Feedback summary" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Total feedback" value={summary.total} to="/app/feedback" />
            <StatTile label="Last 30 days" value={last30} to="/app/feedback" />
            <StatTile label="New, not reviewed" value={summary.new} to="/app/feedback?review=new" />
            <StatTile label="Open complaints" value={summary.openComplaints} to="/app/feedback?complaint=open" />
            <StatTile label="In progress" value={summary.inProgress} to="/app/feedback?complaint=in_progress" />
            <StatTile label="Resolved" value={summary.resolved} to="/app/feedback?complaint=resolved" />
          </section>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
          </div>

          <Card className="mt-4">
            <h2 className="text-sm font-semibold text-ink">Public feedback link</h2>
            <div className="mt-3">
              <PublicLink url={publicFeedbackUrl(business.publicSlug)} />
            </div>
          </Card>
        </>
      )}
    </>
  );
}

// Label + value. Values stay in ink; status colors are kept for statuses.
function StatTile({ label, value, to }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-surface px-4 py-3 shadow-xs transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{numberFormat.format(value)}</p>
    </Link>
  );
}

function CountTable({ title, rows }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
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
              <td className="py-1.5 pr-3">
                <Link to={row.to} className="break-words text-ink hover:underline">
                  {row.label}
                </Link>
              </td>
              <td className={`py-1.5 text-right tabular-nums ${row.count ? "text-ink" : "text-ink-muted"}`}>
                {numberFormat.format(row.count)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
