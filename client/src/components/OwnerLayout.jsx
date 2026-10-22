import { Outlet } from "react-router";
import { LayoutDashboard, Inbox, BarChart3, QrCode, Settings } from "lucide-react";
import AppShell from "./AppShell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useBusiness } from "../context/BusinessContext.jsx";
import { useLogout } from "../hooks/useLogout.js";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/app/feedback", label: "Feedback", Icon: Inbox },
  { to: "/app/analytics", label: "Analytics", Icon: BarChart3 },
  { to: "/app/links", label: "Links & QR codes", Icon: QrCode },
  { to: "/app/settings", label: "Settings", Icon: Settings },
];

// Layout for the business dashboard.
export default function OwnerLayout() {
  const { session } = useAuth();
  const { business } = useBusiness();
  const { logout, loggingOut, error } = useLogout();

  return (
    <AppShell
      nav={NAV}
      homeTo="/app/dashboard"
      heading={
        <>
          <p className="truncate text-sm font-semibold text-text" title={business.name}>
            {business.name}
          </p>
          {business.locationName && <p className="truncate text-xs text-muted">{business.locationName}</p>}
        </>
      }
      aside={
        <p className="truncate text-xs text-muted max-[479px]:hidden" title={session.user.email}>
          {session.user.email}
        </p>
      }
      onLogout={logout}
      loggingOut={loggingOut}
      error={error}
    >
      <Outlet />
    </AppShell>
  );
}
