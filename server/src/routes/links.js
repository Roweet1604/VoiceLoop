import { Router } from "express";
import mongoose from "mongoose";
import { Business } from "../models/Business.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Feedback } from "../models/Feedback.js";
import { AppError } from "../utils/AppError.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireActiveAccess, requireOwner } from "../middleware/auth.js";
import { createLinkBody, updateLinkBody } from "../validators/links.js";
import { createLink, ensureDefaultLink } from "../services/feedbackLinks.js";

// Generous, but stops one account from creating links without bound.
const MAX_LINKS_PER_BUSINESS = 200;

function serializeLink(link, feedbackCount = 0) {
  return {
    id: link._id,
    name: link.name,
    code: link.code,
    isActive: link.isActive,
    isDefault: link.isDefault,
    feedbackCount,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

const router = Router();

// Owners with active access only. The business comes from the logged-in
// user's organization in the database; ids in the request are never trusted.
router.use(requireAuth, requireActiveAccess, requireOwner);

async function ownBusiness(req) {
  const business = await Business.findOne({ organizationId: req.user.organizationId });
  if (!business) throw AppError.notFound("Set up your business first", "NO_BUSINESS");
  return business;
}

// A link of the caller's business, or 404. Another tenant's link id is simply
// "not found" because the query is scoped to this business.
async function ownLink(business, id) {
  const link = mongoose.isValidObjectId(id) ? await FeedbackLink.findOne({ _id: id, businessId: business._id }) : null;
  if (!link) throw AppError.notFound("Link not found");
  return link;
}

async function feedbackCount(link) {
  return Feedback.countDocuments({ businessId: link.businessId, linkId: link._id });
}

router.get("/", async (req, res) => {
  const business = await ownBusiness(req);
  await ensureDefaultLink(business); // backfills businesses created before links existed

  const [links, counts] = await Promise.all([
    FeedbackLink.find({ businessId: business._id }).sort({ isDefault: -1, createdAt: 1 }),
    Feedback.aggregate([{ $match: { businessId: business._id } }, { $group: { _id: "$linkId", n: { $sum: 1 } } }]),
  ]);
  const countByLink = new Map(counts.map(({ _id, n }) => [String(_id), n]));

  res.json({
    links: links.map((link) => serializeLink(link, countByLink.get(String(link._id)) ?? 0)),
    // Feedback that isn't tied to any link (none today; kept so totals add up).
    unlinkedFeedbackCount: countByLink.get("null") ?? 0,
  });
});

router.post("/", validate({ body: createLinkBody }), async (req, res) => {
  const business = await ownBusiness(req);
  if ((await FeedbackLink.countDocuments({ businessId: business._id })) >= MAX_LINKS_PER_BUSINESS) {
    throw AppError.conflict(`A business can have at most ${MAX_LINKS_PER_BUSINESS} links`, "LINK_LIMIT");
  }
  const link = await createLink(business, { name: req.body.name.trim() });
  res.status(201).json({ link: serializeLink(link) });
});

// Rename and/or activate/deactivate. Feedback is never touched.
router.patch("/:id", validate({ body: updateLinkBody }), async (req, res) => {
  const business = await ownBusiness(req);
  const link = await ownLink(business, req.params.id);

  if (req.body.name !== undefined) link.name = req.body.name.trim();
  if (req.body.isActive !== undefined) link.isActive = req.body.isActive;
  await link.save();

  res.json({ link: serializeLink(link, await feedbackCount(link)) });
});

export default router;
