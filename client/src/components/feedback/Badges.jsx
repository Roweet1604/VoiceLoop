import { CircleDot, Clock, CircleCheck } from "lucide-react";
import StatusPill from "../ui/StatusPill.jsx";
import { CATEGORY_LABELS, COMPLAINT_STATUS_LABELS } from "../../lib/feedbackLabels.js";

// Categories are identity, not state, so they stay neutral; status colors are
// reserved for complaint status, and always come with an icon and a label.
export function CategoryBadge({ category }) {
  return <StatusPill icon={null}>{CATEGORY_LABELS[category] ?? category}</StatusPill>;
}

const COMPLAINT_STYLES = {
  open: { tone: "danger", Icon: CircleDot },
  in_progress: { tone: "warn", Icon: Clock },
  resolved: { tone: "ok", Icon: CircleCheck },
};

export function ComplaintStatusBadge({ status }) {
  const style = COMPLAINT_STYLES[status];
  if (!style) return null;
  return (
    <StatusPill tone={style.tone} icon={style.Icon}>
      {COMPLAINT_STATUS_LABELS[status]}
    </StatusPill>
  );
}

// Marks unreviewed feedback. The dot is decorative; the text is for everyone.
export function NewIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accentText">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      New
    </span>
  );
}
