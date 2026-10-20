import { Router } from "express";
import { Business } from "../models/Business.js";
import { Organization } from "../models/Organization.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Feedback } from "../models/Feedback.js";
import { AppError } from "../utils/AppError.js";
import { SLUG_PATTERN } from "../utils/slug.js";
import { LINK_CODE_PATTERN } from "../services/feedbackLinks.js";
import { validate } from "../middleware/validate.js";
import { submitFeedbackBody } from "../validators/feedback.js";

// One response for every "can't show this" case (unknown slug or link code,
// inactive business or link, organization not active or expired), so the
// public endpoints reveal nothing about why.
const unavailable = () => AppError.notFound("This feedback page isn't available");

// The business behind a public slug, if it may currently receive feedback.
async function findPublicBusiness(slug) {
  if (typeof slug !== "string" || slug.length > 80 || !SLUG_PATTERN.test(slug)) throw unavailable();
  const business = await Business.findOne({ publicSlug: slug, isActive: true });
  const organization = business && (await Organization.findById(business.organizationId));
  if (!organization || !organization.accessState().allowed) throw unavailable();
  return business;
}

// With a code: that active link of this business, or 404. Without one: the
// business's default link (404 if it was deactivated, null if it doesn't
// exist yet).
async function findPublicLink(business, code) {
  if (code) {
    if (!LINK_CODE_PATTERN.test(code)) throw unavailable();
    const link = await FeedbackLink.findOne({ businessId: business._id, code, isActive: true });
    if (!link) throw unavailable();
    return link;
  }
  const link = await FeedbackLink.findOne({ businessId: business._id, isDefault: true });
  if (link && !link.isActive) throw unavailable();
  return link;
}

// Whitelisted fields only: no ids, organization or owner details.
function publicBusiness(business) {
  return {
    slug: business.publicSlug,
    name: business.name,
    locationName: business.locationName,
    welcomeMessage: business.welcomeMessage,
    logoUrl: business.logoUrl,
    googleReviewUrl: business.googleReviewUrl,
  };
}

// Unauthenticated endpoints used by the customer-facing feedback page.
export function createPublicRouter({ submitLimiter }) {
  const router = Router();

  // Don't let browsers or proxies keep serving a page after access ends.
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/business/:slug", async (req, res) => {
    const business = await findPublicBusiness(req.params.slug);
    res.json({ business: publicBusiness(business) });
  });

  // Everything the feedback page needs to render: /f/<slug> or /f/<slug>/<code>.
  router.get("/f/:slug{/:code}", async (req, res) => {
    const business = await findPublicBusiness(req.params.slug);
    await findPublicLink(business, req.params.code);
    res.json({ business: publicBusiness(business), linkCode: req.params.code ?? null });
  });

  router.post("/f/:slug/submit", submitLimiter, validate({ body: submitFeedbackBody }), async (req, res) => {
    const business = await findPublicBusiness(req.params.slug);
    const { category, message, customerName, customerEmail, linkCode, idempotencyKey } = req.body;
    const link = await findPublicLink(business, linkCode || null);

    // The same key for the same business means a retry of a submission that
    // was already stored: answer exactly as the first time, store nothing.
    const respond = (feedback) => res.status(201).json({ submitted: true, submittedAt: feedback.submittedAt });

    const previous = await Feedback.findOne({ businessId: business._id, idempotencyKey });
    if (previous) return respond(previous);

    try {
      // Only these fields are taken from the request. Status fields and notes
      // always start at their defaults, whatever the body contains.
      const feedback = await Feedback.create({
        businessId: business._id,
        organizationId: business.organizationId,
        linkId: link?._id ?? null,
        category,
        message: message.trim(),
        customerName: customerName?.trim() ?? "",
        customerEmail: customerEmail?.trim() ?? "",
        submissionType: "text",
        complaintStatus: category === "complaint" ? "open" : null,
        idempotencyKey,
      });
      return respond(feedback);
    } catch (err) {
      // Two identical requests raced past the check above; the other one won.
      if (err.code === 11000 && err.keyPattern?.idempotencyKey) {
        return respond(await Feedback.findOne({ businessId: business._id, idempotencyKey }));
      }
      throw err;
    }
  });

  return router;
}
