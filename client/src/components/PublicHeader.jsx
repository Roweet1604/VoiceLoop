import { Link } from "react-router";
import { Wordmark } from "./AuthLayout.jsx";

// Top bar for the landing and legal pages.
export default function PublicHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-md border border-transparent bg-accent px-3 py-2 text-sm font-medium text-accent-ink shadow-xs hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Request access
          </Link>
        </nav>
      </div>
    </header>
  );
}
