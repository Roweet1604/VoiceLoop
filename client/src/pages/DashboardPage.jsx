import { LogOut } from "lucide-react";
import { Wordmark } from "../components/AuthLayout.jsx";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLogout } from "../hooks/useLogout.js";

// Placeholder until the business dashboard is built. Shows only real
// account data, no sample metrics.
export default function DashboardPage() {
  const { session } = useAuth();
  const { logout, loggingOut, error } = useLogout();
  const { user, organization } = session;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Wordmark />
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-ink-muted sm:block">{user.email}</span>
            <Button variant="secondary" onClick={logout} loading={loggingOut} className="px-3 py-1.5">
              {!loggingOut && <LogOut className="h-4 w-4" aria-hidden="true" />}
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {error && <Alert className="mb-4">{error}</Alert>}
        <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">{organization?.name ?? "VoiceLoop administration"}</p>

        <Card className="mt-6">
          <p className="text-sm font-medium text-ink">Signed in as {user.name}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Feedback, links and reports will appear here once they're set up.
          </p>
        </Card>
      </main>
    </div>
  );
}
