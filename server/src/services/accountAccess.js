// Super Admin account access: listing organizations and changing their access.
import mongoose from "mongoose";
import { Organization, effectiveAccessStatus, ACCESS_STATUSES } from "../models/Organization.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { AppError } from "../utils/AppError.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRING_SOON_DAYS = 7;

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const formatDate = (date) => date.toISOString().slice(0, 10);

function invalidTransition(message) {
  return AppError.conflict(message, "INVALID_TRANSITION");
}

// Shape returned to the admin UI. Only whitelisted fields: no password data,
// and the access history stays out of the list.
export function serializeAccount(org, owner, now = new Date()) {
  const accessStatus = effectiveAccessStatus(org, now);
  const expiresAt = org.accessExpiresAt ? new Date(org.accessExpiresAt) : null;
  return {
    id: org._id,
    name: org.name,
    owner: owner ? { id: owner._id, name: owner.name, email: owner.email } : null,
    requestedAt: org.createdAt,
    accessStatus,
    accessStartsAt: org.accessStartsAt,
    accessExpiresAt: org.accessExpiresAt,
    daysRemaining: accessStatus === "active" && expiresAt ? Math.ceil((expiresAt - now) / DAY_MS) : null,
  };
}

// ---------------------------------------------------------------------------
// Transitions. Each planner checks that the change makes sense for the
// account's current effective status and returns the fields to set. Bodies
// have already passed the validators in validators/superAdmin.js.

// { days } | { endDate } | { noExpiry: true }  ->  the new accessExpiresAt
function termEnd(body, now) {
  if (body.days !== undefined) return addDays(now, body.days);
  if (body.endDate !== undefined) return new Date(body.endDate);
  return null;
}

const hasTerm = (body) => body.days !== undefined || body.endDate !== undefined || body.noExpiry === true;

const PLANNERS = {
  approve(org, body, now, from) {
    if (from === "active") throw invalidTransition("This account is already active");
    if (from === "suspended") throw invalidTransition("This account is suspended. Reactivate it instead");
    if (from === "expired") throw invalidTransition("This account's access has ended. Extend it instead");
    // pending or rejected
    return { toStatus: "active", accessStartsAt: now, accessExpiresAt: termEnd(body, now) };
  },

  reject(org, body, now, from) {
    if (from !== "pending") throw invalidTransition(`Only pending requests can be rejected; this account is ${from}`);
    return { toStatus: "rejected", reason: body.reason?.trim() };
  },

  suspend(org, body, now, from) {
    if (from === "suspended") throw invalidTransition("This account is already suspended");
    if (from !== "active") throw invalidTransition(`Only active accounts can be suspended; this account is ${from}`);
    return { toStatus: "suspended", reason: body.reason.trim() };
  },

  reactivate(org, body, now, from) {
    if (from !== "suspended") throw invalidTransition(`Only suspended accounts can be reactivated; this account is ${from}`);
    if (hasTerm(body)) {
      return { toStatus: "active", accessStartsAt: org.accessStartsAt ?? now, accessExpiresAt: termEnd(body, now) };
    }
    if (org.accessExpiresAt && org.accessExpiresAt <= now) {
      throw AppError.badRequest(
        `The access period ended on ${formatDate(org.accessExpiresAt)} while suspended. Choose a new end date to reactivate`,
        { term: "A new access period is required" }
      );
    }
    return { toStatus: "active", accessStartsAt: org.accessStartsAt ?? now };
  },

  extend(org, body, now, from) {
    if (from !== "active" && from !== "expired") {
      throw invalidTransition(`Only active or expired accounts can be extended; this account is ${from}`);
    }
    const currentEnd = org.accessExpiresAt;
    if (from === "active" && !currentEnd) throw invalidTransition("This account has no expiry date to extend");

    // Days are added to the current end date, or to today if it has passed.
    const base = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd = body.days !== undefined ? addDays(base, body.days) : new Date(body.endDate);
    if (currentEnd && currentEnd > now && newEnd <= currentEnd) {
      throw AppError.badRequest("The new end date must be later than the current end date", {
        endDate: `Must be after ${formatDate(currentEnd)}`,
      });
    }
    return { toStatus: "active", accessStartsAt: org.accessStartsAt ?? now, accessExpiresAt: newEnd };
  },
};

export const ACCESS_ACTIONS = Object.keys(PLANNERS);

