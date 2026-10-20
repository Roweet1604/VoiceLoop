import { NavLink, Outlet } from "react-router";
import { LayoutDashboard, QrCode, Settings, LogOut } from "lucide-react";
import { Wordmark } from "./AuthLayout.jsx";
import Button from "./ui/Button.jsx";
import Alert from "./ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useBusiness } from "../context/BusinessContext.jsx";
import { useLogout } from "../hooks/useLogout.js";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/app/links", label: "Links & QR codes", Icon: QrCode },
  { to: "/app/settings", label: "Settings", Icon: Settings },
];

function navClasses({ isActive }) {
  return `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
    isActive ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-subtle hover:text-ink"
  }`;
}

// Layout for the business dashboard: a sidebar on wide screens, a top bar
// with the same links on narrow ones.
export default function AppShell() {
  const { session } = useAuth();
  const { business } = useBusiness();
  const { logout, loggingOut, error } = useLogout();

  const navLinks = NAV.map(({ to, label, Icon }) => (
    <NavLink key={to} to={to} className={navClasses}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </NavLink>
  ));

  return (
    <div className="min-h-screen bg-canvas md:flex">
      {/* Sidebar (md and up) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-screen">
        <div className="border-b border-border px-4 py-4">
          <Wordmark />
          <p className="mt-3 truncate text-sm font-medium text-ink" title={business.name}>
            {business.name}
          </p>
          {business.locationName && <p className="truncate text-xs text-ink-muted">{business.locationName}</p>}
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 p-3">
          {navLinks}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate px-1 text-xs text-ink-muted" title={session.user.email}>
            {session.user.email}
          </p>
          <Button variant="secondary" size="sm" onClick={logout} loading={loggingOut} className="mt-2 w-full">
            {!loggingOut && <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
            Log out
          </Button>
        </div>
      </aside>

      {/* Top bar (below md) */}
      <header className="border-b border-border bg-surface md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Wordmark />
          <Button variant="secondary" size="sm" onClick={logout} loading={loggingOut}>
            Log out
          </Button>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2">
          {navLinks}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-3xl">
          {error && <Alert className="mb-4">{error}</Alert>}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
