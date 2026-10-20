import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

// Loads one page of the Super Admin account list. `query` is a URL query
// string. The previous data stays visible while a new page loads.
export function useAccounts(query) {
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    api(`/api/super-admin/accounts?${query}`)
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // Session ended or role changed: re-check, and the route guards redirect.
        if (err.status === 401 || err.status === 403) refresh().catch(() => {});
        setState((s) => ({ ...s, loading: false, error: err }));
      });

    return () => {
      cancelled = true;
    };
  }, [query, reloadKey, refresh]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Drop a row the server has confirmed is gone, without waiting for a reload.
  const removeAccount = useCallback((id) => {
    setState((s) =>
      s.data
        ? { ...s, data: { ...s.data, accounts: s.data.accounts.filter((a) => a.id !== id), total: s.data.total - 1 } }
        : s
    );
  }, []);

  return { ...state, reload, removeAccount };
}
