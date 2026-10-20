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

// Landing-screen wording limits (mirrors WORDING_FIELDS on the server).
export const WORDING_LIMITS = {
  reviewCardTitle: 60,
  reviewCardText: 160,
  reviewCardButton: 30,
  feedbackCardTitle: 60,
  feedbackCardText: 160,
  feedbackCardButton: 30,
};

// Validates whichever business fields are present in `values`.
export function validateBusiness(values) {
  const wording = Object.fromEntries(
    Object.entries(WORDING_LIMITS)
      .filter(([field]) => field in values)
      .map(([field, max]) => [field, values[field].trim().length > max ? `Keep this under ${max + 1} characters` : null])
  );
  return collect({
    ...wording,
    name: "name" in values ? checkBusinessName(values.name) : null,
    locationName: "locationName" in values ? optionalMax(values.locationName, "Location", BUSINESS_LIMITS.locationName) : null,
    welcomeMessage:
      "welcomeMessage" in values
        ? optionalMax(values.welcomeMessage, "Welcome message", BUSINESS_LIMITS.welcomeMessage)
        : null,
    googleReviewUrl: "googleReviewUrl" in values ? checkReviewUrl(values.googleReviewUrl) : null,
  });
}

// Mirrors server/src/validators/feedback.js.
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_NAME_MAX = 80;

export function validateFeedback(values) {
  const message = values.message.trim();
  return collect({
    message: !message
      ? "Please write your feedback"
      : message.length > FEEDBACK_MESSAGE_MAX
        ? `Feedback must be at most ${FEEDBACK_MESSAGE_MAX} characters`
        : null,
    customerName:
      values.customerName.trim().length > FEEDBACK_NAME_MAX ? `Name must be at most ${FEEDBACK_NAME_MAX} characters` : null,
    customerEmail: values.customerEmail.trim() ? checkEmail(values.customerEmail) : null,
  });
}

// Mirrors server/src/validators/links.js.
export const LINK_NAME_MAX = 60;

export function validateLinkName(values) {
  const name = values.name.trim();
  return collect({
    name: !name
      ? "Link name is required"
      : name.length < 2 || name.length > LINK_NAME_MAX
        ? `Link name must be 2 to ${LINK_NAME_MAX} characters`
        : null,
  });
}

export function validateLogin(values) {
  return collect({
    email: values.email.trim() ? null : "Email is required",
    password: values.password ? null : "Password is required",
  });
}
