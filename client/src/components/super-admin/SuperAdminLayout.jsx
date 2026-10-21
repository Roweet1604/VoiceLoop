import { NavLink, Outlet } from "react-router";
import { Users, ScrollText } from "lucide-react";
import AppHeader from "../AppHeader.jsx";
import Alert from "../ui/Alert.jsx";
import { useLogout } from "../../hooks/useLogout.js";

const NAV = [
  { to: "/super-admin", label: "Accounts", Icon: Users, end: true },
  { to: "/super-admin/audit-logs", label: "Audit log", Icon: ScrollText },
];

// Shared frame for the Super Admin pages: header plus a small tab row.
export default function SuperAdminLayout() {
  const { logout, loggingOut, error } = useLogout();

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader label="Super Admin" onLogout={logout} loggingOut={loggingOut} maxWidth="max-w-6xl" />
      <nav aria-label="Super Admin" className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl gap-1 px-4">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  isActive ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Outlet />
      </main>
    </div>
  );
}
