import { LogOut } from "lucide-react";
import { Wordmark } from "./AuthLayout.jsx";
import Button from "./ui/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// Top bar for signed-in areas. `label` marks the area, e.g. "Super Admin".
export default function AppHeader({ label, onLogout, loggingOut, maxWidth = "max-w-5xl" }) {
  const { session } = useAuth();

  return (
    <header className="border-b border-border bg-surface">
      <div className={`mx-auto flex h-14 items-center justify-between gap-4 px-4 ${maxWidth}`}>
        <div className="flex items-center gap-3">
          <Wordmark />
          {label && (
            <span className="rounded-sm border border-border bg-subtle px-1.5 py-0.5 text-xs font-medium text-ink-muted">
              {label}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden truncate text-sm text-ink-muted sm:block">{session.user.email}</span>
          <Button variant="secondary" onClick={onLogout} loading={loggingOut} className="px-3 py-1.5">
            {!loggingOut && <LogOut className="h-4 w-4" aria-hidden="true" />}
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
