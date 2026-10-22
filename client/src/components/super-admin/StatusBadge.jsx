import StatusPill from "../ui/StatusPill.jsx";
import { ACCESS_STATUS_LABELS } from "../../lib/auditLabels.js";

const TONES = {
  pending: "warn",
  active: "ok",
  suspended: "danger",
  expired: "neutral",
  rejected: "danger",
};

// An account's access status as a small pill.
export default function StatusBadge({ status }) {
  return <StatusPill tone={TONES[status] ?? "neutral"}>{ACCESS_STATUS_LABELS[status] ?? status}</StatusPill>;
}
