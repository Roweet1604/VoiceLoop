const STYLES = {
  pending: { label: "Pending", classes: "bg-warning-soft text-warning" },
  active: { label: "Active", classes: "bg-success-soft text-success" },
  suspended: { label: "Suspended", classes: "bg-danger-soft text-danger" },
  expired: { label: "Expired", classes: "bg-subtle text-ink-muted" },
  rejected: { label: "Rejected", classes: "bg-danger-soft text-danger" },
};

export default function StatusBadge({ status }) {
  const { label, classes } = STYLES[status] ?? { label: status, classes: "bg-subtle text-ink-muted" };
  return <span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${classes}`}>{label}</span>;
}
