import { Routes, Route, Navigate } from "react-router";
import {
  SessionGate,
  RootRedirect,
  GuestOnly,
  RequireAuth,
  RequireActiveAccess,
  RequireSuperAdmin,
} from "./components/RouteGuards.jsx";
import { BusinessGate } from "./context/BusinessContext.jsx";
import AppShell from "./components/AppShell.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import WaitingPage from "./pages/WaitingPage.jsx";
import SetupPage from "./pages/SetupPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import LinksPage from "./pages/LinksPage.jsx";
import FeedbackInboxPage from "./pages/FeedbackInboxPage.jsx";
import FeedbackDetailPage from "./pages/FeedbackDetailPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import FeedbackPage from "./pages/FeedbackPage.jsx";
import SuperAdminPage from "./pages/SuperAdminPage.jsx";
import HealthPage from "./pages/HealthPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
  return (
    <Routes>
      {/* Outside the session gate so it still works when the API is down. */}
      <Route path="/health" element={<HealthPage />} />
      {/* Public customer page: no session needed, so it never waits on /me. */}
      <Route path="/f/:slug/:code?" element={<FeedbackPage />} />

      <Route element={<SessionGate />}>
        <Route index element={<RootRedirect />} />

        <Route element={<GuestOnly />}>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/waiting-for-approval" element={<WaitingPage />} />
        </Route>

        {/* Active owners. BusinessGate sends owners without a business to setup. */}
        <Route path="/app" element={<RequireActiveAccess />}>
          <Route element={<BusinessGate />}>
            <Route path="setup" element={<SetupPage />} />
            <Route element={<AppShell />}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="feedback" element={<FeedbackInboxPage />} />
              <Route path="feedback/:feedbackId" element={<FeedbackDetailPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="links" element={<LinksPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Route>
        </Route>

        <Route path="/super-admin" element={<RequireSuperAdmin />}>
          <Route index element={<SuperAdminPage />} />
          <Route path="*" element={<Navigate to="/super-admin" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
