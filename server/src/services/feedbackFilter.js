import mongoose from "mongoose";
import { escapeRegex } from "../utils/regex.js";

// The MongoDB filter for the inbox list and the CSV export. `query` must have
// passed listFeedbackQuery, so every value is a plain, valid string. The
// result is always scoped to the given business; filters only narrow it.
export function feedbackFilter(businessId, query) {
  const { q, category, reviewStatus, complaintStatus, submissionType, transcriptStatus, linkId, from, to } = query;

  const filter = { businessId };
  if (category) filter.category = category;
  if (reviewStatus) filter.reviewStatus = reviewStatus;
  if (complaintStatus) filter.complaintStatus = complaintStatus;
  if (submissionType) filter.submissionType = submissionType;
  if (transcriptStatus) filter.transcriptStatus = transcriptStatus;
  if (linkId) filter.linkId = new mongoose.Types.ObjectId(linkId);
  if (from || to) {
    filter.submittedAt = {};
    if (from) filter.submittedAt.$gte = new Date(from);
    if (to) filter.submittedAt.$lte = new Date(to);
  }
  // Search input is escaped, so it always matches literally. Transcripts are
  // searched too (only completed ones have text).
  if (q?.trim()) {
    const pattern = { $regex: escapeRegex(q.trim()), $options: "i" };
    filter.$or = [{ message: pattern }, { transcriptText: pattern }];
  }
  return filter;
}
