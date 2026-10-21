// Permanent deletion of an organization and everything that belongs to it.
//
// DELETION RULE (CLAUDE.md): this must remove ALL of an organization's data
// from every collection and from audio storage. When you add a collection or
// a stored file type, update ORGANIZATION_DATA, USER_DATA or STORED_FILES
// and tests/deletion.test.js in the same change. The "every model is covered"
// test fails if a new model isn't handled here.
import mongoose from "mongoose";
import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { Business } from "../models/Business.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Feedback } from "../models/Feedback.js";
import { AuditLog } from "../models/AuditLog.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { AppError } from "../utils/AppError.js";
import { getStorage } from "./storage/index.js";

const ORGANIZATION_USERS = { role: { $ne: "superadmin" } };

// Collections whose documents belong to an organization through an
// `organizationId` field. Feedback includes its internal notes (embedded);
// its audio files are in storage and handled separately (STORED_FILES).
// Order: dependants first, so a partial run could never leave orphans
// pointing at missing parents (the transaction makes this belt and braces).
export const ORGANIZATION_DATA = [
  { model: Feedback, key: "feedback" },
  { model: FeedbackLink, key: "links" },
  { model: Business, key: "businesses" },
  // Super Admins never belong to an organization; the filter keeps it that
  // way even if data is ever inconsistent.
  { model: User, key: "users", extraFilter: ORGANIZATION_USERS },
];

// Collections whose documents belong to one of the organization's users
// through a `userId` field. Deleted before the users themselves.
// (The key avoids the word "password": deletion responses are checked to
// contain nothing that looks like password data.)
export const USER_DATA = [{ model: PasswordResetToken, key: "resetTokens" }];

// Every kind of stored file and how to find an organization's keys. Add new
// file types here (and to tests/deletion.test.js) in the same change.
export const STORED_FILES = [
  {
    key: "audio",
    keysFor: async (orgId, session) =>
      (await Feedback.find({ organizationId: orgId, audioKey: { $ne: null } }).select("audioKey").session(session).lean()).map(
        (f) => f.audioKey
      ),
  },
];

// Removes files after the database deletion committed. Failures are logged
// with their keys so they can be removed by hand, but never undo or fail the
// deletion: the database records are already gone.
async function deleteStoredFiles(keys, organizationId) {
  const storage = getStorage();
  const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
  const failed = keys.filter((_, i) => results[i].status === "rejected");
  if (failed.length > 0) {
    console.error(
      `[storage] account ${organizationId} deleted, but ${failed.length} file(s) could not be removed: ${failed.join(", ")}`,
      results.find((r) => r.status === "rejected").reason
    );
  }
  return { removed: keys.length - failed.length, failed: failed.length };
}

// The name the Super Admin must type to confirm: the business name, or the
// organization name if no business has been set up yet.
export function confirmationNameFor(organization, business) {
  return business?.name ?? organization.name;
}

/**
 * Permanently deletes an organization and all its data in one transaction.
 * Nothing is deleted unless every step succeeds. Its stored files (audio)
 * are removed right after the transaction commits.
 *
 * Keeps exactly one AuditLog entry for the organization: action
 * "account_deleted", the actor's id, the organization id, the business name
 * and the time. No email, feedback text or password data. Earlier audit
 * entries about the organization (approvals, suspensions, ...) are removed
 * with it, as is its accessHistory (stored on the organization document).
 */
export async function deleteOrganizationAccount({ organizationId, confirmName, actor }) {
  if (!mongoose.isValidObjectId(organizationId)) throw AppError.notFound("Account not found");

  let result;
  let fileKeys = [];
  await mongoose.connection.transaction(async (session) => {
    const organization = await Organization.findById(organizationId).session(session);
    if (!organization) throw AppError.notFound("Account not found");

    const orgId = organization._id;
    if (await User.exists({ organizationId: orgId, role: "superadmin" }).session(session)) {
      throw AppError.forbidden("Accounts that include a Super Admin can't be deleted");
    }

    const business = await Business.findOne({ organizationId: orgId }).session(session);
    const expectedName = confirmationNameFor(organization, business);
    if (typeof confirmName !== "string" || confirmName.trim() !== expectedName) {
      throw new AppError("The name you typed doesn't match. Nothing was deleted.", 400, "CONFIRMATION_MISMATCH", {
        confirmName: "Type the name exactly as shown",
      });
    }

    // Stored files can't take part in a MongoDB transaction, so their keys
    // are collected here and the files removed only after the commit. (A
    // transaction that is retried collects them again from scratch.)
    fileKeys = [];
    for (const { keysFor } of STORED_FILES) fileKeys.push(...(await keysFor(orgId, session)));

    const deleted = {};
    // User-owned records first, while the users can still be found.
    const userIds = (
      await User.find({ organizationId: orgId, ...ORGANIZATION_USERS }).select("_id").session(session).lean()
    ).map((u) => u._id);
    for (const { model, key } of USER_DATA) {
      const { deletedCount } = await model.deleteMany({ userId: { $in: userIds } }, { session });
      deleted[key] = deletedCount;
    }
    for (const { model, key, extraFilter } of ORGANIZATION_DATA) {
      const { deletedCount } = await model.deleteMany({ organizationId: orgId, ...extraFilter }, { session });
      deleted[key] = deletedCount;
    }

    await AuditLog.deleteMany({ targetType: "Organization", targetId: orgId }, { session });
    // Removes the organization and its embedded accessHistory.
    await Organization.deleteOne({ _id: orgId }, { session });

    await AuditLog.create(
      [
        {
          actor: actor._id,
          action: "account_deleted",
          targetType: "Organization",
          targetId: orgId,
          context: { businessName: expectedName },
          createdAt: new Date(),
        },
      ],
      { session }
    );

    result = { organizationId: orgId, businessName: expectedName, deleted };
  });

  result.files = await deleteStoredFiles(fileKeys, result.organizationId);
  return result;
}
