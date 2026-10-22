import { useId, useState } from "react";
import { CircleAlert } from "lucide-react";
import Dialog, { DialogFooter } from "../ui/Dialog.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import { inputClasses } from "../ui/TextField.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { api } from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REASON_LENGTH = 500;
const DAY_OPTIONS = [7, 30, 90];

export const ACTION_LABELS = {
  approve: "Approve",
  reject: "Reject",
  suspend: "Suspend",
  reactivate: "Reactivate",
  extend: "Extend",
};

const META = {
  approve: { title: "Approve access", confirm: "Approve access", variant: "primary" },
  reject: { title: "Reject request", confirm: "Reject request", variant: "danger" },
  suspend: { title: "Suspend account", confirm: "Suspend account", variant: "danger" },
  reactivate: { title: "Reactivate account", confirm: "Reactivate", variant: "primary" },
  extend: { title: "Extend access", confirm: "Extend access", variant: "primary" },
};

// <input type="date"> works in local YYYY-MM-DD.
function toDateInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A chosen end date means "through the end of that day" in the admin's time zone.
function endOfDay(dateInput) {
  const [y, m, d] = dateInput.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function termOptions(action, account, now) {
  const currentEnd = account.accessExpiresAt ? new Date(account.accessExpiresAt) : null;
  if (action === "extend") {
    return [
      ...DAY_OPTIONS.map((n) => ({ value: String(n), label: `Add ${n} days` })),
      { value: "custom", label: "Set a new end date" },
    ];
  }
  const options = [
    ...DAY_OPTIONS.map((n) => ({ value: String(n), label: `${n} days` })),
    { value: "custom", label: "Custom end date" },
    { value: "none", label: "No expiry" },
  ];
  // Reactivating can keep the existing period if it hasn't run out.
  if (action === "reactivate" && (!currentEnd || currentEnd > now)) {
    options.unshift({
      value: "keep",
      label: currentEnd ? `Keep current end date (${formatDate(currentEnd)})` : "Keep current period (no expiry)",
    });
  }
  return options;
}

// Turns the form into a request body and a preview of the resulting end
// date, or an error message if the choice isn't valid yet.
function buildTerm(action, account, choice, customDate, now) {
  const currentEnd = account.accessExpiresAt ? new Date(account.accessExpiresAt) : null;

  if (choice === "keep") return { body: {}, end: currentEnd };
  if (choice === "none") return { body: { noExpiry: true }, end: null };

  if (choice === "custom") {
    if (!customDate) return { error: "Choose an end date" };
    const end = endOfDay(customDate);
    if (end <= now) return { error: "The end date must be in the future" };
    if (action === "extend" && currentEnd && currentEnd > now && end <= currentEnd) {
      return { error: `Choose a date after the current end date (${formatDate(currentEnd)})` };
    }
    return { body: { endDate: end.toISOString() }, end };
  }

  const days = Number(choice);
  // Extending adds to the current end date, or to today if it has passed.
  const base = action === "extend" && currentEnd && currentEnd > now ? currentEnd : now;
  return { body: { days }, end: new Date(base.getTime() + days * DAY_MS) };
}

function serverErrorText(err) {
  const details = err.details ? Object.values(err.details) : [];
  return details.length ? details.join(". ") : err.message;
}

export default function AccountActionDialog({ account, action, onClose, onDone }) {
  const meta = META[action];
  const usesTerm = action === "approve" || action === "reactivate" || action === "extend";
  const usesReason = action === "reject" || action === "suspend";
  const reasonRequired = action === "suspend";

  const [now] = useState(() => new Date());
  const options = usesTerm ? termOptions(action, account, now) : [];
  const [choice, setChoice] = useState(() => (options.some((o) => o.value === "keep") ? "keep" : "30"));
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const reasonId = useId();
  const dateId = useId();

  const term = usesTerm ? buildTerm(action, account, choice, customDate, now) : null;
  const reasonError =
    usesReason && reasonRequired && !reason.trim()
      ? "A reason is required"
      : reason.trim().length > MAX_REASON_LENGTH
        ? `Keep the reason under ${MAX_REASON_LENGTH} characters`
        : null;
  const formError = term?.error || reasonError;

  async function onSubmit(e) {
    e.preventDefault();
    setAttempted(true);
    if (formError) return;

    setSubmitting(true);
    setError(null);
    try {
      const body = usesTerm ? term.body : reason.trim() ? { reason: reason.trim() } : {};
      const { account: updated } = await api(`/api/super-admin/accounts/${account.id}/${action}`, {
        method: "POST",
        body,
      });
      onDone(updated, action);
    } catch (err) {
      setError(serverErrorText(err));
      setSubmitting(false);
    }
  }

  return (
    <Dialog title={meta.title} busy={submitting} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        <div className="space-y-4 px-6 pt-4">
          <dl className="divide-y divide-border rounded-control border border-border bg-panel2 text-sm">
            <Row label="Business" value={account.name} />
            <Row label="Owner" value={account.owner ? `${account.owner.name} · ${account.owner.email}` : "—"} />
            <Row label="Status" value={<StatusBadge status={account.accessStatus} />} />
            {account.accessExpiresAt && <Row label="Current end" value={formatDate(account.accessExpiresAt)} />}
          </dl>

          {usesTerm && (
            <fieldset disabled={submitting}>
              <legend className="text-sm font-semibold text-text">
                {action === "extend" ? "Extend by" : "Access period"}
              </legend>
              <div className="mt-2 space-y-1.5">
                {options.map((option) => (
                  <label
                    key={option.value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                      choice === option.value ? "border-accent bg-accentSoft text-text" : "border-border hover:bg-panel2"
                    }`}
                  >
                    <input
                      type="radio"
                      name="term"
                      value={option.value}
                      checked={choice === option.value}
                      onChange={() => setChoice(option.value)}
                      className="accent-accent"
                    />
                    {option.label}
                  </label>
                ))}
              </div>

              {choice === "custom" && (
                <div className="mt-3">
                  <label htmlFor={dateId} className="block text-sm font-semibold text-text">
                    End date
                  </label>
                  <input
                    id={dateId}
                    type="date"
                    min={toDateInput(now)}
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className={`${inputClasses} mt-1.5 border-border-strong`}
                  />
                </div>
              )}

              {!term.error && (
                <p className="mt-3 text-sm text-muted">
                  {term.end ? (
                    <>
                      Access will end on <strong className="font-medium text-text">{formatDate(term.end)}</strong>.
                    </>
                  ) : (
                    "Access will have no end date."
                  )}
                </p>
              )}
              {attempted && term.error && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
                  <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{term.error}</span>
                </p>
              )}
            </fieldset>
          )}

          {usesReason && (
            <div>
              <label htmlFor={reasonId} className="block text-sm font-semibold text-text">
                Reason {!reasonRequired && <span className="font-normal text-muted">(optional)</span>}
              </label>
              <textarea
                id={reasonId}
                rows={3}
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                disabled={submitting}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={attempted && reasonError ? true : undefined}
                className={`${inputClasses} mt-1.5 resize-y ${attempted && reasonError ? "border-danger" : "border-border-strong"}`}
              />
              <p className={`mt-1.5 text-xs ${attempted && reasonError ? "text-danger" : "text-muted"}`}>
                {attempted && reasonError
                  ? reasonError
                  : "Recorded in the account history and audit log. Not shown to the account owner."}
              </p>
            </div>
          )}

          {action === "suspend" && (
            <p className="text-sm text-muted">The owner loses access to the dashboard on their next request.</p>
          )}

          {error && <Alert>{error}</Alert>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant={meta.variant} loading={submitting}>
            {meta.confirm}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text">{value}</dd>
    </div>
  );
}
