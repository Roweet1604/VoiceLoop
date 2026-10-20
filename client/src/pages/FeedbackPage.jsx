import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { MapPin, LockKeyhole, ExternalLink, CircleCheck, LoaderCircle } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import TextField from "../components/ui/TextField.jsx";
import { useForm } from "../hooks/useForm.js";
import { api } from "../lib/api.js";
import { newIdempotencyKey } from "../lib/idempotency.js";
import { validateFeedback, FEEDBACK_MESSAGE_MAX, FEEDBACK_NAME_MAX } from "../lib/validation.js";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "complaint", label: "Complaint or issue" },
  { value: "suggestion", label: "Suggestion" },
  { value: "compliment", label: "Compliment" },
  { value: "other", label: "Other" },
];

const EMPTY = { message: "", customerName: "", customerEmail: "" };
const VISIBLE_FIELDS = ["category", "message", "customerName", "customerEmail"];

// The server validates the link too, so this is only a guard against
// rendering anything but an https link.
const isHttpsUrl = (value) => typeof value === "string" && value.startsWith("https://");

// Public, no login: /f/:slug and /f/:slug/:code.
export default function FeedbackPage() {
  const { slug, code } = useParams();
  const [page, setPage] = useState({ status: "loading", business: null, error: null });

  const load = useCallback(async () => {
    setPage({ status: "loading", business: null, error: null });
    try {
      const path = `/api/public/f/${encodeURIComponent(slug)}${code ? `/${encodeURIComponent(code)}` : ""}`;
      const { business } = await api(path);
      setPage({ status: "ready", business, error: null });
    } catch (err) {
      setPage({ status: err.status === 404 ? "unavailable" : "error", business: null, error: err });
    }
  }, [slug, code]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (page.business) document.title = `Feedback for ${page.business.name}`;
  }, [page.business]);

  if (page.status === "loading") {
    return (
      <PublicFrame>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      </PublicFrame>
    );
  }

  if (page.status === "unavailable") return <Unavailable />;

  if (page.status === "error") {
    return (
      <PublicFrame>
        <Card>
          <h1 className="text-lg font-semibold text-ink">Couldn't load this page</h1>
          <Alert className="mt-4">{page.error.message}</Alert>
          <Button className="mt-4 w-full" onClick={load}>
            Try again
          </Button>
        </Card>
      </PublicFrame>
    );
  }

  return <FeedbackForm business={page.business} slug={slug} code={code} onUnavailable={() => setPage({ status: "unavailable" })} />;
}

