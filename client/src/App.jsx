import { Routes, Route, Navigate } from "react-router";
import { SessionGate, RootRedirect, GuestOnly, RequireAuth, RequireActiveAccess } from "./components/RouteGuards.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import WaitingPage from "./pages/WaitingPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import HealthPage from "./pages/HealthPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
  return (
    <Routes>
      {/* Outside the session gate so it still works when the API is down. */}
      <Route path="/health" element={<HealthPage />} />

      <Route element={<SessionGate />}>
        <Route index element={<RootRedirect />} />

        <Route element={<GuestOnly />}>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/waiting-for-approval" element={<WaitingPage />} />
        </Route>

        <Route path="/app" element={<RequireActiveAccess />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
