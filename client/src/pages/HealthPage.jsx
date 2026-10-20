import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import { api } from "../lib/api.js";

// Developer check at /health: confirms the browser can reach the API.
export default function HealthPage() {
  const [state, setState] = useState({ loading: true, ok: false, error: null });

  const checkHealth = useCallback(() => {
    setState({ loading: true, ok: false, error: null });
    api("/api/health")
      .then(() => setState({ loading: false, ok: true, error: null }))
      .catch((err) => setState({ loading: false, ok: false, error: err.message }));
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-xs">
        <h1 className="text-sm font-semibold text-ink">API health</h1>
        <div className="mt-3 flex items-center gap-2 text-sm" role="status">
          {state.loading && <LoaderCircle className="h-4 w-4 animate-spin text-ink-subtle" aria-hidden="true" />}
          {state.ok && <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />}
          {state.error && <CircleX className="h-4 w-4 text-danger" aria-hidden="true" />}
          <span className="text-ink-muted">
            {state.loading ? "Checking…" : state.ok ? "API is reachable" : state.error}
          </span>
        </div>
        <Button variant="secondary" onClick={checkHealth} disabled={state.loading} className="mt-4 w-full">
          Check again
        </Button>
      </Card>
    </main>
  );
}
