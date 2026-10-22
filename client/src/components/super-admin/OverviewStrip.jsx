import { RefreshCw } from "lucide-react";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import { formatBytes } from "../../lib/format.js";

const numberFormat = new Intl.NumberFormat();

// Platform-wide totals from GET /api/super-admin/overview, as one slim row.
// (The per-status account counts are the Accounts page's summary cards.)
export default function OverviewStrip({ overview }) {
  const { loading, data, error, reload } = overview;

  if (error && !data) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Alert className="flex-1">Couldn't load the overview: {error.message}</Alert>
        <Button variant="secondary" onClick={reload}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  const value = (n) => (data ? numberFormat.format(n) : "–");

  return (
    <section aria-label="Platform overview" aria-busy={loading} className={loading && data ? "opacity-60" : ""}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Businesses">{value(data?.businesses)}</Stat>
        <Stat label="Feedback received">{value(data?.feedback)}</Stat>
        <Stat label="Voice recordings stored">
          {value(data?.voiceRecordings)}
          {data && <span className="ml-1.5 text-sm font-normal text-muted">{formatBytes(data.audioBytes)}</span>}
        </Stat>
      </dl>
    </section>
  );
}

function Stat({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-card border border-border bg-panel px-5 py-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-base font-semibold text-text tabular-nums">{children}</dd>
    </div>
  );
}
