import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

// GETs a Super Admin endpoint (path under /api/super-admin) and reloads when
// the path changes. Pass null to skip. Previous data stays visible while
// reloading; a 401/403 re-checks the session so the route guards redirect.
export function useSuperAdminData(path) {
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: Boolean(path), data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(`/api/super-admin${path}`)
      .then((data) => !cancelled && setState({ loading: false, data, error: null }))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) refresh().catch(() => {});
        setState((s) => ({ ...s, loading: false, error: err }));
      });
    return () => {
      cancelled = true;
    };
  }, [path, reloadKey, refresh]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { ...state, reload };
}
