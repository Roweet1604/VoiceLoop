import mongoose from "mongoose";

export const ACCESS_STATUSES = ["pending", "active", "suspended", "expired", "rejected"];

// One entry per access change: who did what, when, and why.
const accessHistorySchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // e.g. "requested", "approved", "suspended"
    fromStatus: { type: String, enum: [...ACCESS_STATUSES, null], default: null },
    toStatus: { type: String, enum: ACCESS_STATUSES, required: true },
    accessExpiresAt: { type: Date, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    accessStatus: { type: String, enum: ACCESS_STATUSES, default: "pending", index: true },
    accessStartsAt: { type: Date, default: null },
    accessExpiresAt: { type: Date, default: null }, // null = no expiry
    accessHistory: { type: [accessHistorySchema], default: [] },
  },
  { timestamps: true }
);

const BLOCKED = {
  pending: { code: "ACCESS_PENDING", message: "Your account is waiting for approval" },
  rejected: { code: "ACCESS_REJECTED", message: "Your access request was not approved" },
  suspended: { code: "ACCESS_SUSPENDED", message: "Your account has been suspended" },
  expired: { code: "ACCESS_EXPIRED", message: "Your access period has ended" },
};

// The effective status at `now`. Expiry is evaluated on every call instead
// of by a scheduled job, so an "active" organization past its accessExpiresAt
// counts as expired without anything being written. Works on documents and
// plain objects. The Super Admin account list mirrors this rule in a MongoDB
// expression (routes/superAdmin.js); keep the two in sync.
export function effectiveAccessStatus({ accessStatus, accessStartsAt, accessExpiresAt }, now = new Date()) {
  if (accessStatus !== "active") return accessStatus;
  if (accessExpiresAt && accessExpiresAt <= now) return "expired";
  if (accessStartsAt && accessStartsAt > now) return "pending";
  return "active";
}

organizationSchema.methods.accessState = function accessState(now = new Date()) {
  const status = effectiveAccessStatus(this, now);
  return status === "active" ? { status, allowed: true } : { status, allowed: false, ...BLOCKED[status] };
};

export const Organization = mongoose.model("Organization", organizationSchema);
