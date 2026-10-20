import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "./AuthContext.jsx";
import { FullPageLoader, FullPageError } from "../components/FullPageStatus.jsx";

const BusinessContext = createContext(null);

const SETUP_PATH = "/app/setup";

// Layout route for /app/*. Loads the owner's business once and shares it.
// Owners without a business are sent to /app/setup; owners with one can't
// go back to setup.
export function BusinessGate() {
  const { refresh } = useAuth();
  const location = useLocation();
  const [state, setState] = useState({ status: "loading", business: null, error: null });

  const load = useCallback(async () => {
    setState({ status: "loading", business: null, error: null });
    try {
      const { business } = await api("/api/business");
      setState({ status: "ready", business, error: null });
    } catch (err) {
      // Logged out, or access ended (suspended/expired) since the page loaded:
      // re-read the session and the route guards redirect accordingly.
      if (err.status === 401 || err.status === 403) refresh().catch(() => {});
      setState({ status: "error", business: null, error: err });
    }
  }, [refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const setBusiness = useCallback((business) => setState({ status: "ready", business, error: null }), []);

  if (state.status === "loading") return <FullPageLoader />;
  if (state.status === "error") return <FullPageError message={state.error.message} onRetry={load} />;

  const onSetup = location.pathname === SETUP_PATH;
  if (!state.business && !onSetup) return <Navigate to={SETUP_PATH} replace />;
  if (state.business && onSetup) return <Navigate to="/app/dashboard" replace />;

  return (
    <BusinessContext.Provider value={{ business: state.business, setBusiness }}>
      <Outlet />
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error("useBusiness must be used inside <BusinessGate>");
  return context;
}

// For pages that save business changes: a 401/403 means the session or
// access changed, so re-check it (the guards then redirect).
export function useHandleAccessError() {
  const { refresh } = useAuth();
  return useCallback(
    (err) => {
      if (err.status === 401 || err.status === 403) refresh().catch(() => {});
    },
    [refresh]
  );
}
