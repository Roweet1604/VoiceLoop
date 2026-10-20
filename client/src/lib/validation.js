// Client-side checks that mirror server/src/validators/auth.js. The server
// remains the authority; these just catch mistakes before a round trip.
// Keep the two files in sync.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_BYTES = 72;

function checkText(value, label, max) {
  if (!value.trim()) return `${label} is required`;
  if (value.trim().length > max) return `${label} must be at most ${max} characters`;
  return null;
}

function checkEmail(value) {
  const email = value.trim();
  if (!email) return "Email is required";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Enter a valid email address";
  return null;
}

function checkNewPassword(value) {
  if (!value) return "Password is required";
  if (value.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) return "Password is too long";
  return null;
}

function collect(entries) {
  const errors = {};
  for (const [field, problem] of Object.entries(entries)) {
    if (problem) errors[field] = problem;
  }
  return errors;
}

export function validateSignup(values) {
  return collect({
    name: checkText(values.name, "Name", 100),
    organizationName: checkText(values.organizationName, "Business name", 120),
    email: checkEmail(values.email),
    password: checkNewPassword(values.password),
  });
}

// Mirrors server/src/validators/business.js.
export const BUSINESS_LIMITS = { name: 80, locationName: 80, welcomeMessage: 300 };

function checkReviewUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) return "Google review link is too long";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return "Enter a full link starting with https://";
  }
  if (url.protocol !== "https:" || !url.hostname) return "The link must start with https://";
  return null;
}

function checkBusinessName(value) {
  const name = value.trim();
  if (!name) return "Business name is required";
  if (name.length < 2) return "Business name must be at least 2 characters";
  if (name.length > BUSINESS_LIMITS.name) return `Business name must be at most ${BUSINESS_LIMITS.name} characters`;
  return null;
}

const optionalMax = (value, label, max) =>
  value.trim().length > max ? `${label} must be at most ${max} characters` : null;

// Validates whichever business fields are present in `values`.
export function validateBusiness(values) {
  return collect({
    name: "name" in values ? checkBusinessName(values.name) : null,
    locationName: "locationName" in values ? optionalMax(values.locationName, "Location", BUSINESS_LIMITS.locationName) : null,
    welcomeMessage:
      "welcomeMessage" in values
        ? optionalMax(values.welcomeMessage, "Welcome message", BUSINESS_LIMITS.welcomeMessage)
        : null,
    googleReviewUrl: "googleReviewUrl" in values ? checkReviewUrl(values.googleReviewUrl) : null,
  });
}

export function validateLogin(values) {
  return collect({
    email: values.email.trim() ? null : "Email is required",
    password: values.password ? null : "Password is required",
  });
}
