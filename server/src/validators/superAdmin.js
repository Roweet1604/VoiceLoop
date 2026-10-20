// Validators for the Super Admin routes, used with validate(). Each returns
// { field: "problem" }; an empty object means valid.
import { ACCESS_STATUSES } from "../models/Organization.js";

export const APPROVAL_DAY_OPTIONS = [7, 30, 90];
export const MAX_EXTEND_DAYS = 3650;
const MAX_REASON_LENGTH = 500;
const MAX_FUTURE_MS = 10 * 365 * 24 * 60 * 60 * 1000; // ~10 years

const isInteger = (value) => typeof value === "number" && Number.isInteger(value);

// endDate must be an ISO 8601 string for a moment in the future.
function checkEndDate(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "End date must be a valid date";
  const time = Date.parse(value);
  if (time <= Date.now()) return "End date must be in the future";
  if (time > Date.now() + MAX_FUTURE_MS) return "End date must be within 10 years";
  return null;
}

function checkReason(value, { required }) {
  if (value === undefined || value === null || value === "") {
    return required ? "A reason is required" : null;
  }
  if (typeof value !== "string") return "Reason must be text";
  if (required && !value.trim()) return "A reason is required";
  if (value.trim().length > MAX_REASON_LENGTH) return `Reason must be at most ${MAX_REASON_LENGTH} characters`;
  return null;
}

function provided(body, keys) {
  return keys.filter((key) => body[key] !== undefined && body[key] !== null && body[key] !== false);
}

// Approve, and reactivate when a new term is given: exactly one of
// { days: 7 | 30 | 90 }, { endDate }, { noExpiry: true }.
function checkTerm(body) {
  const given = provided(body, ["days", "endDate", "noExpiry"]);
  if (given.length !== 1) return { term: "Choose one of: a number of days, an end date, or no expiry" };
  if (given[0] === "days" && !APPROVAL_DAY_OPTIONS.includes(body.days)) {
    return { days: `Days must be one of ${APPROVAL_DAY_OPTIONS.join(", ")}` };
  }
  if (given[0] === "endDate") {
    const problem = checkEndDate(body.endDate);
    if (problem) return { endDate: problem };
  }
  if (given[0] === "noExpiry" && body.noExpiry !== true) return { noExpiry: "noExpiry must be true" };
  return {};
}

export function approveBody(body) {
  return checkTerm(body);
}

// The term is optional here; the route decides whether one is needed.
export function reactivateBody(body) {
  return provided(body, ["days", "endDate", "noExpiry"]).length ? checkTerm(body) : {};
}

export function rejectBody(body) {
  const problem = checkReason(body.reason, { required: false });
  return problem ? { reason: problem } : {};
}

export function suspendBody(body) {
  const problem = checkReason(body.reason, { required: true });
  return problem ? { reason: problem } : {};
}

// Exactly one of { days: 1..3650 } (added to the current end date) or { endDate }.
export function extendBody(body) {
  const given = provided(body, ["days", "endDate"]);
  if (given.length !== 1) return { term: "Provide either a number of days to add or a new end date" };
  if (given[0] === "days" && (!isInteger(body.days) || body.days < 1 || body.days > MAX_EXTEND_DAYS)) {
    return { days: `Days must be a whole number from 1 to ${MAX_EXTEND_DAYS}` };
  }
  if (given[0] === "endDate") {
    const problem = checkEndDate(body.endDate);
    if (problem) return { endDate: problem };
  }
  return {};
}

export function listQuery(query) {
  const errors = {};
  if (query.status !== undefined && query.status !== "all" && !ACCESS_STATUSES.includes(query.status)) {
    errors.status = `Status must be "all" or one of: ${ACCESS_STATUSES.join(", ")}`;
  }
  if (query.q !== undefined && (typeof query.q !== "string" || query.q.length > 100)) {
    errors.q = "Search must be text of at most 100 characters";
  }
  if (query.expiring !== undefined && !["true", "false"].includes(query.expiring)) {
    errors.expiring = 'Expiring must be "true" or "false"';
  }
  for (const [key, max] of [["page", 10000], ["limit", 100]]) {
    if (query[key] === undefined) continue;
    const n = Number(query[key]);
    if (typeof query[key] !== "string" || !Number.isInteger(n) || n < 1 || n > max) {
      errors[key] = `${key} must be a whole number from 1 to ${max}`;
    }
  }
  return errors;
}
