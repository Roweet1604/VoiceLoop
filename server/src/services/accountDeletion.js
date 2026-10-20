// Permanent deletion of an organization and everything that belongs to it.
//
// DELETION RULE (CLAUDE.md): this must remove ALL of an organization's data
// from every collection and from audio storage. When you add a collection or
// a stored file type, update ORGANIZATION_DATA (or the storage section below)
// and tests/deletion.test.js in the same change. The "every model is covered"
// test fails if a new model with an organizationId isn't handled here.
import mongoose from "mongoose";
import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { Business } from "../models/Business.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Feedback } from "../models/Feedback.js";
import { AuditLog } from "../models/AuditLog.js";
import { AppError } from "../utils/AppError.js";

// Collections whose documents belong to an organization through an
// `organizationId` field. Feedback includes its internal notes (embedded).
// Order: dependants first, so a partial run could never leave orphans
// pointing at missing parents (the transaction makes this belt and braces).
export const ORGANIZATION_DATA = [
  { model: Feedback, key: "feedback" },
  { model: FeedbackLink, key: "links" },
  { model: Business, key: "businesses" },
  // Super Admins never belong to an organization; the filter keeps it that
  // way even if data is ever inconsistent.
  { model: User, key: "users", extraFilter: { role: { $ne: "superadmin" } } },
];

// The name the Super Admin must type to confirm: the business name, or the
// organization name if no business has been set up yet.
export function confirmationNameFor(organization, business) {
  return business?.name ?? organization.name;
}

/**
 * Permanently deletes an organization and all its data in one transaction.
 * Nothing is deleted unless every step succeeds.
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

    // ---------------------------------------------------------------------
    // AUDIO STORAGE (not built yet). When private audio uploads exist:
    //   1. Here, inside the transaction, collect the storage keys of every
    //      audio file belonging to this organization (e.g. from Feedback).
    //   2. After the transaction commits (see below), delete those objects
    //      from storage. Files can't take part in a MongoDB transaction, so
    //      they are removed only once the database deletion is certain.
    // ---------------------------------------------------------------------

    const deleted = {};
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

  // AUDIO STORAGE (not built yet): delete the collected storage objects here,
  // after the commit. Log any failures with their keys so they can be retried;
  // never let a storage error report the account as not deleted.

  return result;
}