function FeedbackForm({ business, slug, code, onUnavailable }) {
  const [category, setCategory] = useState("general");
  const [sent, setSent] = useState(false);
  const [retryable, setRetryable] = useState(false);
  // One key per submission attempt, reused for every retry of that attempt and
  // cleared only once the server has confirmed it.
  const keyRef = useRef(null);
  const formRef = useRef(null);
  const successRef = useRef(null);

  const { values, bind, handleSubmit, submitting, formError, reset } = useForm(EMPTY, validateFeedback);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const onSubmit = handleSubmit(async (form) => {
    setRetryable(false);
    if (!keyRef.current) keyRef.current = newIdempotencyKey();

    try {
      await api(`/api/public/f/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        body: {
          category,
          message: form.message.trim(),
          customerName: form.customerName.trim(),
          customerEmail: form.customerEmail.trim(),
          ...(code && { linkCode: code }),
          idempotencyKey: keyRef.current,
        },
      });
    } catch (err) {
      if (err.status === 404) {
        onUnavailable();
        return;
      }
      if (err.status === 429) {
        throw new Error("You've sent several messages in a short time. Please wait a few minutes, then try again.");
      }
      if (err.details && Object.keys(err.details).some((field) => !VISIBLE_FIELDS.includes(field))) {
        keyRef.current = null;
        throw new Error("Something went wrong on our side. Please try again.");
      }
      if (err.code === "NETWORK_ERROR" || err.status >= 500) {
        // The request may or may not have reached the server. Retrying with
        // the same key is safe: it can't create a second copy.
        setRetryable(true);
        throw new Error("We couldn't confirm that your feedback was sent. Please try again; it won't be sent twice.");
      }
      throw err;
    }

    // Only reached once the server has confirmed the save.
    keyRef.current = null;
    reset(EMPTY);
    setCategory("general");
    setSent(true);
  });

  const messageLength = values.message.length;
  const reviewUrl = isHttpsUrl(business.googleReviewUrl) ? business.googleReviewUrl : null;

  return (
    <PublicFrame>
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink break-words">{business.name}</h1>
        {business.locationName && (
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{business.locationName}</span>
          </p>
        )}
        {business.welcomeMessage && (
          <p className="mt-3 text-sm whitespace-pre-line break-words text-ink">{business.welcomeMessage}</p>
        )}
      </header>

      {sent ? (
        <Card>
          <div ref={successRef} tabIndex={-1} role="status" className="outline-none">
            <CircleCheck className="h-6 w-6 text-success" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-ink">Thank you, your feedback was sent</h2>
            <p className="mt-1 text-sm text-ink-muted">It has gone privately to {business.name}.</p>
          </div>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => setSent(false)}>
            Send more feedback
          </Button>
        </Card>
      ) : (
        <Card>
          <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
            <h2 className="sr-only">Send feedback</h2>

            <fieldset disabled={submitting}>
              <legend className="text-sm font-medium text-ink">What is it about?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORIES.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface px-3 py-2 text-center text-sm text-ink transition-colors hover:bg-subtle has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-medium has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option.value}
                      checked={category === option.value}
                      onChange={() => setCategory(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {bind("category").error && <p className="mt-1.5 text-xs text-danger">{bind("category").error}</p>}
            </fieldset>

            <TextField
              label="Your feedback"
              multiline
              rows={5}
              maxLength={FEEDBACK_MESSAGE_MAX}
              placeholder="Tell us what happened or what we could do better"
              hint={`${messageLength} / ${FEEDBACK_MESSAGE_MAX} characters`}
              {...bind("message")}
            />

            <p className="flex items-start gap-2 rounded-md bg-subtle px-3 py-2.5 text-xs text-ink-muted">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Your feedback goes privately to {business.name}. It's anonymous unless you add your name or email
                below.
              </span>
            </p>

            <fieldset disabled={submitting} className="space-y-4">
              <legend className="sr-only">Contact details (optional)</legend>
              <TextField
                label="Name (optional)"
                autoComplete="name"
                maxLength={FEEDBACK_NAME_MAX}
                {...bind("customerName")}
              />
              <TextField
                label="Email (optional)"
                type="email"
                inputMode="email"
                autoComplete="email"
                hint="Only if you'd like a reply."
                {...bind("customerEmail")}
              />
            </fieldset>

            {formError && (
              <Alert>
                <p>{formError}</p>
                {retryable && (
                  <button
                    type="button"
                    onClick={() => formRef.current?.requestSubmit()}
                    className="mt-1 font-medium underline underline-offset-2"
                  >
                    Try again
                  </button>
                )}
              </Alert>
            )}

            <Button type="submit" loading={submitting} className="w-full">
              {submitting ? "Sending…" : "Send feedback"}
            </Button>
          </form>
        </Card>
      )}

      {reviewUrl && (
        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-4 text-center">
          <p className="text-sm text-ink-muted">You can also share your experience publicly.</p>
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Leave a Google review
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      )}
    </PublicFrame>
  );
}

function Unavailable() {
  useEffect(() => {
    document.title = "Page not available";
  }, []);
  return (
    <PublicFrame>
      <Card>
        <h1 className="text-lg font-semibold text-ink">This feedback page isn't available</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The link may be incorrect, or this business isn't collecting feedback here right now.
        </p>
      </Card>
    </PublicFrame>
  );
}

function PublicFrame({ children }) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        {children}
        <p className="mt-8 text-center text-xs text-ink-muted">Feedback collected with VoiceLoop</p>
      </div>
    </main>
  );
}
