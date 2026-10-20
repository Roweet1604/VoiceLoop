import { Router } from "express";
import { Business } from "../models/Business.js";
import { AppError } from "../utils/AppError.js";
import { slugify, randomSuffix } from "../utils/slug.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireActiveAccess, requireOwner } from "../middleware/auth.js";
import { createBusinessBody, updateBusinessBody, pickBusinessFields } from "../validators/business.js";
import { ensureDefaultLink } from "../services/feedbackLinks.js";

const SLUG_ATTEMPTS = 5;

// The owner's view of their business. organizationId is never sent back.
function serializeBusiness(business) {
  return {
    id: business._id,
    name: business.name,
    locationName: business.locationName,
    welcomeMessage: business.welcomeMessage,
    googleReviewUrl: business.googleReviewUrl,
    logoUrl: business.logoUrl,
    reviewCardText: business.reviewCardText,
    feedbackCardText: business.feedbackCardText,
    publicSlug: business.publicSlug,
    isActive: business.isActive,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
  };
}

const businessExists = () =>
  AppError.conflict("Your organization already has a business", "BUSINESS_EXISTS");

const router = Router();

// Owners with active access only. The business is always looked up from the
// organization of the user loaded by requireAuth, never from ids in the
// request, so one owner can't reach another's business.
router.use(requireAuth, requireActiveAccess, requireOwner);

const ownBusiness = (req) => Business.findOne({ organizationId: req.user.organizationId });

router.get("/", async (req, res) => {
  const business = await ownBusiness(req);
  res.json({ business: business && serializeBusiness(business) });
});

router.post("/", validate({ body: createBusinessBody }), async (req, res) => {
  const organizationId = req.user.organizationId;
  if (await Business.exists({ organizationId })) throw businessExists();

  const fields = pickBusinessFields(req.body);
  const base = slugify(fields.name);

  // Try the plain slug first, then add a random suffix. The unique index is
  // the real guarantee; the exists() check just avoids most collisions.
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const publicSlug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    if (await Business.exists({ publicSlug })) continue;
    try {
      const business = await Business.create({ ...fields, organizationId, publicSlug });
      // Every business starts with a "Main link". If this fails, the link is
      // still created later by ensureDefaultLink (GET /api/links or the script).
      await ensureDefaultLink(business);
      return res.status(201).json({ business: serializeBusiness(business) });
    } catch (err) {
      if (err.code !== 11000) throw err;
      if (err.keyPattern?.organizationId) throw businessExists();
      // publicSlug taken between the check and the insert: try another.
    }
  }
  throw new Error(`Could not generate a unique public slug for "${base}"`);
});

router.patch("/", validate({ body: updateBusinessBody }), async (req, res) => {
  const business = await ownBusiness(req);
  if (!business) throw AppError.notFound("You haven't set up a business yet");

  // Only name, locationName, welcomeMessage and googleReviewUrl can change.
  // publicSlug is immutable, so a rename keeps the existing public link.
  Object.assign(business, pickBusinessFields(req.body));
  await business.save();
  res.json({ business: serializeBusiness(business) });
});

export default router;
