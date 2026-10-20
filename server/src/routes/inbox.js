import { Router } from "express";
import mongoose from "mongoose";
import { Business } from "../models/Business.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Feedback, FEEDBACK_CATEGORIES } from "../models/Feedback.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { escapeRegex } from "../utils/regex.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireActiveAccess, requireOwner } from "../middleware/auth.js";
import {
  listFeedbackQuery,
  summaryQuery,
  reviewBody,
  complaintStatusBody,
  noteBody,
} from "../validators/inbox.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const VOLUME_DAYS = 30;
const EXCERPT_LENGTH = 160;

// Allowed complaint changes: current status -> requested action -> new status.
const COMPLAINT_TRANSITIONS = {
  open: { in_progress: "in_progress", resolved: "resolved" },
  in_progress: { open: "open", resolved: "resolved" },
  resolved: { reopen: "open" },
};
const STATUS_LABELS = { open: "open", in_progress: "in progress", resolved: "resolved" };

const router = Router();

// Owners with active access only. Every query below is scoped to the business
// of the logged-in user's organization (from the database), so ids of another
// tenant's feedback simply aren't found.
router.use(requireAuth, requireActiveAccess, requireOwner);

async function ownBusiness(req) {
  const business = await Business.findOne({ organizationId: req.user.organizationId });
  if (!business) throw AppError.notFound("Set up your business first", "NO_BUSINESS");
  return business;
}

async function ownFeedback(business, id) {
  const feedback = mongoose.isValidObjectId(id) ? await Feedback.findOne({ _id: id, businessId: business._id }) : null;
  if (!feedback) throw AppError.notFound("Feedback not found");
  return feedback;
}

// Full view for the detail page: author names resolved, no organization ids.
async function serializeDetail(feedback, business) {
  const userIds = [...feedback.internalNotes.map((n) => n.authorId), ...feedback.statusHistory.map((h) => h.by)];
  const [users, link] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("name"),
    feedback.linkId ? FeedbackLink.findOne({ _id: feedback.linkId, businessId: business._id }) : null,
  ]);
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));
  const person = (id) => ({ id, name: nameOf.get(String(id)) ?? "Former team member" });

  return {
    id: feedback._id,
    category: feedback.category,
    message: feedback.message,
    customerName: feedback.customerName,
    customerEmail: feedback.customerEmail,
    submissionType: feedback.submissionType,
    reviewStatus: feedback.reviewStatus,
    complaintStatus: feedback.complaintStatus,
    resolutionSummary: feedback.resolutionSummary,
    resolvedAt: feedback.resolvedAt,
    submittedAt: feedback.submittedAt,
    link: link && { id: link._id, name: link.name, isActive: link.isActive },
    internalNotes: feedback.internalNotes.map((note) => ({
      id: note._id,
      text: note.text,
      author: person(note.authorId),
      createdAt: note.createdAt,
    })),
    statusHistory: feedback.statusHistory.map((entry) => ({
      field: entry.field,
      from: entry.from,
      to: entry.to,
      by: person(entry.by),
      at: entry.at,
      ...(entry.resolutionSummary && { resolutionSummary: entry.resolutionSummary }),
    })),
  };
}

// --- Summary -----------------------------------------------------------------

// The last `days` calendar days in `timeZone`, oldest first, as YYYY-MM-DD.
function recentDays(timeZone, days, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (days - 1 - i))).toISOString().slice(0, 10)
  );
}

const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

