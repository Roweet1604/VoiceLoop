import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function HealthPage() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-900">VoiceLoop</h1>
        <p className="mt-1 text-sm text-slate-500">API health check</p>

        <div className="mt-6 flex items-center gap-3">
          {state.loading && (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="text-slate-600">Checking…</span>
            </>
          )}
          {state.data && (
            <>
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <span className="text-slate-800">
                Server status: <strong>{state.data.status}</strong>
              </span>
            </>
          )}
          {state.error && (
            <>
              <XCircle className="h-6 w-6 text-red-600" />
              <span className="text-slate-800">Server unreachable ({state.error})</span>
            </>
          )}
        </div>

        {state.data && (
          <pre className="mt-4 rounded bg-slate-100 p-3 text-xs text-slate-700">
            {JSON.stringify(state.data)}
          </pre>
        )}
      </div>
    </main>
  );
}
