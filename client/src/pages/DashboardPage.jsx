import { Link, useLocation } from "react-router";
import Card from "../components/ui/Card.jsx";
import Alert from "../components/ui/Alert.jsx";
import PublicLink from "../components/PublicLink.jsx";
import { publicFeedbackUrl } from "../lib/publicUrl.js";
import { useBusiness } from "../context/BusinessContext.jsx";

// Overview for the owner. Only real data: feedback metrics come later.
export default function DashboardPage() {
  const { business } = useBusiness();
  const location = useLocation();

  return (
    <>
      <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-muted">{business.name}</p>

      {location.state?.justCreated && (
        <Alert tone="success" className="mt-4">
          {business.name} is set up. Your public feedback link is below.
        </Alert>
      )}

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Public feedback link</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Customers will use this link to send you feedback. It stays the same even if you rename your business.
        </p>
        <div className="mt-4">
          <PublicLink url={publicFeedbackUrl(business.publicSlug)} />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Need separate links or QR codes for tables, rooms or your website?{" "}
          <Link to="/app/links" className="font-medium text-accent hover:underline">
            Manage links
          </Link>
        </p>
      </Card>

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-sm font-semibold text-ink">Business details</h2>
          <Link to="/app/settings" className="text-sm font-medium text-accent hover:underline">
            Edit
          </Link>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-ink-muted">Name</dt>
          <dd className="text-ink break-words">{business.name}</dd>
          <dt className="text-ink-muted">Location</dt>
          <dd className={business.locationName ? "text-ink break-words" : "text-ink-subtle"}>
            {business.locationName || "Not set"}
          </dd>
          <dt className="text-ink-muted">Welcome message</dt>
          <dd className={business.welcomeMessage ? "text-ink break-words whitespace-pre-line" : "text-ink-subtle"}>
            {business.welcomeMessage || "Not set"}
          </dd>
          <dt className="text-ink-muted">Google review link</dt>
          <dd className={business.googleReviewUrl ? "text-ink break-all" : "text-ink-subtle"}>
            {business.googleReviewUrl || "Not set"}
          </dd>
        </dl>
      </Card>
    </>
  );
}
