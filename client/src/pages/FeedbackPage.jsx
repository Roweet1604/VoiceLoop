import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { MapPin, LockKeyhole, ExternalLink, CircleCheck, LoaderCircle, ArrowLeft, PenLine, Mic } from "lucide-react";
import LandingCards from "../components/LandingCards.jsx";
import { resolveWording, isHttpsUrl } from "../lib/landingWording.js";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import TextField from "../components/ui/TextField.jsx";
import VoiceRecorder, { UploadProgress } from "../components/feedback/VoiceRecorder.jsx";
import { useForm } from "../hooks/useForm.js";
import { useVoiceRecorder, voiceRecordingSupport, baseType } from "../hooks/useVoiceRecorder.js";
import { api, apiUpload } from "../lib/api.js";
import { newIdempotencyKey } from "../lib/idempotency.js";
import {
  validateFeedback,
  validateVoiceFeedback,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_NAME_MAX,
} from "../lib/validation.js";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "complaint", label: "Complaint or issue" },
  { value: "suggestion", label: "Suggestion" },
  { value: "compliment", label: "Compliment" },
  { value: "other", label: "Other" },
];

const MODES = [
  { value: "text", label: "Write", Icon: PenLine },
  { value: "voice", label: "Record voice", Icon: Mic },
];

