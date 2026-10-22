// Writing and reading AuditLog entries.
//
// Responses never include an entry as stored: only the fields below, actor
// names looked up fresh (never emails), and context keys on SAFE_CONTEXT_KEYS.
// A sensitive value that ever ended up in `context` therefore still couldn't
// reach the Super Admin screens. Add a key here only if it can never hold
// passwords, tokens, customer emails or feedback text.
import mongoose from "mongoose";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { Organization } from "../models/Organization.js";

export const SAFE_CONTEXT_KEYS = [
  "organizationName",
  "businessName",
  "fromStatus",
  "toStatus",
  "accessStartsAt",
  "accessExpiresAt",
  "previousExpiresAt",
  "reason",
  "fields", // names of changed settings, never their values
  // retention.cleanup: counts and the cutoff date only
  "feedbackDeleted",
  "audioFilesDeleted",
  "cutoff",
  // feedback.deleted: enum values only
  "category",
  "submissionType",
];

// Context fields matched by the audit-log text search (with `action`).
export const SEARCHABLE_CONTEXT_KEYS = ["organizationName", "businessName", "reason"];

// Records an owner's change to their own organization's business. The target
// is the Organization, so account deletion removes these entries with the
// rest of its audit trail. No actorEmail: owners' emails stay out of the log.
export function recordOwnerAction({ user, action, context, session }) {
  return AuditLog.create(
    [
      {
        actor: user._id,
        action,
        targetType: "Organization",
        targetId: user.organizationId,
        context,
        createdAt: new Date(),
      },
    ],
    { session }
  );
}

function safeContext(context) {
  const safe = {};
  for (const key of SAFE_CONTEXT_KEYS) {
    if (context?.[key] !== undefined && context[key] !== null) safe[key] = context[key];
  }
  return safe;
}

// Names (never emails) of the given user ids.
export async function userNames(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))].filter((id) => mongoose.isValidObjectId(id));
  const users = await User.find({ _id: { $in: unique } }).select("name role").lean();
  return new Map(users.map((u) => [String(u._id), { name: u.name, role: u.role }]));
}

export const personFrom = (names, id) => {
  if (!id) return null;
  const found = names.get(String(id));
  return found ? { id, name: found.name, role: found.role } : { id, name: "Deleted user", role: null };
};

// Plain entries -> response objects. Organization targets get a name: the
// one recorded at the time, or the current one, or none if it was deleted.
export async function serializeAuditEntries(entries) {
  const orgIds = entries.filter((e) => e.targetType === "Organization").map((e) => e.targetId);
  const [names, orgs] = await Promise.all([
    userNames(entries.map((e) => e.actor)),
    Organization.find({ _id: { $in: orgIds } }).select("name").lean(),
  ]);
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));

  return entries.map((entry) => {
    const context = safeContext(entry.context);
    return {
      id: entry._id,
      action: entry.action,
      createdAt: entry.createdAt,
      actor: personFrom(names, entry.actor),
      target: {
        type: entry.targetType,
        id: entry.targetId,
        name: context.businessName ?? context.organizationName ?? orgName.get(String(entry.targetId)) ?? null,
        exists: entry.targetType === "Organization" ? orgName.has(String(entry.targetId)) : null,
      },
      context,
    };
  });
}
