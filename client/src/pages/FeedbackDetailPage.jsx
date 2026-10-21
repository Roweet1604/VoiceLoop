import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ArrowLeft, LoaderCircle, Mail } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import TextField from "../components/ui/TextField.jsx";
import Dialog, { DialogFooter } from "../components/ui/Dialog.jsx";
import { CategoryBadge, ComplaintStatusBadge, NewIndicator } from "../components/feedback/Badges.jsx";
import VoiceMessage from "../components/feedback/VoiceMessage.jsx";
import { useHandleAccessError } from "../context/BusinessContext.jsx";
import { api } from "../lib/api.js";
import { formatDate, formatTime } from "../lib/format.js";
import { COMPLAINT_STATUS_LABELS } from "../lib/feedbackLabels.js";

const NOTE_MAX = 1000;
const SUMMARY_MAX = 1000;
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

export default function FeedbackDetailPage() {
  const { feedbackId } = useParams();
  const location = useLocation();
  const handleAccessError = useHandleAccessError();
  const [state, setState] = useState({ status: "loading", feedback: null, error: null });
  const [busy, setBusy] = useState(null); // which action is in flight
  const [actionError, setActionError] = useState(null);
  const [resolving, setResolving] = useState(false);
  const backTo = `/app/feedback${location.state?.fromSearch ?? ""}`;

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: s.feedback ? "ready" : "loading", error: null }));
    try {
      const { feedback } = await api(`/api/feedback/${encodeURIComponent(feedbackId)}`);
      setState({ status: "ready", feedback, error: null });
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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted" role="status">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading feedback…
      </div>
    );
  }

  if (state.status === "missing" || state.status === "error") {
    return (
      <>
        <BackLink to={backTo} />
        <Card className="mt-4">
          <h1 className="text-base font-semibold text-ink">
            {state.status === "missing" ? "Feedback not found" : "Couldn't load this feedback"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {state.status === "missing" ? "It may have been removed, or the link is incorrect." : state.error.message}
          </p>
          {state.status === "error" && (
            <Button variant="secondary" className="mt-4" onClick={load}>
              Try again
            </Button>
          )}
        </Card>
      </>
    );
  }

  const f = state.feedback;
  const isComplaint = f.category === "complaint";

  return (
    <>
      <BackLink to={backTo} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CategoryBadge category={f.category} />
        {f.complaintStatus && <ComplaintStatusBadge status={f.complaintStatus} />}
        {f.reviewStatus === "new" && <NewIndicator />}
      </div>
      <h1 className="mt-2 text-lg font-semibold text-ink">Feedback from {f.customerName || "an anonymous customer"}</h1>
      <p className="mt-0.5 text-sm text-ink-muted">Received {when(f.submittedAt)}</p>

      {actionError && <Alert className="mt-4">{actionError}</Alert>}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {f.submissionType === "voice" && f.audio ? (
            <VoiceMessage
              feedbackId={f.id}
              audio={f.audio}
              transcriptStatus={f.transcriptStatus}
              transcriptText={f.transcriptText}
              onAccessError={handleAccessError}
            />
          ) : (
            <Card>
              <h2 className="sr-only">Message</h2>
              <p className="text-sm whitespace-pre-wrap break-words text-ink">{f.message}</p>
            </Card>
          )}

          <NotesCard
            notes={f.internalNotes}
            busy={busy === "note"}
            onAdd={(text) => run("note", "/notes", "POST", { text })}
          />
          <HistoryCard history={f.statusHistory} />
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Details</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Detail label="Type">{f.submissionType === "voice" ? "Voice message" : "Written"}</Detail>
              <Detail label="Source">
                {f.link ? (
                  <>
                    {f.link.name}
                    {!f.link.isActive && <span className="ml-1 text-xs text-ink-muted">(inactive)</span>}
                  </>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Name">{f.customerName || <span className="text-ink-muted">Not given</span>}</Detail>
              <Detail label="Email">
                {f.customerEmail ? (
                  <a href={`mailto:${f.customerEmail}`} className="inline-flex items-center gap-1 break-all text-accent hover:underline">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {f.customerEmail}
                  </a>
                ) : (
                  <span className="text-ink-muted">Not given</span>
                )}
              </Detail>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Review</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {f.reviewStatus === "new" ? "Not reviewed yet." : "Marked as reviewed."}
            </p>
            <Button
              variant={f.reviewStatus === "new" ? "primary" : "secondary"}
              size="sm"
              className="mt-3 w-full"
              loading={busy === "review"}
              disabled={busy !== null}
              onClick={() =>
                run("review", "/review", "PATCH", { reviewStatus: f.reviewStatus === "new" ? "reviewed" : "new" })
              }
            >
              {f.reviewStatus === "new" ? "Mark as reviewed" : "Mark as new"}
            </Button>
          </Card>

          {isComplaint && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">Complaint</h2>
              <div className="mt-2">
                <ComplaintStatusBadge status={f.complaintStatus ?? "open"} />
              </div>
              {f.complaintStatus === "resolved" && f.resolutionSummary && (
                <div className="mt-3 rounded-md bg-subtle px-3 py-2 text-sm">
                  <p className="text-xs font-medium text-ink-muted">Resolution</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-ink">{f.resolutionSummary}</p>
                  {f.resolvedAt && <p className="mt-1 text-xs text-ink-muted">{when(f.resolvedAt)}</p>}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {COMPLAINT_ACTIONS[f.complaintStatus ?? "open"].map((action) => (
                  <Button
                    key={action.status}
                    size="sm"
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
              </div>
            </Card>
          )}
        </div>
      </div>

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
    </>
  );
}

function BackLink({ to }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Feedback
    </Link>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}

function NotesCard({ notes, busy, onAdd }) {
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
    <Card>
      <h2 className="text-sm font-semibold text-ink">Internal notes</h2>
      <p className="mt-0.5 text-xs text-ink-muted">Only visible to your team, never to the customer.</p>

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">No notes yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border border-border px-3 py-2.5">
              <p className="text-sm whitespace-pre-wrap break-words text-ink">{note.text}</p>
              <p className="mt-1 text-xs text-ink-muted">
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
          <Button type="submit" size="sm" loading={busy}>
            Add note
          </Button>
        </div>
      </form>
    </Card>
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

function HistoryCard({ history }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink">History</h2>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No changes yet.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-border pl-4">
          {[...history].reverse().map((entry, i) => (
            <li key={`${entry.at}-${i}`} className="text-sm">
              <p className="text-ink">
                <span className="font-medium">{entry.by.name}</span> {describeChange(entry)}
              </p>
              {entry.resolutionSummary && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-ink-muted">“{entry.resolutionSummary}”</p>
              )}
              <p className="mt-0.5 text-xs text-ink-muted">{when(entry.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
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
