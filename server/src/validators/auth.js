// Validators for validate() in middleware/validate.js. Each returns
// { field: "problem" }. Every field is checked to be a string, which also
// stops operator objects such as { "$gt": "" } from reaching a query.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 10;
// bcrypt ignores everything after 72 bytes, so longer passwords are refused
// rather than silently truncated.
export const PASSWORD_MAX_BYTES = 72;

function checkText(value, label, max) {
  if (typeof value !== "string" || !value.trim()) return `${label} is required`;
  if (value.trim().length > max) return `${label} must be at most ${max} characters`;
  return null;
}

export function checkEmail(value) {
  if (typeof value !== "string" || !value.trim()) return "Email is required";
  const email = value.trim();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Enter a valid email address";
  return null;
}

export function checkNewPassword(value) {
  if (typeof value !== "string" || !value) return "Password is required";
  if (value.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (Buffer.byteLength(value, "utf8") > PASSWORD_MAX_BYTES) return "Password is too long";
  return null;
}

function collect(entries) {
  const errors = {};
  for (const [field, problem] of Object.entries(entries)) {
    if (problem) errors[field] = problem;
  }
  return errors;
}

export function registerBody(body) {
  return collect({
    name: checkText(body.name, "Name", 100),
    email: checkEmail(body.email),
    password: checkNewPassword(body.password),
    organizationName: checkText(body.organizationName, "Business name", 120),
  });
}

// Login only checks shape. Password rules are not re-checked here so that
// failures do not reveal anything beyond "invalid email or password".
export function loginBody(body) {
  return collect({
    email: typeof body.email === "string" && body.email.trim() ? null : "Email is required",
    password: typeof body.password === "string" && body.password ? null : "Password is required",
  });
}
