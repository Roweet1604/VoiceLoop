import { FeedbackLink } from "../models/FeedbackLink.js";
import { randomSuffix } from "../utils/slug.js";

export const DEFAULT_LINK_NAME = "Main link";
export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_PATTERN = /^[a-z0-9]{8}$/;
const CODE_ATTEMPTS = 5;

const isDuplicateKey = (err, field) => err?.code === 11000 && (!field || err.keyPattern?.[field]);

// Creates a link with a fresh random code, retrying on the (very unlikely)
// event that the code is already taken.
export async function createLink(business, { name, isDefault = false }) {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    try {
      return await FeedbackLink.create({
        businessId: business._id,
        organizationId: business.organizationId,
        name,
        code: randomSuffix(LINK_CODE_LENGTH),
        isDefault,
      });
    } catch (err) {
      if (!isDuplicateKey(err, "code")) throw err;
    }
  }
  throw new Error("Could not generate a unique link code");
}

// Returns the business's default "Main link", creating it if missing. Safe to
// call any number of times, including concurrently: the partial unique index
// on { businessId } for default links lets only one insert win, and the
// losers read the winner's link. Used when a business is created, lazily by
// GET /api/links, and by scripts/ensure-default-links.js for older data.
export async function ensureDefaultLink(business) {
  const existing = await FeedbackLink.findOne({ businessId: business._id, isDefault: true });
  if (existing) return existing;
  try {
    return await createLink(business, { name: DEFAULT_LINK_NAME, isDefault: true });
  } catch (err) {
    if (!isDuplicateKey(err, "businessId")) throw err;
    return FeedbackLink.findOne({ businessId: business._id, isDefault: true });
  }
}
