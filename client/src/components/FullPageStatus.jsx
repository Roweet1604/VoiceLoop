import { CircleAlert, LoaderCircle } from "lucide-react";
import Button from "./ui/Button.jsx";
import Alert from "./ui/Alert.jsx";

export function FullPageLoader({ label = "Loading…" }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
      </div>
    </main>
  );
}

// Shown when the initial session check fails for a reason other than "not
// logged in" (server down, network error), so we don't wrongly send the
// user to the login page.
export function FullPageError({ message, onRetry }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[420px] rounded-[20px] border border-border bg-panel p-6 text-center shadow-card sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-dangerSoft text-danger">
          <CircleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-text">Something went wrong</h1>
        <Alert className="mt-4 text-left">{message}</Alert>
        <Button className="mt-5 h-12 w-full text-sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
