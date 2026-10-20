import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Hourglass, Ban, ShieldAlert, CalendarX, CircleAlert, RefreshCw, LogOut } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLogout } from "../hooks/useLogout.js";
import { canUseApp } from "../lib/access.js";

const formatDate = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
const formatTime = (value) => new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(value);

// What to tell the user for each blocked access status. `business` is the
// organization name.
const STATUS_CONTENT = {
  pending: {
    Icon: Hourglass,
    tone: "bg-warning-soft text-warning",
    label: "Pending review",
    title: "Waiting for approval",
    body: (business) =>
      `The VoiceLoop team reviews every new account before it can be used. You'll be able to open the dashboard for ${business} as soon as it's approved.`,
  },
  rejected: {
    Icon: Ban,
    tone: "bg-danger-soft text-danger",
    label: "Not approved",
    title: "Access request not approved",
    body: (business) =>
      `The access request for ${business} wasn't approved. If you think this is a mistake, contact the VoiceLoop team.`,
  },
  suspended: {
    Icon: ShieldAlert,
    tone: "bg-danger-soft text-danger",
    label: "Suspended",
    title: "Account suspended",
    body: (business) =>
      `Access for ${business} is suspended, so the dashboard is unavailable. Contact the VoiceLoop team for details.`,
  },
  expired: {
    Icon: CalendarX,
    tone: "bg-subtle text-ink-muted",
    label: "Expired",
    title: "Access period ended",
    body: (business, expiresAt) =>
      `Access for ${business} ended${expiresAt ? ` on ${formatDate(expiresAt)}` : ""}. Contact the VoiceLoop team to extend it.`,
  },
};

const NO_ORGANIZATION = {
  Icon: CircleAlert,
  tone: "bg-danger-soft text-danger",
  label: "Unavailable",
  title: "Account not set up",
  body: () => "This account isn't linked to a business. Contact the VoiceLoop team for help.",
};

export default function WaitingPage() {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, loggingOut, error: logoutError } = useLogout();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  // Approved (or approved while this page was open): nothing to wait for.
  if (canUseApp(session)) return <Navigate to="/app/dashboard" replace />;

  const { user, organization } = session;
  const content = (organization && STATUS_CONTENT[organization.accessStatus]) || NO_ORGANIZATION;
  const business = organization?.name ?? "your business";
  const { Icon } = content;

  async function checkAgain() {
    setChecking(true);
    setCheckError(null);
    try {
      const latest = await refresh();
      if (!latest) {
        navigate("/login", { replace: true });
        return;
      }
      setLastChecked(new Date());
    } catch (err) {
      setCheckError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthLayout title={content.title}>
      <div className="space-y-4">
        {location.state?.justRegistered && organization?.accessStatus === "pending" && (
          <Alert tone="success">Your account has been created.</Alert>
        )}

        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${content.tone}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${content.tone}`}>{content.label}</span>
        </div>

        <p className="text-sm text-ink-muted">{content.body(business, organization?.accessExpiresAt)}</p>

        <dl className="divide-y divide-border rounded-md border border-border text-sm">
          {organization && (
            <div className="flex justify-between gap-4 px-3 py-2">
              <dt className="text-ink-muted">Business</dt>
              <dd className="truncate font-medium text-ink">{organization.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 px-3 py-2">
            <dt className="text-ink-muted">Email</dt>
            <dd className="truncate font-medium text-ink">{user.email}</dd>
          </div>
        </dl>

        {checkError && <Alert>{checkError}</Alert>}
        {logoutError && <Alert>{logoutError}</Alert>}
        {lastChecked && !checkError && (
          <p className="text-xs text-ink-muted" role="status">
            Status checked at {formatTime(lastChecked)}. No change yet.
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={checkAgain} loading={checking} className="flex-1">
            {!checking && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Check status
          </Button>
          <Button variant="secondary" onClick={logout} loading={loggingOut}>
            {!loggingOut && <LogOut className="h-4 w-4" aria-hidden="true" />}
            Log out
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
