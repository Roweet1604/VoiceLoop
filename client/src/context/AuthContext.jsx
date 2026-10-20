import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const AuthContext = createContext(null);

// session is { user, organization } as returned by the auth endpoints, or
// null when logged out. status is "loading" until the first /me call settles,
// then "ready", or "error" if the server could not be reached.
export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

  // Re-reads the session from the server. A 401 simply means "logged out";
  // anything else is a real failure and is rethrown to the caller.
  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/auth/me");
      setSession(data);
      return data;
    } catch (err) {
      if (err.status === 401) {
        setSession(null);
        return null;
      }
      throw err;
    }
  }, []);

  const loadInitialSession = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      await refresh();
      setStatus("ready");
    } catch (err) {
      setError(err);
      setStatus("error");
    }
  }, [refresh]);

  useEffect(() => {
    loadInitialSession();
  }, [loadInitialSession]);

  const login = useCallback(async (credentials) => {
    const data = await api("/api/auth/login", { method: "POST", body: credentials });
    setSession(data);
    return data;
  }, []);

  const register = useCallback(async (details) => {
    const data = await api("/api/auth/register", { method: "POST", body: details });
    setSession(data);
    return data;
  }, []);

  // Only forget the session once the server has cleared the cookie; otherwise
  // the next page load would silently log the user back in.
  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ status, session, error, refresh, retry: loadInitialSession, login, register, logout }),
    [status, session, error, refresh, loadInitialSession, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
