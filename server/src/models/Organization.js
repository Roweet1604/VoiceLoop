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

// The effective access state at `now`. Expiry is evaluated on every call
// instead of by a scheduled job, so an "active" organization past its
// accessExpiresAt is reported as expired without anything being written.
organizationSchema.methods.accessState = function accessState(now = new Date()) {
  let status = this.accessStatus;
  if (status === "active") {
    if (this.accessExpiresAt && this.accessExpiresAt <= now) status = "expired";
    else if (this.accessStartsAt && this.accessStartsAt > now) status = "pending";
  }
  return status === "active" ? { status, allowed: true } : { status, allowed: false, ...BLOCKED[status] };
};

export const Organization = mongoose.model("Organization", organizationSchema);
