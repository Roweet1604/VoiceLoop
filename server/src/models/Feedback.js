import mongoose from "mongoose";

export const FEEDBACK_CATEGORIES = ["general", "complaint", "suggestion", "compliment", "other"];
export const REVIEW_STATUSES = ["new", "reviewed"];
export const COMPLAINT_STATUSES = ["open", "in_progress", "resolved"];

// Owner-only notes. Never included in any public response.
const internalNoteSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

// One customer submission. Text is stored exactly as entered; clients must
// render it as plain text.
const feedbackSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, immutable: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    linkId: { type: mongoose.Schema.Types.ObjectId, ref: "FeedbackLink", default: null, immutable: true },
    category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
    message: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
    customerName: { type: String, trim: true, maxlength: 80, default: "" },
    customerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    submissionType: { type: String, enum: ["text"], default: "text" },
    reviewStatus: { type: String, enum: REVIEW_STATUSES, default: "new" },
    // Only complaints have a status; everything else stays null.
    complaintStatus: { type: String, enum: [...COMPLAINT_STATUSES, null], default: null },
    internalNotes: { type: [internalNoteSchema], default: [] },
    submittedAt: { type: Date, default: Date.now, immutable: true },
    // Sent by the client with each submission so a retry (double tap, flaky
    // network) is recognised instead of stored twice.
    idempotencyKey: { type: String, required: true, immutable: true },
  },
  { timestamps: true }
);

feedbackSchema.index({ businessId: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, idempotencyKey: 1 }, { unique: true });
feedbackSchema.index({ linkId: 1 });

export const Feedback = mongoose.model("Feedback", feedbackSchema);
