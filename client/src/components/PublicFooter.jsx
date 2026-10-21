import { Link } from "react-router";

const LINK = "rounded-sm hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Small footer for public pages. `newTab` opens the links in a new tab, for
// pages where leaving would lose what the visitor has typed or recorded.
export default function PublicFooter({ newTab = false, className = "" }) {
  const target = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <footer className={`text-xs text-ink-muted ${className}`}>
      <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link to="/privacy" className={LINK} {...target}>
          Privacy Policy
          {newTab && <span className="sr-only"> (opens in a new tab)</span>}
        </Link>
        <Link to="/terms" className={LINK} {...target}>
          Terms
          {newTab && <span className="sr-only"> (opens in a new tab)</span>}
        </Link>
      </nav>
    </footer>
  );
}
