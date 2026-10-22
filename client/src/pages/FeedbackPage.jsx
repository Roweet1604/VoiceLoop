import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  MapPin,
  LockKeyhole,
  ExternalLink,
  CircleCheck,
  LoaderCircle,
  ArrowLeft,
  PenLine,
  Mic,
  CircleAlert,
  LinkIcon,
} from "lucide-react";
import LandingCards from "../components/LandingCards.jsx";
import { resolveWording, isHttpsUrl } from "../lib/landingWording.js";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import TextField from "../components/ui/TextField.jsx";
import VoiceRecorder, { UploadProgress } from "../components/feedback/VoiceRecorder.jsx";
import PublicFooter from "../components/PublicFooter.jsx";
import { useForm } from "../hooks/useForm.js";
import { usePageMeta } from "../hooks/usePageMeta.js";
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

  usePageMeta(
    page.status === "unavailable"
      ? "Page not available"
      : page.business
        ? `Feedback for ${page.business.name}`
        : "Leave feedback",
    page.business
      ? `Send private feedback to ${page.business.name}, in writing or as a voice message.`
      : "Send private feedback to a business, in writing or as a voice message."
  );

  if (page.status === "loading") {
    return (
      <PublicFrame>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
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
        <StateCard Icon={CircleAlert} title="Couldn't load this page">
          <Alert className="mt-4 text-left">{page.error.message}</Alert>
          <Button className="mt-4 h-12 w-full" onClick={load}>
            Try again
          </Button>
        </StateCard>
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
      <header className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent text-lg font-bold text-onAccent"
          aria-hidden="true"
        >
          {business.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-semibold break-words text-text">{business.name}</h1>
          {business.locationName && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="break-words">{business.locationName}</span>
            </p>
          )}
        </div>
      </header>

      {business.welcomeMessage && (
        <p className="text-[15px] leading-relaxed whitespace-pre-line break-words text-text">{business.welcomeMessage}</p>
      )}

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
              className="-mb-2 inline-flex items-center gap-1 self-start rounded-sm text-sm font-semibold text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          )}

          {sent ? (
            <div className="rounded-[20px] border border-border bg-panel px-6 py-10 text-center shadow-card">
              <div ref={successRef} tabIndex={-1} role="status" className="outline-none">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accentSoft">
                  <CircleCheck className="h-8 w-8 text-accentText" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-semibold text-text">Thank you!</h2>
                <p className="mt-2 text-[15px] text-muted">We appreciate you taking the time to share this.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-[20px] border border-border bg-panel p-5 shadow-card sm:p-6">
              <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6">
                <h2 ref={formHeadingRef} tabIndex={-1} className="text-lg font-semibold break-words text-text outline-none">
                  {wording.feedbackCardTitle}
                </h2>

                <fieldset disabled={submitting}>
                  <legend className="text-sm font-semibold text-text">What is it about?</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {CATEGORIES.map((option) => (
                      <label
                        key={option.value}
                        className="flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border bg-panel2 px-3 py-2 text-center text-sm text-text transition-colors hover:border-faint has-[:checked]:border-accent has-[:checked]:bg-accentSoft has-[:checked]:font-semibold has-[:checked]:text-accentText has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
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
                  {bind("category").error && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
                      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{bind("category").error}</span>
                    </p>
                  )}
                </fieldset>

                <fieldset disabled={submitting}>
                  <legend className="text-sm font-semibold text-text">How would you like to share it?</legend>
                  <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-border bg-panel2 p-1">
                    {MODES.map(({ value, label, Icon }) => (
                      <label
                        key={value}
                        className="flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-text has-[:checked]:bg-accent has-[:checked]:text-onAccent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
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
                    inputClassName="min-h-[140px] rounded-[14px] px-4 py-3 text-[15px]"
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

                <p className="flex items-start gap-2 rounded-control bg-panel2 px-3 py-2.5 text-xs text-muted">
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
                        className="mt-1 rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        Try again
                      </button>
                    )}
                  </Alert>
                )}

                {uploadProgress !== null && <UploadProgress value={uploadProgress} />}

                <Button type="submit" loading={submitting} className="h-12 w-full text-[15px]">
                  {submitting ? "Sending…" : mode === "voice" ? "Send recording" : "Send feedback"}
                </Button>
              </form>
            </div>
          )}

          {/* The review option stays available below the form, whatever the
              customer chose or wrote. The thank-you screen shows only thanks. */}
          {reviewUrl && !sent && (
            <div className="rounded-[20px] border border-border bg-panel px-5 py-5 text-center">
              <p className="text-sm break-words text-muted">{wording.reviewCardTitle}</p>
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-control border border-faint/45 px-5 text-sm font-semibold text-text transition-colors hover:bg-panel2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

// The page title is set by FeedbackPage.
function Unavailable() {
  return (
    <PublicFrame>
      <StateCard Icon={LinkIcon} title="This feedback page isn't available">
        <p className="mt-2 text-[15px] text-muted">
          The link may be incorrect, or this business isn't collecting feedback here right now.
        </p>
      </StateCard>
    </PublicFrame>
  );
}

// Centred card with an icon, for the error and unavailable screens.
function StateCard({ Icon, title, children }) {
  return (
    <div className="rounded-[20px] border border-border bg-panel px-6 py-10 text-center shadow-card">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-panel2 text-muted">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-lg font-semibold text-text">{title}</h1>
      {children}
    </div>
  );
}

// Phone-first column, 440px at most. On tall, wide windows the content sits
// in the middle; on phones it starts at the top.
function PublicFrame({ children }) {
  return (
    <main className="flex min-h-dvh flex-col bg-bg px-5 py-8 [@media(min-width:640px)_and_(min-height:760px)]:justify-center">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6">
        {children}
        <div>
          <p className="text-center text-xs text-muted">Feedback collected with VoiceLoop</p>
          {/* New tab, so a half-written message or recording isn't lost. */}
          <PublicFooter newTab className="mt-2" />
        </div>
      </div>
    </main>
  );
}