const EMPTY = { message: "", customerName: "", customerEmail: "" };
const VISIBLE_FIELDS = ["category", "message", "customerName", "customerEmail"];
const AUDIO_FIELDS = ["audio", "durationSec"];
const FILE_EXTENSIONS = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" };

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
  const reviewUrl = isHttpsUrl(business.googleReviewUrl) ? business.googleReviewUrl.trim() : null;
  const wording = resolveWording(business);

  // With a Google review link, customers first see two equal choices; without
  // one, there's nothing to choose between, so the form shows directly.
  const [view, setView] = useState(reviewUrl ? "landing" : "form");
  const [category, setCategory] = useState("general");
  // Text is always available; voice is an alternative, never a requirement.
  const [mode, setMode] = useState("text");
  const [sent, setSent] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const recorder = useVoiceRecorder();
  const voiceSupport = useMemo(voiceRecordingSupport, []);
  // One key per submission attempt, reused for every retry of that attempt and
  // cleared only once the server has confirmed it. It survives switching back
  // to the landing screen, like the text typed so far.
  const keyRef = useRef(null);
  const formRef = useRef(null);
  const successRef = useRef(null);
  const formHeadingRef = useRef(null);
  const landingRef = useRef(null);
  const viewChanged = useRef(false);

  const { values, bind, handleSubmit, submitting, formError, reset } = useForm(
    EMPTY,
    mode === "voice" ? validateVoiceFeedback : validateFeedback
  );

  // A key belongs to one exact submission. A new or discarded recording is a
  // different submission, so it must never reuse the key of an earlier one.
  useEffect(() => {
    keyRef.current = null;
    setRetryable(false);
  }, [recorder.recording]);

  function switchMode(next) {
    if (next === mode) return;
    keyRef.current = null;
    setRetryable(false);
    reset(values); // clears errors from the other mode, keeps what was typed
    setMode(next);
  }

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  // After switching views, move focus to the new view's heading so keyboard
  // and screen reader users land in the right place (not on first load).
  useEffect(() => {
    if (!viewChanged.current) return;
    (view === "form" ? formHeadingRef : landingRef).current?.focus();
  }, [view]);

  function showView(next) {
    viewChanged.current = true;
    setView(next);
  }

  // Maps a failed submission to what the customer sees. Throwing makes useForm
  // show the message (or the field errors) on the form.
  function failed(err) {
    if (err.status === 404) {
      onUnavailable();
      return;
    }
    if (err.status === 429) {
      throw new Error("You've sent several messages in a short time. Please wait a few minutes, then try again.");
    }
    if (err.status === 413 || (err.details && AUDIO_FIELDS.some((field) => err.details[field]))) {
      // Nothing was stored, and this recording can't be sent as it is.
      keyRef.current = null;
      // Server messages have no final period.
      const reason = err.details?.audio ?? err.details?.durationSec ?? "The recording is too large";
      throw new Error(`${reason}. Please record your message again, or write it instead.`);
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

  function sendText(form) {
    return api(`/api/public/f/${encodeURIComponent(slug)}/submit`, {
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
  }

  async function sendVoice(form) {
    const { recording } = recorder;
    const data = new FormData();
    data.append("category", category);
    if (form.customerName.trim()) data.append("customerName", form.customerName.trim());
    if (form.customerEmail.trim()) data.append("customerEmail", form.customerEmail.trim());
    if (code) data.append("linkCode", code);
    data.append("idempotencyKey", keyRef.current);
    data.append("durationSec", Math.max(recording.durationSec, 0.1).toFixed(1));
    data.append("audio", recording.blob, `recording.${FILE_EXTENSIONS[baseType(recording.mimeType)] ?? "webm"}`);

    setUploadProgress(0);
    try {
      return await apiUpload(`/api/public/f/${encodeURIComponent(slug)}/submit-voice`, data, {
        onProgress: setUploadProgress,
      });
    } finally {
      setUploadProgress(null);
    }
  }

  const onSubmit = handleSubmit(async (form) => {
    setRetryable(false);
    if (mode === "voice" && recorder.status !== "recorded") {
      throw new Error(
        recorder.status === "recording" ? "Stop the recording first, then send it." : "Record your message first, or switch to Write."
      );
    }
    if (!keyRef.current) keyRef.current = newIdempotencyKey();

    try {
      await (mode === "voice" ? sendVoice(form) : sendText(form));
    } catch (err) {
      failed(err);
      return;
    }

    // Only reached once the server has confirmed the save.
    keyRef.current = null;
    reset(EMPTY);
    setCategory("general");
    recorder.discard();
    setSent(true);
  });

  const messageLength = values.message.length;

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

      {view === "landing" ? (
        <section ref={landingRef} tabIndex={-1} aria-labelledby="landing-heading" className="outline-none">
          <h2 id="landing-heading" className="sr-only">
            How would you like to share your experience?
          </h2>
          <LandingCards wording={wording} reviewUrl={reviewUrl} onChooseFeedback={() => showView("form")} />
        </section>
      ) : (
        <>
          {reviewUrl && !sent && (
            <button
              type="button"
              onClick={() => showView("landing")}
              className="mb-3 inline-flex items-center gap-1 rounded-sm text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          )}

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
                <h2 ref={formHeadingRef} tabIndex={-1} className="text-base font-semibold break-words text-ink outline-none">
                  {wording.feedbackCardTitle}
                </h2>

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

                <fieldset disabled={submitting}>
                  <legend className="text-sm font-medium text-ink">How would you like to share it?</legend>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-border bg-subtle p-1">
                    {MODES.map(({ value, label, Icon }) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink has-[:checked]:bg-surface has-[:checked]:font-medium has-[:checked]:text-ink has-[:checked]:shadow-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                      >
                        <input
                          type="radio"
                          name="mode"
                          value={value}
                          checked={mode === value}
                          onChange={() => switchMode(value)}
                          className="sr-only"
                        />
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {mode === "text" ? (
                  <TextField
                    label="Your feedback"
                    multiline
                    rows={5}
                    maxLength={FEEDBACK_MESSAGE_MAX}
                    placeholder="Tell us what happened or what we could do better"
                    hint={`${messageLength} / ${FEEDBACK_MESSAGE_MAX} characters`}
                    {...bind("message")}
                  />
                ) : (
                  <VoiceRecorder
                    recorder={recorder}
                    support={voiceSupport}
                    disabled={submitting}
                    onUseText={() => switchMode("text")}
                  />
                )}

                <p className="flex items-start gap-2 rounded-md bg-subtle px-3 py-2.5 text-xs text-ink-muted">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {mode === "voice" ? (
                    <span>
                      Your recording goes privately to {business.name} and only their team can listen to it. Automatic
                      transcription may not be available. It's anonymous unless you add your name or email below.
                    </span>
                  ) : (
                    <span>
                      Your feedback goes privately to {business.name}. It's anonymous unless you add your name or email
                      below.
                    </span>
                  )}
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

                {uploadProgress !== null && <UploadProgress value={uploadProgress} />}

                <Button type="submit" loading={submitting} className="w-full">
                  {submitting ? "Sending…" : mode === "voice" ? "Send recording" : "Send feedback"}
                </Button>
              </form>
            </Card>
          )}

          {/* The review option stays available below the form and after sending,
              whatever the customer chose or wrote. */}
          {reviewUrl && (
            <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-4 text-center">
              <p className="text-sm break-words text-ink-muted">{wording.reviewCardTitle}</p>
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {wording.reviewCardButton}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">(opens Google in a new tab)</span>
              </a>
            </div>
          )}
        </>
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
