import mongoose from "mongoose";

// Append-only record of significant actions. `context` holds non-sensitive
// details only (statuses, dates, reasons), never passwords, tokens or hashes.
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // Snapshot so the log stays readable if the actor account is later removed.
  // Optional: some entries (account deletion) deliberately store no email.
  actorEmail: { type: String },
  action: { type: String, required: true }, // e.g. "access.approve"
  targetType: { type: String, required: true }, // e.g. "Organization"
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
