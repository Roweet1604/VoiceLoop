import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, LoaderCircle, Mail, Trash2 } from "lucide-react";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import TextField from "../ui/TextField.jsx";
import Dialog, { DialogFooter } from "../ui/Dialog.jsx";
import { CategoryBadge, ComplaintStatusBadge, NewIndicator } from "./Badges.jsx";
import VoiceMessage from "./VoiceMessage.jsx";
import { deletesIn } from "./RetentionNotice.jsx";
import { useHandleAccessError } from "../../context/BusinessContext.jsx";
import { api } from "../../lib/api.js";
import { formatDate, formatTime } from "../../lib/format.js";
import { CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, SUBMISSION_TYPE_LABELS } from "../../lib/feedbackLabels.js";

const NOTE_MAX = 1000;
const SUMMARY_MAX = 1000;
// Messages up to this length get the large heading; longer ones would be a
// wall of 26px text, so they use the smaller size.
const LARGE_HEADING_MAX = 240;
const when = (value) => `${formatDate(value)}, ${formatTime(value)}`;

// Available complaint actions for each status (mirrors the server's rules).
const COMPLAINT_ACTIONS = {
  open: [
    { status: "in_progress", label: "Start working on it" },
    { status: "resolved", label: "Resolve…", primary: true },
  ],
  in_progress: [
    { status: "resolved", label: "Resolve…", primary: true },
    { status: "open", label: "Move back to open" },
  ],
  resolved: [{ status: "reopen", label: "Reopen" }],
};

