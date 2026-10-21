// Display text for audit entries and access history. Everything returned is
// plain text, rendered by React (never as HTML).
import { formatDate } from "./format.js";

export const AUDIT_ACTION_LABELS = {
  "access.approve": "Approved access",
  "access.reject": "Rejected request",
  "access.suspend": "Suspended",
  "access.reactivate": "Reactivated",
  "access.extend": "Extended access",
  account_deleted: "Deleted account",
  "business.created": "Created business",
  "business.updated": "Changed business settings",
};

// accessHistory uses the bare action names.
export const HISTORY_ACTION_LABELS = {
  requested: "Requested access",
  approve: "Approved",
  reject: "Rejected",
  suspend: "Suspended",
  reactivate: "Reactivated",
  extend: "Extended",
};

export const ACCESS_STATUS_LABELS = {
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  expired: "Expired",
  rejected: "Rejected",
};

const FIELD_LABELS = {
  name: "name",
  locationName: "location",
  welcomeMessage: "welcome message",
  googleReviewUrl: "Google review link",
  reviewCardText: "review card text",
  feedbackCardText: "feedback card text",
};

export const auditActionLabel = (action) => AUDIT_ACTION_LABELS[action] ?? action;
const statusLabel = (status) => ACCESS_STATUS_LABELS[status] ?? status;

// "Pending → Active" (or just "Pending" for the first entry).
export function statusChange(from, to) {
  if (!to) return null;
  return from && from !== to ? `${statusLabel(from)} → ${statusLabel(to)}` : statusLabel(to);
}

// Access-period text for changes that set one.
export function accessUntil(expiresAt) {
  return expiresAt ? `Access until ${formatDate(expiresAt)}` : "No end date";
}

// Short plain-text facts about an audit entry, excluding the reason (shown
// on its own so it can wrap).
export function describeAuditEntry({ action, context }) {
  const lines = [];
  const change = statusChange(context.fromStatus, context.toStatus);
  if (change) lines.push(change);
  if (["access.approve", "access.reactivate", "access.extend"].includes(action) && "toStatus" in context) {
    lines.push(accessUntil(context.accessExpiresAt));
    if (action === "access.extend" && context.previousExpiresAt) lines.push(`was ${formatDate(context.previousExpiresAt)}`);
  }
  if (Array.isArray(context.fields) && context.fields.length > 0) {
    lines.push(`Changed ${context.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`);
  }
  return lines;
}
