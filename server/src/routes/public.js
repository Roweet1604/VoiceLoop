import { Router } from "express";
import { Business } from "../models/Business.js";
import { Organization } from "../models/Organization.js";
import { AppError } from "../utils/AppError.js";
import { SLUG_PATTERN } from "../utils/slug.js";

// Unauthenticated endpoints used by the customer-facing feedback page.
const router = Router();

// One response for every "can't show this" case (unknown slug, inactive
// business, organization not active or expired), so the endpoint reveals
// nothing about why.
const unavailable = () => AppError.notFound("This feedback page isn't available");

router.get("/business/:slug", async (req, res) => {
  const { slug } = req.params;
  if (slug.length > 80 || !SLUG_PATTERN.test(slug)) throw unavailable();

  const business = await Business.findOne({ publicSlug: slug, isActive: true });
  const organization = business && (await Organization.findById(business.organizationId));
  if (!organization || !organization.accessState().allowed) throw unavailable();

  // Don't let browsers or proxies keep serving a page after access ends.
  res.set("Cache-Control", "no-store");
  // Whitelisted fields only: no ids, organization or owner details.
  res.json({
    business: {
      slug: business.publicSlug,
      name: business.name,
      locationName: business.locationName,
      welcomeMessage: business.welcomeMessage,
      logoUrl: business.logoUrl,
      googleReviewUrl: business.googleReviewUrl,
    },
  });
});

export default router;
