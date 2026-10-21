// Validator for public feedback submissions, used with validate(). Every field
// must be a string, which also stops operator objects such as { "$gt": "" }.
// The route reads only the fields below; anything else is ignored.
import { FEEDBACK_CATEGORIES } from "../models/Feedback.js";
import { AUDIO_MAX_DURATION_SEC } from "../services/audioFile.js";
import { checkEmail } from "./auth.js";

export const MESSAGE_MAX = 2000;
const NAME_MAX = 80;
// Client-generated, e.g. a UUID from crypto.randomUUID().
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;

const isBlank = (value) => value === undefined || value === null || value === "";

// Fields shared by text and voice submissions.
function checkCommonFields(body, errors) {
  if (typeof body.category !== "string" || !FEEDBACK_CATEGORIES.includes(body.category)) {
    errors.category = `Choose one of: ${FEEDBACK_CATEGORIES.join(", ")}`;
  }

  if (!isBlank(body.customerName)) {
    if (typeof body.customerName !== "string") errors.customerName = "Name must be text";
    else if (body.customerName.trim().length > NAME_MAX) errors.customerName = `Name must be at most ${NAME_MAX} characters`;
  }

  if (!isBlank(body.customerEmail)) {
    const problem = typeof body.customerEmail === "string" && !body.customerEmail.trim()
      ? null
      : checkEmail(body.customerEmail);
    if (problem) errors.customerEmail = problem;
  }

  // Only the type is checked here. An unknown or malformed code gets the same
  // generic 404 as any other unavailable page.
  if (!isBlank(body.linkCode) && (typeof body.linkCode !== "string" || body.linkCode.length > 40)) {
    errors.linkCode = "Invalid link";
  }

  if (typeof body.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(body.idempotencyKey)) {
    errors.idempotencyKey = "A valid idempotency key is required";
  }
  return errors;
}

export function submitFeedbackBody(body) {
  const errors = {};

  if (typeof body.message !== "string" || !body.message.trim()) {
    errors.message = "Please write your feedback";
  } else if (body.message.trim().length > MESSAGE_MAX) {
    errors.message = `Feedback must be at most ${MESSAGE_MAX} characters`;
  }

  return checkCommonFields(body, errors);
}

// Multipart text fields of a voice submission (the file itself is checked by
// services/audioFile.js). durationSec is the recording length the browser
// measured, as a decimal string.
export function submitVoiceBody(body) {
  const errors = {};
  const duration = Number(body.durationSec);
  if (
    typeof body.durationSec !== "string" ||
    !/^\d{1,3}(\.\d{1,3})?$/.test(body.durationSec) ||
    duration <= 0 ||
    duration > AUDIO_MAX_DURATION_SEC
  ) {
    errors.durationSec = `Recordings can be at most ${AUDIO_MAX_DURATION_SEC} seconds`;
  }
  return checkCommonFields(body, errors);
}
