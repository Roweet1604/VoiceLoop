import { CircleDot, Clock, CircleCheck } from "lucide-react";
import { CATEGORY_LABELS, COMPLAINT_STATUS_LABELS } from "../../lib/feedbackLabels.js";

// Categories are identity, not state, so they stay neutral; status colors are
// reserved for complaint status, and always come with an icon and a label.
export function CategoryBadge({ category }) {
  return (
    <span className="inline-flex rounded-sm border border-border bg-subtle px-1.5 py-0.5 text-xs font-medium text-ink-muted">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

const COMPLAINT_STYLES = {
  open: { classes: "bg-danger-soft text-danger", Icon: CircleDot },
  in_progress: { classes: "bg-warning-soft text-warning", Icon: Clock },
  resolved: { classes: "bg-success-soft text-success", Icon: CircleCheck },
};

export function ComplaintStatusBadge({ status }) {
  const style = COMPLAINT_STYLES[status];
  if (!style) return null;
  const { classes, Icon } = style;
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium ${classes}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {COMPLAINT_STATUS_LABELS[status]}
    </span>
  );
}

// Marks unreviewed feedback. The dot is decorative; the text is for everyone.
export function NewIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      New
    </span>
  );
}
