import { Business } from "../models/Business.js";
import { AppError } from "../utils/AppError.js";

// The business of the logged-in owner's organization. The organization comes
// from the user record loaded by requireAuth, never from the request, so a
// tenant can only ever reach its own business.
export async function ownBusiness(req) {
  const business = await Business.findOne({ organizationId: req.user.organizationId });
  if (!business) throw AppError.notFound("Set up your business first", "NO_BUSINESS");
  return business;
}
