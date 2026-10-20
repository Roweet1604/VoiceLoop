import AppHeader from "../components/AppHeader.jsx";
import Card from "../components/ui/Card.jsx";
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
      <AppHeader onLogout={logout} loggingOut={loggingOut} />

      <main className="mx-auto max-w-5xl px-4 py-8">
        {error && <Alert className="mb-4">{error}</Alert>}
        <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">{organization.name}</p>

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
