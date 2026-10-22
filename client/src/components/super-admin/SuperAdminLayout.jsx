import { Outlet } from "react-router";
import { Users, ScrollText } from "lucide-react";
import AppShell from "../AppShell.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLogout } from "../../hooks/useLogout.js";

const NAV = [
  { to: "/super-admin", label: "Accounts", Icon: Users, end: true },
  { to: "/super-admin/audit-logs", label: "Audit log", Icon: ScrollText },
];

// Shared frame for the Super Admin pages.
export default function SuperAdminLayout() {
  const { session } = useAuth();
  const { logout, loggingOut, error } = useLogout();

  return (
    <AppShell
      nav={NAV}
      homeTo="/super-admin"
      heading={
        <span className="inline-flex items-center gap-2">
          <span className="text-sm font-semibold text-text">VoiceLoop</span>
          <span className="rounded-full border border-border bg-panel2 px-2 py-0.5 text-xs font-semibold text-muted">
            Super Admin
          </span>
        </span>
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
