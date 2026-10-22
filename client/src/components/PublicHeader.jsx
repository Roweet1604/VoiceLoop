import { Link } from "react-router";
import { Wordmark } from "./AuthLayout.jsx";
import ThemeToggle from "./ui/ThemeToggle.jsx";

// Top bar for the landing and legal pages. Below 400px there is no room for
// the theme switch here; those pages repeat it in their footer.
export default function PublicHeader() {
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-2 px-4 sm:px-6">
        <Wordmark tight />
        <nav aria-label="Account" className="flex items-center gap-1.5 sm:gap-3">
          <ThemeToggle className="max-[399px]:hidden" />
          <Link
            to="/login"
            className="rounded-control px-2.5 py-2 text-sm font-semibold whitespace-nowrap text-muted hover:bg-panel2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-control bg-accent px-3 py-2 text-sm font-semibold whitespace-nowrap text-onAccent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Request access
          </Link>
        </nav>
      </div>
    </header>
  );
}
