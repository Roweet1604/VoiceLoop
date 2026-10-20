import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Reference swatches for the tokens defined in index.css. Class names are
// written out in full so Tailwind can detect them.
const COLOR_GROUPS = [
  {
    label: "Neutrals",
    swatches: [
      ["canvas", "bg-canvas"],
      ["surface", "bg-surface"],
      ["subtle", "bg-subtle"],
      ["border", "bg-border"],
      ["border-strong", "bg-border-strong"],
      ["ink-subtle", "bg-ink-subtle"],
      ["ink-muted", "bg-ink-muted"],
      ["ink", "bg-ink"],
    ],
  },
  {
    label: "Accent",
    swatches: [
      ["accent-soft", "bg-accent-soft"],
      ["accent", "bg-accent"],
      ["accent-hover", "bg-accent-hover"],
    ],
  },
];

const STATUSES = [
  ["Resolved", "bg-success-soft text-success"],
  ["In progress", "bg-warning-soft text-warning"],
  ["Open complaint", "bg-danger-soft text-danger"],
  ["New", "bg-accent-soft text-accent"],
];

const RADII = [
  ["sm · 4px", "rounded-sm"],
  ["md · 8px", "rounded-md"],
  ["lg · 12px", "rounded-lg"],
];

const SHADOWS = [
  ["xs", "shadow-xs"],
  ["sm", "shadow-sm"],
];

function TokenReference() {
  return (
    <Card className="w-full max-w-sm">
      <h2 className="text-sm font-semibold text-ink">Design tokens</h2>

      {COLOR_GROUPS.map((group) => (
        <div key={group.label} className="mt-4">
          <p className="text-xs font-medium text-ink-muted">{group.label}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.swatches.map(([name, bg]) => (
              <div
                key={name}
                title={name}
                className={`h-7 w-7 rounded-sm border border-border ${bg}`}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-muted">Status</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STATUSES.map(([label, classes]) => (
            <span key={label} className={`rounded-sm px-2 py-0.5 text-xs font-medium ${classes}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-ink-muted">Radius</p>
          <div className="mt-2 flex gap-2">
            {RADII.map(([label, radius]) => (
              <div
                key={label}
                title={label}
                className={`h-8 w-8 border border-border-strong bg-subtle ${radius}`}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-muted">Shadow</p>
          <div className="mt-2 flex gap-2">
            {SHADOWS.map(([label, shadow]) => (
              <div
                key={label}
                title={label}
                className={`h-8 w-8 rounded-md border border-border bg-surface ${shadow}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-muted">Type · Inter</p>
        <p className="mt-1 text-base font-semibold text-ink">Feedback inbox</p>
        <p className="text-sm text-ink-muted">3 new complaints since yesterday</p>
        <p className="font-mono text-xs text-ink-subtle">/f/corner-cafe</p>
      </div>
    </Card>
  );
}

export default function HealthPage() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const checkHealth = useCallback(() => {
    setState({ loading: true, data: null, error: null });
    fetch(`${API_URL}/api/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-ink">VoiceLoop</h1>
        <p className="mt-1 text-sm text-ink-muted">API health check</p>

        <div className="mt-6 flex items-center gap-3">
          {state.loading && (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-ink-subtle" />
              <span className="text-sm text-ink-muted">Checking…</span>
            </>
          )}
          {state.data && (
            <>
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="text-sm text-ink">
                Server status: <strong className="font-semibold">{state.data.status}</strong>
              </span>
            </>
          )}
          {state.error && (
            <>
              <XCircle className="h-5 w-5 text-danger" />
              <span className="text-sm text-ink">Server unreachable ({state.error})</span>
            </>
          )}
        </div>

        {state.data && (
          <pre className="mt-4 rounded-sm border border-border bg-subtle p-3 font-mono text-xs text-ink-muted">
            {JSON.stringify(state.data)}
          </pre>
        )}

        <div className="mt-6 flex gap-2">
          <Button onClick={checkHealth} disabled={state.loading}>
            <RefreshCw className="h-4 w-4" />
            Check again
          </Button>
          <Button variant="secondary" onClick={() => window.open(`${API_URL}/api/health`, "_blank")}>
            View raw
          </Button>
        </div>
      </Card>

      <TokenReference />
    </main>
  );
}