// Applies an access change and records it in the organization's
// accessHistory and in the AuditLog. Both writes happen in one transaction,
// so a change is never saved without its audit entry (requires a replica set,
// which MongoDB Atlas provides).
export async function changeAccess({ organizationId, action, body, actor }) {
  if (!mongoose.isValidObjectId(organizationId)) throw AppError.notFound("Account not found");

  let updated;
  await mongoose.connection.transaction(async (session) => {
    const now = new Date();
    const org = await Organization.findById(organizationId).session(session);
    if (!org) throw AppError.notFound("Account not found");

    const fromStatus = effectiveAccessStatus(org, now);
    const plan = PLANNERS[action](org, body, now, fromStatus);
    const previousExpiresAt = org.accessExpiresAt;

    org.accessStatus = plan.toStatus;
    if ("accessStartsAt" in plan) org.accessStartsAt = plan.accessStartsAt;
    if ("accessExpiresAt" in plan) org.accessExpiresAt = plan.accessExpiresAt;
    org.accessHistory.push({
      action,
      fromStatus,
      toStatus: plan.toStatus,
      accessExpiresAt: org.accessExpiresAt,
      by: actor._id,
      reason: plan.reason ?? "",
      at: now,
    });
    await org.save({ session });

    await AuditLog.create(
      [
        {
          actor: actor._id,
          actorEmail: actor.email,
          action: `access.${action}`,
          targetType: "Organization",
          targetId: org._id,
          context: {
            organizationName: org.name,
            fromStatus,
            toStatus: plan.toStatus,
            accessStartsAt: org.accessStartsAt,
            accessExpiresAt: org.accessExpiresAt,
            previousExpiresAt,
            ...(plan.reason && { reason: plan.reason }),
          },
          createdAt: now,
        },
      ],
      { session }
    );

    updated = org;
  });

  const owner = await User.findOne({ organizationId: updated._id, role: "owner" }).select("name email");
  return serializeAccount(updated, owner);
}

// ---------------------------------------------------------------------------
// Listing

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// MongoDB version of effectiveAccessStatus(); keep the two in sync.
function effectiveStatusExpression(now) {
  return {
    $switch: {
      branches: [
        { case: { $ne: ["$accessStatus", "active"] }, then: "$accessStatus" },
        { case: { $lte: [{ $ifNull: ["$accessExpiresAt", new Date(8.64e15)] }, now] }, then: "expired" },
        { case: { $gt: [{ $ifNull: ["$accessStartsAt", new Date(0)] }, now] }, then: "pending" },
      ],
      default: "active",
    },
  };
}

export async function listAccounts({ status = "all", q = "", expiring = false, page = 1, limit = 20 }) {
  const now = new Date();
  const expiringSoon = { effectiveStatus: "active", accessExpiresAt: { $ne: null, $lte: addDays(now, EXPIRING_SOON_DAYS) } };

  const filter = {};
  if (status !== "all") filter.effectiveStatus = status;
  if (expiring) Object.assign(filter, expiringSoon);
  if (q.trim()) {
    const pattern = new RegExp(escapeRegex(q.trim()), "i");
    filter.$or = [{ name: pattern }, { "owner.name": pattern }, { "owner.email": pattern }];
  }

  // Pending requests are reviewed oldest first; expiring accounts soonest first.
  const sort = expiring ? { accessExpiresAt: 1, _id: 1 } : status === "pending" ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 };

  const [result] = await Organization.aggregate([
    {
      $lookup: {
        from: User.collection.name,
        let: { orgId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$organizationId", "$$orgId"] }, role: "owner" } },
          { $sort: { createdAt: 1 } },
          { $limit: 1 },
          { $project: { name: 1, email: 1 } }, // never passwordHash
        ],
        as: "owners",
      },
    },
    { $addFields: { owner: { $first: "$owners" }, effectiveStatus: effectiveStatusExpression(now) } },
    { $project: { owners: 0, accessHistory: 0 } },
    {
      $facet: {
        items: [{ $match: filter }, { $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $match: filter }, { $count: "n" }],
        byStatus: [{ $group: { _id: "$effectiveStatus", n: { $sum: 1 } } }],
        expiringSoon: [{ $match: expiringSoon }, { $count: "n" }],
      },
    },
  ]);

  const counts = Object.fromEntries(ACCESS_STATUSES.map((s) => [s, 0]));
  for (const { _id, n } of result.byStatus) counts[_id] = n;
  counts.all = Object.values(counts).reduce((sum, n) => sum + n, 0);
  counts.expiringSoon = result.expiringSoon[0]?.n ?? 0;

  const total = result.total[0]?.n ?? 0;
  return {
    accounts: result.items.map((org) => serializeAccount(org, org.owner, now)),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    counts,
  };
}
