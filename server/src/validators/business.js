// Validators for /api/business, used with validate(). The route reads only
// the fields listed in BUSINESS_FIELDS, so anything else in the body
// (organizationId, publicSlug, isActive, logoUrl, _id, ...) is ignored.

export const BUSINESS_FIELDS = ["name", "locationName", "welcomeMessage", "googleReviewUrl"];

const LIMITS = { name: 80, locationName: 80, welcomeMessage: 300, googleReviewUrl: 500 };

function checkName(value) {
  if (typeof value !== "string" || !value.trim()) return "Business name is required";
  const length = value.trim().length;
  if (length < 2) return "Business name must be at least 2 characters";
  if (length > LIMITS.name) return `Business name must be at most ${LIMITS.name} characters`;
  return null;
}

function checkOptionalText(value, label, max) {
  if (typeof value !== "string") return `${label} must be text`;
  if (value.trim().length > max) return `${label} must be at most ${max} characters`;
  return null;
}

// Empty clears the link; otherwise it must be an absolute https URL.
function checkReviewUrl(value) {
  if (typeof value !== "string") return "Google review link must be text";
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > LIMITS.googleReviewUrl) return "Google review link is too long";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return "Enter a full link starting with https://";
  }
  if (url.protocol !== "https:" || !url.hostname) return "The link must start with https://";
  return null;
}

const CHECKS = {
  name: checkName,
  locationName: (v) => checkOptionalText(v, "Location", LIMITS.locationName),
  welcomeMessage: (v) => checkOptionalText(v, "Welcome message", LIMITS.welcomeMessage),
  googleReviewUrl: checkReviewUrl,
};

function checkFields(body, fields) {
  const errors = {};
  for (const field of fields) {
    const problem = CHECKS[field](body[field]);
    if (problem) errors[field] = problem;
  }
  return errors;
}

const present = (body) => BUSINESS_FIELDS.filter((field) => body[field] !== undefined);

// Create: name is required, the rest optional.
export function createBusinessBody(body) {
  return checkFields(body, ["name", ...present(body).filter((f) => f !== "name")]);
}

// Update: any subset of the fields, but at least one.
export function updateBusinessBody(body) {
  const fields = present(body);
  if (fields.length === 0) return { body: `Provide at least one of: ${BUSINESS_FIELDS.join(", ")}` };
  return checkFields(body, fields);
}

// Copies the known fields (trimmed) from a validated body.
export function pickBusinessFields(body) {
  const picked = {};
  for (const field of present(body)) picked[field] = body[field].trim();
  return picked;
}
