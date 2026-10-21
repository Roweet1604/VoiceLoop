import { Link } from "react-router";
import { RefreshCw } from "lucide-react";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import { formatBytes } from "../../lib/format.js";

const numberFormat = new Intl.NumberFormat();

// Account tiles link to the matching view of the accounts table.
const ACCOUNT_TILES = [
  { key: "pending", label: "Pending requests", view: null, tone: "warning" },
  { key: "active", label: "Active", view: "active" },
  { key: "expiringSoon", label: "Expiring in 7 days", view: "expiring", tone: "warning" },
  { key: "suspended", label: "Suspended", view: "suspended" },
  { key: "expired", label: "Expired", view: "expired" },
  { key: "rejected", label: "Rejected", view: "rejected" },
];

const tileClasses = "rounded-lg border border-border bg-surface px-3 py-2.5 shadow-xs";

// Platform-wide counts from GET /api/super-admin/overview.
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ACCOUNT_TILES.map((tile) => {
          const count = data?.accounts[tile.key] ?? 0;
          const highlight = tile.tone === "warning" && count > 0;
          return (
            <Link
              key={tile.key}
              to={tile.view ? `/super-admin?view=${tile.view}` : "/super-admin"}
              className={`${tileClasses} transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
            >
              <p className="text-xs text-ink-muted">{tile.label}</p>
              <p className={`mt-0.5 text-xl font-semibold tabular-nums ${highlight ? "text-warning" : "text-ink"}`}>
                {value(count)}
              </p>
            </Link>
          );
        })}
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label="Businesses">{value(data?.businesses)}</Stat>
        <Stat label="Feedback received">{value(data?.feedback)}</Stat>
        <Stat label="Voice recordings stored">
          {value(data?.voiceRecordings)}
          {data && <span className="ml-1.5 text-sm font-normal text-ink-muted">{formatBytes(data.audioBytes)}</span>}
        </Stat>
      </dl>
    </section>
  );
}

function Stat({ label, children }) {
  return (
    <div className={`${tileClasses} flex items-baseline justify-between gap-3`}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-base font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}