router.get("/summary", validate({ query: summaryQuery }), async (req, res) => {
  const business = await ownBusiness(req);
  const timeZone = req.query.tz ?? "UTC";
  const days = recentDays(timeZone, VOLUME_DAYS);
  // A day of slack so the oldest local day is fully covered in any time zone.
  const since = new Date(Date.now() - (VOLUME_DAYS + 1) * DAY_MS);

  const [[result], links] = await Promise.all([
    Feedback.aggregate([
      { $match: { businessId: business._id } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                new: countIf({ $eq: ["$reviewStatus", "new"] }),
                openComplaints: countIf({ $eq: ["$complaintStatus", "open"] }),
                inProgress: countIf({ $eq: ["$complaintStatus", "in_progress"] }),
                resolved: countIf({ $eq: ["$complaintStatus", "resolved"] }),
              },
            },
          ],
          byCategory: [{ $group: { _id: "$category", count: { $sum: 1 } } }],
          byLink: [{ $group: { _id: "$linkId", count: { $sum: 1 } } }],
          volume: [
            { $match: { submittedAt: { $gte: since } } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$submittedAt", timezone: timeZone } },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
    FeedbackLink.find({ businessId: business._id }).sort({ isDefault: -1, createdAt: 1 }).select("name isActive"),
  ]);

  const totals = result.totals[0] ?? { total: 0, new: 0, openComplaints: 0, inProgress: 0, resolved: 0 };
  const byCategory = new Map(result.byCategory.map((c) => [c._id, c.count]));
  const byLink = new Map(result.byLink.map((l) => [String(l._id), l.count]));
  const volume = new Map(result.volume.map((v) => [v._id, v.count]));

  res.json({
    total: totals.total,
    new: totals.new,
    openComplaints: totals.openComplaints,
    inProgress: totals.inProgress,
    resolved: totals.resolved,
    timeZone,
    volume: days.map((date) => ({ date, count: volume.get(date) ?? 0 })),
    byCategory: FEEDBACK_CATEGORIES.map((category) => ({ category, count: byCategory.get(category) ?? 0 })),
    byLink: links.map((link) => ({
      linkId: link._id,
      name: link.name,
      isActive: link.isActive,
      count: byLink.get(String(link._id)) ?? 0,
    })),
    unlinkedCount: byLink.get("null") ?? 0,
  });
});

// --- List ----------------------------------------------------------------------

router.get("/", validate({ query: listFeedbackQuery }), async (req, res) => {
  const business = await ownBusiness(req);
  const { q, category, reviewStatus, complaintStatus, linkId, from, to } = req.query;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  // Always scoped to this business; filters only narrow it further.
  const filter = { businessId: business._id };
  if (category) filter.category = category;
  if (reviewStatus) filter.reviewStatus = reviewStatus;
  if (complaintStatus) filter.complaintStatus = complaintStatus;
  if (linkId) filter.linkId = new mongoose.Types.ObjectId(linkId);
  if (from || to) {
    filter.submittedAt = {};
    if (from) filter.submittedAt.$gte = new Date(from);
    if (to) filter.submittedAt.$lte = new Date(to);
  }
  // Search input is escaped, so it always matches literally.
  if (q?.trim()) filter.message = { $regex: escapeRegex(q.trim()), $options: "i" };

  const [total, items, links] = await Promise.all([
    Feedback.countDocuments(filter),
    Feedback.find(filter)
      .sort({ submittedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("category message customerName reviewStatus complaintStatus submittedAt linkId")
      .lean(),
    FeedbackLink.find({ businessId: business._id }).select("name").lean(),
  ]);
  const linkName = new Map(links.map((l) => [String(l._id), l.name]));

  res.json({
    feedback: items.map((f) => ({
      id: f._id,
      category: f.category,
      excerpt: f.message.length > EXCERPT_LENGTH ? `${f.message.slice(0, EXCERPT_LENGTH).trimEnd()}…` : f.message,
      customerName: f.customerName,
      reviewStatus: f.reviewStatus,
      complaintStatus: f.complaintStatus,
      submittedAt: f.submittedAt,
      link: f.linkId ? { id: f.linkId, name: linkName.get(String(f.linkId)) ?? null } : null,
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

// --- Detail and changes -----------------------------------------------------------

router.get("/:id", async (req, res) => {
  const business = await ownBusiness(req);
  const feedback = await ownFeedback(business, req.params.id);
  res.json({ feedback: await serializeDetail(feedback, business) });
});

// The update only applies if the field still has the value we read, so two
// people changing it at once can't silently overwrite each other.
async function conditionalUpdate(business, feedback, field, update) {
  const updated = await Feedback.findOneAndUpdate(
    { _id: feedback._id, businessId: business._id, [field]: feedback[field] },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) throw AppError.conflict("This feedback was just changed by someone else. Reload and try again", "CONFLICT");
  return updated;
}

router.patch("/:id/review", validate({ body: reviewBody }), async (req, res) => {
  const business = await ownBusiness(req);
  const feedback = await ownFeedback(business, req.params.id);
  const { reviewStatus } = req.body;

  // Already in that state: nothing to change or record.
  if (feedback.reviewStatus === reviewStatus) {
    return res.json({ feedback: await serializeDetail(feedback, business) });
  }

  const updated = await conditionalUpdate(business, feedback, "reviewStatus", {
    $set: { reviewStatus },
    $push: {
      statusHistory: { field: "reviewStatus", from: feedback.reviewStatus, to: reviewStatus, by: req.user._id, at: new Date() },
    },
  });
  res.json({ feedback: await serializeDetail(updated, business) });
});

router.patch("/:id/complaint-status", validate({ body: complaintStatusBody }), async (req, res) => {
  const business = await ownBusiness(req);
  const feedback = await ownFeedback(business, req.params.id);
  if (feedback.category !== "complaint") {
    throw AppError.conflict("Only complaints have a status", "NOT_A_COMPLAINT");
  }

  const { status: action } = req.body;
  const current = feedback.complaintStatus ?? "open";
  const next = COMPLAINT_TRANSITIONS[current]?.[action];
  if (!next) {
    const message =
      action === current
        ? `This complaint is already ${STATUS_LABELS[current]}`
        : action === "reopen"
          ? "Only resolved complaints can be reopened"
          : current === "resolved"
            ? "Reopen the complaint before changing its status"
            : "That status change isn't allowed";
    throw AppError.conflict(message, "INVALID_TRANSITION");
  }

  const now = new Date();
  const summary = next === "resolved" ? req.body.resolutionSummary.trim() : undefined;
  const updated = await conditionalUpdate(business, feedback, "complaintStatus", {
    $set: {
      complaintStatus: next,
      resolutionSummary: summary ?? "",
      resolvedAt: next === "resolved" ? now : null,
    },
    $push: {
      statusHistory: {
        field: "complaintStatus",
        from: feedback.complaintStatus,
        to: next,
        by: req.user._id,
        at: now,
        ...(summary && { resolutionSummary: summary }),
      },
    },
  });
  res.json({ feedback: await serializeDetail(updated, business) });
});

router.post("/:id/notes", validate({ body: noteBody }), async (req, res) => {
  const business = await ownBusiness(req);
  const feedback = await ownFeedback(business, req.params.id);

  const updated = await Feedback.findOneAndUpdate(
    { _id: feedback._id, businessId: business._id },
    { $push: { internalNotes: { authorId: req.user._id, text: req.body.text.trim(), createdAt: new Date() } } },
    { new: true, runValidators: true }
  );
  res.status(201).json({ feedback: await serializeDetail(updated, business) });
});

export default router;