// One feedback item with all its actions: review, complaint status, notes,
// history and deletion. Used in the inbox's detail pane and on the
// stand-alone /app/feedback/:id page.
//
// back:          shown above the content (e.g. a Back link)
// headingLevel:  "h1" on its own page, "h2" inside the inbox
// onChanged(f):  after the server confirmed a change, with the new feedback
// onDeleted():   after the server confirmed the deletion
export default function FeedbackDetail({ feedbackId, back, headingLevel: Heading = "h2", onChanged, onDeleted }) {
  const handleAccessError = useHandleAccessError();
  const [state, setState] = useState({ status: "loading", feedback: null, error: null });
  const [busy, setBusy] = useState(null); // which action is in flight
  const [actionError, setActionError] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retentionDays, setRetentionDays] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: s.feedback ? "ready" : "loading", error: null }));
    try {
      const { feedback, retentionDays } = await api(`/api/feedback/${encodeURIComponent(feedbackId)}`);
      setState({ status: "ready", feedback, error: null });
      setRetentionDays(retentionDays ?? null);
    } catch (err) {
      handleAccessError(err);
      setState({ status: err.status === 404 ? "missing" : "error", feedback: null, error: err });
    }
  }, [feedbackId, handleAccessError]);

  useEffect(() => {
    load();
  }, [load]);

  // Runs a change and shows the server's confirmed result. If someone else
  // changed the feedback meanwhile (409), reload to show the current state.
  async function run(key, path, method, body) {
    setBusy(key);
    setActionError(null);
    try {
      const { feedback } = await api(`/api/feedback/${feedbackId}${path}`, { method, body });
      setState({ status: "ready", feedback, error: null });
      onChanged?.(feedback);
      return true;
    } catch (err) {
      handleAccessError(err);
      setActionError(err.message);
      if (err.status === 409) load();
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="p-4 sm:p-6">
        {back}
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading feedback…
        </div>
      </div>
    );
  }

  if (state.status === "missing" || state.status === "error") {
    return (
      <div className="p-4 sm:p-6">
        {back}
        <Heading className="mt-4 text-base font-semibold text-text">
          {state.status === "missing" ? "Feedback not found" : "Couldn't load this feedback"}
        </Heading>
        <p className="mt-1 text-sm text-muted">
          {state.status === "missing" ? "It may have been removed, or the link is incorrect." : state.error.message}
        </p>
        {state.status === "error" && (
          <Button variant="secondary" className="mt-4" onClick={load}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const f = state.feedback;
  const isComplaint = f.category === "complaint";
  const isVoice = f.submissionType === "voice";
  const headingText = isVoice ? "Voice message" : f.message;
  const Sub = Heading === "h1" ? "h2" : "h3";

  const badges = (
    <div className="flex flex-wrap items-center gap-2">
      <CategoryBadge category={f.category} />
      {f.complaintStatus && <ComplaintStatusBadge status={f.complaintStatus} />}
      {f.reviewStatus === "new" && <NewIndicator />}
    </div>
  );

  // Two layouts from one set of blocks, chosen by the pane's own width (a
  // container query), so it also works inside the narrower stand-alone page.
  // Narrow: one column, ordered with `order-*` (the two wrappers use
  // display: contents, so their children line up in a single flex column):
  //   header, badges, player + transcript, actions, details, notes, history, delete.
  // From 48rem: main column (header, player, transcript, notes) and a 340px
  // side panel (badges, actions, details, history, delete).
  return (
    <article className="@container">
      <div className="flex flex-col gap-6 p-5 sm:p-6 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_340px] @3xl:gap-0 @3xl:p-0">
        <div className="contents @3xl:block @3xl:min-w-0 @3xl:space-y-6 @3xl:p-6">
          {back && <div className="order-0">{back}</div>}

          <header className="order-1">
            <p className="text-[11px] font-semibold tracking-wider text-accentText uppercase">
              {CATEGORY_LABELS[f.category] ?? f.category} · {SUBMISSION_TYPE_LABELS[f.submissionType] ?? f.submissionType} ·{" "}
              {when(f.submittedAt)}
            </p>
            <Heading
              className={`mt-2 font-semibold tracking-tight whitespace-pre-wrap break-words text-text ${
                headingText.length <= LARGE_HEADING_MAX ? "text-[26px] leading-tight" : "text-lg leading-snug"
              }`}
            >
              {headingText}
            </Heading>
            <p className="mt-2 text-sm text-muted">Feedback from {f.customerName || "an anonymous customer"}</p>
          </header>

          {actionError && <Alert className="order-1">{actionError}</Alert>}

          {isVoice && f.audio && (
            <div className="order-3">
              <VoiceMessage
                feedbackId={f.id}
                audio={f.audio}
                transcriptStatus={f.transcriptStatus}
                transcriptText={f.transcriptText}
                onAccessError={handleAccessError}
              />
            </div>
          )}

          <div className="order-6">
            <Notes
              Sub={Sub}
              notes={f.internalNotes}
              busy={busy === "note"}
              onAdd={(text) => run("note", "/notes", "POST", { text })}
            />
          </div>
        </div>

        <div className="contents @3xl:block @3xl:space-y-6 @3xl:border-l @3xl:border-border @3xl:p-5">
          <div className="order-2">{badges}</div>

          {/* Actions: review and complaint status. Delete sits apart at the end. */}
          <div className="order-4 divide-y divide-border rounded-card border border-border">
            <ActionRow
              title="Review"
              Sub={Sub}
              text={f.reviewStatus === "new" ? "Not reviewed yet." : "Marked as reviewed."}
            >
              <Button
                variant={f.reviewStatus === "new" ? "primary" : "secondary"}
                loading={busy === "review"}
                disabled={busy !== null}
                onClick={() =>
                  run("review", "/review", "PATCH", { reviewStatus: f.reviewStatus === "new" ? "reviewed" : "new" })
                }
              >
                {f.reviewStatus === "new" ? "Mark as reviewed" : "Mark as new"}
              </Button>
            </ActionRow>

            {isComplaint && (
              <ActionRow
                title="Complaint"
                Sub={Sub}
                text={<ComplaintStatusBadge status={f.complaintStatus ?? "open"} />}
                extra={
                  f.complaintStatus === "resolved" &&
                  f.resolutionSummary && (
                    <div className="mt-3 rounded-control bg-panel2 px-3 py-2 text-sm">
                      <p className="text-xs font-semibold text-muted">Resolution</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-text">{f.resolutionSummary}</p>
                      {f.resolvedAt && <p className="mt-1 text-xs text-muted">{when(f.resolvedAt)}</p>}
                    </div>
                  )
                }
              >
                {COMPLAINT_ACTIONS[f.complaintStatus ?? "open"].map((action) => (
                  <Button
                    key={action.status}
                    variant={action.primary ? "primary" : "secondary"}
                    loading={busy === `complaint-${action.status}`}
                    disabled={busy !== null}
                    onClick={() =>
                      action.status === "resolved"
                        ? setResolving(true)
                        : run(`complaint-${action.status}`, "/complaint-status", "PATCH", { status: action.status })
                    }
                  >
                    {action.label}
                  </Button>
                ))}
              </ActionRow>
            )}
          </div>

          <section className="order-5 @container">
            <Sub className="text-sm font-semibold text-text">Details</Sub>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm @sm:grid-cols-2">
              <Detail label="Received">
                {when(f.submittedAt)}
                {retentionDays && (
                  <span className="mt-0.5 block text-xs text-muted">{deletesIn(f.submittedAt, retentionDays)}</span>
                )}
              </Detail>
              <Detail label="Type">{isVoice ? "Voice message" : "Written"}</Detail>
              <Detail label="Source">
                {f.link ? (
                  <>
                    {f.link.name}
                    {!f.link.isActive && <span className="ml-1 text-xs text-muted">(inactive)</span>}
                  </>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Name">{f.customerName || <span className="text-muted">Not given</span>}</Detail>
              <Detail label="Email">
                {f.customerEmail ? (
                  <a
                    href={`mailto:${f.customerEmail}`}
                    className="inline-flex items-center gap-1 break-all text-accentText hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {f.customerEmail}
                  </a>
                ) : (
                  <span className="text-muted">Not given</span>
                )}
              </Detail>
            </dl>
          </section>

          <div className="order-7">
            <History Sub={Sub} history={f.statusHistory} />
          </div>

          <div className="order-8 rounded-card border border-danger/30">
            <ActionRow
              title="Delete"
              Sub={Sub}
              text={`Permanently removes this feedback${f.audio ? ", its recording" : ""} and its notes.`}
            >
              <Button variant="danger" disabled={busy !== null} onClick={() => setDeleting(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete feedback
              </Button>
            </ActionRow>
          </div>
        </div>
      </div>

      {deleting && (
        <DeleteDialog
          feedbackId={f.id}
          hasRecording={Boolean(f.audio)}
          onClose={() => setDeleting(false)}
          onAccessError={handleAccessError}
          // Only after the server confirmed the deletion.
          onDeleted={onDeleted}
        />
      )}

      {resolving && (
        <ResolveDialog
          onClose={() => setResolving(false)}
          onResolve={async (summary) => {
            const ok = await run("complaint-resolved", "/complaint-status", "PATCH", {
              status: "resolved",
              resolutionSummary: summary,
            });
            if (ok) setResolving(false);
            return ok;
          }}
          error={actionError}
        />
      )}
    </article>
  );
}

// Back to the inbox, keeping its filters.
export function BackLink({ to, className = "" }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1 rounded-md text-sm font-semibold text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Feedback
    </Link>
  );
}

// One action group: title and status text on the left, buttons on the right.
// Sized by its own width (container query), so in the narrow side panel the
// buttons sit under the text instead.
function ActionRow({ title, Sub, text, extra, children }) {
  return (
    <div className="@container px-5 py-[18px]">
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:justify-between">
        <div className="min-w-0">
          <Sub className="text-sm font-semibold text-text">{title}</Sub>
          <div className="mt-1 text-sm text-muted">{text}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5 @sm:justify-end">{children}</div>
      </div>
      {extra}
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-text">{children}</dd>
    </div>
  );
}

function Notes({ Sub, notes, busy, onAdd }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return setError("Write a note first");
    if (trimmed.length > NOTE_MAX) return setError(`Notes must be at most ${NOTE_MAX} characters`);
    setError(null);
    if (await onAdd(trimmed)) setText("");
  }

  return (
    <section className="border-t border-border pt-5">
      <Sub className="text-sm font-semibold text-text">Internal notes</Sub>
      <p className="mt-0.5 text-xs text-muted">Only visible to your team, never to the customer.</p>

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-control border border-border bg-panel2 px-3 py-2.5">
              <p className="text-sm whitespace-pre-wrap break-words text-text">{note.text}</p>
              <p className="mt-1 text-xs text-muted">
                {note.author.name} · {when(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} noValidate className="mt-4 space-y-2">
        <TextField
          label="Add a note"
          multiline
          rows={3}
          maxLength={NOTE_MAX}
          value={text}
          disabled={busy}
          error={error}
          hint={`${text.trim().length} / ${NOTE_MAX}`}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>
            Add note
          </Button>
        </div>
      </form>
    </section>
  );
}

function describeChange(entry) {
  if (entry.field === "reviewStatus") {
    return entry.to === "reviewed" ? "marked this as reviewed" : "marked this as new";
  }
  if (entry.from === "resolved" && entry.to === "open") return "reopened the complaint";
  const from = COMPLAINT_STATUS_LABELS[entry.from] ?? "Open";
  return `changed the status from ${from} to ${COMPLAINT_STATUS_LABELS[entry.to]}`;
}

function History({ Sub, history }) {
  return (
    <section className="border-t border-border pt-5">
      <Sub className="text-sm font-semibold text-text">History</Sub>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No changes yet.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-border pl-4">
          {[...history].reverse().map((entry, i) => (
            <li key={`${entry.at}-${i}`} className="text-sm">
              <p className="text-text">
                <span className="font-semibold">{entry.by.name}</span> {describeChange(entry)}
              </p>
              {entry.resolutionSummary && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-muted">“{entry.resolutionSummary}”</p>
              )}
              <p className="mt-0.5 text-xs text-muted">{when(entry.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ResolveDialog({ onClose, onResolve, error }) {
  const [summary, setSummary] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const trimmed = summary.trim();
  const problem = !trimmed
    ? "Describe how the complaint was resolved"
    : trimmed.length > SUMMARY_MAX
      ? `Keep it under ${SUMMARY_MAX} characters`
      : null;

  async function submit(e) {
    e.preventDefault();
    setAttempted(true);
    if (problem) return;
    setSubmitting(true);
    const ok = await onResolve(trimmed);
    if (!ok) setSubmitting(false);
  }

  return (
    <Dialog
      title="Resolve complaint"
      description="Summarise what was done. This stays internal and is kept in the history."
      busy={submitting}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        <div className="space-y-3 px-6 pt-4">
          <TextField
            label="Resolution summary"
            multiline
            rows={4}
            maxLength={SUMMARY_MAX}
            autoFocus
            value={summary}
            disabled={submitting}
            error={attempted ? problem : null}
            hint={`${trimmed.length} / ${SUMMARY_MAX}`}
            onChange={(e) => setSummary(e.target.value)}
          />
          {error && submitting === false && attempted && <Alert>{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Mark resolved
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ feedbackId, hasRecording, onClose, onAccessError, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/feedback/${encodeURIComponent(feedbackId)}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      onAccessError(err);
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title="Delete this feedback?"
      description={`This permanently deletes the feedback${hasRecording ? ", its voice recording" : ""}, internal notes and history. This cannot be undone.`}
      busy={submitting}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        {error && (
          <div className="px-6 pt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={submitting}>
            Delete permanently
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
