import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { canUseApp, homePathFor } from "../lib/access.js";
import { FullPageLoader, FullPageError } from "./FullPageStatus.jsx";

// Wraps every route that depends on the session. Nothing below it renders
// until the initial /me check has settled, so the guards below always see a
// final answer rather than a "still loading" null session.
export function SessionGate() {
  const { status, error, retry } = useAuth();
  if (status === "loading") return <FullPageLoader />;
  if (status === "error") return <FullPageError message={error.message} onRetry={retry} />;
  return <Outlet />;
}

// "/" has no public page yet: send people to wherever they belong.
export function RootRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? homePathFor(session) : "/login"} replace />;
}

// Logged-in users only. Logged-out visitors go to /login, remembering where
// they were headed so login can send them back.
export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

// For /app/*: logged in AND allowed to use the app. Pending, rejected,
// suspended and expired accounts are sent to the waiting page instead.
export function RequireActiveAccess() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!canUseApp(session)) return <Navigate to="/waiting-for-approval" replace />;
  return <Outlet />;
}

// For /login and /signup: users who arrive already logged in are sent home.
// A session that appears while on the page (the user just submitted the
// form) is left alone, so the page's own redirect wins and can pass state.
export function GuestOnly() {
  const { session } = useAuth();
  const [arrivedLoggedIn] = useState(() => Boolean(session));
  if (session && arrivedLoggedIn) return <Navigate to={homePathFor(session)} replace />;
  return <Outlet />;
}
