import { LoaderCircle } from "lucide-react";
import Card from "./ui/Card.jsx";
import Button from "./ui/Button.jsx";
import Alert from "./ui/Alert.jsx";

export function FullPageLoader({ label = "Loading…" }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-ink-muted">
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
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
        <Alert className="mt-4">{message}</Alert>
        <Button className="mt-4 w-full" onClick={onRetry}>
          Try again
        </Button>
      </Card>
    </main>
  );
}
