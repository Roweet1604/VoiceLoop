import { Link } from "react-router";
import { AudioLines } from "lucide-react";
import PublicFooter from "./PublicFooter.jsx";
import ThemeToggle from "./ui/ThemeToggle.jsx";

// `tight`: below 360px only the logo tile shows (the name stays for screen
// readers), so a header with buttons still fits a 320px screen.
export function Wordmark({ tight = false }) {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-2.5 rounded-md text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-onAccent">
        <AudioLines className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className={`text-base font-semibold tracking-tight ${tight ? "max-[359px]:sr-only" : ""}`}>VoiceLoop</span>
    </Link>
  );
}

// Shared frame for signup, login, password, account-status and not-found
// pages: logo above a centred 420px card, links under it, and the theme
// switch in the corner. `icon` shows a centred icon above the title.
export default function AuthLayout({ title, description, icon: Icon, children, footer }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center bg-bg px-4 py-10 sm:justify-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-[20px] border border-border bg-panel p-6 shadow-card sm:p-8">
          {Icon && (
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-panel2 text-muted">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
        <PublicFooter className="mt-8" />
      </div>
    </main>
  );
}
