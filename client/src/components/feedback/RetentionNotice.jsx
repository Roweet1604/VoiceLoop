import { Clock } from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (n) => `${n} ${n === 1 ? "day" : "days"}`;

// Inbox and analytics: feedback is deleted automatically after the server's
// retention period. Renders nothing until the server has said what it is.
// `compact` keeps it to one line; the full sentence stays in the page for
// screen readers and shows as a tooltip when it is cut off.
// `pill` shows a short label in a small pill; the full sentence (after
// `intro`, if given) is in a tooltip on hover and keyboard focus, and is what
// screen readers read.
export default function RetentionNotice({ retentionDays, compact = false, pill = false, intro, className = "" }) {
  if (!retentionDays) return null;
  const text = `Feedback is deleted automatically after ${days(retentionDays)}. Export a CSV if you need to keep a copy.`;
  if (pill) {
    const full = intro ? `${intro} ${text}` : text;
    return (
      <span
        tabIndex={0}
        className={`group relative inline-flex items-center gap-1.5 rounded-full border border-border bg-panel2 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span aria-hidden="true">Deleted after {days(retentionDays)}</span>
        <span className="sr-only">{full}</span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-full left-0 z-30 mt-2 w-72 rounded-control border border-border bg-panel px-3 py-2 text-xs font-normal whitespace-normal text-text opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {full}
        </span>
      </span>
    );
  }
  return (
    <p
      title={compact ? text : undefined}
      className={`flex gap-2 text-xs text-muted ${compact ? "items-center" : "items-start"} ${className}`}
    >
      <Clock className={`h-3.5 w-3.5 shrink-0 ${compact ? "" : "mt-px"}`} aria-hidden="true" />
      <span className={compact ? "min-w-0 truncate" : ""}>{text}</span>
    </p>
  );
}

// "Deletes automatically in N days" for one item. The server deletes it once
// it is older than retentionDays, checking every hour, so less than a day left
// still shows as 1 day.
export function deletesIn(submittedAt, retentionDays, now = Date.now()) {
  const remaining = new Date(submittedAt).getTime() + retentionDays * DAY_MS - now;
  return `Deletes automatically in ${days(Math.max(1, Math.ceil(remaining / DAY_MS)))}`;
}
