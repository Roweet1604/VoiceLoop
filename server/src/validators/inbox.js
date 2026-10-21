// Validators for the owner feedback inbox (/api/feedback), used with
// validate(). Each value must be a plain string (or boolean where noted), so
// operator objects such as { "$gt": "" } and repeated query keys (arrays) are
// rejected. Routes read only the fields checked here.
import mongoose from "mongoose";
import {
  FEEDBACK_CATEGORIES,
  REVIEW_STATUSES,
  COMPLAINT_STATUSES,
  SUBMISSION_TYPES,
  TRANSCRIPT_STATUSES,
  NOTE_MAX,
  RESOLUTION_SUMMARY_MAX,
} from "../models/Feedback.js";

export const PAGE_SIZE_MAX = 50;
const SEARCH_MAX = 200;

function checkInteger(value, label, max) {
  const n = Number(value);
  if (typeof value !== "string" || !/^\d+$/.test(value) || n < 1 || n > max) {
    return `${label} must be a whole number from 1 to ${max}`;
  }
  return null;
}

function checkOneOf(value, options) {
  return typeof value === "string" && options.includes(value) ? null : `Must be one of: ${options.join(", ")}`;
}

function checkDate(value) {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))
    ? null
    : "Must be a valid date";
}

export function listFeedbackQuery(query) {
  const errors = {};
  const check = (key, fn) => {
    if (query[key] === undefined) return;
    const problem = fn(query[key]);
    if (problem) errors[key] = problem;
  };

  check("page", (v) => checkInteger(v, "page", 10000));
  check("limit", (v) => checkInteger(v, "limit", PAGE_SIZE_MAX));
  check("q", (v) => (typeof v === "string" && v.length <= SEARCH_MAX ? null : `Search must be text of at most ${SEARCH_MAX} characters`));
  check("category", (v) => checkOneOf(v, FEEDBACK_CATEGORIES));
  check("reviewStatus", (v) => checkOneOf(v, REVIEW_STATUSES));
  check("complaintStatus", (v) => checkOneOf(v, COMPLAINT_STATUSES));
  check("submissionType", (v) => checkOneOf(v, SUBMISSION_TYPES));
  check("transcriptStatus", (v) => checkOneOf(v, TRANSCRIPT_STATUSES));
  check("linkId", (v) => (typeof v === "string" && mongoose.isValidObjectId(v) ? null : "Invalid link"));
  check("from", checkDate);
  check("to", checkDate);

  if (!errors.from && !errors.to && query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
    errors.to = "The end date must be after the start date";
  }
  return errors;
}

// Time zone used to group the 30-day volume by local day.
export function summaryQuery(query) {
  if (query.tz === undefined) return {};
  if (typeof query.tz !== "string" || query.tz.length > 64) return { tz: "Invalid time zone" };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: query.tz });
    return {};
  } catch {
    return { tz: "Invalid time zone" };
  }
}

export function reviewBody(body) {
  const problem = checkOneOf(body.reviewStatus, REVIEW_STATUSES);
  return problem ? { reviewStatus: problem } : {};
}

// status: open | in_progress | resolved | reopen. Resolving needs a summary.
export const COMPLAINT_ACTIONS = [...COMPLAINT_STATUSES, "reopen"];

export function complaintStatusBody(body) {
  const problem = checkOneOf(body.status, COMPLAINT_ACTIONS);
  if (problem) return { status: problem };

  const summary = body.resolutionSummary;
  if (body.status === "resolved") {
    if (typeof summary !== "string" || !summary.trim()) {
      return { resolutionSummary: "Describe how the complaint was resolved" };
    }
  }
  if (summary !== undefined && summary !== null) {
    if (typeof summary !== "string") return { resolutionSummary: "Resolution summary must be text" };
    if (summary.trim().length > RESOLUTION_SUMMARY_MAX) {
      return { resolutionSummary: `Resolution summary must be at most ${RESOLUTION_SUMMARY_MAX} characters` };
    }
  }
  return {};
}

export function noteBody(body) {
  if (typeof body.text !== "string" || !body.text.trim()) return { text: "Write a note" };
  if (body.text.trim().length > NOTE_MAX) return { text: `Notes must be at most ${NOTE_MAX} characters` };
  return {};
}
