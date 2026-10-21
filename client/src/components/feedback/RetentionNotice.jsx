import { Clock } from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (n) => `${n} ${n === 1 ? "day" : "days"}`;

// Inbox and analytics: feedback is deleted automatically after the server's
// retention period. Renders nothing until the server has said what it is.
export default function RetentionNotice({ retentionDays, className = "" }) {
  if (!retentionDays) return null;
  return (
    <p className={`flex items-start gap-2 text-xs text-ink-muted ${className}`}>
      <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Feedback is deleted automatically after {days(retentionDays)}. Export a CSV if you need to keep a copy.
      </span>
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
