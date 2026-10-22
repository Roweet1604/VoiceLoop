import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AuditLog } from "../models/AuditLog.js";
import { Organization } from "../models/Organization.js";
import { Business } from "../models/Business.js";
import { Feedback } from "../models/Feedback.js";
import { AppError } from "../utils/AppError.js";
import { escapeRegex } from "../utils/regex.js";
import { changeAccess, listAccounts, accessCounts } from "../services/accountAccess.js";
import { deleteOrganizationAccount } from "../services/accountDeletion.js";
import { createResetLinkForAccount } from "../services/passwordReset.js";
import { createLimiter } from "../middleware/rateLimit.js";
import { serializeAuditEntries, userNames, personFrom, SEARCHABLE_CONTEXT_KEYS } from "../services/auditLog.js";
import {
  auditLogQuery,
  listQuery,
  deleteAccountBody,
  approveBody,
  rejectBody,
  suspendBody,
  reactivateBody,
  extendBody,
} from "../validators/superAdmin.js";

const router = Router();

// Per admin (the routes below run after requireAuth), not per IP.
export const RESET_LINKS_PER_ADMIN_PER_HOUR = 10;
const resetLinkLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: RESET_LINKS_PER_ADMIN_PER_HOUR,
  keyGenerator: (req) => `admin-${req.user._id}`,
});

// Every route below is Super Admin only. Owners get 403, logged-out callers 401.
router.use(requireAuth, requireSuperAdmin);

router.get("/accounts", validate({ query: listQuery }), async (req, res) => {
  const { status, q, expiring, page, limit } = req.query;
  res.json(
    await listAccounts({
      status: status ?? "all",
      q: q ?? "",
      expiring: expiring === "true",
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    })
  );
});

// Real platform-wide counts. Audio bytes are the sizes recorded at upload
// for recordings that still exist (deleted accounts' files are gone).
router.get("/overview", async (req, res) => {
  const [access, businesses, feedback, [audio]] = await Promise.all([
    accessCounts(),
    Business.countDocuments(),
    Feedback.countDocuments(),
    Feedback.aggregate([
      { $match: { submissionType: "voice", audioKey: { $ne: null } } },
      { $group: { _id: null, recordings: { $sum: 1 }, bytes: { $sum: "$audioSizeBytes" } } },
    ]),
  ]);
  res.json({
    accounts: access,
    businesses,
    feedback,
    voiceRecordings: audio?.recordings ?? 0,
    audioBytes: audio?.bytes ?? 0,
  });
});

// The platform audit trail, newest first. `q` matches the action and a few
// safe context fields literally (regex characters are escaped).
router.get("/audit-logs", validate({ query: auditLogQuery }), async (req, res) => {
  const { action, targetId, from, to, q } = req.query;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);

  const filter = {};
  if (action) filter.action = action;
  if (targetId) filter.targetId = new mongoose.Types.ObjectId(targetId);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (q?.trim()) {
    const pattern = { $regex: escapeRegex(q.trim()), $options: "i" };
    filter.$or = [{ action: pattern }, ...SEARCHABLE_CONTEXT_KEYS.map((key) => ({ [`context.${key}`]: pattern }))];
  }

  const [total, entries, actions] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.distinct("action"),
  ]);

  res.json({
    entries: await serializeAuditEntries(entries),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    actions: actions.sort(),
  });
});

// One organization's access history and audit entries, newest first.
// A deleted organization is a 404 here; its deletion entry remains in
// /audit-logs.
router.get("/accounts/:id/history", async (req, res) => {
  const { id } = req.params;
  const organization = mongoose.isValidObjectId(id) ? await Organization.findById(id).select("name accessHistory").lean() : null;
  if (!organization) throw AppError.notFound("Account not found");

  const entries = await AuditLog.find({ targetType: "Organization", targetId: organization._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(500)
    .lean();
  const names = await userNames(organization.accessHistory.map((h) => h.by));

  res.json({
    account: { id: organization._id, name: organization.name },
    accessHistory: [...organization.accessHistory].reverse().map((h) => ({
      action: h.action,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      accessExpiresAt: h.accessExpiresAt,
      reason: h.reason,
      by: personFrom(names, h.by),
      at: h.at,
    })),
    auditEntries: await serializeAuditEntries(entries),
  });
});

const ACTION_VALIDATORS = {
  approve: approveBody,
  reject: rejectBody,
  suspend: suspendBody,
  reactivate: reactivateBody,
  extend: extendBody,
};

// Permanent deletion; see services/accountDeletion.js.
router.post("/accounts/:id/delete", validate({ body: deleteAccountBody }), async (req, res) => {
  const result = await deleteOrganizationAccount({
    organizationId: req.params.id,
    confirmName: req.body.confirmName,
    actor: req.user,
  });
  res.json({ deleted: result });
});

// A password reset link for the account's owner, shown to the admin once and
// never emailed. See createResetLinkForAccount() in services/passwordReset.js.
router.post("/accounts/:id/reset-link", resetLinkLimiter, async (req, res) => {
  const { link, expiresAt } = await createResetLinkForAccount({ organizationId: req.params.id, actor: req.user });
  res.set("Cache-Control", "no-store");
  res.status(201).json({ link, expiresAt });
});

for (const [action, validator] of Object.entries(ACTION_VALIDATORS)) {
  router.post(`/accounts/:id/${action}`, validate({ body: validator }), async (req, res) => {
    const account = await changeAccess({
      organizationId: req.params.id,
      action,
      body: req.body ?? {},
      actor: req.user,
    });
    res.json({ account });
  });
}

export default router;
