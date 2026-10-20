import { Link } from "react-router";
import { AudioLines } from "lucide-react";
import Card from "./ui/Card.jsx";

export function Wordmark() {
  return (
    <Link to="/" className="inline-flex items-center gap-2 text-ink">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
        <AudioLines className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-base font-semibold tracking-tight">VoiceLoop</span>
    </Link>
  );
}

// Shared frame for signup, login and account-status pages.
export default function AuthLayout({ title, description, children, footer }) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-canvas px-4 py-10 sm:justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Wordmark />
        </div>
        <Card>
          <h1 className="text-lg font-semibold text-ink">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <div className="mt-4 text-center text-sm text-ink-muted">{footer}</div>}
      </div>
    </main>
  );
}
